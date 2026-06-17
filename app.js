const APP_SCRIPT_URL = new URL(document.currentScript?.src || window.location.href);
const APP_BASE_URL = APP_SCRIPT_URL.pathname.endsWith("/web/app.js")
  ? new URL("../", APP_SCRIPT_URL)
  : new URL("./", APP_SCRIPT_URL);
const DATA_URL = new URL("data/life_actuarial_exercises_ch01_ch05_solutions_deepseek_v4_pro.json", APP_BASE_URL).href;
const METHOD_CARDS_URL = new URL("data/life_actuarial_method_cards.json", APP_BASE_URL).href;
const QUESTION_TAGS_URL = new URL("data/life_actuarial_question_tags.json", APP_BASE_URL).href;
const STORAGE_KEY = "life-actuarial-practice-state-v1";

const els = {
  subtitle: document.querySelector("#subtitle"),
  searchInput: document.querySelector("#searchInput"),
  summaryStrip: document.querySelector("#summaryStrip"),
  chapterFilters: document.querySelector("#chapterFilters"),
  questionKicker: document.querySelector("#questionKicker"),
  questionTitle: document.querySelector("#questionTitle"),
  questionBody: document.querySelector("#questionBody"),
  favoriteBtn: document.querySelector("#favoriteBtn"),
  statusActions: document.querySelector("#statusActions"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  revealReasonBtn: document.querySelector("#revealReasonBtn"),
  revealAnswerBtn: document.querySelector("#revealAnswerBtn"),
  methodInsight: document.querySelector("#methodInsight"),
  solutionContent: document.querySelector("#solutionContent")
};

const reviewLabels = {
  new: "未做",
  blur: "模糊",
  mastered: "掌握"
};

const filters = {
  chapter: "all",
  status: "all",
  search: ""
};

const ui = {
  selectedId: null,
  activeTab: "reason",
  revealReason: false,
  revealAnswer: false
};

let questions = [];
let filteredQuestions = [];
let practiceState = loadPracticeState();
let methodLookup = null;
let mathRetry = 0;
let testMode = loadTestMode();
let shuffledOrder = [];

function loadTestMode() {
  try {
    return JSON.parse(localStorage.getItem("life-actuarial-practice-testmode") || "false");
  } catch {
    return false;
  }
}

function saveTestMode() {
  localStorage.setItem("life-actuarial-practice-testmode", JSON.stringify(testMode));
}

function generateShuffledOrder() {
  const ids = questions.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

window.queueMathTypeset = () => {
  mathRetry = 0;
  typesetMath();
};

init();

async function init() {
  bindEvents();
  try {
    const [payload, methodPayload, tagPayload] = await Promise.all([
      fetchJson(DATA_URL),
      fetchOptionalJson(METHOD_CARDS_URL),
      fetchOptionalJson(QUESTION_TAGS_URL)
    ]);
    questions = normalizeQuestions(payload.questions || []);
    methodLookup = window.MethodUtils?.buildMethodLookup(
      methodPayload?.method_cards || [],
      tagPayload?.question_tags || []
    );
    const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    ui.selectedId = questions.some((q) => q.id === hashId) ? hashId : questions[0]?.id;
    const initialQuestion = getSelectedQuestion();
    if (initialQuestion && !testMode) {
      filters.chapter = String(initialQuestion.chapter);
    }
    if (testMode) {
      shuffledOrder = generateShuffledOrder();
      updateModeSwitchUI();
    }
    els.subtitle.textContent = `${questions.length} 道题 · 第 1-5 章`;
    renderAll();
  } catch (error) {
    els.subtitle.textContent = "题库读取失败";
    els.questionBody.innerHTML = `<div class="error-state">无法读取题库 JSON：${escapeHtml(error.message)}</div>`;
    els.solutionContent.innerHTML = `<div class="error-state">请从项目根目录启动本地 HTTP 服务后访问 /web/index.html。</div>`;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchOptionalJson(url) {
  try {
    return await fetchJson(url);
  } catch {
    return null;
  }
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    filters.search = event.target.value.trim();
    renderAll({ keepReveal: true });
  });

  els.favoriteBtn.addEventListener("click", () => {
    const question = getSelectedQuestion();
    if (!question) return;
    const state = getQuestionState(question.id);
    updateQuestionState(question.id, { favorite: !state.favorite });
    renderAll({ keepReveal: true });
  });

  els.prevBtn.addEventListener("click", () => moveSelection(-1));
  els.nextBtn.addEventListener("click", () => moveSelection(1));

  els.revealReasonBtn.addEventListener("click", () => {
    ui.activeTab = "reason";
    ui.revealReason = true;
    ui.revealAnswer = false;
    renderSolution();
  });

  els.revealAnswerBtn.addEventListener("click", () => {
    ui.activeTab = "answer";
    ui.revealAnswer = true;
    ui.revealReason = false;
    renderSolution();
  });

  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (questions.some((q) => q.id === id)) {
      selectQuestion(id);
    }
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === "chapter" && testMode) {
        testMode = false;
        shuffledOrder = [];
        saveTestMode();
        updateModeSwitchUI();
        filters.chapter = "all";
        const question = getSelectedQuestion();
        if (question) filters.chapter = String(question.chapter);
        renderAll();
      } else if (mode === "test" && !testMode) {
        testMode = true;
        shuffledOrder = generateShuffledOrder();
        saveTestMode();
        updateModeSwitchUI();
        filters.chapter = "all";
        renderAll();
      }
    });
  });
}

function normalizeQuestions(items) {
  return [...items].sort((a, b) => {
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.number - b.number;
  });
}

function renderAll(options = {}) {
  filteredQuestions = getFilteredQuestions();
  if (!filteredQuestions.some((q) => q.id === ui.selectedId)) {
    ui.selectedId = filteredQuestions[0]?.id || questions[0]?.id || null;
  }
  if (!options.keepReveal) {
    ui.revealReason = false;
    ui.revealAnswer = false;
    ui.activeTab = "reason";
  }
  renderLibrary();
  renderQuestion();
  renderMethodInsight();
  renderStatusActions();
  renderSolution();
  updateSummary();
}

function renderLibrary() {
  if (testMode) {
    renderTestModeLibrary();
    return;
  }

  const chapters = Array.from(new Set(questions.map((q) => q.chapter))).map((chapter) => {
    const chapterQuestions = questions.filter((q) => q.chapter === chapter);
    return {
      value: String(chapter),
      chapter,
      title: chapterQuestions[0]?.chapter_title || "",
      count: chapterQuestions.length
    };
  });
  els.chapterFilters.innerHTML = [
    chapterOverviewButton(filters.chapter === "all"),
    ...chapters.map((item) => chapterFilterButton(item, filters.chapter === item.value))
  ].join("");

  els.chapterFilters.querySelectorAll("[data-filter-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.filterKind === "chapter") {
        const nextChapter = button.dataset.filterValue;
        filters.status = "all";
        filters.chapter = filters.chapter === nextChapter && nextChapter !== "all" ? "all" : nextChapter;
      } else {
        filters[button.dataset.filterKind] = button.dataset.filterValue;
      }
      renderAll({ keepReveal: true });
    });
  });

  els.chapterFilters.querySelectorAll("[data-question-id]").forEach((button) => {
    button.addEventListener("click", () => selectQuestion(button.dataset.questionId));
  });
}

function renderTestModeLibrary() {
  const total = questions.length;
  const statuses = [
    { value: "all", label: `全部 ${total}` },
    { value: "new", label: `未做 ${questions.filter((q) => (getQuestionState(q.id).status || "new") === "new").length}` },
    { value: "blur", label: `模糊 ${questions.filter((q) => getQuestionState(q.id).status === "blur").length}` },
    { value: "mastered", label: `掌握 ${questions.filter((q) => getQuestionState(q.id).status === "mastered").length}` },
    { value: "favorite", label: `收藏 ${questions.filter((q) => getQuestionState(q.id).favorite).length}` }
  ];

  els.chapterFilters.innerHTML = `
    <div class="test-mode-attribution">Mentioned by Haaaa</div>
    <div class="test-mode-status-row">
      ${statuses.map((s) => filterChip("status", s.value, s.label, filters.status === s.value)).join("")}
    </div>
    <div class="test-mode-question-list">
      ${filteredQuestions.length ? renderQuestionRows(filteredQuestions) : `<div class="empty-state">没有匹配的题目</div>`}
    </div>
  `;

  els.chapterFilters.querySelectorAll("[data-filter-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      filters[button.dataset.filterKind] = button.dataset.filterValue;
      renderAll({ keepReveal: true });
    });
  });

  els.chapterFilters.querySelectorAll("[data-question-id]").forEach((button) => {
    button.addEventListener("click", () => selectQuestion(button.dataset.questionId));
  });
}

function filterChip(kind, value, label, active) {
  return `<button type="button" class="chip ${active ? "active" : ""}" data-filter-kind="${kind}" data-filter-value="${value}">${label}</button>`;
}

function chapterOverviewButton(active) {
  return `
    <button type="button" class="chapter-overview ${active ? "active" : ""}" data-filter-kind="chapter" data-filter-value="all" aria-pressed="${active}">
      <span>全部章节</span>
      <span class="chapter-caret">⌄</span>
    </button>
  `;
}

function chapterFilterButton(item, active) {
  const panel = active ? chapterPanel(item) : "";
  return `
    <section class="chapter-group ${active ? "active" : ""}">
      <button type="button" class="chapter-filter ${active ? "active" : ""}" data-filter-kind="chapter" data-filter-value="${item.value}" aria-expanded="${active}" aria-pressed="${active}">
        <span class="chapter-chevron">${active ? "⌄" : "›"}</span>
        <span class="chapter-label">第 ${item.chapter} 章 ${escapeHtml(item.title)}</span>
        <span class="chapter-count">${item.count}</span>
      </button>
      ${panel}
    </section>
  `;
}

function chapterPanel(item) {
  const chapterQuestions = questions.filter((question) => String(question.chapter) === item.value);
  const visibleQuestions = getFilteredQuestions();
  const statuses = [
    { value: "all", label: `全部 ${chapterQuestions.length}` },
    { value: "new", label: `未做 ${countChapterStatus(chapterQuestions, "new")}` },
    { value: "blur", label: `模糊 ${countChapterStatus(chapterQuestions, "blur")}` },
    { value: "mastered", label: `掌握 ${countChapterStatus(chapterQuestions, "mastered")}` },
    { value: "favorite", label: `收藏 ${countChapterStatus(chapterQuestions, "favorite")}` }
  ];

  return `
    <div class="chapter-panel">
      <div class="chapter-status-row">
        ${statuses.map((status) => filterChip("status", status.value, status.label, filters.status === status.value)).join("")}
      </div>
      <div class="chapter-question-list">
        ${visibleQuestions.length ? renderQuestionRows(visibleQuestions) : `<div class="empty-state">没有匹配的题目</div>`}
      </div>
    </div>
  `;
}

function countChapterStatus(chapterQuestions, status) {
  return chapterQuestions.filter((question) => {
    const state = getQuestionState(question.id);
    if (status === "favorite") return Boolean(state.favorite);
    return (state.status || "new") === status;
  }).length;
}

function updateModeSwitchUI() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    const isActive = (btn.dataset.mode === "test" && testMode) || (btn.dataset.mode === "chapter" && !testMode);
    btn.classList.toggle("active", isActive);
  });
  const filterTitle = document.querySelector(".filter-title");
  if (filterTitle) {
    filterTitle.textContent = testMode ? "筛选" : "章节";
  }
}

function getFilteredQuestions() {
  const term = filters.search.toLowerCase();
  let result = questions.filter((question) => {
    if (!testMode && filters.chapter !== "all" && String(question.chapter) !== filters.chapter) return false;
    const state = getQuestionState(question.id);
    const status = state.status || "new";
    if (filters.status === "favorite" && !state.favorite) return false;
    if (filters.status !== "all" && filters.status !== "favorite" && status !== filters.status) return false;
    if (!term) return true;
    const haystack = [
      question.id,
      question.chapter_title,
      question.exercise_title,
      question.number,
      question.question_latex,
      question.solution?.answer_text,
      question.solution?.reasoning_text,
      window.MethodUtils?.collectMethodSearchText(getQuestionMethodBundle(question.id))
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });

  if (testMode && shuffledOrder.length) {
    const orderMap = new Map(shuffledOrder.map((id, idx) => [id, idx]));
    result.sort((a, b) => {
      const ia = orderMap.get(a.id) ?? Infinity;
      const ib = orderMap.get(b.id) ?? Infinity;
      return ia - ib;
    });
  }

  return result;
}

function renderQuestionRows(items) {
  return items
    .map((question) => {
      const state = getQuestionState(question.id);
      const status = state.status || "new";
      const active = question.id === ui.selectedId;
      const snippet = compactSnippet(question.question_latex);
      return `
        <button type="button" class="question-row ${active ? "active" : ""}" data-question-id="${question.id}">
          <span class="question-num">${question.chapter}.${question.number}</span>
          <span class="question-row-title">${escapeHtml(snippet)}</span>
          <span class="row-meta">
            <span class="dot ${status}"></span>
            ${state.favorite ? `<span class="star">★</span>` : ""}
          </span>
        </button>
      `;
    })
    .join("");
}

function renderQuestion() {
  const question = getSelectedQuestion();
  if (!question) {
    els.questionKicker.textContent = "题库";
    els.questionTitle.textContent = "没有可显示的题目";
    els.questionBody.innerHTML = `<div class="empty-state">调整筛选条件后继续。</div>`;
    els.favoriteBtn.classList.remove("active");
    return;
  }

  const state = getQuestionState(question.id);
  els.questionKicker.textContent = `第 ${question.chapter} 章 · ${question.chapter_title} · PDF ${question.source_page_span?.join("-") || ""}`;
  els.questionTitle.textContent = `${question.exercise_title || "习题"} · 第 ${question.number} 题`;
  els.questionBody.innerHTML = renderMarkdown(question.question_latex);
  els.favoriteBtn.textContent = state.favorite ? "★" : "☆";
  els.favoriteBtn.classList.toggle("active", Boolean(state.favorite));
  syncHash(question.id);
  typesetMath();
}

function renderStatusActions() {
  const question = getSelectedQuestion();
  const current = question ? getQuestionState(question.id).status || "new" : "new";
  els.statusActions.innerHTML = Object.entries(reviewLabels)
    .map(
      ([value, label]) =>
        `<button type="button" class="status-btn ${current === value ? "active" : ""}" data-status="${value}">${label}</button>`
    )
    .join("");

  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = getSelectedQuestion();
      if (!selected) return;
      updateQuestionState(selected.id, { status: button.dataset.status });
      renderAll({ keepReveal: true });
    });
  });

  updateNavButtons();
}

function renderMethodInsight() {
  if (!els.methodInsight) return;
  const question = getSelectedQuestion();
  if (!question) {
    els.methodInsight.innerHTML = `
      <div class="method-empty">
        <strong>通法未加载</strong>
        <span>选择一道题后查看对应方法。</span>
      </div>
    `;
    return;
  }

  const bundle = getQuestionMethodBundle(question.id);
  if (!bundle) {
    els.methodInsight.innerHTML = `
      <div class="method-empty">
        <strong>暂无通法标签</strong>
        <span>这道题还没有匹配到方法卡。</span>
      </div>
    `;
    return;
  }

  const { tag, primary, secondary } = bundle;
  const cues = firstNonEmptyList(primary.recognition_cues, primary.applies_to);
  const steps = firstNonEmptyList(tag.key_steps, primary.step_template);
  const formulas = uniqueValues([...(tag.core_formula_latex || []), ...(primary.key_formulas_latex || [])]).slice(0, 4);
  const pitfalls = firstNonEmptyList(tag.pitfalls, primary.pitfalls);

  els.methodInsight.innerHTML = `
    <div class="method-head">
      <div>
        <span class="method-eyebrow">${escapeHtml(primary.category || "通性通法")}</span>
        <h3>${escapeHtml(primary.title || "本题通法")}</h3>
      </div>
      <span class="difficulty-badge">难度 ${escapeHtml(tag.difficulty || "-")}</span>
    </div>
    ${renderMethodPills(tag.topic_tags)}
    ${tag.summary ? `<p class="method-summary">${formatInline(escapeHtml(tag.summary))}</p>` : ""}
    <div class="method-grid">
      ${renderMethodList("识别信号", cues)}
      ${renderMethodList("解题步骤", steps)}
      ${renderMethodList("关键公式", formulas, true)}
      ${renderMethodList("易错点", pitfalls)}
    </div>
    ${
      secondary.length
        ? `<div class="related-methods"><span>关联通法</span>${secondary
            .map((item) => `<strong>${escapeHtml(item.title || item.method_id)}</strong>`)
            .join("")}</div>`
        : ""
    }
  `;
  typesetMath();
}

function renderMethodPills(items = []) {
  if (!items.length) return "";
  return `<div class="method-pills">${items.slice(0, 5).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderMethodList(title, items = [], formatMath = false) {
  const cleanItems = uniqueValues(items).filter(Boolean).slice(0, 4);
  if (!cleanItems.length) return "";
  return `
    <section class="method-mini">
      <h4>${title}</h4>
      <ul>
        ${cleanItems.map((item) => `<li>${formatMath ? renderFormulaInline(item) : escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderFormulaInline(value) {
  const escaped = escapeHtml(value);
  return window.MethodUtils?.wrapLatexFormula(escaped) || `\\(${escaped}\\)`;
}

function renderSolution() {
  const question = getSelectedQuestion();
  const activeTab = ui.activeTab;

  const isReasonVisible = activeTab === "reason" && ui.revealReason;
  const isAnswerVisible = activeTab === "answer" && ui.revealAnswer;
  els.revealReasonBtn.classList.toggle("active", isReasonVisible);
  els.revealAnswerBtn.classList.toggle("active", isAnswerVisible);
  els.revealReasonBtn.setAttribute("aria-pressed", String(isReasonVisible));
  els.revealAnswerBtn.setAttribute("aria-pressed", String(isAnswerVisible));

  if (!question) {
    els.solutionContent.className = "content-block solution-content locked";
    els.solutionContent.innerHTML = `<p><strong>尚未选择题目</strong><span>从左侧章节中选择一道题开始。</span></p>`;
    return;
  }

  const solution = question.solution || {};
  const canShow = activeTab === "reason" ? ui.revealReason : ui.revealAnswer;
  const text = activeTab === "reason" ? solution.reasoning_text : solution.answer_text;
  if (!canShow) {
    els.solutionContent.className = "content-block solution-content locked";
    els.solutionContent.innerHTML = `<p><strong>${activeTab === "reason" ? "解题思路未显示" : "答案未显示"}</strong><span>点击上方页签查看解析内容。</span></p>`;
    return;
  }

  els.solutionContent.className = "content-block solution-content";
  els.solutionContent.innerHTML = renderMarkdown(text || "暂无内容");
  typesetMath();
}

function updateSummary() {
  const mastered = questions.filter((q) => getQuestionState(q.id).status === "mastered").length;
  const blur = questions.filter((q) => getQuestionState(q.id).status === "blur").length;
  const favorite = questions.filter((q) => getQuestionState(q.id).favorite).length;
  els.summaryStrip.innerHTML = `
    <div><strong>${questions.length}</strong><span>题目</span></div>
    <div><strong>${mastered}</strong><span>掌握</span></div>
    <div><strong>${blur}</strong><span>模糊</span></div>
    <div><strong>${favorite}</strong><span>收藏</span></div>
  `;
}

function updateNavButtons() {
  const list = filteredQuestions.length ? filteredQuestions : questions;
  const index = list.findIndex((q) => q.id === ui.selectedId);
  els.prevBtn.disabled = index <= 0;
  els.nextBtn.disabled = index < 0 || index >= list.length - 1;
}

function moveSelection(direction) {
  const list = filteredQuestions.length ? filteredQuestions : questions;
  const index = list.findIndex((q) => q.id === ui.selectedId);
  const next = list[index + direction];
  if (next) selectQuestion(next.id);
}

function selectQuestion(id) {
  ui.selectedId = id;
  const question = getSelectedQuestion();
  if (question && !testMode) {
    filters.chapter = String(question.chapter);
  }
  ui.revealReason = false;
  ui.revealAnswer = false;
  ui.activeTab = "reason";
  renderAll();
}

function getSelectedQuestion() {
  return questions.find((question) => question.id === ui.selectedId) || null;
}

function getQuestionMethodBundle(id) {
  return window.MethodUtils?.getQuestionMethodBundle(id, methodLookup) || null;
}

function getQuestionState(id) {
  return practiceState.byId[id] || {};
}

function updateQuestionState(id, patch, options = {}) {
  practiceState.byId[id] = {
    ...getQuestionState(id),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  savePracticeState();
  if (!options.quiet) updateSummary();
}

function loadPracticeState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      version: 1,
      byId: parsed.byId && typeof parsed.byId === "object" ? parsed.byId : {}
    };
  } catch {
    return { version: 1, byId: {} };
  }
}

function savePracticeState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(practiceState));
}

function syncHash(id) {
  if (!id) return;
  const hash = `#${encodeURIComponent(id)}`;
  if (window.location.hash !== hash) {
    history.replaceState(null, "", hash);
  }
}

function compactSnippet(text) {
  return String(text || "")
    .replace(/\$\$[\s\S]*?\$\$/g, "公式")
    .replace(/\$[^$]*\$/g, "公式")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

function firstNonEmptyList(...lists) {
  return lists.find((items) => Array.isArray(items) && items.length) || [];
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value)))];
}

function renderMarkdown(input) {
  const text = escapeHtml(String(input || ""));
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let paragraph = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("|")) {
      flushParagraph(chunks, paragraph);
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      chunks.push(renderTable(tableLines));
      continue;
    }

    if (!line.trim()) {
      flushParagraph(chunks, paragraph);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph(chunks, paragraph);
  return chunks.join("");
}

function flushParagraph(chunks, paragraph) {
  if (!paragraph.length) return;
  const raw = paragraph.join("<br />");
  chunks.push(`<p>${formatInline(raw)}</p>`);
  paragraph.length = 0;
}

function renderTable(lines) {
  const rows = lines
    .filter((line) => !/^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim()))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => formatInline(cell.trim()))
    );
  if (!rows.length) return "";
  const head = rows[0];
  const body = rows.slice(1);
  return `
    <table>
      <thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>
      <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function formatInline(text) {
  const protectedSegments = [];
  let output = protectInlineSegments(text, protectedSegments);
  output = autoWrapBareLatex(output);
  output = output.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return restoreInlineSegments(output, protectedSegments);
}

function protectInlineSegments(text, protectedSegments) {
  return text.replace(/(`[^`]+`|\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g, (match) => {
    const key = `@@INLINE_PROTECTED_${protectedSegments.length}@@`;
    protectedSegments.push(match.startsWith("`") ? `<code>${match.slice(1, -1)}</code>` : match);
    return key;
  });
}

function restoreInlineSegments(text, protectedSegments) {
  return text.replace(/@@INLINE_PROTECTED_(\d+)@@/g, (_, index) => protectedSegments[Number(index)] || "");
}

function autoWrapBareLatex(text) {
  const wrappedSegments = [];
  const fractionPattern =
    /(^|[\s([{（，、；：。])((?:\\(?:frac|dfrac|tfrac)\{(?:[^{}]|\{[^{}]*\})+\}\{(?:[^{}]|\{[^{}]*\})+\}))/g;
  const commandPattern =
    /(^|[\s([{（，、；：。])((?:\\(?:frac|dfrac|tfrac|sum|prod|sqrt|cdot|times|ddot|dot|bar|overline|hat|tilde|vec|left|right|leq|geq|le|ge|neq|approx|infty|alpha|beta|gamma|delta|theta|lambda|mu|nu|omega|pi|int|lim|ln|log|exp|sin|cos|tan|Pr|mathrm|operatorname|text)(?![A-Za-z]))(?:&(?:lt|gt|amp);|[A-Za-z0-9_{}^+\-*/=()[\].,:|\\\s?!])*)/g;
  let output = text.replace(fractionPattern, (match, prefix, expression) =>
    protectAutoLatex(prefix, expression, wrappedSegments)
  );
  output = output.replace(commandPattern, (match, prefix, expression) =>
    protectAutoLatex(prefix, expression, wrappedSegments)
  );

  output = output
    .replace(/(^|[^\w\\])([A-Za-z]{1,4}_(?:\{[^\s<，。；：、,.;!?=()]*\}|[A-Za-z0-9]+))/g, "$1\\($2\\)")
    .replace(/(^|[^\w\\])(_(?:\{[^\s<，。；：、,.;!?=()]*\}|[A-Za-z0-9]+)[A-Za-z]{1,4}(?:_(?:\{[^\s<，。；：、,.;!?=()]*\}|[A-Za-z0-9]+))?)/g, "$1\\($2\\)")
    .replace(/(^|[^\w\\])([A-Za-z]{1,4}\^\{[^\s<，。；：、,.;!?=()]*\})/g, "$1\\($2\\)");

  return output.replace(/@@LATEXBLOCK(\d+)@@/g, (_, index) => wrappedSegments[Number(index)] || "");
}

function protectAutoLatex(prefix, expression, wrappedSegments) {
  const leading = expression.match(/^\s*/)?.[0] || "";
  const trailing = expression.match(/\s*$/)?.[0] || "";
  let body = expression.slice(leading.length, expression.length - trailing.length);
  let punctuation = "";
  body = body.replace(/([,.;:!?]+)$/, (match) => {
    punctuation = match;
    return "";
  });
  body = body.replace(/\?/g, "");
  if (!body.trim()) return `${prefix}${expression}`;
  if (!hasBalancedMathBraces(body)) return `${prefix}${expression}`;
  const key = `@@LATEXBLOCK${wrappedSegments.length}@@`;
  wrappedSegments.push(`${leading}\\(${body}\\)${punctuation}${trailing}`);
  return `${prefix}${key}`;
}

function hasBalancedMathBraces(value) {
  let depth = 0;
  for (const char of value) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function typesetMath() {
  const targets = [els.questionBody, els.methodInsight, els.solutionContent].filter(Boolean);
  if (window.MathJax?.typesetPromise) {
    mathRetry = 0;
    window.MathJax.typesetClear?.(targets);
    window.MathJax.typesetPromise(targets).catch(() => {});
    return;
  }
  if (mathRetry < 80) {
    mathRetry += 1;
    window.setTimeout(typesetMath, 250);
  }
}

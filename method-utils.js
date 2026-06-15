(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.MethodUtils = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function indexBy(items, key) {
    return new Map((items || []).filter((item) => item && item[key]).map((item) => [String(item[key]), item]));
  }

  function buildMethodLookup(methodCards, questionTags) {
    return {
      methodsById: indexBy(methodCards, "method_id"),
      tagsByQuestionId: indexBy(questionTags, "question_id")
    };
  }

  function getQuestionMethodBundle(questionId, lookup) {
    if (!questionId || !lookup) return null;
    const tag = lookup.tagsByQuestionId.get(String(questionId));
    if (!tag) return null;

    const primary = lookup.methodsById.get(String(tag.primary_method_id || ""));
    const secondary = (tag.secondary_method_ids || [])
      .map((id) => lookup.methodsById.get(String(id)))
      .filter(Boolean);

    if (!primary) return null;
    return { tag, primary, secondary };
  }

  function collectMethodSearchText(bundle) {
    if (!bundle) return "";
    const values = [
      bundle.primary,
      ...bundle.secondary,
      bundle.tag
    ].flatMap((item) => [
      item.title,
      item.category,
      item.question_type,
      item.summary,
      item.core_idea,
      ...(item.topic_tags || []),
      ...(item.applies_to || []),
      ...(item.recognition_cues || []),
      ...(item.key_steps || []),
      ...(item.step_template || []),
      ...(item.core_formula_latex || []),
      ...(item.key_formulas_latex || []),
      ...(item.pitfalls || [])
    ]);
    return values.filter(Boolean).join(" ");
  }

  function wrapLatexFormula(value) {
    const formula = String(value || "").trim();
    if (!formula) return "";
    if (
      /^\\\([\s\S]*\\\)$/.test(formula) ||
      /^\\\[[\s\S]*\\\]$/.test(formula) ||
      /^\$\$[\s\S]*\$\$$/.test(formula) ||
      /^\$[^$][\s\S]*[^$]\$$/.test(formula)
    ) {
      return formula;
    }
    return `\\(${formula}\\)`;
  }

  return {
    buildMethodLookup,
    getQuestionMethodBundle,
    collectMethodSearchText,
    wrapLatexFormula
  };
});

(function attachTestModeOrder(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TestModeOrder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTestModeOrder() {
  const TEST_GROUP_COUNT = 5;
  const SEED_PREFIX = "life-actuarial-practice-test-order-v1";

  function normalizeGroupIndex(value, groupCount = TEST_GROUP_COUNT) {
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index < groupCount ? index : 0;
  }

  function getNextGroupIndex(currentIndex, groupCount = TEST_GROUP_COUNT) {
    return (normalizeGroupIndex(currentIndex, groupCount) + 1) % groupCount;
  }

  function getGroupLabel(groupIndex, groupCount = TEST_GROUP_COUNT) {
    const normalized = normalizeGroupIndex(groupIndex, groupCount);
    return `第 ${normalized + 1}/${groupCount} 组`;
  }

  function buildTestOrder(ids, groupIndex = 0, groupCount = TEST_GROUP_COUNT) {
    const normalized = normalizeGroupIndex(groupIndex, groupCount);
    const order = [...ids];
    const random = seededRandom(hashString(`${SEED_PREFIX}:${groupCount}:${normalized}`));

    for (let index = order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }

    return order;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function nextRandom() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    TEST_GROUP_COUNT,
    buildTestOrder,
    getGroupLabel,
    getNextGroupIndex,
    normalizeGroupIndex
  };
});

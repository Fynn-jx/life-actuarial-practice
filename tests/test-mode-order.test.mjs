import test from "node:test";
import assert from "node:assert/strict";
import TestModeOrder from "../test-mode-order.js";

const ids = Array.from({ length: 112 }, (_, index) => `life_actuarial_q${String(index + 1).padStart(3, "0")}`);

test("same group always produces the same full-question order", () => {
  const first = TestModeOrder.buildTestOrder(ids, 0);
  const second = TestModeOrder.buildTestOrder(ids, 0);

  assert.deepEqual(first, second);
  assert.equal(first.length, ids.length);
  assert.equal(new Set(first).size, ids.length);
  assert.deepEqual([...first].sort(), [...ids].sort());
  assert.notDeepEqual(first, ids);
});

test("different groups produce different deterministic full-question orders", () => {
  const groups = Array.from({ length: TestModeOrder.TEST_GROUP_COUNT }, (_, groupIndex) =>
    TestModeOrder.buildTestOrder(ids, groupIndex)
  );

  assert.equal(new Set(groups.map((group) => group.join("|"))).size, TestModeOrder.TEST_GROUP_COUNT);
  for (const group of groups) {
    assert.equal(group.length, ids.length);
    assert.deepEqual([...group].sort(), [...ids].sort());
  }
});

test("group index normalization and cycling are stable", () => {
  assert.equal(TestModeOrder.normalizeGroupIndex(undefined), 0);
  assert.equal(TestModeOrder.normalizeGroupIndex(-1), 0);
  assert.equal(TestModeOrder.normalizeGroupIndex(99), 0);
  assert.equal(TestModeOrder.normalizeGroupIndex(3), 3);
  assert.equal(TestModeOrder.getNextGroupIndex(0), 1);
  assert.equal(TestModeOrder.getNextGroupIndex(4), 0);
  assert.equal(TestModeOrder.getGroupLabel(0), "第 1/5 组");
  assert.equal(TestModeOrder.getGroupLabel(4), "第 5/5 组");
});

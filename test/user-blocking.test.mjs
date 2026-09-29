import assert from "node:assert/strict";
import test from "node:test";

import {
  addUserBlockRule,
  DEFAULT_USER_BLOCKING_STATE,
  normalizeUserBlockingState,
  removeUserBlockRule,
  shouldBlockUser,
} from "../packages/douyu-web-enhancer/src/features/user-blocking.ts";

test("user rules apply globally or in one current room", () => {
  const global = addUserBlockRule(DEFAULT_USER_BLOCKING_STATE, "123", null);
  const both = addUserBlockRule(global, "456", "52");
  const enabled = { ...both, enabled: true };
  assert.equal(shouldBlockUser(enabled, "52", "123", "52"), true);
  assert.equal(shouldBlockUser(enabled, "53", "123", "53"), true);
  assert.equal(shouldBlockUser(enabled, "52", "456", "52"), true);
  assert.equal(shouldBlockUser(enabled, "53", "456", "53"), false);
  assert.equal(shouldBlockUser(enabled, "52", "456", "53"), false);
  assert.equal(shouldBlockUser(both, "52", "123", "52"), false);
  assert.equal(shouldBlockUser(enabled, null, "123", "52"), false);
  assert.equal(shouldBlockUser(removeUserBlockRule(enabled, "456", "52"), "52", "456", "52"), false);
});

test("rules deduplicate exact scope, reject bad identifiers, and fail closed on corrupt storage", () => {
  const one = addUserBlockRule(DEFAULT_USER_BLOCKING_STATE, " 123 ", null);
  assert.equal(addUserBlockRule(one, "123", null), one);
  assert.throws(() => addUserBlockRule(one, "001", null));
  assert.throws(() => addUserBlockRule(one, "123", "0"));
  assert.deepEqual(normalizeUserBlockingState({ schemaVersion: 1, enabled: true, rules: [{ uid: "abc", roomId: null }] }), DEFAULT_USER_BLOCKING_STATE);
  assert.deepEqual(normalizeUserBlockingState({ schemaVersion: 1, enabled: true, rules: [{ uid: "123", roomId: null }, { uid: "123", roomId: null }] }), { ...one, enabled: true });
});

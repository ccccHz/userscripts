import assert from "node:assert/strict";
import test from "node:test";

import {
  addUserBlockRule,
  changeUserBlockRuleFromShortcut,
  DEFAULT_USER_BLOCKING_STATE,
  normalizeUserBlockingState,
  removeUserBlockRule,
  shouldBlockUser,
  shouldBlockUserEntry,
} from "../packages/douyu-web-enhancer/src/features/user-blocking.ts";
import {
  uidFromOfficialProfileLink,
} from "../packages/douyu-web-enhancer/src/features/user-block-shortcuts.ts";

test("entry switch defaults off for existing rules and works independently of chat", () => {
  const stored = { schemaVersion: 1, enabled: true, rules: [{ uid: "123", roomId: "52" }] };
  const migrated = normalizeUserBlockingState(stored);
  assert.equal(migrated.entriesEnabled, false);
  assert.equal(shouldBlockUserEntry(migrated, "52", "123", "52"), false);
  const entriesOnly = { ...migrated, enabled: false, entriesEnabled: true };
  assert.equal(shouldBlockUserEntry(entriesOnly, "52", "123", "52"), true);
  assert.equal(shouldBlockUser(entriesOnly, "52", "123", "52"), false);
  assert.equal(shouldBlockUserEntry(entriesOnly, "53", "123", "53"), false);
  assert.equal(shouldBlockUserEntry(entriesOnly, "52", "123", "53"), false);
  assert.equal(shouldBlockUserEntry(entriesOnly, "52", "456", "52"), false);
  assert.equal(normalizeUserBlockingState(entriesOnly).entriesEnabled, true);
});

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

test("quick action enables a saved rule atomically and removes only the selected scope", () => {
  const local = changeUserBlockRuleFromShortcut(DEFAULT_USER_BLOCKING_STATE, "123", "52", true);
  assert.equal(local.enabled, true);
  assert.equal(shouldBlockUser(local, "52", "123", "52"), true);
  const both = changeUserBlockRuleFromShortcut(local, "123", null, true);
  const removed = changeUserBlockRuleFromShortcut(both, "123", "52", false);
  assert.deepEqual(removed.rules, [{ uid: "123", roomId: null }]);
  assert.equal(removed.enabled, true);
});

test("quick action only accepts UID from official identity fields", () => {
  assert.equal(uidFromOfficialProfileLink("//yuba.douyu.com/wbapi/web/jumpusercenter?id=123&name=test", "https://www.douyu.com/52"), "123");
  assert.equal(uidFromOfficialProfileLink("/wbapi/web/jumpusercenter?id=123", "https://www.douyu.com/52"), null);
  assert.equal(uidFromOfficialProfileLink("//yuba.douyu.com/wbapi/web/jumpusercenter?id=001", "https://www.douyu.com/52"), null);
});

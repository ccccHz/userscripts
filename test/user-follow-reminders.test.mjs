import assert from "node:assert/strict";
import test from "node:test";
import { UserFollowReminders } from "../packages/douyu-web-enhancer/src/features/user-follow-reminders.ts";
import { readDouyuUserMessages } from "../packages/douyu-web-enhancer/src/core/douyu-user-messages.ts";
import { DEFAULT_USER_FOLLOWING_STATE, selectFollowedMessages, shouldRemindUser } from "../packages/douyu-web-enhancer/src/features/user-following.ts";
import { UserBlockHistory } from "../packages/douyu-web-enhancer/src/features/user-block-history.ts";

const chat = { uid: "123", roomId: "52", nickname: "viewer", text: "hello", kind: "chatmsg" };
test("gift observations require explicit sender, room and quantity; reminders preserve history while recording switches are off", async () => {
  const messages = readDouyuUserMessages(["type@=dgb/rid@=52/uid@=123/nn@=viewer/gfid@=824/gfcnt@=72/gfn@=荧光棒/", "type@=spbc/rid@=52/uid@=123/", "type@=dgb/rid@=52/uid@=123/gfcnt@=bad/gfn@=礼物/"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "赠送 荧光棒 × 72");
  const state = { ...DEFAULT_USER_FOLLOWING_STATE, uids: ["123"], giftReminders: true };
  assert.deepEqual(selectFollowedMessages(state, "52", [chat, ...messages]), messages);
  assert.equal(shouldRemindUser(state, messages[0]), true);
  assert.equal(shouldRemindUser(state, chat), false);
  assert.deepEqual(selectFollowedMessages(state, "53", messages), []);
  const history = new UserBlockHistory(null, 50);
  await history.setRules([{ uid: "123", roomId: null }]); history.record(messages);
  assert.equal(history.snapshot()[0].recent[0].kind, "dgb"); history.dispose();
});

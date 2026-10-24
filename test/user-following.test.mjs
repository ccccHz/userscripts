import assert from "node:assert/strict";
import test from "node:test";
import { readDouyuUserMessages, isCompleteDouyuObservationFrame } from "../packages/douyu-web-enhancer/src/core/douyu-user-messages.ts";
import { encodeDouyuPacket } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import { DEFAULT_USER_FOLLOWING_STATE, normalizeUserFollowingState, changeUserFollow, selectFollowedMessages, followHistoryRules, sortFollowingByRecentActivity, ChatSpeedWindow } from "../packages/douyu-web-enhancer/src/features/user-following.ts";
import { UserBlockHistory, mergeBlockHistory } from "../packages/douyu-web-enhancer/src/features/user-block-history.ts";

const chat = { kind: "chatmsg", uid: "123", roomId: "52", nickname: "viewer", text: "hello" };
const enter = { ...chat, kind: "uenter", text: "" };

test("following ranks recent behaviour first, keeps ties and unobserved users stable, ignores name lookup time", () => {
  const uids = ["1","2","3","4","5"];
  const history = [{ uid:"1", nicknameAt:99999, recent:[] }, {uid:"2",recent:[{at:20}]}, {uid:"3",recent:[{at:10},{at:40}]}, {uid:"4",recent:[{at:20}]}];
  assert.deepEqual(sortFollowingByRecentActivity(uids, history), ["3","2","4","1","5"]);
  assert.deepEqual(uids, ["1","2","3","4","5"]);
});

test("global following has independent opt-in switches, validated rules and current-room selection", () => {
  const followed = changeUserFollow(DEFAULT_USER_FOLLOWING_STATE, "123", true);
  assert.equal(followed.chatsEnabled, true);
  assert.equal(followed.entriesEnabled, false);
  assert.deepEqual(followHistoryRules(followed), [{ uid: "123", roomId: null }]);
  assert.deepEqual(normalizeUserFollowingState({ ...followed, uids: ["123", "123"] }).uids, ["123"]);
  assert.deepEqual(normalizeUserFollowingState({ ...followed, uids: ["001"] }), DEFAULT_USER_FOLLOWING_STATE);
  assert.throws(() => changeUserFollow(followed, "001", true));
  const both = { ...followed, entriesEnabled: true };
  assert.deepEqual(selectFollowedMessages(followed, "52", [chat, enter]), [chat]);
  assert.deepEqual(selectFollowedMessages(both, "52", [chat, enter, { ...chat, uid: "456" }, { ...chat, roomId: "53" }]), [chat, enter]);
  assert.deepEqual(selectFollowedMessages(both, "53", [{ ...chat, roomId: "53" }]), [{ ...chat, roomId: "53" }]);
  assert.deepEqual(selectFollowedMessages(changeUserFollow(both, "123", false), "52", [chat]), []);
  assert.deepEqual(selectFollowedMessages({ ...both, chatsEnabled: false, entriesEnabled: false }, "52", [chat, enter]), []);
});

test("user message reader decodes STT, excludes unsupported types and invalid identity", () => {
  const result = readDouyuUserMessages(["type@=chatmsg/rid@=52/uid@=123/nn@=name@Sx/txt@=hello@Athere/\0type@=uenter/rid@=52/uid@=123/nn@=name/", "type@=dgb/rid@=52/uid@=123/", "type@=chatmsg/rid@=52/uid@=001/", "type@=uenter/uid@=123/"]);
  assert.deepEqual(result.map(item => item.kind), ["chatmsg", "uenter"]);
  assert.equal(result[0].nickname, "name/x"); assert.equal(result[0].text, "hello@there");
  const bytes = encodeDouyuPacket("type@=chatmsg/rid@=52/uid@=123/");
  assert.equal(isCompleteDouyuObservationFrame(bytes), true);
  assert.equal(isCompleteDouyuObservationFrame(bytes.slice(0, -1)), false);
  new DataView(bytes).setUint32(4, 100, true);
  assert.equal(isCompleteDouyuObservationFrame(bytes), false);
});

test("fifty mixed observations survive save, reload and cancel/re-add without affecting ten-entry block history", async () => {
  const disk = new Map();
  const persistence = {
    async load(uids) { return { users: uids.flatMap(uid => disk.has(uid) ? [structuredClone(disk.get(uid))] : []), rooms: [] }; },
    async commit(deltas) { return deltas.map(delta => { const old = disk.get(delta.uid) ?? { uid: delta.uid, nickname: "", nicknameAt: 0, count: 0, recent: [] }; const merged = mergeBlockHistory(old, delta, 50); disk.set(delta.uid, merged); return structuredClone(merged); }); },
    async clear() {},
  };
  const history = new UserBlockHistory(persistence, 50);
  const rules = [{ uid: "123", roomId: null }];
  await history.setRules(rules);
  for (let i = 0; i < 55; i++) history.record([i % 2 ? enter : { ...chat, text: String(i) }], 1000 + i);
  await history.flush();
  assert.equal(history.snapshot()[0].recent.length, 50);
  const reloaded = new UserBlockHistory(persistence, 50);
  await reloaded.setRules(rules);
  assert.equal(reloaded.snapshot()[0].count, 55);
  assert.equal(reloaded.snapshot()[0].recent.at(-1).at, 1005);
  assert.equal(reloaded.snapshot()[0].recent[1].kind, "uenter");
  await reloaded.setRules([]); await reloaded.setRules(rules);
  assert.equal(reloaded.snapshot()[0].recent.length, 50);
  const block = new UserBlockHistory(); await block.setRules(rules);
  for (let i = 0; i < 55; i++) block.record([chat], i);
  assert.equal(block.snapshot()[0].recent.length, 10);
  history.dispose(); reloaded.dispose(); block.dispose();
});

test("speed window counts chat before filtering, expires buckets, pauses and resets on room changes", () => {
  const speed = new ChatSpeedWindow();
  speed.configure(true, "52", 0);
  speed.record([chat, enter, { ...chat, roomId: "53" }], 0);
  speed.record([chat], 59000);
  assert.equal(speed.snapshot(59000).count, 2);
  assert.equal(speed.snapshot(60000).count, 1);
  assert.equal(speed.snapshot(120000).count, 0);
  assert.equal(speed.snapshot(120000).observedSeconds, 60);
  speed.configure(true, "53", 120000);
  assert.equal(speed.snapshot(120000).count, 0);
  speed.record([{ ...chat, roomId: "53" }], 121000);
  assert.equal(speed.snapshot(121000).count, 1);
  speed.configure(false, "53", 122000); speed.record([chat], 122000);
  assert.equal(speed.snapshot(122000).count, 0);
});

test("dual speed windows extrapolate startup and respond to bursts independently", () => {
  const speed = new ChatSpeedWindow();
  speed.configure(true, "52", 0);
  speed.record(Array(10).fill(chat), 0);
  assert.equal(speed.snapshot(500).instantRate, null);
  assert.equal(speed.snapshot(2000).instantRate, 300);
  assert.equal(speed.snapshot(2000).averageRate, 300);
  speed.record(Array(20).fill(chat), 4000);
  assert.equal(speed.snapshot(4000).instantRate, 450);
  assert.equal(speed.snapshot(4000).averageRate, 450);
  assert.equal(speed.snapshot(5000).instantRate, 240);
  assert.equal(speed.snapshot(5000).averageRate, 360);
  assert.equal(speed.snapshot(9000).instantRate, 0);
  assert.equal(speed.snapshot(9000).averageRate, 200);
  speed.record(Array(100).fill(chat), 59000);
  assert.equal(speed.snapshot(60000).instantRate, 1200);
  assert.equal(speed.snapshot(60000).averageRate, 120);
  assert.equal(speed.snapshot(64000).instantRate, 0);
  assert.equal(speed.snapshot(64000).averageRate, 100);
  speed.configure(true, "53", 64000);
  assert.equal(speed.snapshot(64000).averageRate, null);
});

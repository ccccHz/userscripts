import assert from "node:assert/strict";
import test from "node:test";
import { UserBlockHistory, mergeBlockHistory, createBrowserUserBlockHistoryPersistence } from "../packages/douyu-web-enhancer/src/features/user-block-history.ts";

const rules = [{ uid: "123", roomId: "52" }, { uid: "123", roomId: null }];
const chat = (text = "hello", nickname = "viewer") => ({ uid: "123", roomId: "52", text, nickname });
function memoryDisk() {
  const users = new Map(); const rooms = new Map();
  let fail = false; let commits = 0;
  return {
    users, rooms,
    get commits() { return commits; },
    set fail(value) { fail = value; },
    async load(uids, ids) { return structuredClone({ users: uids.flatMap(uid => users.has(uid) ? [users.get(uid)] : []), rooms: ids.flatMap(id => rooms.has(id) ? [rooms.get(id)] : []) }); },
    async commit(deltas, names) {
      if (fail) throw new Error("disk full");
      commits++;
      const saved = deltas.map(delta => {
        const old = users.get(delta.uid) ?? { uid: delta.uid, nickname: "", nicknameAt: 0, count: 0, recent: [] };
        const next = mergeBlockHistory(old, delta);
        users.set(delta.uid, structuredClone(next));
        return next;
      });
      for (const name of names) if (!rooms.has(name.roomId) || rooms.get(name.roomId).updatedAt <= name.updatedAt) rooms.set(name.roomId, structuredClone(name));
      return structuredClone(saved);
    },
    async clear(uid) { const entry = users.get(uid); if (entry) users.set(uid, { ...entry, count: 0, recent: [] }); },
  };
}

test("names, room identity, totals and last ten survive reload and remove/re-add", async () => {
  const disk = memoryDisk(); const first = new UserBlockHistory(disk);
  await first.setRules(rules);
  first.rememberRoom("52", "主播甲", 1);
  first.rememberNickname("123", "旧昵称", 1);
  for (let i = 0; i < 12; i++) first.record([chat(String(i))], i + 2);
  assert.equal(disk.commits, 0, "message path does not write per message");
  await first.flush(); first.dispose();
  const second = new UserBlockHistory(disk);
  await second.setRules(rules);
  assert.equal(second.snapshot()[0].count, 12);
  assert.equal(second.snapshot()[0].recent.length, 10);
  assert.equal(second.snapshot()[0].recent[0].text, "11");
  assert.equal(second.roomName("52"), "主播甲");
  second.rememberRoom("52", "主播乙", 30);
  second.record([chat("new", "最新昵称")], 30);
  await second.setRules([]);
  assert.deepEqual(second.snapshot(), []);
  assert.equal(disk.users.get("123").count, 13, "cancelling rules preserves persisted history");
  await second.setRules(rules);
  assert.equal(second.snapshot()[0].nickname, "最新昵称");
  assert.equal(second.snapshot()[0].count, 13);
  assert.equal(second.roomName("52"), "主播乙");
  second.dispose();
});

test("two page stores merge count increments and timestamped names without losing updates", async () => {
  const disk = memoryDisk(); const a = new UserBlockHistory(disk); const b = new UserBlockHistory(disk);
  await Promise.all([a.setRules(rules), b.setRules(rules)]);
  a.record([chat("a", "较新昵称")], 20);
  b.record([chat("b", "较旧昵称")], 10);
  await a.flush(); await b.flush();
  await a.setRules(rules);
  assert.equal(a.snapshot()[0].count, 2);
  assert.equal(a.snapshot()[0].nickname, "较新昵称");
  assert.deepEqual(a.snapshot()[0].recent.map(sample => sample.text), ["a", "b"]);
  a.dispose(); b.dispose();
});

test("failed save keeps visible totals and retries the same delta once; clear keeps identities", async () => {
  const disk = memoryDisk(); const store = new UserBlockHistory(disk);
  await store.setRules(rules);
  store.rememberRoom("52", "主播", 1);
  store.record([chat()], 1);
  disk.fail = true;
  await store.flush();
  assert.equal(store.status, "error");
  assert.equal(store.snapshot()[0].count, 1);
  await assert.rejects(store.clear("123"), /保存失败/);
  disk.fail = false;
  store.record([chat("next")], 2);
  await store.flush();
  assert.equal(disk.users.get("123").count, 2);
  assert.equal(store.snapshot()[0].count, 2);
  await store.clear("123");
  assert.equal(store.snapshot()[0].count, 0);
  assert.deepEqual(store.snapshot()[0].recent, []);
  assert.equal(store.snapshot()[0].nickname, "viewer");
  assert.equal(store.roomName("52"), "主播");
  store.dispose();
});

test("messages received while saving stay visible and persist in a later batch", async () => {
  const disk = memoryDisk(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const store = new UserBlockHistory({ ...disk, async commit(users, rooms) { await gate; return disk.commit(users, rooms); } });
  await store.setRules(rules);
  store.record([chat("first")], 1);
  const writing = store.flush();
  store.record([chat("second")], 2);
  assert.equal(store.snapshot()[0].count, 2);
  release(); await writing; await store.flush();
  assert.equal(store.snapshot()[0].count, 2);
  assert.equal(disk.users.get("123").count, 2);
  store.dispose();
});

test("unavailable IndexedDB reports failure but does not lose the live count", async () => {
  const store = new UserBlockHistory(createBrowserUserBlockHistoryPersistence(null));
  await store.setRules(rules);
  assert.equal(store.status, "error");
  store.record([chat()], 1);
  await store.flush();
  assert.equal(store.status, "error");
  assert.equal(store.snapshot()[0].count, 1);
  store.dispose();
});

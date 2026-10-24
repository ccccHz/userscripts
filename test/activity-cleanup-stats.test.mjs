import assert from "node:assert/strict";
import test from "node:test";
import { ActivityCleanupStats, mergeActivityStats, createBrowserActivityCleanupPersistence } from "../packages/douyu-web-enhancer/src/features/activity-cleanup-stats.ts";
import { createActivityLinkCleanupFeature, confirmedActivityRoom } from "../packages/douyu-web-enhancer/src/features/activity-link-cleanup.ts";

function storage() {
  const rooms = new Map(); let count = 0, lastAt = 0;
  return {
    async load() { return { count, lastAt, rooms: [...rooms.values()].map(room => ({ ...room })) }; },
    async commit(deltas) {
      for (const delta of deltas) {
        rooms.set(delta.roomId, mergeActivityStats(rooms.get(delta.roomId) ?? { roomId:delta.roomId, count:0, lastAt:0 }, delta));
        count += delta.count; lastAt = Math.max(lastAt, delta.lastAt);
      }
      return this.load();
    },
  };
}

test("activity counts only successful Socket filtering, separate rooms, persist totals without content", async () => {
  const disk = storage(), stats = new ActivityCleanupStats(disk, () => "52");
  await stats.load();
  stats.recordFiltered("52", 2, 1200);
  stats.recordFiltered("53", 1, 1400);
  stats.recordFiltered("001", 1, 1500);
  assert.deepEqual(stats.snapshot(), { count:3, lastAt:1400, rooms:[{roomId:"53",count:1,lastAt:1400},{roomId:"52",count:2,lastAt:1200}] });
  await stats.flush(); assert.equal(stats.status, "saved");
  const reload = new ActivityCleanupStats(disk, () => "52"); await reload.load();
  assert.equal(reload.snapshot().count, 3);
  assert.deepEqual(Object.keys(reload.snapshot().rooms[0]).sort(), ["count", "lastAt", "roomId"]);
  stats.dispose(); reload.dispose();
});

test("concurrent owners add deltas and a failed write retains pending counts for retry", async () => {
  const disk = storage(), first = new ActivityCleanupStats(disk, () => "52"), second = new ActivityCleanupStats(disk, () => "52");
  await Promise.all([first.load(), second.load()]);
  first.recordFiltered("52", 1, 10); second.recordFiltered("52", 1, 20);
  await Promise.all([first.flush(), second.flush()]); assert.equal((await disk.load()).count, 2);
  let fail = true;
  const flaky = new ActivityCleanupStats({ load: () => disk.load(), commit: async (...args) => { if (fail) throw Error("busy"); return disk.commit(...args); } }, () => "53");
  await flaky.load(); flaky.recordFiltered("53", 1, 30);
  await flaky.flush(); assert.equal(flaky.status, "error"); assert.equal(flaky.snapshot().count, 3);
  fail = false; await flaky.flush(); assert.equal(flaky.snapshot().count, 3); assert.equal(flaky.status, "saved");
  first.dispose(); second.dispose(); flaky.dispose();
});

test("activity accounting follows enable/disable lifecycle and only the Socket callback counts", async () => {
  const stats = new ActivityCleanupStats(storage(), () => "52"); await stats.load();
  let active = false, filter = null, counted = null;
  const hook = { setActivityFilter(next, callback) { filter = next; counted = callback; } };
  const feature = createActivityLinkCleanupFeature(stats, () => "52", hook);
  const context = { diagnostics:{update(){}}, styles:{add(){active=true; return () => {active=false;};}} };
  const stop = feature.start(context);
  assert.equal(filter("type@=chatmsg/rid@=52/gadid@=29/txt@=event/"), "52");
  assert.equal(filter("type@=chatmsg/rid@=52/gadid@=48/txt@=event/"), "52");
  assert.equal(filter("type@=chatmsg/rid@=53/gadid@=48/txt@=event/"), null);
  assert.equal(filter("type@=chatmsg/rid@=52/txt@=合成大西瓜/"), null);
  assert.equal(filter("type@=chatmsg/rid@=52/gadid@=99/"), null);
  assert.equal(confirmedActivityRoom("type@=chatmsg/rid@=52/gadid@=29/", "53"), null);
  assert.equal(stats.snapshot().count, 0);
  counted(["52", "52"]); assert.equal(stats.snapshot().count, 2);
  stop(); assert.equal(active, false); assert.equal(filter, null);
  const stopAgain = feature.start(context); counted(["52"]); assert.equal(stats.snapshot().count, 3);
  stopAgain(); await stats.flush(); stats.dispose();
});

test("a row arriving during save remains visible in totals and is saved in the next batch", async () => {
  const disk = storage(); let release;
  const waiting = new Promise(resolve => { release=resolve; }); let commits=0;
  const stats = new ActivityCleanupStats({ load: () => disk.load(), commit:async (...args) => { if (++commits === 1) await waiting; return disk.commit(...args); } }, () => "52");
  stats.recordFiltered("52", 1, 1000); const write = stats.flush();
  stats.recordFiltered("52", 1, 2000); assert.equal(stats.snapshot().count, 2);
  release(); await write; assert.equal(stats.snapshot().count, 2);
  await stats.flush(); assert.equal((await disk.load()).count, 2); stats.dispose();
});

test("a snapshot read failure rolls back the browser transaction before retrying deltas", async () => {
  let disk = new Map(), failNextSnapshot = true, wroteTotal = false;
  const modes = [];
  // Transaction test double: FIFO requests, commit on completion, discard on abort.
  const db = { transaction(_name, mode) {
    modes.push(mode);
    const draft = new Map(disk); let pending = 0, ended = false;
    const tx = { objectStore: () => store };
    const enqueue = operation => {
      const request = {}; pending++;
      queueMicrotask(() => {
        if (ended) return;
        try { request.result = operation(); request.onsuccess?.(); }
        catch (error) { ended = true; tx.error = error; tx.onabort?.(); }
        finally {
          pending--;
          if (!pending && !ended) queueMicrotask(() => {
            if (pending || ended) return;
            ended = true; if (mode === "readwrite") disk = draft;
            tx.oncomplete?.();
          });
        }
      });
      return request;
    };
    const store = {
      get(key) { return enqueue(() => {
        if (key === "total" && wroteTotal && failNextSnapshot) {
          failNextSnapshot = false; throw Error("snapshot failed");
        }
        return draft.get(key);
      }); },
      put(value) { return enqueue(() => { draft.set(value.roomId, value); if (value.roomId === "total") wroteTotal = true; }); },
      index() { return { openCursor() {
        const rows = [...draft.values()].sort((a,b) => b.lastAt - a.lastAt); let offset = 0;
        const next = () => {
          const value = rows[offset++];
          return value ? { primaryKey:value.roomId, value, continue() {
            const following = enqueue(next); following.onsuccess = () => { request.result = following.result; request.onsuccess?.(); };
          } } : null;
        };
        const request = enqueue(next); return request;
      } }; },
    };
    return tx;
  } };
  const windowObject = { indexedDB:{ open() { const request = { result:db }; queueMicrotask(() => request.onsuccess?.()); return request; } } };
  const stats = new ActivityCleanupStats(createBrowserActivityCleanupPersistence(windowObject), () => "52");
  await stats.load(); stats.recordFiltered("52", 1, 1000);
  await stats.flush(); assert.equal(stats.status, "error"); assert.equal(disk.size, 0);
  await stats.flush(); assert.equal(stats.status, "saved"); assert.equal(stats.snapshot().count, 1);
  assert.equal(disk.get("total").count, 1); assert.equal(disk.get("52").count, 1);
  assert.deepEqual(modes, ["readonly", "readwrite", "readwrite"]);
  stats.dispose();
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { encodeDouyuPacket } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import { createCollection } from "../packages/douyu-web-enhancer/tools/socket-archive-core.mjs";
import { createArchiveStore } from "../packages/douyu-web-enhancer/tools/socket-archive-store.mjs";
import { startArchive } from "../packages/douyu-web-enhancer/tools/socket-archive.mjs";
import {
  TOTAL_RESEARCH_LIMIT,
  createRoomStore,
  measureResearchUsage,
  normalizeRoomPlan,
  parseMultiArgs,
  startMultiArchive,
} from "../packages/douyu-web-enhancer/tools/socket-archive-multi.mjs";

class FakeSocket extends EventTarget {
  static sockets = [];
  sent = [];
  readyState = 0;
  constructor(url) { super(); this.url = url; FakeSocket.sockets.push(this); }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  send(data) { this.sent.push(Buffer.from(data).subarray(12, -1).toString()); }
  receive(data) {
    const event = new Event("message");
    event.data = data;
    this.dispatchEvent(event);
  }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}

async function until(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("test-condition-timeout");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

async function within(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("test-completion-timeout")), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

async function recordsIn(directory) {
  const records = [];
  for (const name of (await readdir(directory)).filter((entry) => /^packets-\d+\.jsonl$/.test(entry)).sort()) {
    const text = await readFile(join(directory, name), "utf8");
    assert.ok(text.endsWith("\n"));
    records.push(...text.trim().split("\n").map(JSON.parse));
  }
  return records;
}

const packet = (text) => ({ text, packetType: 690 });
const hour = 3600_000;
const roomOptions = { maxRetries: 0, connectTimeoutMs: 5000, heartbeatMs: 5000 };
const fakeRoomDependencies = { WebSocketImpl: FakeSocket };

test("multi-room plans reject duplicate rooms and invalid resource requests before starting sockets", async () => {
  const rooms = Array.from({ length: 16 }, (_, index) => String(index + 1));
  assert.equal(normalizeRoomPlan(rooms).length, 16);
  assert.throws(() => normalizeRoomPlan(["52", { room: "52" }]), /duplicate-room/);
  assert.throws(() => normalizeRoomPlan([]), /invalid-room-count/);
  assert.throws(() => normalizeRoomPlan(Array.from({ length: 21 }, (_, index) => String(index + 1))), /invalid-room-count/);
  assert.throws(() => normalizeRoomPlan(["52/type@=chatmessage"]));
  assert.throws(() => normalizeRoomPlan([{ room: "52", name: "x".repeat(401) }]), /invalid-plan-metadata/);
  const parsed = await parseMultiArgs(["--rooms", "52, 12306", "--hours", "12", "--max-gb", "5"]);
  assert.deepEqual(parsed.rooms, [{ room: "52" }, { room: "12306" }]);
  assert.equal(parsed.durationMs, 12 * hour);
  assert.equal(parsed.maxBytes, TOTAL_RESEARCH_LIMIT);
  await assert.rejects(parseMultiArgs(["--rooms", "52", "--max-gb", "5.1"]), /invalid-resource-limits/);
  await assert.rejects(parseMultiArgs(["--rooms", "52", "--rooms", "12306"]), /invalid-arguments/);
});

test("sixteen fake room connections keep an individual retry failure isolated", async () => {
  FakeSocket.sockets = [];
  const directory = await mkdtemp(join(tmpdir(), "dwe-multi-sixteen-"));
  const rooms = Array.from({ length: 16 }, (_, index) => String(index + 100));
  const signalsBefore = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  const handle = await startMultiArchive({ rooms, directory, durationMs: 10_000, staggerMs: 0,
    statusMs: 5000, captureTemplate: false, roomOptions }, { roomDependencies: fakeRoomDependencies });
  try {
    await handle.ready;
    assert.equal(FakeSocket.sockets.length, 16);
    assert.equal(handle.report().startedRooms, 16);
    for (const socket of FakeSocket.sockets) socket.open();
    for (const [index, socket] of FakeSocket.sockets.entries()) {
      assert.deepEqual(socket.sent, [
        `type@=loginreq/roomid@=${rooms[index]}/`,
        `type@=joingroup/rid@=${rooms[index]}/gid@=-9999/`,
      ]);
      assert.match(socket.url, /^wss:\/\/danmuproxy\.douyu\.com:850[2-5]$/);
    }
    FakeSocket.sockets[0].close();
    await until(() => handle.report().rooms[0].reason === "retry-limit");
    const current = handle.report();
    assert.equal(current.running, true);
    assert.equal(current.rooms[0].running, false);
    assert.ok(current.rooms.slice(1).every((entry) => entry.running));
    FakeSocket.sockets[1].receive(encodeDouyuPacket("type@=rare_event/value@=PRIVATE_MESSAGE/uid@=SECRET_UID/"));
    await until(() => handle.report().rooms[1].collection.saved === 1);
    const final = await within(handle.stop());
    assert.equal(final.running, false);
    assert.ok(final.rooms.every((entry) => !entry.running));
    assert.doesNotMatch(JSON.stringify(final), /PRIVATE_MESSAGE|SECRET_UID/);
    const records = await recordsIn(directory);
    assert.equal(records.filter((entry) => entry.kind === "packet").length, 1);
    assert.equal(records.find((entry) => entry.kind === "packet").room, rooms[1]);
    assert.equal(JSON.parse(await readFile(join(directory, "status.json"), "utf8")).running, false);
  } finally { await handle.stop(); }
  assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")], signalsBefore);
});

test("room backpressure leaves shared queue capacity for another room and reserves actual serialized bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dwe-multi-budget-"));
  const shared = await createArchiveStore(directory, { maxBytes: 2000, statusReserve: 100,
    queueBytes: 400, segmentBytes: 500 });
  const firstRoom = createRoomStore(shared, "1", { queueBytes: 240 });
  const secondRoom = createRoomStore(shared, "2", { queueBytes: 240 });
  const thirdRoom = createRoomStore(shared, "3", { queueBytes: 1000 });
  try {
    const first = firstRoom.append({ kind: "packet", text: "x".repeat(130) });
    assert.equal(first.accepted, true);
    assert.equal(firstRoom.append({ kind: "packet", text: "x".repeat(130) }).reason, "room-queue-limit");
    const second = secondRoom.append({ kind: "packet", text: "small" });
    assert.equal(second.accepted, true);
    assert.equal(thirdRoom.append({ kind: "packet", text: "y".repeat(130) }).reason, "queue-limit");
    assert.ok(shared.snapshot().queuedBytes <= 400);
    assert.equal(await first.done, true);
    assert.equal(await second.done, true);
    assert.equal(firstRoom.snapshot().queuedBytes, 0);
    await firstRoom.close();
    assert.equal(firstRoom.append({ kind: "late" }).reason, "storage-closed");
    assert.equal(await secondRoom.append({ kind: "after-other-room-stopped" }).done, true);
    let rejection;
    for (let index = 0; index < 100; index += 1) {
      const write = thirdRoom.append({ kind: "packet", text: "z".repeat(130) });
      if (!write.accepted) { rejection = write.reason; break; }
      assert.equal(await write.done, true);
    }
    assert.equal(rejection, "disk-limit");
    assert.equal(shared.snapshot().queuedBytes, 0);
    await shared.status({ running: true });
    await shared.close();
    await shared.status({ running: false });
    const usage = await measureResearchUsage([directory]);
    assert.ok(usage.bytes <= 2000);
    const records = await recordsIn(directory);
    assert.equal(records.filter((entry) => entry.room === "1").length, 1);
    assert.ok(records.some((entry) => entry.room === "2" && entry.kind === "after-other-room-stopped"));
  } finally { await shared.close(); }
});

test("exhausting the shared budget stops every room and accounts for existing research bytes", async () => {
  FakeSocket.sockets = [];
  const directory = await mkdtemp(join(tmpdir(), "dwe-multi-exhaustion-"));
  const handle = await startMultiArchive({ rooms: ["52", "12306"], directory, durationMs: 10_000,
    staggerMs: 0, statusMs: 5000, captureTemplate: false, roomOptions,
    maxBytes: 50_000, priorBytes: 1000, storeOptions: { statusReserve: 8000 } },
  { roomDependencies: fakeRoomDependencies });
  try {
    await handle.ready;
    for (const socket of FakeSocket.sockets) socket.open();
    FakeSocket.sockets[0].receive(encodeDouyuPacket(`type@=rare_event/value@=${"x".repeat(40_000)}/`));
    const final = await within(handle.done);
    assert.equal(final.reason, "disk-limit");
    assert.ok(final.rooms.every((entry) => !entry.running));
    assert.equal(final.resources.totalLimitBytes, 50_000);
    assert.equal(final.resources.priorResearchBytes, 1000);
    assert.equal(final.resources.currentRunLimitBytes, 49_000);
    assert.equal(final.rooms[0].collection.selected, 0);
    assert.equal(final.rooms[0].collection.dropped["disk-limit"], 1);
    const usage = await measureResearchUsage([directory]);
    assert.ok(usage.bytes + 1000 <= 50_000);
  } finally { await handle.stop(); }
});

test("all rooms share one credential-free configuration snapshot and a room stop does not abort it", async () => {
  FakeSocket.sockets = [];
  const directory = await mkdtemp(join(tmpdir(), "dwe-multi-configuration-"));
  const childHandles = new Map();
  let fetchCount = 0;
  let fetchOptions;
  let releaseFetch;
  const response = new Promise((resolve) => { releaseFetch = resolve; });
  const handle = await startMultiArchive({ rooms: ["52", "12306", "60937"], directory,
    durationMs: 10_000, staggerMs: 0, statusMs: 5000, roomOptions }, {
    roomDependencies: fakeRoomDependencies,
    startRoom: async (options, dependencies) => {
      const child = await startArchive(options, dependencies);
      childHandles.set(options.room, child);
      return child;
    },
    fetchImpl: async (url, options) => {
      fetchCount += 1;
      fetchOptions = options;
      assert.equal(url, "https://wconf.douyucdn.cn/resource/common/comm_chatmsg_w.json");
      return response;
    },
  });
  try {
    await handle.ready;
    assert.equal(fetchCount, 1);
    await childHandles.get("52").stop();
    assert.equal(fetchOptions.signal.aborted, false);
    assert.equal(fetchOptions.credentials, "omit");
    assert.equal(fetchOptions.redirect, "error");
    releaseFetch(new Response(JSON.stringify({ data: { tempList: { 48: { content: [] } } } })));
    await until(() => handle.report().template.state === "stored");
    FakeSocket.sockets[1].open();
    FakeSocket.sockets[1].receive(encodeDouyuPacket("type@=chatmsg/txt@=configuration-reference/"));
    await until(() => handle.report().rooms[1].collection.saved === 1);
    const final = await within(handle.stop());
    assert.equal(final.template.snapshots, 1);
    assert.equal(fetchCount, 1);
    const records = await recordsIn(directory);
    assert.equal(records.filter((entry) => entry.kind === "configuration").length, 1);
    assert.equal(records.find((entry) => entry.kind === "packet").configurationSha256, final.template.sha256);
  } finally {
    releaseFetch(new Response("{}"));
    await handle.stop();
  }
});

test("coordinator STOP closes all room connections and persists one final combined status", async () => {
  FakeSocket.sockets = [];
  const directory = await mkdtemp(join(tmpdir(), "dwe-multi-stop-"));
  const handle = await startMultiArchive({ rooms: ["52", "12306", "60937"], directory,
    durationMs: 10_000, staggerMs: 0, statusMs: 5, captureTemplate: false, roomOptions },
  { roomDependencies: fakeRoomDependencies });
  try {
    await handle.ready;
    for (const socket of FakeSocket.sockets) socket.open();
    await writeFile(join(directory, "STOP"), "manual-stop\n", { mode: 0o600 });
    const final = await within(handle.done);
    assert.equal(final.reason, "manual-stop");
    assert.ok(final.rooms.every((entry) => !entry.running));
    assert.ok(FakeSocket.sockets.every((socket) => socket.readyState === 3));
    const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
    assert.equal(status.schema, 3);
    assert.equal(status.running, false);
    assert.equal(status.rooms.length, 3);
    assert.equal((await stat(join(directory, "status.json"))).mode & 0o777, 0o600);
  } finally { await handle.stop(); }
});

test("old captures and status files consume the research budget and active collectors are identified", async () => {
  const root = await mkdtemp(join(tmpdir(), "dwe-multi-prior-"));
  const archive = join(root, "archives", "previous");
  const samples = join(root, "samples");
  await mkdir(archive, { recursive: true });
  await mkdir(samples);
  const raw = "x".repeat(123);
  const summary = `${JSON.stringify({ running: true, updatedAt: new Date().toISOString() })}\n`;
  await writeFile(join(archive, "packets-00001.jsonl"), raw);
  await writeFile(join(archive, "status.json"), summary);
  await writeFile(join(samples, "older.jsonl"), "old-data");
  const usage = await measureResearchUsage([join(root, "archives"), samples, join(root, "missing")]);
  assert.equal(usage.files, 3);
  assert.equal(usage.bytes, Buffer.byteLength(raw + summary + "old-data"));
  assert.deepEqual(usage.active, [archive]);
  await writeFile(join(archive, "status.json"), JSON.stringify({ running: true,
    updatedAt: new Date(Date.now() - 60_000).toISOString() }));
  assert.deepEqual((await measureResearchUsage([root])).active, []);
});

test("hourly sample allowances renew without late releases subtracting the new hour reservation", () => {
  const collection = createCollection({ sampleWindowMs: hour, routinePerStructure: 1, maxSaved: 100 });
  const message = packet("type@=chatmsg/txt@=PRIVATE_MESSAGE/uid@=SECRET_UID/");
  const previous = collection.observe(message, "2026-10-02T00:00:00.000Z");
  assert.ok(previous);
  assert.equal(collection.observe(message, "2026-10-02T00:30:00.000Z"), null);
  const next = collection.observe(message, "2026-10-02T01:00:00.000Z");
  assert.ok(next);
  collection.release(previous);
  assert.equal(collection.observe(message, "2026-10-02T01:01:00.000Z"), null);
  collection.release(next);
  const replacement = collection.observe(message, "2026-10-02T01:02:00.000Z");
  assert.ok(replacement);
  collection.stored(replacement);
  collection.release(replacement);
  collection.stored(replacement);
  const report = collection.report();
  assert.equal(report.selected, 1);
  assert.equal(report.saved, 1);
  assert.equal(report.received, 5);
  assert.equal(report.dropped["sample-limit"], 2);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_MESSAGE|SECRET_UID/);
});

test("CST period coverage counts received interaction messages even when sample quotas reject them", () => {
  const collection = createCollection({ maxSaved: 1 });
  const timestamps = { morning: "2026-10-01T22:00:00.000Z", afternoon: "2026-10-02T04:00:00.000Z",
    evening: "2026-10-02T10:00:00.000Z", night: "2026-10-02T16:00:00.000Z" };
  for (const timestamp of Object.values(timestamps)) {
    for (const type of ["chatmsg", "comm_chatmsg", "dgb", "uenter"]) {
      collection.observe(packet(`type@=${type}/uid@=SECRET_UID/`), timestamp);
    }
  }
  const report = collection.report();
  assert.equal(report.received, 16);
  assert.equal(report.selected, 1);
  for (const period of Object.keys(timestamps)) {
    assert.deepEqual(report.periods[period], { received: 4, chat: 1, specialChat: 1, gifts: 1, entries: 1 });
  }
  assert.doesNotMatch(JSON.stringify(report), /SECRET_UID/);
});

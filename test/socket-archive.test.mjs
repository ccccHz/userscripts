import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { encodeDouyuPacket } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import { createCollection, describePacket } from "../packages/douyu-web-enhancer/tools/socket-archive-core.mjs";
import { createArchiveStore } from "../packages/douyu-web-enhancer/tools/socket-archive-store.mjs";
import { startArchive, replayArchive, archiveExitCode } from "../packages/douyu-web-enhancer/tools/socket-archive.mjs";

const packet = (text) => ({ packetType: 690, text });
const now = "2026-10-02T00:00:00.000Z";

test("structure sampling ignores identities but retains new fields, nested structures and activity IDs", () => {
  const collection = createCollection({ routinePerStructure: 1 });
  const first = collection.observe(packet("type@=chatmsg/uid@=111/nn@=PERSON/txt@=SECRET/"), now);
  assert.ok(first);
  collection.stored(first);
  assert.equal(collection.observe(packet("type@=chatmsg/uid@=222/nn@=OTHER/txt@=MESSAGE/"), now), null);
  assert.ok(collection.observe(packet("type@=chatmsg/uid@=222/txt@=MESSAGE/gadid@=48/"), now));
  assert.ok(collection.observe(packet("type@=chatmsg/uid@=222/txt@=MESSAGE/gadid@=29/"), now));
  assert.notEqual(describePacket("type@=comm_chatmsg/chatmsg@=txt@A=hi@S/").structure,
    describePacket("type@=comm_chatmsg/chatmsg@=txt@A=hi@Sgadid@A=48@S/").structure);
  const report = collection.report();
  assert.equal(report.received, 4);
  assert.equal(report.saved, 1);
  assert.equal(report.dropped["sample-limit"], 1);
  assert.doesNotMatch(JSON.stringify(report), /PERSON|SECRET|MESSAGE|111|222|OTHER/);
});

test("unknown types and structures are bounded while all observed packets remain counted", () => {
  const collection = createCollection({ maxTypes: 2, maxStructures: 2, unknownPerStructure: 1 });
  assert.ok(collection.observe(packet("type@=rare/k@=1/"), now));
  assert.equal(collection.observe(packet("type@=rare/k@=2/"), now), null);
  assert.ok(collection.observe(packet("type@=another/a@=1/"), now));
  assert.equal(collection.observe(packet("type@=rare/new@=1/"), now), null);
  assert.equal(collection.observe(packet("type@=third/k@=1/"), now), null);
  const report = collection.report();
  assert.equal(report.received, 5);
  assert.equal(report.types.rare.count, 3);
  assert.equal(report.dropped["type-limit"], 1);
  assert.equal(report.dropped["structure-limit"], 1);
  assert.equal(collection.observe(packet("type@=loginres/sessionid@=AUTH_SECRET/"), now), null);
  assert.doesNotMatch(JSON.stringify(collection.report()), /AUTH_SECRET/);
});

test("backpressure releases sample reservations so a rare structure can still be saved later", () => {
  const collection = createCollection({ unknownPerStructure: 1, maxSaved: 1 });
  const first = collection.observe(packet("type@=rare/k@=1/"), now);
  collection.release(first);
  collection.release(first); // A repeated release must not create negative counters.
  const retry = collection.observe(packet("type@=rare/k@=2/"), now);
  assert.ok(retry);
  collection.stored(retry);
  assert.equal(collection.report().saved, 1);
  assert.equal(collection.report().selected, 1);
});

test("protocol keys matching object prototypes cannot corrupt summaries or structures", async () => {
  const { addFrameToSummary, createSummary } = await import("../packages/douyu-web-enhancer/tools/socket-sampler-core.mjs");
  const summary = createSummary();
  addFrameToSummary(summary, encodeDouyuPacket("type@=constructor/constructor@=123/__proto__@=123/toString@=abc/list@=constructor@A=1@S/"));
  assert.equal(summary.types.constructor.count, 1);
  assert.equal(summary.types.constructor.fields.constructor.number, 1);
  assert.equal(summary.types.constructor.fields.__proto__, undefined);
  assert.equal(summary.types.constructor.nestedFields.list.constructor, 1);
  const collection = createCollection();
  assert.ok(collection.observe(packet("type@=toString/constructor@=123/"), now));
  assert.equal(collection.report().types.toString.count, 1);
});

test("storage rotates only at complete JSONL records and enforces actual serialized byte budget", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dwe-archive-store-"));
  const store = await createArchiveStore(dir, { maxBytes: 300, statusReserve: 100, segmentBytes: 50 });
  assert.equal(await store.append({ kind: "one", text: "中文" }).done, true);
  assert.equal(await store.append({ kind: "two", text: "abcdef" }).done, true);
  assert.equal(store.snapshot().segments, 2);
  assert.equal(store.append({ text: "x".repeat(200) }).reason, "disk-limit");
  await store.close();
  await store.status({ stopped: true });
  const names = await readdir(dir);
  const sizes = await Promise.all(names.map((n) => stat(join(dir, n))));
  assert.ok(sizes.reduce((sum, s) => sum + s.size, 0) <= 300);
  for (const name of names.filter((n) => n.endsWith("jsonl"))) {
    const data = await readFile(join(dir, name), "utf8");
    assert.ok(data.endsWith("\n"));
    for (const line of data.trim().split("\n")) JSON.parse(line);
    assert.equal((await stat(join(dir, name))).mode & 0o777, 0o600);
  }
});

test("storage limits queued bytes without reserving discarded records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dwe-archive-queue-"));
  const store = await createArchiveStore(dir, { queueBytes: 60 });
  const first = store.append({ text: "x".repeat(30) });
  assert.equal(store.append({ text: "x".repeat(30) }).reason, "queue-limit");
  await first.done;
  assert.equal(store.snapshot().queuedBytes, 0);
  assert.equal(await store.append({ text: "later" }).done, true);
  await store.close();
});

class FakeSocket extends EventTarget {
  static sockets = [];
  sent = [];
  readyState = 0;
  constructor(url) { super(); this.url = url; FakeSocket.sockets.push(this); }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  send(data) { this.sent.push(Buffer.from(data).subarray(12, -1).toString()); }
  receive(data) { const event = new Event("message"); event.data = data; this.dispatchEvent(event); }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}

const until = async (predicate) => {
  const deadline = Date.now() + 1000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 2)); }
};

test("long capture reassembles UTF-8 chunks, isolates reconnects and replays saved packets", async () => {
  FakeSocket.sockets = [];
  const dir = await mkdtemp(join(tmpdir(), "dwe-archive-capture-"));
  const handle = await startArchive({ room: "12306", directory: dir, durationMs: 3000,
    retryBaseMs: 1, retryMaxMs: 1, statusMs: 3000 }, { WebSocketImpl: FakeSocket });
  try {
    const first = FakeSocket.sockets[0]; first.open();
    const frame = Buffer.from(encodeDouyuPacket("type@=chatmsg/txt@=中文/uid@=SECRET_UID/"));
    first.receive(frame.subarray(0, frame.length - 5)); first.receive(frame.subarray(frame.length - 5));
    first.receive(frame.subarray(0, 17)); first.close();
    await until(() => FakeSocket.sockets.length === 2);
    const second = FakeSocket.sockets[1]; second.open();
    second.receive(encodeDouyuPacket("type@=ranklist/list@=uid@A=1@Sgold@A=5@S/"));
    // A stale event on the old connection is not allowed to append or alter the new heartbeat.
    first.receive(frame);
    const result = await handle.stop();
    assert.equal(result.parsedPackets, 2);
    assert.equal(result.incompletePackets, 1);
    assert.equal(result.retries, 1);
    assert.equal(result.collection.saved, 2);
    assert.doesNotMatch(JSON.stringify(result), /SECRET_UID|中文/);
    assert.deepEqual(first.sent, ["type@=loginreq/roomid@=12306/", "type@=joingroup/rid@=12306/gid@=-9999/"]);
    const replay = await replayArchive(dir);
    assert.equal(replay.collection.received, 2);
    assert.equal(replay.collection.saved, 2);
    assert.equal(replay.collection.types.ranklist.count, 1);
    const status = JSON.parse(await readFile(join(dir, "status.json"), "utf8"));
    assert.equal(status.running, false);
  } finally { await handle.stop(); }
});

test("retry, duration and STOP control finish with explicit reasons", async () => {
  FakeSocket.sockets = [];
  const retryDir = await mkdtemp(join(tmpdir(), "dwe-archive-retry-"));
  const retry = await startArchive({ room: "52", directory: retryDir, durationMs: 3000, maxRetries: 1,
    retryBaseMs: 1, retryMaxMs: 1 }, { WebSocketImpl: FakeSocket });
  FakeSocket.sockets[0].close();
  await until(() => FakeSocket.sockets.length === 2);
  FakeSocket.sockets[1].close();
  assert.equal((await retry.done).reason, "retry-limit");
  const durationDir = await mkdtemp(join(tmpdir(), "dwe-archive-duration-"));
  const duration = await startArchive({ room: "52", directory: durationDir, durationMs: 5 }, { WebSocketImpl: FakeSocket });
  assert.equal((await duration.done).reason, "duration-limit");
  const stopDir = await mkdtemp(join(tmpdir(), "dwe-archive-stop-"));
  const manual = await startArchive({ room: "52", directory: stopDir, durationMs: 3000, statusMs: 5 }, { WebSocketImpl: FakeSocket });
  await writeFile(join(stopDir, "STOP"), "stop");
  assert.equal((await manual.done).reason, "manual-stop");
});

test("replay reports a truncated tail without discarding complete earlier records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dwe-archive-truncated-"));
  await writeFile(join(dir, "packets-00001.jsonl"), `${JSON.stringify({ kind: "packet", at: now, text: "type@=dgb/gfid@=1/" })}\n{"kind":`);
  const replay = await replayArchive(dir);
  assert.equal(replay.collection.types.dgb.count, 1);
  assert.equal(replay.invalidLines, 1);
});

test("public activity template is captured as data while credentials and redirects are disabled", async () => {
  FakeSocket.sockets = [];
  const dir = await mkdtemp(join(tmpdir(), "dwe-archive-template-"));
  let fetchOptions;
  const handle = await startArchive({ room: "52", directory: dir, durationMs: 3000, captureTemplate: true }, {
    WebSocketImpl: FakeSocket,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://wconf.douyucdn.cn/resource/common/comm_chatmsg_w.json");
      fetchOptions = options;
      return new Response(JSON.stringify({ data: { tempList: { 48: { content: [] } } } }));
    },
  });
  try {
    await until(() => handle.report().template.state === "stored");
    assert.equal(fetchOptions.credentials, "omit");
    assert.equal(fetchOptions.redirect, "error");
    const report = await handle.stop();
    assert.equal(report.template.snapshots, 1);
    assert.doesNotMatch(JSON.stringify(report), /tempList|content/);
    const lines = (await readFile(join(dir, "packets-00001.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(lines.find((line) => line.kind === "configuration").text, JSON.stringify({ data: { tempList: { 48: { content: [] } } } }));
  } finally { await handle.stop(); }
});

test("malformed frames containing a login acknowledgement do not leak its payload through diagnostics", async () => {
  FakeSocket.sockets = [];
  const dir = await mkdtemp(join(tmpdir(), "dwe-archive-error-"));
  const handle = await startArchive({ room: "52", directory: dir, durationMs: 3000 }, { WebSocketImpl: FakeSocket });
  try {
    const socket = FakeSocket.sockets[0]; socket.open();
    const frame = Buffer.concat([Buffer.from(encodeDouyuPacket("type@=loginres/sessionid@=AUTH_SECRET/")), Buffer.alloc(13, 255)]);
    socket.receive(frame);
    const report = await handle.stop();
    assert.equal(report.parserErrors, 1);
    const data = await readFile(join(dir, "packets-00001.jsonl"), "utf8");
    assert.doesNotMatch(data, /AUTH_SECRET|base64/);
  } finally { await handle.stop(); }
});

test("shutdown resolves and reports failures even when closing or final status writing fails", async () => {
  for (const statusFails of [false, true]) {
    FakeSocket.sockets = [];
    const dir = await mkdtemp(join(tmpdir(), "dwe-archive-shutdown-"));
    let closed = false;
    const handle = await startArchive({ room: "52", directory: dir, durationMs: 3000 }, {
      WebSocketImpl: FakeSocket,
      createStore: async (...args) => {
        const store = await createArchiveStore(...args);
        return { ...store,
          async close() { await store.close(); closed = true; throw new Error("private-fs-detail"); },
          async status(report) {
            if (statusFails && closed) throw new Error("private-fs-detail");
            return store.status(report);
          },
        };
      },
    });
    const result = await handle.stop();
    assert.equal(await handle.done, result);
    assert.equal(result.running, false);
    assert.equal(result.reason, statusFails ? "status-write-failed" : "storage-close-error");
    assert.deepEqual(result.shutdownErrors, statusFails ? ["storage-close-error", "status-write-failed"] : ["storage-close-error"]);
    assert.doesNotMatch(JSON.stringify(result), /private-fs-detail/);
    assert.equal(archiveExitCode(result.reason), 1);
    if (!statusFails) assert.equal(JSON.parse(await readFile(join(dir, "status.json"), "utf8")).running, false);
  }
  for (const reason of ["retry-limit", "storage-error", "status-error", "initial-status-error", "control-send-error"]) {
    assert.equal(archiveExitCode(reason), 1);
  }
  assert.equal(archiveExitCode("duration-limit"), 0);
  assert.equal(archiveExitCode("manual-stop"), 0);
});

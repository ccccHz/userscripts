#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createPacketStream, anonymousControlMessages } from "./socket-sampler-core.mjs";
import { createCollection } from "./socket-archive-core.mjs";
import { createArchiveStore } from "./socket-archive-store.mjs";

export const ARCHIVE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", ".local", "socket-archives");
const PORTS = [8502, 8503, 8504, 8505];
const MAX_FRAME_BYTES = 1024 * 1024;
const TEMPLATE_URL = "https://wconf.douyucdn.cn/resource/common/comm_chatmsg_w.json";

export async function readTemplate(fetchImpl, signal) {
  const response = await fetchImpl(TEMPLATE_URL, { credentials: "omit", redirect: "error", signal });
  if (!response.ok || !response.body) throw new Error("template-unavailable");
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw new Error("template-too-large");
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const text = Buffer.concat(parts).toString("utf8");
  JSON.parse(text); // Data only; no evaluation/JSONP execution.
  return { text, bytes: size, sha256: createHash("sha256").update(text).digest("hex") };
}

function encode(message) {
  const payload = Buffer.from(message);
  const packet = Buffer.alloc(payload.length + 13);
  packet.writeUInt32LE(payload.length + 9, 0);
  packet.writeUInt32LE(payload.length + 9, 4);
  packet.writeUInt32LE(689, 8);
  payload.copy(packet, 12);
  return packet;
}

export async function startArchive(options, dependencies = {}) {
  const { room, directory, durationMs = 24 * 60 * 60 * 1000, maxRetries = 20,
    retryBaseMs = 1000, retryMaxMs = 60_000, connectTimeoutMs = 15_000,
    heartbeatMs = 40_000, statusMs = 10_000, captureTemplate = false, templateMs = 3600_000,
    registerSignals = true, checkStop = true, retryJitter = false, storeOptions, collectionOptions } = options;
  anonymousControlMessages(room); // Validate before creating files or connections.
  const WebSocketImpl = dependencies.WebSocketImpl ?? WebSocket;
  const store = await (dependencies.createStore ?? createArchiveStore)(directory, storeOptions);
  const collection = createCollection(collectionOptions);
  const startedAt = new Date().toISOString();
  const stats = { frames: 0, incomingBytes: 0, parsedPackets: 0, parserErrors: 0, incompletePackets: 0,
    connections: 0, retries: 0, disconnects: 0, skippedFrames: 0, parserDiagnosticsSaved: 0, lastPacketAt: null };
  let socket;
  let current;
  let heartbeat;
  let connectionTimer;
  let reconnectTimer;
  let durationTimer;
  let statusTimer;
  let templateTimer;
  let templateAbort;
  let templateBusy = false;
  let templateHash = null;
  let templateState = { state: captureTemplate ? "pending" : "disabled", snapshots: 0 };
  let ended = false;
  let reason = null;
  const shutdownErrors = [];
  let sequence = 0;
  let consecutiveFailures = 0;
  let statusChain = Promise.resolve();
  let resolveDone;
  const done = new Promise((res) => { resolveDone = res; });
  const report = () => ({ schema: 2, mode: "anonymous-selected-packets", room, pid: process.pid, startedAt,
    updatedAt: new Date().toISOString(), running: !ended, reason, shutdownErrors: [...shutdownErrors], durationMs,
    state: ended ? "stopped" : current?.opened ? "connected" : reconnectTimer ? "reconnecting" : "connecting",
    connection: current?.id ?? 0, ...stats, template: templateState, storage: store.snapshot(), collection: collection.report(),
    completeness: "Selected packets only; anonymous stream does not establish page/admin coverage." });
  const updateStatus = () => {
    statusChain = statusChain.catch(() => {}).then(async () => { await store.status(report()); });
    return statusChain;
  };
  const save = (record, description) => {
    const write = store.append(record);
    if (!write.accepted) {
      if (description) collection.release(description);
      collection.drop(write.reason);
      if (write.reason === "disk-limit") void stop("disk-limit");
      return false;
    }
    void write.done.then((success) => {
      if (success && description) collection.stored(description);
      else if (!success) { if (description) collection.release(description); collection.drop("write-failed"); void stop("storage-error"); }
    });
    return true;
  };
  const resetStream = (connection) => {
    if (connection.stream.finish()) stats.incompletePackets += 1;
    connection.stream.reset();
  };
  const onSignal = () => { void stop("interrupted"); };
  async function captureTemplateSnapshot() {
    if (ended || templateBusy) return;
    templateBusy = true;
    const controller = new AbortController();
    templateAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const template = await readTemplate(dependencies.fetchImpl ?? fetch, controller.signal);
      if (ended) return;
      const checkedAt = new Date().toISOString();
      if (template.sha256 !== templateHash) {
        const write = store.append({ kind: "configuration", at: checkedAt, source: TEMPLATE_URL, ...template });
        if (!write.accepted) { collection.drop(write.reason); if (write.reason === "disk-limit") void stop("disk-limit"); return; }
        if (!await write.done) { void stop("storage-error"); return; }
        templateHash = template.sha256;
        templateState = { state: "stored", snapshots: templateState.snapshots + 1, checkedAt, sha256: templateHash, bytes: template.bytes };
      } else templateState = { ...templateState, state: "stored", checkedAt };
    } catch { if (!ended) templateState = { ...templateState, state: "unavailable", checkedAt: new Date().toISOString() }; }
    finally { clearTimeout(timeout); templateBusy = false; templateAbort = undefined; }
  }
  async function stop(stopReason = "manual-stop") {
    if (ended) return done;
    ended = true; reason = stopReason;
    clearInterval(heartbeat); clearInterval(statusTimer); clearInterval(templateTimer);
    templateAbort?.abort();
    clearTimeout(connectionTimer); clearTimeout(reconnectTimer); clearTimeout(durationTimer);
    process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
    if (current) resetStream(current);
    try { socket?.close(); } catch { /* shutdown stays bounded */ }
    // A failed or closing socket must not keep the process alive indefinitely.
    current = null;
    try { await store.close(); }
    catch { reason = "storage-close-error"; shutdownErrors.push("storage-close-error"); }
    try { await updateStatus(); }
    catch { reason = "status-write-failed"; shutdownErrors.push("status-write-failed"); }
    finally { resolveDone(report()); }
    return done;
  }
  const connect = () => {
    if (ended) return;
    reconnectTimer = undefined;
    const connection = { id: ++stats.connections, opened: false, stream: createPacketStream(), closed: false };
    current = connection;
    try { socket = new WebSocketImpl(`wss://danmuproxy.douyu.com:${PORTS[stats.retries % PORTS.length]}`); }
    catch { void stop("connection-constructor-error"); return; }
    const activeSocket = socket;
    activeSocket.binaryType = "arraybuffer";
    connectionTimer = setTimeout(() => { try { activeSocket.close(); } catch { void stop("connection-timeout"); } }, connectTimeoutMs);
    activeSocket.addEventListener("open", () => {
      if (ended || current !== connection || connection.closed) { try { activeSocket.close(); } catch {} return; }
      clearTimeout(connectionTimer);
      connection.opened = true;
      save({ kind: "connection", connection: connection.id, event: "open", at: new Date().toISOString() });
      if (ended) return;
      try { for (const message of anonymousControlMessages(room)) activeSocket.send(encode(message)); }
      catch { void stop("control-send-error"); return; }
      if (ended || connection.closed) return;
      heartbeat = setInterval(() => {
        if (!ended && current === connection && activeSocket.readyState === 1) {
          try { activeSocket.send(encode("type@=mrkl/")); } catch { try { activeSocket.close(); } catch {} }
        }
      }, heartbeatMs);
      void updateStatus().catch(() => { void stop("status-error"); });
    });
    activeSocket.addEventListener("message", (event) => {
      if (ended || current !== connection || connection.closed) return;
      const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data)
        : ArrayBuffer.isView(event.data) ? new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength) : null;
      stats.frames += 1;
      if (!data || data.byteLength > MAX_FRAME_BYTES) {
        stats.skippedFrames += 1; resetStream(connection);
        collection.drop(data ? "oversized-frame" : "unsupported-frame"); return;
      }
      stats.incomingBytes += data.byteLength;
      const result = connection.stream.push(data);
      const at = new Date().toISOString();
      for (const packet of result.messages) {
        if (ended) break;
        stats.parsedPackets += 1; stats.lastPacketAt = at; sequence += 1;
        const description = collection.observe(packet, at);
        if (description) save({ kind: "packet", at, connection: connection.id, sequence, frameSequence: stats.frames,
          packetType: packet.packetType, ...description, text: packet.text }, description);
      }
      if (result.error) {
        stats.parserErrors += 1;
        // Never archive a whole malformed frame: it could also contain a login acknowledgement.
        if (stats.parserDiagnosticsSaved < 10 && save({ kind: "parser-error", at, connection: connection.id,
          frameSequence: stats.frames, reason: result.error, bytes: data.byteLength })) stats.parserDiagnosticsSaved += 1;
        resetStream(connection);
      }
    });
    activeSocket.addEventListener("error", () => { /* close triggers bounded reconnect */ });
    activeSocket.addEventListener("close", () => {
      if (current !== connection || connection.closed) return;
      connection.closed = true;
      clearInterval(heartbeat); clearTimeout(connectionTimer);
      if (ended) return;
      resetStream(connection); stats.disconnects += 1;
      save({ kind: "connection", connection: connection.id, event: "close", at: new Date().toISOString() });
      if (ended) return;
      if (stats.retries >= maxRetries) { void stop("retry-limit"); return; }
      stats.retries += 1;
      consecutiveFailures += 1;
      const baseDelay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(consecutiveFailures - 1, 16));
      const delay = retryJitter ? Math.round(baseDelay * (0.75 + (dependencies.random ?? Math.random)() * 0.25)) : baseDelay;
      reconnectTimer = setTimeout(connect, delay);
      void updateStatus().catch(() => { void stop("status-error"); });
    });
  };
  if (registerSignals) { process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal); }
  durationTimer = setTimeout(() => { void stop("duration-limit"); }, durationMs);
  if (statusMs > 0) statusTimer = setInterval(() => {
    void (async () => {
      if (!checkStop) { await updateStatus(); return; }
      try { await readFile(join(directory, "STOP")); await stop("manual-stop"); }
      catch (error) { if (error?.code !== "ENOENT") { await stop("control-read-error"); return; } await updateStatus(); }
    })().catch(() => { void stop("status-error"); });
  }, statusMs);
  save({ kind: "session", schema: 2, room, startedAt, source: "anonymous-danmuproxy", durationMs });
  try { await updateStatus(); }
  catch { await stop("initial-status-error"); return { done, stop, report }; }
  connect();
  if (captureTemplate && !ended) {
    void captureTemplateSnapshot();
    templateTimer = setInterval(() => { void captureTemplateSnapshot(); }, templateMs);
  }
  return { done, stop, report };
}

export async function replayArchive(directory, options = {}) {
  const collection = createCollection({ selectAll: true });
  const rooms = new Map();
  let records = 0;
  let invalidLines = 0;
  for (const name of (await readdir(directory)).filter((n) => /^packets-\d+\.jsonl$/.test(n)).sort()) {
    const lines = createInterface({ input: createReadStream(join(directory, name), { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of lines) {
      records += 1;
      let record;
      try { record = JSON.parse(line); } catch { invalidLines += 1; continue; }
      if (record.kind === "packet" && typeof record.text === "string") {
        const description = collection.observe({ text: record.text, packetType: record.packetType }, record.at);
        if (description) collection.stored(description);
        if (options.perRoom && /^\d{1,12}$/.test(record.room ?? "")) {
          if (!rooms.has(record.room) && rooms.size < 20) rooms.set(record.room, createCollection({ selectAll: true }));
          const room = rooms.get(record.room);
          const roomDescription = room?.observe({ text: record.text, packetType: record.packetType }, record.at);
          if (roomDescription) room.stored(roomDescription);
        }
      }
    }
  }
  return { records, invalidLines, replayScope: "Saved packets only; use status.json for all observed counts.", collection: collection.report(),
    ...(options.perRoom ? { rooms: Object.fromEntries([...rooms].map(([room, item]) => [room, item.report()])) } : {}) };
}

function parseArgs(args) {
  const values = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    if (!["--room", "--hours", "--max-mib"].includes(args[i]) || args[i + 1] === undefined) throw new Error("invalid-arguments");
    values[args[i]] = args[i + 1];
  }
  const room = values["--room"];
  anonymousControlMessages(room);
  const hours = Number(values["--hours"] ?? 24);
  const mib = Number(values["--max-mib"] ?? 256);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || !Number.isInteger(mib) || mib < 4 || mib > 1024) throw new Error("invalid-resource-limits");
  return { room, durationMs: Math.round(hours * 3600_000), storeOptions: { maxBytes: mib * 1024 * 1024 } };
}

export function archiveExitCode(reason) {
  return ["duration-limit", "manual-stop", "interrupted", "disk-limit"].includes(reason) ? 0 : 1;
}

async function cli() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "capture") {
    const options = parseArgs(args);
    const directory = join(ARCHIVE_ROOT, `${new Date().toISOString().replace(/[:.]/g, "-")}-${options.room}-${randomBytes(4).toString("hex")}`);
    const handle = await startArchive({ ...options, directory, captureTemplate: true });
    process.stdout.write(`${JSON.stringify({ directory, ...handle.report() }, null, 2)}\n`);
    const final = await handle.done;
    await new Promise((res) => process.stdout.write(`${JSON.stringify(final, null, 2)}\n`, res));
    // Undici may keep a peer's unfinished close handshake alive. Files are flushed above.
    process.exit(archiveExitCode(final.reason));
  } else if (["status", "stop", "replay"].includes(command) && args.length === 1) {
    const directory = resolve(args[0]);
    // A STOP file is restricted to a known archive directory, never arbitrary input paths.
    if (command === "stop") {
      const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
      if (status.schema !== 2 || status.mode !== "anonymous-selected-packets") throw new Error("not-an-archive");
      await writeFile(join(directory, "STOP"), "manual-stop\n", { mode: 0o600 });
      process.stdout.write("Stop requested; collector checks within 10 seconds.\n");
    } else if (command === "replay") process.stdout.write(`${JSON.stringify(await replayArchive(directory), null, 2)}\n`);
    else {
      const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
      const updatedAgoMs = Date.now() - Date.parse(status.updatedAt);
      process.stdout.write(`${JSON.stringify({ ...status, updatedAgoMs,
        liveness: !status.running ? "stopped" : updatedAgoMs > 30_000 ? "stale-status" : "recently-updated" }, null, 2)}\n`);
    }
  } else throw new Error("Usage: socket-archive.mjs capture --room ID [--hours 0..24] [--max-mib 4..1024] | status|stop|replay DIRECTORY");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(() => { process.stderr.write("Archive failed; check arguments, connectivity and local storage.\n"); process.exitCode = 1; });
}

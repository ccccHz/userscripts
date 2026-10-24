#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { anonymousControlMessages } from "./socket-sampler-core.mjs";
import { createArchiveStore } from "./socket-archive-store.mjs";
import { ARCHIVE_ROOT, archiveExitCode, readTemplate, replayArchive, startArchive } from "./socket-archive.mjs";

export const TOTAL_RESEARCH_LIMIT = 5_000_000_000; // User's 5 GB: decimal bytes, not 5 GiB.
const LOCAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", ".local");
const PLAN_FIELDS = ["name", "category", "source", "sizeHint", "scheduleEvidence", "currentHint"];

export function normalizeRoomPlan(input) {
  if (!Array.isArray(input) || !input.length || input.length > 20) throw new Error("invalid-room-count");
  const seen = new Set();
  return input.map((entry) => {
    const room = typeof entry === "string" ? entry : entry?.room;
    anonymousControlMessages(room);
    if (seen.has(room)) throw new Error("duplicate-room");
    seen.add(room);
    const result = { room };
    for (const key of PLAN_FIELDS) {
      if (typeof entry === "object" && entry[key] !== undefined) {
        if (typeof entry[key] !== "string" || entry[key].length > 400) throw new Error("invalid-plan-metadata");
        result[key] = entry[key];
      }
    }
    return result;
  });
}

/** A per-room queue allowance prevents a busy room from occupying all shared capacity. */
export function createRoomStore(shared, room, options = {}) {
  const { queueBytes = 2 * 1024 * 1024, onFailure = () => {}, configuration = () => null } = options;
  let queuedBytes = 0;
  let bytes = 0;
  let records = 0;
  let closed = false;
  return {
    append(record) {
      if (closed) return { accepted: false, reason: "storage-closed", done: Promise.resolve(false) };
      const tagged = { ...record, room, configurationSha256: configuration() };
      const size = Buffer.byteLength(`${JSON.stringify(tagged)}\n`);
      if (queuedBytes + size > queueBytes) return { accepted: false, reason: "room-queue-limit", done: Promise.resolve(false) };
      const write = shared.append(tagged);
      if (!write.accepted) {
        if (["disk-limit", "storage-closed"].includes(write.reason)) onFailure(write.reason);
        return write;
      }
      queuedBytes += size;
      const done = write.done.then((success) => {
        if (success) { bytes += size; records += 1; }
        else onFailure("storage-error");
        return success;
      }, () => { onFailure("storage-error"); return false; }).finally(() => { queuedBytes -= size; });
      return { accepted: true, reason: null, done };
    },
    snapshot() { return { bytes, records, queuedBytes, queueLimit: queueBytes }; },
    async status() { /* The coordinator writes a single combined status. */ },
    async close() { closed = true; /* Only the coordinator closes shared storage. */ },
  };
}

/** Count existing research files and reject another live collector before allocating a new budget. */
export async function measureResearchUsage(roots = [ARCHIVE_ROOT, join(LOCAL_ROOT, "socket-samples"), join(LOCAL_ROOT, "socket-plans")]) {
  let bytes = 0;
  let files = 0;
  const active = [];
  async function visit(directory, depth = 0) {
    if (depth > 8) throw new Error("research-tree-too-deep");
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error?.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("research-symlink-not-counted");
      if (entry.isDirectory()) { await visit(path, depth + 1); continue; }
      if (!entry.isFile()) continue;
      if (++files > 10_000) throw new Error("research-file-limit");
      bytes += (await stat(path)).size;
      if (entry.name === "status.json") {
        let report;
        try { report = JSON.parse(await readFile(path, "utf8")); } catch { continue; }
        if (report.running && Date.now() - Date.parse(report.updatedAt) < 30_000) active.push(directory);
      }
    }
  }
  for (const root of roots) await visit(root);
  return { bytes, files, active };
}

export async function startMultiArchive(options, dependencies = {}) {
  const rooms = normalizeRoomPlan(options.rooms);
  const { directory, durationMs = 24 * 3600_000, maxBytes = TOTAL_RESEARCH_LIMIT, priorBytes = 0,
    statusMs = 10_000, staggerMs = 350, captureTemplate = true, templateMs = 3600_000,
    roomQueueBytes = 2 * 1024 * 1024, roomOptions = {}, storeOptions = {} } = options;
  if (!Number.isSafeInteger(maxBytes) || maxBytes > TOTAL_RESEARCH_LIMIT || maxBytes <= priorBytes || priorBytes < 0
    || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 24 * 3600_000) throw new Error("invalid-resource-limits");
  const shared = await (dependencies.createStore ?? createArchiveStore)(directory, {
    queueBytes: 48 * 1024 * 1024, statusReserve: 2 * 1024 * 1024, controlReserve: 4096,
    ...storeOptions, maxBytes: maxBytes - priorBytes,
  });
  const handles = new Map();
  const failedStarts = new Map();
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + durationMs;
  let ended = false;
  let reason = null;
  let lastTick = Date.now();
  let schedulingGaps = 0;
  let schedulingGapMs = 0;
  let latestSchedulingGapAt = null;
  const shutdownErrors = [];
  let statusChain = Promise.resolve();
  let durationTimer;
  let statusTimer;
  let templateTimer;
  let staggerTimer;
  let releaseStagger;
  let templateAbort;
  let templateBusy = false;
  let templateTask = Promise.resolve();
  let templateState = { state: captureTemplate ? "pending" : "disabled", snapshots: 0 };
  let startup = Promise.resolve();
  let startupFinished = false;
  let resolveDone;
  const done = new Promise((res) => { resolveDone = res; });
  const report = () => ({ schema: 3, mode: "anonymous-multi-room-selected-packets", pid: process.pid,
    startedAt, updatedAt: new Date().toISOString(), deadlineAt: new Date(deadline).toISOString(),
    running: !ended, reason, shutdownErrors: [...shutdownErrors], durationMs,
    plannedRooms: rooms.length, startedRooms: handles.size, startupFinished,
    schedulingGaps, schedulingGapMs, latestSchedulingGapAt,
    resources: { totalLimitBytes: maxBytes, priorResearchBytes: priorBytes, currentRunLimitBytes: maxBytes - priorBytes,
      ...shared.snapshot(), totalPayloadAndHistoryBytes: priorBytes + shared.snapshot().bytes,
      totalBudgetedBytes: priorBytes + shared.snapshot().bytes + shared.snapshot().queuedBytes
        + shared.snapshot().reservedStatusBytes + shared.snapshot().reservedControlBytes },
    template: { ...templateState },
    rooms: rooms.map((plan) => ({ ...plan, ...(handles.get(plan.room)?.report() ?? {
      running: !ended && !failedStarts.has(plan.room), state: failedStarts.has(plan.room) ? "failed" : ended ? "not-started" : "pending",
      reason: failedStarts.get(plan.room) ?? null,
    }) })),
    completeness: "Anonymous packets only. Time bins count actual messages; connection/heartbeat is not proof of a live broadcast.",
  });
  function updateStatus() {
    statusChain = statusChain.catch(() => {}).then(() => shared.status(report()));
    return statusChain;
  }
  function onStorageFailure(failure) {
    if (!ended) void stop(failure === "disk-limit" ? "disk-limit" : "storage-error");
  }
  function appendShared(record) {
    const write = shared.append(record);
    if (!write.accepted && ["disk-limit", "storage-closed"].includes(write.reason)) onStorageFailure(write.reason);
    if (write.accepted) void write.done.then((success) => { if (!success) onStorageFailure("storage-error"); });
    return write;
  }
  async function captureConfiguration() {
    if (ended || templateBusy) return;
    templateBusy = true;
    const controller = new AbortController();
    templateAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const snapshot = await readTemplate(dependencies.fetchImpl ?? fetch, controller.signal);
      if (ended) return;
      const checkedAt = new Date().toISOString();
      if (snapshot.sha256 !== templateState.sha256) {
        const write = appendShared({ kind: "configuration", at: checkedAt,
          source: "https://wconf.douyucdn.cn/resource/common/comm_chatmsg_w.json", ...snapshot });
        if (!write.accepted || !await write.done || ended) return;
        templateState = { state: "stored", snapshots: templateState.snapshots + 1, checkedAt,
          sha256: snapshot.sha256, bytes: snapshot.bytes };
      } else templateState = { ...templateState, state: "stored", checkedAt };
    } catch { if (!ended) templateState = { ...templateState, state: "unavailable", checkedAt: new Date().toISOString() }; }
    finally { clearTimeout(timeout); templateAbort = undefined; templateBusy = false; }
  }
  const onSignal = () => { void stop("interrupted"); };
  async function stop(stopReason = "manual-stop") {
    if (ended) return done;
    ended = true; reason = stopReason;
    clearTimeout(durationTimer); clearInterval(statusTimer); clearInterval(templateTimer);
    clearTimeout(staggerTimer); releaseStagger?.(); templateAbort?.abort();
    process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
    await startup.catch(() => {});
    const closed = await Promise.allSettled([...handles.values()].map((handle) => handle.stop(stopReason)));
    if (closed.some((result) => result.status === "rejected")) shutdownErrors.push("room-shutdown-error");
    await templateTask.catch(() => {});
    try { await shared.close(); }
    catch { reason = "storage-close-error"; shutdownErrors.push("storage-close-error"); }
    try { await updateStatus(); }
    catch { reason = "status-write-failed"; shutdownErrors.push("status-write-failed"); }
    finally { resolveDone(report()); }
    return done;
  }
  async function startRooms() {
    for (const [index, plan] of rooms.entries()) {
      if (ended) break;
      if (index && staggerMs > 0) await new Promise((res) => {
        releaseStagger = res;
        staggerTimer = setTimeout(res, staggerMs);
      });
      releaseStagger = undefined;
      if (ended) break;
      try {
        const handle = await (dependencies.startRoom ?? startArchive)({ ...roomOptions, room: plan.room,
          directory, durationMs: Math.max(1, deadline - Date.now()), captureTemplate: false,
          registerSignals: false, checkStop: false, statusMs: 0, retryJitter: true,
          collectionOptions: { maxSaved: 100_000, sampleWindowMs: 3600_000, ...roomOptions.collectionOptions },
        }, { ...dependencies.roomDependencies,
          createStore: async () => createRoomStore(shared, plan.room, { queueBytes: roomQueueBytes,
            configuration: () => templateState.sha256 ?? null, onFailure: onStorageFailure }),
        });
        handles.set(plan.room, handle);
        void handle.done.then(() => {
          if (!ended && startupFinished && [...handles.values()].every((item) => !item.report().running)) void stop("all-rooms-stopped");
        }).catch(() => { if (!ended) failedStarts.set(plan.room, "room-unhandled-error"); });
        if (ended) await handle.stop(reason);
      } catch { failedStarts.set(plan.room, "room-start-failed"); }
    }
    startupFinished = true;
    if (!ended && (!handles.size || [...handles.values()].every((item) => !item.report().running))) void stop("all-rooms-stopped");
  }
  process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal);
  durationTimer = setTimeout(() => { void stop("duration-limit"); }, durationMs);
  statusTimer = setInterval(() => {
    void (async () => {
      if (ended) return;
      const tick = Date.now();
      if (tick - lastTick > Math.max(30_000, statusMs * 3)) {
        schedulingGaps += 1; schedulingGapMs += tick - lastTick - statusMs;
        latestSchedulingGapAt = new Date(tick).toISOString();
        appendShared({ kind: "observation-gap", at: latestSchedulingGapAt, elapsedMs: tick - lastTick,
          reason: "timer-delay-not-attributed" });
      }
      lastTick = tick;
      if (tick >= deadline) { await stop("duration-limit"); return; }
      try { await readFile(join(directory, "STOP")); await stop(); }
      catch (error) { if (error?.code !== "ENOENT") { await stop("control-read-error"); return; } await updateStatus(); }
    })().catch(() => { void stop("status-error"); });
  }, statusMs);
  appendShared({ kind: "plan", schema: 3, startedAt, rooms, durationMs, maxBytes, priorBytes });
  try { await updateStatus(); }
  catch { await stop("initial-status-error"); return { done, stop, report, ready: startup }; }
  if (!ended) {
    startup = startRooms();
    if (captureTemplate) {
      templateTask = captureConfiguration();
      templateTimer = setInterval(() => { if (!templateBusy) templateTask = captureConfiguration(); }, templateMs);
    }
  }
  return { done, stop, report, ready: startup };
}

export async function parseMultiArgs(args) {
  const values = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    if (!["--rooms", "--plan", "--hours", "--max-gb"].includes(args[i]) || args[i + 1] === undefined
      || values[args[i]] !== undefined) throw new Error("invalid-arguments");
    values[args[i]] = args[i + 1];
  }
  if (Boolean(values["--rooms"]) === Boolean(values["--plan"])) throw new Error("specify-one-plan");
  const rooms = normalizeRoomPlan(values["--plan"] ? JSON.parse(await readFile(resolve(values["--plan"]), "utf8"))
    : values["--rooms"].split(",").map((room) => room.trim()));
  const hours = Number(values["--hours"] ?? 24);
  const gb = Number(values["--max-gb"] ?? 5);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || !Number.isFinite(gb) || gb < 0.01 || gb > 5) throw new Error("invalid-resource-limits");
  return { rooms, durationMs: Math.round(hours * 3600_000), maxBytes: Math.floor(gb * 1_000_000_000) };
}

async function cli() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "capture") {
    const options = await parseMultiArgs(args);
    const previous = await measureResearchUsage();
    if (previous.active.length) throw new Error("stop-other-collector-before-capture");
    const directory = join(ARCHIVE_ROOT, `${new Date().toISOString().replace(/[:.]/g, "-")}-multi-${randomBytes(4).toString("hex")}`);
    const handle = await startMultiArchive({ ...options, directory, priorBytes: previous.bytes });
    await handle.ready;
    process.stdout.write(`${JSON.stringify({ directory, pid: process.pid, roomCount: options.rooms.length,
      totalLimitBytes: options.maxBytes, priorResearchBytes: previous.bytes, startedAt: handle.report().startedAt,
      deadlineAt: handle.report().deadlineAt }, null, 2)}\n`);
    const final = await handle.done;
    await new Promise((res) => process.stdout.write(`${JSON.stringify(final, null, 2)}\n`, res));
    process.exit(archiveExitCode(final.reason));
  } else if (["status", "stop", "replay"].includes(command) && args.length === 1) {
    const directory = resolve(args[0]);
    const report = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
    if (report.schema !== 3 || report.mode !== "anonymous-multi-room-selected-packets") throw new Error("not-a-multi-archive");
    if (command === "stop") {
      await writeFile(join(directory, "STOP"), "manual-stop\n", { mode: 0o600 });
      process.stdout.write("Stop requested; coordinator checks within 10 seconds.\n");
    } else if (command === "replay") process.stdout.write(`${JSON.stringify(await replayArchive(directory, { perRoom: true }), null, 2)}\n`);
    else {
      const updatedAgoMs = Date.now() - Date.parse(report.updatedAt);
      process.stdout.write(`${JSON.stringify({ ...report, updatedAgoMs,
        liveness: !report.running ? "stopped" : updatedAgoMs > 30_000 ? "stale-status" : "recently-updated" }, null, 2)}\n`);
    }
  } else throw new Error("Usage: socket-archive-multi.mjs capture --rooms IDS|--plan JSON [--hours 0..24] [--max-gb 0.01..5] | status|stop|replay DIRECTORY");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    const safeReasons = ["stop-other-collector-before-capture", "invalid-resource-limits", "duplicate-room", "invalid-room-count"];
    process.stderr.write(`Multi archive failed: ${safeReasons.includes(error?.message) ? error.message : "check-plan-and-local-storage"}.\n`);
    process.exitCode = 1;
  });
}

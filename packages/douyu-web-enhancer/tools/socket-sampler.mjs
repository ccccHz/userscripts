#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzeCapture, anonymousControlMessages } from "./socket-sampler-core.mjs";

const SAMPLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".local", "socket-samples");
const HOST = "danmuproxy.douyu.com";
const PORTS = [8502, 8503, 8504, 8505];
const DEFAULT_SECONDS = 120;
const MAX_SECONDS = 600;
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_FRAMES = 20_000;

function packet(message) {
  const payload = new TextEncoder().encode(message);
  const buffer = new ArrayBuffer(payload.length + 13);
  const view = new DataView(buffer);
  view.setUint32(0, payload.length + 9, true);
  view.setUint32(4, payload.length + 9, true);
  view.setUint32(8, 689, true);
  new Uint8Array(buffer, 12, payload.length).set(payload);
  return buffer;
}

function usage() {
  return "Usage: node tools/socket-sampler.mjs capture --room <numeric-id> [--seconds 1..600] | analyze <capture.jsonl>";
}

function captureArgs(args) {
  let room;
  let seconds = DEFAULT_SECONDS;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === "--room") room = args[i + 1];
    else if (args[i] === "--seconds") seconds = Number(args[i + 1]);
    else throw new Error(usage());
  }
  if (!/^[1-9]\d{0,11}$/.test(room ?? "")) throw new Error("Room ID must be numeric");
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) throw new Error("Seconds must be 1..600");
  return { room, seconds };
}

async function capture({ room, seconds }) {
  await mkdir(SAMPLE_DIR, { recursive: true, mode: 0o700 });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${room}-${randomBytes(4).toString("hex")}.jsonl`;
  const path = join(SAMPLE_DIR, name);
  const file = await open(path, "wx", 0o600);
  let writes = Promise.resolve();
  const append = (record) => { writes = writes.then(() => file.write(`${JSON.stringify(record)}\n`)); return writes; };
  let socket;
  let heartbeat;
  let timer;
  let frames = 0;
  let bytes = 0;
  let finished = false;
  let opened = false;
  let portIndex = 0;
  const startedAt = new Date().toISOString();
  await append({ kind: "session", schema: 1, room, startedAt, mode: "anonymous-danmuproxy" });

  const finish = async (reason) => {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    clearTimeout(timer);
    try { socket?.close(); } catch { /* a failed connection may already be closed */ }
    process.off("SIGINT", onInterrupt);
    await append({ kind: "end", at: new Date().toISOString(), reason, frames, bytes });
    await writes;
    await file.close();
    const summary = await analyzeCapture(path);
    const types = Object.fromEntries(Object.entries(summary.types).map(([type, item]) => [type, item.count]));
    process.stdout.write(`${JSON.stringify({ path, reason, frames: summary.frames, messages: summary.messages, unparsedFrames: summary.unparsedFrames, unparsedReasons: summary.unparsedReasons, skippedFrames: summary.skippedFrames, types }, null, 2)}\n`);
  };
  const onInterrupt = () => { void finish("interrupted"); };
  process.on("SIGINT", onInterrupt);
  timer = setTimeout(() => { void finish("duration-limit"); }, seconds * 1000);

  const connect = () => {
    if (finished) return;
    opened = false;
    const port = PORTS[portIndex];
    try {
      socket = new WebSocket(`wss://${HOST}:${port}`);
    } catch {
      void finish("connection-error");
      return;
    }
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      if (finished) return;
      opened = true;
      // Protocol join/heartbeat only. No chat, gift, or account commands exist in this tool.
      for (const message of anonymousControlMessages(room)) socket.send(packet(message));
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(packet("type@=mrkl/"));
      }, 40_000);
      void append({ kind: "open", at: new Date().toISOString(), port });
    });
    socket.addEventListener("message", (event) => {
      if (finished) return;
      void (async () => {
        const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data)
          : event.data instanceof Blob ? new Uint8Array(await event.data.arrayBuffer())
            : typeof event.data === "string" ? new TextEncoder().encode(event.data) : null;
        if (!data || finished) return;
        if (data.byteLength > MAX_FRAME_BYTES) {
          await append({ kind: "skip", at: new Date().toISOString(), reason: "oversized-frame", bytes: data.byteLength });
          return;
        }
        if (bytes + data.byteLength > MAX_TOTAL_BYTES || frames >= MAX_FRAMES) {
          await finish("size-limit");
          return;
        }
        bytes += data.byteLength;
        frames += 1;
        await append({ kind: "frame", at: new Date().toISOString(), base64: Buffer.from(data).toString("base64") });
      })().catch(() => { void finish("capture-error"); });
    });
    socket.addEventListener("error", () => { /* close event handles retry/exit */ });
    socket.addEventListener("close", () => {
      clearInterval(heartbeat);
      if (finished) return;
      if (!opened && portIndex + 1 < PORTS.length) {
        portIndex += 1;
        connect();
      } else {
        void finish(opened ? "connection-closed" : "connection-failed");
      }
    });
  };
  connect();
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "capture") await capture(captureArgs(args));
  else if (command === "analyze" && args.length === 1) {
    process.stdout.write(`${JSON.stringify(await analyzeCapture(args[0]), null, 2)}\n`);
  } else throw new Error(usage());
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Sampler failed"}\n`);
  process.exitCode = 1;
}

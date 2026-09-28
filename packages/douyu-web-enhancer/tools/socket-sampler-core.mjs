import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const MAX_FIELD_NAME = 64;
const MAX_PACKET_BYTES = 2 * 1024 * 1024;
const STRUCTURED_FIELDS = new Set(["list", "list_day", "list_all", "chatmsg"]);

export function createPacketStream() {
  let pending = new Uint8Array(0);
  return {
    push(buffer) {
      const chunk = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const bytes = new Uint8Array(pending.length + chunk.length);
      bytes.set(pending);
      bytes.set(chunk, pending.length);
      pending = new Uint8Array(0);
      const messages = [];
      let offset = 0;
      while (offset + 12 <= bytes.length) {
        const header = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
        const length = header.getUint32(0, true) + 4;
        if (length < 13 || length > MAX_PACKET_BYTES || header.getUint32(4, true) + 4 !== length) {
          return { messages, error: "invalid-packet-length" };
        }
        if (offset + length > bytes.length) break;
        if (bytes[offset + length - 1] !== 0) return { messages, error: "missing-terminator" };
        const body = bytes.subarray(offset + 12, offset + length - 1);
        for (const text of new TextDecoder().decode(body).split("\0")) {
          if (text) messages.push({ packetType: header.getUint32(8, true), text });
        }
        offset += length;
      }
      pending = bytes.slice(offset);
      return { messages, error: null };
    },
    finish() { return pending.length === 0 ? null : "incomplete-packet"; },
    reset() { pending = new Uint8Array(0); },
  };
}

export function decodeFrame(buffer) {
  const stream = createPacketStream();
  const result = stream.push(buffer);
  return { messages: result.messages, error: result.error ?? stream.finish() };
}

function fieldShape(value) {
  if (value === "") return "empty";
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return "number";
  if (/^https?:\/\//i.test(value)) return "url";
  if (value.includes("@A") || value.includes("@S")) return "nested-or-escaped";
  return "text";
}

function nestedFieldNames(value) {
  let decoded = value;
  for (let i = 0; i < 3; i += 1) decoded = decoded.replace(/@S/g, "/").replace(/@A/g, "@");
  const names = new Set();
  for (const match of decoded.matchAll(/(?:^|\/)([a-zA-Z][a-zA-Z0-9_]{0,63})@=/g)) {
    names.add(match[1]);
  }
  return [...names];
}

export function classifyMessage(text) {
  const fields = {};
  const nestedFields = {};
  let type = "(missing)";
  for (const part of text.split("/")) {
    const separator = part.indexOf("@=");
    if (separator < 1) continue;
    const key = part.slice(0, separator);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || key.length > MAX_FIELD_NAME) continue;
    const value = part.slice(separator + 2);
    if (key === "type") {
      type = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value) ? value : "(invalid)";
    } else {
      fields[key] ??= {};
      const shape = fieldShape(value);
      fields[key][shape] = (fields[key][shape] ?? 0) + 1;
      if (shape === "nested-or-escaped" && STRUCTURED_FIELDS.has(key)) {
        const names = nestedFieldNames(value);
        if (names.length > 0) nestedFields[key] = names;
      }
    }
  }
  return { type, fields, nestedFields };
}

export function createSummary() {
  return { frames: 0, messages: 0, skippedFrames: 0, unparsedFrames: 0, unparsedReasons: {}, types: {} };
}

export function anonymousControlMessages(room) {
  if (!/^[1-9]\d{0,11}$/.test(String(room))) throw new Error("Room ID must be numeric");
  return [
    `type@=loginreq/roomid@=${room}/`,
    `type@=joingroup/rid@=${room}/gid@=-9999/`,
  ];
}

export function addFrameToSummary(summary, frame, stream = createPacketStream()) {
  summary.frames += 1;
  const { messages, error } = stream.push(frame);
  if (error) {
    summary.unparsedFrames += 1;
    summary.unparsedReasons[error] = (summary.unparsedReasons[error] ?? 0) + 1;
  }
  for (const message of messages) {
    summary.messages += 1;
    const { type, fields, nestedFields } = classifyMessage(message.text);
    const item = summary.types[type] ??= { count: 0, packetTypes: {}, fields: {}, nestedFields: {} };
    item.count += 1;
    item.packetTypes[message.packetType] = (item.packetTypes[message.packetType] ?? 0) + 1;
    for (const [key, shapes] of Object.entries(fields)) {
      item.fields[key] ??= {};
      for (const [shape, count] of Object.entries(shapes)) {
        item.fields[key][shape] = (item.fields[key][shape] ?? 0) + count;
      }
    }
    for (const [key, names] of Object.entries(nestedFields)) {
      item.nestedFields[key] ??= {};
      for (const name of names) item.nestedFields[key][name] = (item.nestedFields[key][name] ?? 0) + 1;
    }
  }
  return summary;
}

export async function analyzeCapture(path) {
  const summary = createSummary();
  const stream = createPacketStream();
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    let record;
    try { record = JSON.parse(line); } catch {
      summary.unparsedFrames += 1;
      summary.unparsedReasons["invalid-jsonl"] = (summary.unparsedReasons["invalid-jsonl"] ?? 0) + 1;
      continue;
    }
    if (record.kind === "frame" && typeof record.base64 === "string") {
      addFrameToSummary(summary, Buffer.from(record.base64, "base64"), stream);
    } else if (record.kind === "skip") {
      summary.skippedFrames += 1;
      stream.reset();
    }
  }
  const incomplete = stream.finish();
  if (incomplete) {
    summary.unparsedFrames += 1;
    summary.unparsedReasons[incomplete] = (summary.unparsedReasons[incomplete] ?? 0) + 1;
  }
  return summary;
}

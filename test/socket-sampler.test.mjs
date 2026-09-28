import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { encodeDouyuPacket } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import {
  addFrameToSummary,
  analyzeCapture,
  anonymousControlMessages,
  classifyMessage,
  createSummary,
  decodeFrame,
} from "../packages/douyu-web-enhancer/tools/socket-sampler-core.mjs";

test("sampler decodes combined packets and classifies fields without retaining values in summaries", () => {
  const first = new Uint8Array(encodeDouyuPacket("type@=chatmsg/uid@=123/txt@=hello/"));
  const second = new Uint8Array(encodeDouyuPacket("type@=uenter/uid@=456/"));
  const combined = new Uint8Array(first.length + second.length);
  combined.set(first);
  combined.set(second, first.length);
  const decoded = decodeFrame(combined);
  assert.equal(decoded.error, null);
  assert.equal(decoded.messages.length, 2);
  const summary = addFrameToSummary(createSummary(), combined);
  assert.equal(summary.frames, 1);
  assert.equal(summary.messages, 2);
  assert.equal(summary.types.chatmsg.fields.uid.number, 1);
  assert.equal(summary.types.chatmsg.fields.txt.text, 1);
  assert.equal(summary.types.uenter.count, 1);
  assert.doesNotMatch(JSON.stringify(summary), /hello|123|456/);
});

test("sampler reports malformed frames and keeps unusual type values out of the summary", () => {
  const frame = new Uint8Array(encodeDouyuPacket("type@=user@example/txt@=secret/"));
  const summary = addFrameToSummary(createSummary(), frame);
  assert.equal(summary.types["(invalid)"].count, 1);
  assert.doesNotMatch(JSON.stringify(summary), /secret|user@example/);
  frame[0] = 255;
  assert.equal(decodeFrame(frame).error, "invalid-packet-length");
  assert.equal(classifyMessage("type@=ranklist/list@=id@AA=1@AS/").fields.list["nested-or-escaped"], 1);
  assert.deepEqual(classifyMessage("type@=ranklist/list@=id@AA=1@ASgold@AA=20@AS/").nestedFields.list, ["id", "gold"]);
});

test("sampler can reanalyze persisted frame records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dwe-sampler-test-"));
  const path = join(dir, "capture.jsonl");
  const frame = Buffer.from(encodeDouyuPacket("type@=dgb/gfid@=1/"));
  await writeFile(path, [
    JSON.stringify({ kind: "session", schema: 1 }),
    JSON.stringify({ kind: "frame", base64: frame.toString("base64") }),
    JSON.stringify({ kind: "skip", reason: "oversized-frame" }),
  ].join("\n") + "\n");
  const summary = await analyzeCapture(path);
  assert.equal(summary.types.dgb.count, 1);
  assert.equal(summary.skippedFrames, 1);
});

test("sampler reassembles protocol packets split across WebSocket messages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dwe-sampler-split-test-"));
  const path = join(dir, "capture.jsonl");
  const frame = Buffer.from(encodeDouyuPacket("type@=chatmsg/txt@=split-message/"));
  await writeFile(path, [
    JSON.stringify({ kind: "frame", base64: frame.subarray(0, 17).toString("base64") }),
    JSON.stringify({ kind: "frame", base64: frame.subarray(17).toString("base64") }),
  ].join("\n") + "\n");
  const summary = await analyzeCapture(path);
  assert.equal(summary.frames, 2);
  assert.equal(summary.types.chatmsg.count, 1);
  assert.equal(summary.unparsedFrames, 0);
});

test("anonymous connection only creates login and group control messages", () => {
  assert.deepEqual(anonymousControlMessages("1126960"), [
    "type@=loginreq/roomid@=1126960/",
    "type@=joingroup/rid@=1126960/gid@=-9999/",
  ]);
  assert.throws(() => anonymousControlMessages("1126960/type@=chatmessage"));
});

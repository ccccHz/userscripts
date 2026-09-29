import assert from "node:assert/strict";
import test from "node:test";

import { encodeDouyuPacket, decodeDouyuPackets } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import { filterDouyuFrame } from "../packages/douyu-web-enhancer/src/core/douyu-message-filter.ts";

function join(...packets) {
  const bytes = packets.map((packet) => new Uint8Array(packet));
  const result = new Uint8Array(bytes.reduce((sum, packet) => sum + packet.length, 0));
  let offset = 0;
  for (const packet of bytes) { result.set(packet, offset); offset += packet.length; }
  return result.buffer;
}

const target = "type@=chatmsg/rid@=52/uid@=123/txt@=target/";
const other = "type@=chatmsg/rid@=52/uid@=456/txt@=other/";
const gift = "type@=dgb/rid@=52/uid@=123/gfid@=1/";
const block = (uid, roomId) => uid === "123" && roomId === "52";

test("filter removes one chat message while preserving other packets and their bytes", () => {
  const giftPacket = encodeDouyuPacket(gift, 690);
  const otherPacket = encodeDouyuPacket(other, 690);
  const frame = join(giftPacket, encodeDouyuPacket(target, 690), otherPacket);
  const result = filterDouyuFrame(frame, block);
  assert.equal(result.kind, "replace");
  assert.equal(result.removedMessages, 1);
  assert.deepEqual(decodeDouyuPackets(result.data), [gift, other]);
  assert.deepEqual(new Uint8Array(result.data), new Uint8Array(join(giftPacket, otherPacket)));
  assert.deepEqual(new Uint8Array(frame), new Uint8Array(join(giftPacket, encodeDouyuPacket(target, 690), otherPacket)));
});

test("unmatched, wrong room, unknown type and incomplete frames pass through", () => {
  const normal = join(encodeDouyuPacket(other), encodeDouyuPacket(gift));
  assert.deepEqual(filterDouyuFrame(normal, block), { kind: "pass", reason: "unmatched" });
  assert.deepEqual(filterDouyuFrame(encodeDouyuPacket(target.replace("rid@=52", "rid@=53")), block), { kind: "pass", reason: "unmatched" });
  const partial = encodeDouyuPacket(target).slice(0, 15);
  assert.deepEqual(filterDouyuFrame(partial, block), { kind: "pass", reason: "incomplete" });
});

test("a frame containing only target messages can be dropped", () => {
  const result = filterDouyuFrame(encodeDouyuPacket(target), block);
  assert.deepEqual(result, { kind: "drop", removedMessages: 1 });
});

test("multiple nul-separated messages in one packet retain non-target bytes", () => {
  const body = new TextEncoder().encode(`${target}\0${other}\0`);
  const bytes = new Uint8Array(12 + body.length);
  new DataView(bytes.buffer).setUint32(0, body.length + 8, true);
  new DataView(bytes.buffer).setUint32(4, body.length + 8, true);
  new DataView(bytes.buffer).setUint32(8, 690, true);
  bytes.set(body, 12);
  const result = filterDouyuFrame(bytes.buffer, block);
  assert.equal(result.kind, "replace");
  assert.deepEqual(new Uint8Array(result.data), new Uint8Array(encodeDouyuPacket(other, 690)));
});

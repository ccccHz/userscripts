import assert from "node:assert/strict";
import test from "node:test";

import { encodeDouyuPacket, decodeDouyuPackets } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import { filterDouyuFrame } from "../packages/douyu-web-enhancer/src/core/douyu-message-filter.ts";
import { confirmedActivityRoom } from "../packages/douyu-web-enhancer/src/features/activity-link-cleanup.ts";

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

test("entry filtering is opt-in, preserves chat and gifts, and excludes entry from chat history", () => {
  const entry = "type@=uenter/rid@=52/uid@=123/nn@=example/";
  const others = [target, gift, entry.replace("uid@=123", "uid@=456"), entry.replace("rid@=52", "rid@=53")];
  const frame = join(encodeDouyuPacket(entry), ...others.map(message => encodeDouyuPacket(message)));
  assert.deepEqual(filterDouyuFrame(encodeDouyuPacket(entry), block), { kind: "pass", reason: "unmatched" });
  const result = filterDouyuFrame(frame, () => false, block);
  assert.equal(result.kind, "replace");
  assert.equal(result.removedMessages, 1);
  assert.deepEqual(result.blockedChats, []);
  assert.deepEqual(new Uint8Array(result.data), new Uint8Array(join(...others.map(message => encodeDouyuPacket(message)))));
  assert.deepEqual(filterDouyuFrame(encodeDouyuPacket("type@=uenter/rid@=52/nn@=example/"), () => false, block), { kind: "pass", reason: "unmatched" });
  const invalid = join(frame, encodeDouyuPacket(entry).slice(0, 15));
  assert.deepEqual(filterDouyuFrame(invalid, () => false, block), { kind: "pass", reason: "incomplete" });
});

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
  assert.deepEqual(result, { kind: "drop", removedMessages: 1, blockedChats: [{ uid: "123", roomId: "52", nickname: "", text: "target" }], activityRooms: [] });
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

test("confirmed activity ids are removed independently of UID rules, retaining mixed frame order", () => {
  const activity = id => `type@=chatmsg/rid@=52/gadid@=${id}/txt@=event/`;
  const control = "type@=ranklist/rid@=52/";
  const packets = [other, activity(29), control, activity(48), gift, activity(99), "type@=chatmsg/rid@=52/txt@=保卫鱼娘/"];
  const result = filterDouyuFrame(join(...packets.map(p => encodeDouyuPacket(p))), () => false, null, message => confirmedActivityRoom(message, "52"));
  assert.equal(result.kind, "replace");
  assert.equal(result.removedMessages, 2);
  assert.deepEqual(result.activityRooms, ["52", "52"]);
  assert.deepEqual(result.blockedChats, []);
  assert.deepEqual(decodeDouyuPackets(result.data), [packets[0], packets[2], packets[4], packets[5], packets[6]]);
  const overlap = filterDouyuFrame(encodeDouyuPacket(`type@=chatmsg/rid@=52/uid@=123/gadid@=29/txt@=event/`), block, null, message => confirmedActivityRoom(message, "52"));
  assert.equal(overlap.kind, "drop");
  assert.equal(overlap.removedMessages, 1);
  assert.deepEqual(overlap.activityRooms, ["52"]);
  assert.deepEqual(overlap.blockedChats, []);
  assert.deepEqual(filterDouyuFrame(encodeDouyuPacket(activity(29)).slice(0, 15), block, null, message => confirmedActivityRoom(message, "52")), {kind:"pass",reason:"incomplete"});
  for (const unsafe of [
    "type@=chatmsg/gadid@=29/txt@=event/",
    "type@=chatmsg/rid@=52/gadid@=29/",
    "type@=chatmsg/rid@=52/gadid@=29/gadid@=99/txt@=event/",
    "type@=chatmsg/type@=gift/rid@=52/gadid@=29/txt@=event/",
  ]) assert.equal(confirmedActivityRoom(unsafe, "52"), null);
});

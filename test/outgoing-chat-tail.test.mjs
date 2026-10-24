import assert from "node:assert/strict";
import test from "node:test";
import { encodeDouyuPacket, decodeDouyuPackets } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import { DEFAULT_DANMAKU_TAIL, normalizeDanmakuTail, readOutgoingChatContent, rewriteOutgoingChatTail, validateDanmakuTail } from "../packages/douyu-web-enhancer/src/core/outgoing-chat-tail.ts";

const message = content => `pe@=1/content@=${content}/col@=0/type@=chatmessage/sender@=123/`;

test("outbound tail changes only complete chatmessage content and recalculates its packet length", () => {
  const config = { enabled: true, text: "@/尾", position: "suffix" };
  const original = encodeDouyuPacket(message("你好"));
  const result = rewriteOutgoingChatTail(original, config);
  assert.notEqual(result, original);
  assert.deepEqual(decodeDouyuPackets(result), [message("你好@A@S尾")]);
  const view = new DataView(result);
  assert.equal(view.getUint32(0, true) + 4, result.byteLength);
  assert.equal(view.getUint32(4, true), view.getUint32(0, true));
  assert.equal(rewriteOutgoingChatTail(result, config), result);
  assert.deepEqual(decodeDouyuPackets(original), [message("你好")]);
});

test("prefix works and disabled, unrelated, malformed, batched and unsupported sends pass through", () => {
  const config = { enabled: true, text: "前", position: "prefix" };
  const chat = encodeDouyuPacket(message("abc"));
  assert.deepEqual(decodeDouyuPackets(rewriteOutgoingChatTail(chat, config)), [message("前abc")]);
  assert.equal(rewriteOutgoingChatTail(chat, DEFAULT_DANMAKU_TAIL), chat);
  const heartbeat = encodeDouyuPacket("type@=mrkl/");
  assert.equal(rewriteOutgoingChatTail(heartbeat, config), heartbeat);
  assert.equal(rewriteOutgoingChatTail("text", config), "text");
  const incomplete = chat.slice(0, -1);
  assert.equal(rewriteOutgoingChatTail(incomplete, config), incomplete);
  const view = new Uint8Array(chat);
  assert.equal(rewriteOutgoingChatTail(view, config), view);
  const joined = new Uint8Array(chat.byteLength + heartbeat.byteLength);
  joined.set(new Uint8Array(chat)); joined.set(new Uint8Array(heartbeat), chat.byteLength);
  assert.equal(rewriteOutgoingChatTail(joined.buffer, config), joined.buffer);
});

test("invalid content and settings do not enable outbound mutation", () => {
  assert.deepEqual(normalizeDanmakuTail(null), DEFAULT_DANMAKU_TAIL);
  assert.equal(normalizeDanmakuTail({enabled:true,text:"  "}).enabled, false);
  assert.match(validateDanmakuTail({enabled:true,text:"",position:"suffix"}), /填写/);
  const config = {enabled:true,text:"尾",position:"suffix"};
  const duplicate = encodeDouyuPacket("type@=chatmessage/content@=a/content@=b/");
  assert.equal(rewriteOutgoingChatTail(duplicate, config), duplicate);
  const empty = encodeDouyuPacket(message("  "));
  assert.equal(rewriteOutgoingChatTail(empty, config), empty);
});

test("outbound history reader accepts one complete chat and rejects unrelated or ambiguous frames", () => {
  assert.equal(readOutgoingChatContent(encodeDouyuPacket(message("你好@A@S好"))), "你好@/好");
  assert.equal(readOutgoingChatContent(encodeDouyuPacket("type@=chatmessage/content@=a/content@=b/")), null);
  assert.equal(readOutgoingChatContent(encodeDouyuPacket("type@=gift/content@=a/")), null);
  assert.equal(readOutgoingChatContent(encodeDouyuPacket(message("a"), 690)), null);
});

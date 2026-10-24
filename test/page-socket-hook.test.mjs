import assert from "node:assert/strict";
import test from "node:test";

import { encodeDouyuPacket, decodeDouyuPackets } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import { rewriteOutgoingChatTail } from "../packages/douyu-web-enhancer/src/core/outgoing-chat-tail.ts";
import { UserBlockHistory } from "../packages/douyu-web-enhancer/src/features/user-block-history.ts";
import { confirmedActivityRoom } from "../packages/douyu-web-enhancer/src/features/activity-link-cleanup.ts";
import { changeUserBlockRuleFromShortcut, DEFAULT_USER_BLOCKING_STATE, shouldBlockUser } from "../packages/douyu-web-enhancer/src/features/user-blocking.ts";
import {
  installPageSocketHook,
  nativePageWebSocketConstructor,
} from "../packages/douyu-web-enhancer/src/core/page-socket-hook.ts";

class FakeWebSocket extends EventTarget {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  binaryType = "blob";
  readyState = FakeWebSocket.CONNECTING;
  _onmessage = null;
  sent = [];

  constructor(url) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  get onmessage() { return this._onmessage; }
  set onmessage(listener) {
    if (this._onmessage) this.removeEventListener("message", this._onmessage);
    this._onmessage = listener;
    if (listener) this.addEventListener("message", listener);
  }

  send(data) { this.sent.push(data); }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }
  receive(data) {
    const event = new MessageEvent("message", { data });
    this.dispatchEvent(event);
    return event;
  }
}

function target() {
  FakeWebSocket.instances = [];
  return { WebSocket: FakeWebSocket, location: { href: "https://www.douyu.com/52" } };
}

test("room observers receive only allowed complete packets without changing delivery", () => {
  const page=target();const hook=installPageSocketHook(page);
  let observed=[];hook.observeRoomMessages(packets=>{observed.push(...packets);throw new Error("consumer");});
  const socket=new page.WebSocket("wss://danmuproxy.douyu.com:8502");let delivered=[];
  socket.onmessage=e=>delivered.push(e.data);socket.open();
  const frame=encodeDouyuPacket("type@=oun/rid@=52/un@=0/");socket.receive(frame);
  socket.receive(encodeDouyuPacket("type@=chatmsg/uid@=123/rid@=52/txt@=not retained/"));
  socket.receive(frame.slice(0,-1));
  assert.equal(observed.length,1);assert.match(observed[0],/un@=0/);assert.equal(delivered.length,3);assert.equal(delivered[0],frame);
  hook.dispose();
});

test("page socket hook observes Douyu frames without changing native socket behavior", async () => {
  const page = target();
  const original = page.WebSocket;
  const hook = installPageSocketHook(page);
  assert.notEqual(page.WebSocket, original);
  assert.equal(nativePageWebSocketConstructor(page), original);

  const socket = new page.WebSocket("wss://danmuproxy.douyu.com:8502");
  const delivered = [];
  const eventListeners = [];
  socket.onmessage = (event) => delivered.push(event);
  socket.addEventListener("message", (event) => eventListeners.push(event));
  socket.open();
  const frame = encodeDouyuPacket("type@=chatmsg/uid@=123/txt@=hello/");
  const originalEvent = socket.receive(frame);
  socket.send("page-owned outbound frame");

  assert.deepEqual(delivered, [originalEvent]);
  assert.deepEqual(eventListeners, [originalEvent]);
  assert.equal(delivered[0].data, frame);
  assert.equal(socket instanceof page.WebSocket, true);
  assert.equal(socket.binaryType, "blob");
  assert.deepEqual(socket.sent, ["page-owned outbound frame"]);
  assert.equal(hook.snapshot().capturedConnections, 1);
  assert.equal(hook.snapshot().messageTypes.chatmsg, 1);
  assert.doesNotMatch(JSON.stringify(hook.snapshot()), /uid|hello|8502|token|cookie/i);

  socket.receive(new Blob([encodeDouyuPacket("type@=dgb/gfid@=1/")]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(hook.snapshot().messageTypes.dgb, 1);

  socket.close();
  assert.equal(hook.snapshot().openConnections, 0);
  assert.equal(hook.snapshot().closedConnections, 1);
  hook.dispose();
  assert.equal(page.WebSocket, original);
});

test("outgoing transform is opt-in, scoped to page-owned Douyu sockets and restores native send", () => {
  const page = target();
  const hook = installPageSocketHook(page);
  const socket = new page.WebSocket("wss://danmuproxy.douyu.com:8502");
  const unrelated = new page.WebSocket("wss://example.com/");
  const packet = encodeDouyuPacket("type@=chatmessage/content@=hello/");
  const observed = [];
  hook.observeOutgoingChat(data => { observed.push(data); throw new Error("observer is isolated"); });
  socket.send(packet);
  assert.equal(socket.sent[0], packet);
  hook.setOutgoingChatTransform(data => rewriteOutgoingChatTail(data, {enabled:true,text:"尾",position:"suffix"}));
  socket.send(packet);
  unrelated.send(packet);
  assert.deepEqual(decodeDouyuPackets(socket.sent[1]), ["type@=chatmessage/content@=hello尾/"]);
  assert.equal(unrelated.sent[0], packet);
  assert.equal(hook.snapshot().outgoingTransformedFrames, 1);
  assert.deepEqual(observed, [packet, packet]);
  hook.setOutgoingChatTransform(null);
  socket.send(packet);
  assert.equal(socket.sent[2], packet);
  assert.deepEqual(observed, [packet, packet, packet]);
  hook.dispose();
  assert.equal(Object.hasOwn(socket, "send"), false);
});

test("page-driven reconnect is observed; prior instances and unrelated sockets are untouched", () => {
  const page = target();
  const oldSocket = new page.WebSocket("wss://danmuproxy.douyu.com:8502");
  const hook = installPageSocketHook(page);
  const unrelated = new page.WebSocket("wss://example.com/stream");
  oldSocket.receive(encodeDouyuPacket("type@=chatmsg/txt@=before/"));
  unrelated.receive(encodeDouyuPacket("type@=chatmsg/txt@=unrelated/"));
  assert.equal(hook.snapshot().capturedConnections, 0);

  const first = new page.WebSocket("wss://wsproxy.douyu.com/");
  first.open();
  first.receive(encodeDouyuPacket("type@=uenter/uid@=1/"));
  first.close();
  const replacement = new page.WebSocket("wss://wsproxy.douyu.com/");
  replacement.open();
  replacement.receive(encodeDouyuPacket("type@=ranklist/list@=x/"));
  assert.equal(hook.snapshot().capturedConnections, 2);
  assert.equal(hook.snapshot().openConnections, 1);
  assert.equal(hook.snapshot().messageTypes.uenter, 1);
  assert.equal(hook.snapshot().messageTypes.ranklist, 1);

  const native = nativePageWebSocketConstructor(page);
  new native("wss://danmuproxy.douyu.com:8503");
  assert.equal(hook.snapshot().capturedConnections, 2);
  hook.dispose();
  replacement.receive(encodeDouyuPacket("type@=chatmsg/txt@=after/"));
  assert.equal(hook.snapshot().messageTypes.chatmsg, 0);
  assert.equal(replacement.readyState, FakeWebSocket.OPEN);
});

test("repeated installation shares one hook and restores only its own constructor", () => {
  const page = target();
  const original = page.WebSocket;
  const first = installPageSocketHook(page);
  const wrapper = page.WebSocket;
  const second = installPageSocketHook(page);
  assert.equal(page.WebSocket, wrapper);
  first.dispose();
  assert.equal(page.WebSocket, wrapper);
  second.dispose();
  assert.equal(page.WebSocket, original);

  const third = installPageSocketHook(page);
  const external = class ExternalWebSocket extends FakeWebSocket {};
  page.WebSocket = external;
  third.dispose();
  assert.equal(page.WebSocket, external);
});

test("malformed and large frames degrade diagnostics without interrupting page delivery", () => {
  const page = target();
  const hook = installPageSocketHook(page);
  const socket = new page.WebSocket("wss://danmuproxy.douyu.com:8502");
  let pageMessages = 0;
  socket.onmessage = () => { pageMessages += 1; };
  socket.receive(new ArrayBuffer(3));
  socket.receive(new ArrayBuffer(1024 * 1024 + 1));
  assert.equal(pageMessages, 2);
  assert.equal(hook.snapshot().unparsedFrames, 1);
  assert.equal(hook.snapshot().oversizedFrames, 1);
  assert.equal(hook.snapshot().hookErrors, 0);
  hook.dispose();
});

test("opt-in filtering suppresses only target chat messages for both page listener styles", () => {
  const page = target();
  const hook = installPageSocketHook(page);
  const socket = new page.WebSocket("wss://wsproxy.douyu.com/");
  const fromProperty = [];
  const fromListener = [];
  socket.onmessage = (event) => fromProperty.push(event.data);
  socket.addEventListener("message", (event) => fromListener.push(event.data));
  hook.setIncomingChatFilter((uid, rid) => uid === "123" && rid === "52");
  const blocked = encodeDouyuPacket("type@=chatmsg/rid@=52/uid@=123/txt@=blocked/");
  socket.receive(blocked);
  assert.equal(fromProperty.length, 0);
  assert.equal(fromListener.length, 0);

  const other = encodeDouyuPacket("type@=dgb/rid@=52/uid@=123/gfid@=1/");
  const mixed = new Uint8Array(blocked.byteLength + other.byteLength);
  mixed.set(new Uint8Array(blocked));
  mixed.set(new Uint8Array(other), blocked.byteLength);
  socket.receive(mixed.buffer);
  assert.equal(fromProperty.length, 1);
  assert.equal(fromListener.length, 1);
  assert.deepEqual(new Uint8Array(fromProperty[0]), new Uint8Array(other));
  assert.equal(fromProperty[0], fromListener[0]);
  assert.equal(hook.snapshot().filteredFrames, 2);
  assert.equal(hook.snapshot().filteredMessages, 2);
  assert.equal(hook.snapshot().messageTypes.chatmsg, 2);
  assert.equal(hook.snapshot().messageTypes.dgb, 1);
  assert.equal(socket.binaryType, "blob");

  hook.setIncomingChatFilter(null);
  socket.receive(blocked);
  assert.equal(fromProperty.length, 2);
  assert.equal(fromProperty[1], blocked);
  hook.dispose();
});

test("active filtering fails open for Blob and incomplete frames", () => {
  const page = target();
  const hook = installPageSocketHook(page);
  const socket = new page.WebSocket("wss://wsproxy.douyu.com/");
  const received = [];
  socket.addEventListener("message", (event) => received.push(event.data));
  hook.setIncomingChatFilter(() => true);
  const frame = encodeDouyuPacket("type@=chatmsg/rid@=52/uid@=123/txt@=hello/");
  const blob = new Blob([frame]);
  socket.receive(blob);
  socket.receive(frame.slice(0, 15));
  assert.deepEqual(received, [blob, frame.slice(0, 15)]);
  assert.equal(hook.snapshot().filterSkippedFrames, 2);
  assert.equal(hook.snapshot().filterSkippedUnsupportedFrames, 1);
  assert.equal(hook.snapshot().filterSkippedIncompleteFrames, 1);
  hook.dispose();
});

test("activity filtering keeps read-only observers before delivery and composes with UID and entry rules", () => {
  const page=target(), hook=installPageSocketHook(page);
  const socket=new page.WebSocket("wss://wsproxy.douyu.com/");
  const observed=[], delivered=[], counted=[];
  hook.observeUserMessages(messages=>observed.push(...messages));
  socket.onmessage=e=>delivered.push(e.data);
  hook.setActivityFilter(message=>confirmedActivityRoom(message,"52"), rooms=>counted.push(...rooms));
  const event="type@=chatmsg/rid@=52/uid@=123/gadid@=29/txt@=event/";
  const plain="type@=chatmsg/rid@=52/uid@=456/txt@=normal/";
  socket.receive(encodeDouyuPacket(event));
  assert.equal(observed.length,1); assert.equal(delivered.length,0); assert.deepEqual(counted,["52"]);
  hook.setIncomingChatFilter((uid)=>uid==="456",undefined,(uid)=>uid==="456");
  socket.receive(encodeDouyuPacket(event));
  socket.receive(encodeDouyuPacket(plain));
  socket.receive(encodeDouyuPacket("type@=uenter/rid@=52/uid@=456/"));
  assert.equal(delivered.length,0); assert.deepEqual(counted,["52","52"]);
  assert.equal(hook.snapshot().filteredActivityMessages,2);
  hook.setActivityFilter(null);
  socket.receive(encodeDouyuPacket(event));
  assert.equal(delivered.length,1);
  hook.dispose();
});

test("page-driven reconnect inherits the current filter and disabling restores new delivery", () => {
  const page = target();
  const hook = installPageSocketHook(page);
  hook.setIncomingChatFilter((uid, rid) => uid === "123" && rid === "52");
  const first = new page.WebSocket("wss://wsproxy.douyu.com/");
  first.close();
  const replacement = new page.WebSocket("wss://wsproxy.douyu.com/");
  const delivered = [];
  replacement.addEventListener("message", function (event) {
    assert.equal(this, replacement);
    delivered.push(event.data);
  });
  const blocked = encodeDouyuPacket("type@=chatmsg/rid@=52/uid@=123/txt@=blocked/");
  replacement.receive(blocked);
  assert.equal(delivered.length, 0);
  hook.setIncomingChatFilter(null);
  replacement.receive(blocked);
  assert.deepEqual(delivered, [blocked]);
  assert.equal(hook.snapshot().capturedConnections, 2);
  hook.dispose();
});

test("history counts actual blocked chats once, keeps last ten, and excludes fail-open frames", async () => {
  const page = target();
  const hook = installPageSocketHook(page);
  const socket = new page.WebSocket("wss://wsproxy.douyu.com/");
  let state = changeUserBlockRuleFromShortcut(DEFAULT_USER_BLOCKING_STATE, "123", "52", true);
  state = changeUserBlockRuleFromShortcut(state, "123", null, true);
  const session = new UserBlockHistory();
  await session.setRules(state.rules);
  hook.setIncomingChatFilter((uid, rid) => shouldBlockUser(state, "52", uid, rid), (messages) => session.record(messages, 1234));
  const delivered = [];
  socket.onmessage = (event) => delivered.push(event.data);
  socket.addEventListener("message", (event) => delivered.push(event.data));
  const blocked = encodeDouyuPacket("type@=chatmsg/rid@=52/uid@=123/nn@=name@SA/txt@=hello@S@Aworld/");
  // A matching packet followed by invalid data must pass entirely and create no sample.
  const invalid = new Uint8Array(blocked.byteLength + 13);
  invalid.set(new Uint8Array(blocked));
  socket.receive(invalid.buffer);
  assert.equal(session.snapshot()[0].count, 0);
  assert.equal(delivered.length, 2);
  for (let index = 0; index < 12; index++) socket.receive(encodeDouyuPacket(`type@=chatmsg/rid@=52/uid@=123/nn@=viewer/txt@=${index}/`));
  socket.receive(blocked);
  const entry = session.snapshot()[0];
  assert.equal(entry.count, 13);
  assert.equal(entry.recent.length, 10);
  assert.equal(entry.recent[0].text, "hello/@world");
  assert.equal(entry.nickname, "name/A");
  assert.equal(entry.recent.at(-1).text, "3");
  assert.equal(entry.recent[0].at, 1234);
  assert.equal(hook.snapshot().filteredMessages, 13);
  assert.equal(delivered.length, 2);
  assert.doesNotMatch(JSON.stringify(hook.snapshot()), /viewer|hello|world/);
  hook.setIncomingChatFilter(null);
  socket.receive(blocked);
  assert.equal(session.snapshot()[0].count, 13);
  assert.equal(delivered.length, 4);
  const copy = session.snapshot();
  copy[0].recent[0].text = "mutated";
  assert.equal(session.snapshot()[0].recent[0].text, "hello/@world");
  await session.setRules([]);
  assert.deepEqual(session.snapshot(), []);
  assert.deepEqual(new UserBlockHistory().snapshot(), []);
  hook.dispose();
});

test("blocked-chat observer failure cannot suppress retained gifts", () => {
  const page = target();
  const hook = installPageSocketHook(page);
  const socket = new page.WebSocket("wss://wsproxy.douyu.com/");
  const received = [];
  socket.onmessage = (event) => received.push(event.data);
  hook.setIncomingChatFilter(() => true, () => { throw new Error("observer failure"); });
  const chat = encodeDouyuPacket("type@=chatmsg/rid@=52/uid@=123/txt@=hidden/");
  const gift = encodeDouyuPacket("type@=dgb/rid@=52/uid@=123/gfid@=1/");
  const mixed = new Uint8Array(chat.byteLength + gift.byteLength);
  mixed.set(new Uint8Array(chat));
  mixed.set(new Uint8Array(gift), chat.byteLength);
  socket.receive(mixed.buffer);
  assert.deepEqual(received, [gift]);
  hook.dispose();
});

test("entry-only filtering covers native listeners, reconnect, and disabling without chat history", () => {
  const page = target();
  const hook = installPageSocketHook(page);
  const entry = encodeDouyuPacket("type@=uenter/rid@=52/uid@=123/nn@=example/");
  const samples = [];
  hook.setIncomingChatFilter(null, messages => samples.push(...messages), (uid, rid) => uid === "123" && rid === "52");
  assert.equal(hook.snapshot().filterEnabled, true);
  for (let index = 0; index < 2; index++) {
    const socket = new page.WebSocket("wss://wsproxy.douyu.com/");
    const delivered = [];
    socket.onmessage = event => delivered.push(event.data);
    socket.addEventListener("message", event => delivered.push(event.data));
    socket.receive(entry);
    assert.deepEqual(delivered, []);
    const gift = encodeDouyuPacket("type@=dgb/rid@=52/uid@=123/gfid@=1/");
    socket.receive(gift);
    assert.deepEqual(delivered, [gift, gift]);
    socket.close();
  }
  assert.equal(hook.snapshot().filteredEntryMessages, 2);
  assert.equal(hook.snapshot().filteredMessages, 2);
  assert.deepEqual(samples, []);
  hook.setIncomingChatFilter(null);
  const socket = new page.WebSocket("wss://wsproxy.douyu.com/");
  const delivered = [];
  socket.onmessage = event => delivered.push(event.data);
  socket.receive(entry);
  assert.deepEqual(delivered, [entry]);
  hook.dispose();
});

test("read-only observers see blocked chat and entry once before native filtering and cannot break delivery", () => {
  const page = target(); const hook = installPageSocketHook(page);
  const observed = [];
  const stop = hook.observeUserMessages(messages => observed.push(...messages));
  const stopThrow = hook.observeUserMessages(() => { throw new Error("observer failed"); });
  hook.setIncomingChatFilter(() => true);
  const socket = new page.WebSocket("wss://wsproxy.douyu.com/");
  const delivered = []; socket.onmessage = event => delivered.push(event.data);
  const chat = encodeDouyuPacket("type@=chatmsg/rid@=52/uid@=123/txt@=hello/");
  const enter = encodeDouyuPacket("type@=uenter/rid@=52/uid@=123/nn@=viewer/");
  const mixed = new Uint8Array(chat.byteLength + enter.byteLength);
  mixed.set(new Uint8Array(chat)); mixed.set(new Uint8Array(enter), chat.byteLength);
  socket.receive(mixed.buffer);
  assert.deepEqual(observed.map(item => item.kind), ["chatmsg", "uenter"]);
  assert.deepEqual(delivered, [enter]);
  const invalid = new Uint8Array(mixed.length + 1); invalid.set(mixed);
  socket.receive(invalid.buffer);
  assert.equal(observed.length, 2);
  assert.equal(delivered.length, 2);
  stop(); stopThrow(); socket.receive(enter);
  assert.equal(observed.length, 2);
  hook.dispose();
});

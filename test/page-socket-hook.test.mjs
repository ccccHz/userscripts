import assert from "node:assert/strict";
import test from "node:test";

import { encodeDouyuPacket } from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
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
  onmessage = null;
  sent = [];

  constructor(url) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
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
    this.onmessage?.(event);
    return event;
  }
}

function target() {
  FakeWebSocket.instances = [];
  return { WebSocket: FakeWebSocket, location: { href: "https://www.douyu.com/52" } };
}

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

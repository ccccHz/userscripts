import assert from "node:assert/strict";
import test from "node:test";

import {
  DOUYU_ROOM_SOCKET_URL,
  buildEnterRoomMessage,
  buildLoginMessage,
  connectAuthenticatedRoom,
  decodeDouyuMessages,
  encodeDouyuPacket,
  parseCookieString,
} from "../src/douyu-socket.js";

const COOKIE =
  "acf_username=test_user; acf_ltkid=ltk; acf_biz=biz; acf_stk=stk; acf_ct=ct";

const deterministicCrypto = {
  getRandomValues(bytes) {
    bytes.fill(0);
    return bytes;
  },
};

test("parses browser cookies without truncating values containing equals", () => {
  assert.deepEqual(parseCookieString("a=1; token=a=b=c; empty="), {
    a: "1",
    token: "a=b=c",
    empty: "",
  });
});

test("builds an authenticated login message from the current cookie state", () => {
  const message = buildLoginMessage({
    roomId: "12306",
    cookieString: COOKIE,
    now: new Date("2026-07-28T12:00:00.000Z"),
    cryptoObject: deterministicCrypto,
  });

  assert.match(message, /^type@=loginreq\//);
  assert.match(message, /roomid@=12306\//);
  assert.match(message, /username@=test_user\//);
  assert.match(message, /ltkid@=ltk\//);
  assert.match(message, /devid@=b0000000000000000000000000000000\//);
  assert.match(message, /vk@=[0-9a-f]{32}\//);
});

test("rejects an incomplete browser login state before opening a socket", async () => {
  await assert.rejects(
    connectAuthenticatedRoom({
      roomId: "12306",
      cookieString: "acf_username=test_user",
      cryptoObject: deterministicCrypto,
      WebSocketCtor: class {
        constructor() {
          throw new Error("should not open");
        }
      },
    }),
    /当前登录态缺少 acf_ltkid, acf_biz, acf_stk, acf_ct/,
  );
});

test("logs in, enters the room, and resolves after h5ckres", async () => {
  class FakeWebSocket {
    static instance;

    constructor(url) {
      assert.equal(url, DOUYU_ROOM_SOCKET_URL);
      this.sent = [];
      FakeWebSocket.instance = this;
    }

    send(packet) {
      this.sent.push(packet);
    }

    close() {
      this.closed = true;
    }

    emitMessage(message) {
      this.onmessage({ data: encodeDouyuPacket(message, 690) });
    }
  }

  const resultPromise = connectAuthenticatedRoom({
    roomId: "12306",
    cookieString: COOKIE,
    WebSocketCtor: FakeWebSocket,
    cryptoObject: deterministicCrypto,
    now: new Date("2026-07-28T12:00:00.000Z"),
    timeoutMs: 1_000,
  });
  const socket = FakeWebSocket.instance;

  socket.onopen();
  assert.match(decodeDouyuMessages(socket.sent[0])[0], /^type@=loginreq\//);

  socket.emitMessage("type@=loginres/roomgroup@=1/");
  assert.equal(
    decodeDouyuMessages(socket.sent[1])[0],
    buildEnterRoomMessage("12306", new Date("2026-07-28T12:00:00.000Z")),
  );

  socket.emitMessage("type@=h5ckres/code@=0/");
  assert.deepEqual(await resultPromise, {
    status: "connected",
    roomId: "12306",
  });
  assert.equal(socket.closed, true);
});

test("decodes multiple STT messages from one packet payload", () => {
  const packet = encodeDouyuPacket(
    "type@=loginres/roomgroup@=1/\0type@=h5ckres/code@=0/",
    690,
  );

  assert.deepEqual(decodeDouyuMessages(packet), [
    "type@=loginres/roomgroup@=1/",
    "type@=h5ckres/code@=0/",
  ]);
});

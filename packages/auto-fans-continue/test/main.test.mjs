import assert from "node:assert/strict";
import test from "node:test";

import { CHECKED_DATE_KEY } from "../src/run-state.js";
import { runAutoFansContinue } from "../src/main.js";

function createStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) values.set(CHECKED_DATE_KEY, initialValue);

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

const silentLogger = { log() {} };

test("sends one stick to each fan room, sends the rest to the default room, and marks today", async () => {
  const storage = createStorage();
  const sent = [];
  const api = {
    getBagGifts: async (roomId) => {
      assert.equal(roomId, "12306");
      return { data: { list: [{ id: 2358, count: 4 }] } };
    },
    getFanBadgeRoomIds: async () => ["100", "200"],
    sendBagGift: async (item) => {
      sent.push(item);
      return { msg: "success" };
    },
    sleep: async () => {},
  };

  const result = await runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(sent, [
    { giftId: 2358, count: 1, roomId: "100" },
    { giftId: 2358, count: 1, roomId: "200" },
    { giftId: 2358, count: 2, roomId: "12306" },
  ]);
  assert.equal(storage.getItem(CHECKED_DATE_KEY), "2026-06-30T10:00:00.000Z");
});

test("skips when the script has already checked today", async () => {
  const storage = createStorage("2026-06-30T00:00:00.000Z");
  let called = false;
  const api = {
    getBagGifts: async () => {
      called = true;
      return { data: { list: [{ id: 268, count: 2 }] } };
    },
    getFanBadgeRoomIds: async () => ["100"],
    sendBagGift: async () => ({ msg: "success" }),
    sleep: async () => {},
  };

  const result = await runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
  });

  assert.equal(result.status, "skipped");
  assert.equal(called, false);
});

test("does not mark today when there is no usable stick gift", async () => {
  const storage = createStorage();
  const api = {
    getBagGifts: async () => ({ data: { list: [{ id: 999, count: 9 }] } }),
    getFanBadgeRoomIds: async () => ["100"],
    sendBagGift: async () => {
      throw new Error("should not send");
    },
    sleep: async () => {},
  };

  const result = await runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
  });

  assert.equal(result.status, "no-stick-gift");
  assert.equal(storage.getItem(CHECKED_DATE_KEY), null);
});

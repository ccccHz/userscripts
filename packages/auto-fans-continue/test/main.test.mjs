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

function createNotifier() {
  const messages = [];
  return {
    messages,
    info(message) {
      messages.push({ type: "info", message });
    },
    success(message) {
      messages.push({ type: "success", message });
    },
    warning(message) {
      messages.push({ type: "warning", message });
    },
    error(message) {
      messages.push({ type: "error", message });
    },
  };
}

test("sends one stick to each fan room without sending the rest during testing, and marks today", async () => {
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
  ]);
  assert.equal(storage.getItem(CHECKED_DATE_KEY), "2026-06-30T10:00:00.000Z");
});

test("limits gift sends to four concurrent requests", async () => {
  const storage = createStorage();
  let activeCount = 0;
  let maxActiveCount = 0;
  const sent = [];
  const api = {
    getBagGifts: async () => ({ data: { list: [{ id: 2358, count: 8 }] } }),
    getFanBadgeRoomIds: async () =>
      ["100", "200", "300", "400", "500", "600", "700", "800"],
    sendBagGift: async (item) => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      sent.push(item);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount -= 1;
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
  assert.equal(sent.length, 8);
  assert.equal(maxActiveCount, 4);
});

test("notifies renewal start and completion summary", async () => {
  const storage = createStorage();
  const notifier = createNotifier();
  const api = {
    getBagGifts: async () => ({ data: { list: [{ id: 2358, count: 2 }] } }),
    getFanBadgeRoomIds: async () => ["100", "200"],
    sendBagGift: async () => ({ msg: "success" }),
    sleep: async () => {},
  };

  await runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
    notifier,
  });

  assert.deepEqual(notifier.messages, [
    { type: "info", message: "开始自动续荧光棒：待赠送 2 个直播间" },
    { type: "success", message: "【续牌】 100 赠送 1 个荧光棒成功" },
    { type: "success", message: "【续牌】 200 赠送 1 个荧光棒成功" },
    { type: "success", message: "自动续荧光棒完成：成功 2，失败 0，跳过 0" },
  ]);
});

test("does not notify when today has already been checked", async () => {
  const storage = createStorage("2026-06-30T00:00:00.000Z");
  const notifier = createNotifier();
  const api = {
    getBagGifts: async () => {
      throw new Error("should not query gifts");
    },
  };

  await runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
    notifier,
  });

  assert.deepEqual(notifier.messages, []);
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

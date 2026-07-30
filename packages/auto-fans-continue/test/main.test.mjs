import assert from "node:assert/strict";
import test from "node:test";

import { CHECKED_DATE_KEY } from "../src/run-state.js";
import {
  PAGE_START_KEY,
  claimPageStart,
  runAutoFansContinue,
} from "../src/auto-fans-continue.js";

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
    removeItem(key) {
      values.delete(key);
    },
  };
}

const silentLogger = { log() {} };

test("claims each page only once", () => {
  const pageTarget = { location: { href: "https://www.douyu.com/12306" } };

  assert.equal(claimPageStart(pageTarget), true);
  assert.equal(claimPageStart(pageTarget), false);
  assert.equal(pageTarget[PAGE_START_KEY].href, "https://www.douyu.com/12306");
});

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

test("sends one stick to each fan room, sends the rest to 12306, and marks today", async () => {
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
    getBagGifts: async () => ({ data: { list: [{ id: 2358, count: 3 }] } }),
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
    { type: "success", message: "【剩余全送】 12306 赠送 1 个荧光棒成功" },
    { type: "success", message: "自动续荧光棒完成：成功 3，失败 0，跳过 0" },
  ]);
});

test("sends the rest only after fan room sends finish", async () => {
  const storage = createStorage();
  let pendingFanRoomSends = 0;
  let restStartedBeforeFanRoomsFinished = false;
  const api = {
    getBagGifts: async () => ({ data: { list: [{ id: 2358, count: 4 }] } }),
    getFanBadgeRoomIds: async () => ["100", "200"],
    sendBagGift: async (item) => {
      if (item.roomId === "12306") {
        restStartedBeforeFanRoomsFinished = pendingFanRoomSends > 0;
        return { msg: "success" };
      }

      pendingFanRoomSends += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      pendingFanRoomSends -= 1;
      return { msg: "success" };
    },
    sleep: async () => {},
  };

  await runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
  });

  assert.equal(restStartedBeforeFanRoomsFinished, false);
});

test("skips a second run while the first run is still in progress", async () => {
  const storage = createStorage();
  const sent = [];
  let resolveBagRequest;
  const bagRequestReady = new Promise((resolve) => {
    resolveBagRequest = resolve;
  });
  const api = {
    getBagGifts: async () => {
      await bagRequestReady;
      return { data: { list: [{ id: 2358, count: 3 }] } };
    },
    getFanBadgeRoomIds: async () => ["100", "200"],
    sendBagGift: async (item) => {
      sent.push(item);
      return { msg: "success" };
    },
    sleep: async () => {},
  };

  const firstRun = runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
  });
  const secondRun = runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:01.000Z"),
    api,
    logger: silentLogger,
  });

  resolveBagRequest();
  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

  assert.equal(firstResult.status, "completed");
  assert.equal(secondResult.status, "running");
  assert.deepEqual(sent, [
    { giftId: 2358, count: 1, roomId: "100" },
    { giftId: 2358, count: 1, roomId: "200" },
    { giftId: 2358, count: 1, roomId: "12306" },
  ]);
});

test("does not mark today when every gift send fails", async () => {
  const storage = createStorage();
  const sent = [];
  const api = {
    getBagGifts: async () => ({ data: { list: [{ id: 2358, count: 4 }] } }),
    getFanBadgeRoomIds: async () => ["100", "200"],
    sendBagGift: async (item) => {
      sent.push(item);
      return { msg: "failed" };
    },
    sleep: async () => {},
  };

  const result = await runAutoFansContinue({
    storage,
    now: new Date("2026-06-30T10:00:00.000Z"),
    api,
    logger: silentLogger,
  });

  assert.equal(result.successCount, 0);
  assert.equal(storage.getItem(CHECKED_DATE_KEY), null);
  assert.deepEqual(
    sent.map((item) => item.roomId),
    ["100", "200"],
  );
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

test("connects to the configured room and refreshes the backpack when the stick is missing", async () => {
  const storage = createStorage();
  const notifier = createNotifier();
  const connectedRooms = [];
  let bagRequestCount = 0;
  const sent = [];
  const api = {
    getBagGifts: async () => {
      bagRequestCount += 1;
      return bagRequestCount === 1
        ? { data: { list: [] } }
        : { data: { list: [{ id: 2358, count: 2 }] } };
    },
    connectAuthenticatedRoom: async ({ roomId }) => {
      connectedRooms.push(roomId);
    },
    getFanBadgeRoomIds: async () => ["100"],
    sendBagGift: async (item) => {
      sent.push(item);
      return { msg: "success" };
    },
    sleep: async () => {},
  };

  const result = await runAutoFansContinue({
    storage,
    now: new Date("2026-07-28T12:00:00.000Z"),
    api,
    logger: silentLogger,
    notifier,
    restRoomId: "71415",
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(connectedRooms, ["71415"]);
  assert.equal(bagRequestCount, 2);
  assert.deepEqual(sent, [
    { giftId: 2358, count: 1, roomId: "100" },
    { giftId: 2358, count: 1, roomId: "71415" },
  ]);
  assert.deepEqual(notifier.messages.slice(0, 2), [
    {
      type: "info",
      message: "背包暂无荧光棒，正在连接房间 71415 尝试领取",
    },
    { type: "success", message: "已完成房间连接，正在等待荧光棒到账" },
  ]);
});

test("polls the backpack until the socket-triggered stick is credited", async () => {
  const storage = createStorage();
  const sleepDelays = [];
  let bagRequestCount = 0;
  const api = {
    getBagGifts: async () => {
      bagRequestCount += 1;
      return bagRequestCount < 4
        ? { data: { list: [] } }
        : { data: { list: [{ id: 2358, count: 1 }] } };
    },
    connectAuthenticatedRoom: async () => {},
    getFanBadgeRoomIds: async () => ["100"],
    sendBagGift: async () => ({ msg: "success" }),
    sleep: async (delayMs) => {
      sleepDelays.push(delayMs);
    },
  };

  const result = await runAutoFansContinue({
    storage,
    now: new Date("2026-07-29T00:01:00.000+08:00"),
    api,
    logger: silentLogger,
    restRoomId: "71415",
  });

  assert.equal(result.status, "completed");
  assert.equal(bagRequestCount, 4);
  assert.deepEqual(sleepDelays.slice(0, 3), [500, 1_000, 1_500]);
});

test("stops polling without marking today when the stick is not credited", async () => {
  const storage = createStorage();
  const sleepDelays = [];
  let bagRequestCount = 0;
  const api = {
    getBagGifts: async () => {
      bagRequestCount += 1;
      return { data: { list: [] } };
    },
    connectAuthenticatedRoom: async () => {},
    getFanBadgeRoomIds: async () => {
      throw new Error("should not query fan rooms");
    },
    sendBagGift: async () => {
      throw new Error("should not send");
    },
    sleep: async (delayMs) => {
      sleepDelays.push(delayMs);
    },
  };

  const result = await runAutoFansContinue({
    storage,
    now: new Date("2026-07-29T00:01:00.000+08:00"),
    api,
    logger: silentLogger,
    restRoomId: "71415",
  });

  assert.equal(result.status, "empty-bag");
  assert.equal(bagRequestCount, 7);
  assert.deepEqual(sleepDelays, [500, 1_000, 1_500, 2_000, 3_000, 4_000]);
  assert.equal(storage.getItem(CHECKED_DATE_KEY), null);
});

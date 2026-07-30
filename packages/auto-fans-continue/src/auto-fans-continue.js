import {
  getBagGifts,
  getFanBadgeRoomIds,
  sendBagGift,
  sleep,
} from "./douyu-api.js";
import { connectAuthenticatedRoom } from "./douyu-socket.js";
import {
  DEFAULT_REST_ROOM_ID,
  createRenewalPlan,
  selectStickGift,
} from "./renewal-plan.js";
import {
  acquireRunningLock,
  markChecked,
  releaseRunningLock,
  shouldRunToday,
} from "./run-state.js";
import { createLogger } from "./logger.js";
import { createNotifier } from "./notifier.js";

"use strict";

const SEND_NUM = 1;
const SEND_DELAY_MS = 250;
const SEND_CONCURRENCY = 4;
const BAG_REFRESH_DELAYS_MS = [500, 1_000, 1_500, 2_000, 3_000, 4_000];
export const PAGE_START_KEY = "__chzAutoFansContinueStarted";
const defaultApi = {
  getBagGifts,
  getFanBadgeRoomIds,
  sendBagGift,
  sleep,
  connectAuthenticatedRoom,
};

export function claimPageStart(target = globalThis) {
  if (!target) return true;

  try {
    if (target[PAGE_START_KEY]) return false;
    target[PAGE_START_KEY] = {
      startedAt: new Date().toISOString(),
      href: target.location?.href ?? "",
    };
    return true;
  } catch {
    // The localStorage running lock remains the fallback if page state is unwritable.
    return true;
  }
}

const defaultLogger = createLogger(globalThis.console);
const defaultNotifier = createNotifier({ logger: defaultLogger });

function log(logger, ...args) {
  logger.log(...args);
}

function createDefaultNotifier(logger) {
  return logger === defaultLogger ? defaultNotifier : createNotifier({ logger });
}

function notify(notifier, type, message) {
  notifier?.[type]?.(message);
}

function getGiftList(bagData) {
  return Array.isArray(bagData?.data?.list) ? bagData.data.list : [];
}

async function waitForStickGift(api, logger, restRoomId) {
  let bagData;
  let gifts = [];
  let gift;

  for (const delayMs of BAG_REFRESH_DELAYS_MS) {
    await api.sleep(delayMs);
    bagData = await api.getBagGifts(restRoomId);
    gifts = getGiftList(bagData);
    gift = selectStickGift(gifts);
    if (gift) {
      log(logger, `房间连接后等待 ${delayMs}ms 查询到荧光棒`);
      return { bagData, gifts, gift };
    }
    log(logger, `房间连接后等待 ${delayMs}ms，背包仍无荧光棒`);
  }

  return { bagData, gifts, gift: null };
}

async function sendPlanItem(api, logger, notifier, item, label) {
  await api.sleep(SEND_DELAY_MS);

  try {
    const data = await api.sendBagGift(item);
    if (data?.msg === "success") {
      const message = `${label} ${item.roomId} 赠送 ${item.count} 个荧光棒成功`;
      log(logger, message);
      notify(notifier, "success", message);
      return { item, success: true, data };
    }

    const message = `${label} ${item.roomId} 赠送失败`;
    log(logger, message, data);
    notify(notifier, "warning", message);
    return { item, success: false, data };
  } catch (error) {
    const message = `${label} ${item.roomId} 请求失败`;
    log(logger, message, error);
    notify(notifier, "error", message);
    return { item, success: false, error };
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );
  return results;
}

async function sendPlan(
  api,
  logger,
  notifier,
  plan,
  { concurrency = SEND_CONCURRENCY } = {},
) {
  const items = plan.perRoom.map((item) => ({ item, label: "【续牌】" }));
  const results = await mapLimit(items, concurrency, ({ item, label }) =>
    sendPlanItem(api, logger, notifier, item, label),
  );

  if (plan.rest && results.some((result) => result.success)) {
    results.push(
      await sendPlanItem(api, logger, notifier, plan.rest, "【剩余全送】"),
    );
  }

  return results;
}

async function executeRenewal({
  api,
  logger,
  notifier,
  restRoomId,
  sendConcurrency,
}) {
  let bagData = await api.getBagGifts(restRoomId);
  let gifts = getGiftList(bagData);
  let gift = selectStickGift(gifts);

  if (!gift && typeof api.connectAuthenticatedRoom === "function") {
    notify(
      notifier,
      "info",
      `背包暂无荧光棒，正在连接房间 ${restRoomId} 尝试领取`,
    );
    try {
      await api.connectAuthenticatedRoom({ roomId: restRoomId });
      log(logger, `已完成房间 ${restRoomId} 登录与进房连接，等待道具入账`);
      notify(notifier, "success", "已完成房间连接，正在等待荧光棒到账");
      ({ bagData, gifts, gift } = await waitForStickGift(
        api,
        logger,
        restRoomId,
      ));
    } catch (error) {
      log(logger, `连接房间 ${restRoomId} 领取荧光棒失败`, error);
      notify(notifier, "warning", "自动连接房间领取荧光棒失败，稍后可重试");
    }
  }

  if (gifts.length === 0) {
    log(logger, "背包礼物为空，今日不标记为已执行");
    notify(notifier, "warning", "背包礼物为空，今日暂不标记为已执行");
    return { status: "empty-bag", shouldMarkChecked: false };
  }

  if (!gift) {
    log(logger, "等待领取后背包仍没有可用荧光棒，今日不标记为已执行");
    notify(
      notifier,
      "warning",
      "等待领取后仍无荧光棒，今日暂不标记为已执行",
    );
    return { status: "no-stick-gift", shouldMarkChecked: false };
  }

  const fanRoomIds = await api.getFanBadgeRoomIds();
  if (fanRoomIds.length === 0) {
    log(logger, "未找到粉丝牌房间，今日不标记为已执行");
    notify(notifier, "warning", "未找到粉丝牌房间，今日暂不标记为已执行");
    return { status: "no-fan-rooms", shouldMarkChecked: false };
  }

  const plan = createRenewalPlan({
    gift,
    fanRoomIds,
    restRoomId,
    sendNum: SEND_NUM,
  });
  notify(
    notifier,
    "info",
    `开始自动续荧光棒：待赠送 ${plan.perRoom.length} 个直播间`,
  );
  const results = await sendPlan(api, logger, notifier, plan, {
    concurrency: sendConcurrency,
  });
  const successCount = results.filter((result) => result.success).length;

  return {
    status: "completed",
    gift,
    plan,
    results,
    successCount,
    failureCount: results.length - successCount,
    skippedRoomCount: fanRoomIds.length - plan.perRoom.length,
    shouldMarkChecked: successCount > 0,
  };
}

export async function runAutoFansContinue({
  storage = globalThis.localStorage,
  now = new Date(),
  api = defaultApi,
  logger = defaultLogger,
  notifier = createDefaultNotifier(logger),
  restRoomId = DEFAULT_REST_ROOM_ID,
  sendConcurrency = SEND_CONCURRENCY,
} = {}) {
  if (!storage) throw new Error("localStorage is not available");

  if (!shouldRunToday(storage, now)) {
    log(logger, "今天已经执行过");
    return { status: "skipped", shouldMarkChecked: false };
  }

  const runningLockToken = acquireRunningLock(storage, now);
  if (!runningLockToken) {
    log(logger, "自动续荧光棒任务正在执行，跳过本次触发");
    return { status: "running", shouldMarkChecked: false };
  }

  const runtimeApi = { ...defaultApi, ...api };
  try {
    const result = await executeRenewal({
      api: runtimeApi,
      logger,
      notifier,
      restRoomId,
      sendConcurrency,
    });

    if (result.shouldMarkChecked) {
      markChecked(storage, now);
      log(logger, "执行完成", result);
      notify(
        notifier,
        result.failureCount > 0 ? "warning" : "success",
        `自动续荧光棒完成：成功 ${result.successCount}，失败 ${result.failureCount}，跳过 ${result.skippedRoomCount}`,
      );
    }

    return result;
  } finally {
    releaseRunningLock(storage, runningLockToken);
  }
}

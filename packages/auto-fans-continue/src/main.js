import {
  getBagGifts,
  getFanBadgeRoomIds,
  sendBagGift,
  sleep,
} from "./douyu-api.js";
import {
  DEFAULT_REST_ROOM_ID,
  createRenewalPlan,
  selectStickGift,
} from "./renewal-plan.js";
import { markChecked, shouldRunToday } from "./run-state.js";

"use strict";

const SEND_NUM = 1;
const SEND_DELAY_MS = 250;
const defaultApi = {
  getBagGifts,
  getFanBadgeRoomIds,
  sendBagGift,
  sleep,
};

function log(logger, ...args) {
  logger.log("chz_script", ...args);
}

async function sendPlanItem(api, logger, item, label) {
  await api.sleep(SEND_DELAY_MS);

  try {
    const data = await api.sendBagGift(item);
    if (data?.msg === "success") {
      log(logger, `${label} ${item.roomId} 赠送 ${item.count} 个荧光棒成功`);
      return { item, success: true, data };
    }

    log(logger, `${label} ${item.roomId} 赠送失败`, data);
    return { item, success: false, data };
  } catch (error) {
    log(logger, `${label} ${item.roomId} 请求失败`, error);
    return { item, success: false, error };
  }
}

async function sendPlan(api, logger, plan) {
  const results = [];

  for (const item of plan.perRoom) {
    results.push(await sendPlanItem(api, logger, item, "【续牌】"));
  }

  if (plan.rest) {
    results.push(await sendPlanItem(api, logger, plan.rest, "【剩余全送】"));
  }

  return results;
}

async function executeRenewal({ api, logger, restRoomId }) {
  const bagData = await api.getBagGifts(restRoomId);
  const gifts = Array.isArray(bagData?.data?.list) ? bagData.data.list : [];

  if (gifts.length === 0) {
    log(logger, "背包礼物为空，今日不标记为已执行");
    return { status: "empty-bag", shouldMarkChecked: false };
  }

  const gift = selectStickGift(gifts);
  if (!gift) {
    log(logger, "背包内没有可用荧光棒，今日不标记为已执行");
    return { status: "no-stick-gift", shouldMarkChecked: false };
  }

  const fanRoomIds = await api.getFanBadgeRoomIds();
  if (fanRoomIds.length === 0) {
    log(logger, "未找到粉丝牌房间，今日不标记为已执行");
    return { status: "no-fan-rooms", shouldMarkChecked: false };
  }

  const plan = createRenewalPlan({
    gift,
    fanRoomIds,
    restRoomId,
    sendNum: SEND_NUM,
  });
  const results = await sendPlan(api, logger, plan);
  const successCount = results.filter((result) => result.success).length;

  return {
    status: "completed",
    gift,
    plan,
    results,
    successCount,
    failureCount: results.length - successCount,
    skippedRoomCount: fanRoomIds.length - plan.perRoom.length,
    shouldMarkChecked: results.length > 0,
  };
}

export async function runAutoFansContinue({
  storage = globalThis.localStorage,
  now = new Date(),
  api = defaultApi,
  logger = console,
  restRoomId = DEFAULT_REST_ROOM_ID,
} = {}) {
  if (!storage) throw new Error("localStorage is not available");

  if (!shouldRunToday(storage, now)) {
    log(logger, "今天已经执行过");
    return { status: "skipped", shouldMarkChecked: false };
  }

  const runtimeApi = { ...defaultApi, ...api };
  const result = await executeRenewal({ api: runtimeApi, logger, restRoomId });

  if (result.shouldMarkChecked) {
    markChecked(storage, now);
    log(logger, "执行完成", result);
  }

  return result;
}

async function main() {
  log(console, "start!");
  try {
    await runAutoFansContinue();
  } catch (error) {
    log(console, "执行错误", error);
  }
}

if (typeof window !== "undefined") {
  main();
}

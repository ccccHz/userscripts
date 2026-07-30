import { GM_log, GM_registerMenuCommand, unsafeWindow } from "$";

import {
  claimPageStart,
  runAutoFansContinue,
} from "./auto-fans-continue.js";
import { getRestRoomId, registerRestRoomMenu } from "./config.js";
import { createLogger } from "./logger.js";
import { createNotifier } from "./notifier.js";

"use strict";

const pageTarget = unsafeWindow ?? globalThis;
const logger = createLogger(globalThis.console, {
  target: pageTarget,
  gmLog: GM_log,
});
const notifier = createNotifier({ logger });

async function main() {
  logger.log("start!");
  try {
    const storage = globalThis.localStorage;
    await runAutoFansContinue({
      storage,
      logger,
      notifier,
      restRoomId: getRestRoomId(storage),
    });
  } catch (error) {
    logger.log("执行错误", error);
    notifier.error("自动续荧光棒执行错误，请查看控制台状态");
  }
}

function runMainWhenReady() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main, { once: true });
    return;
  }

  main();
}

if (claimPageStart(pageTarget)) {
  registerRestRoomMenu({
    storage: globalThis.localStorage,
    registerMenuCommand: GM_registerMenuCommand,
    prompt: globalThis.prompt,
    alert: globalThis.alert,
  });
  runMainWhenReady();
} else {
  logger.log("当前页面已启动过，跳过重复入口");
}

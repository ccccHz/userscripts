import mscststs from "../../../shared/mscststs.js";
import { ensurePlayerAudioOnOpen } from "./audio.js";
import { ensureDanmakuFiltersDisabled } from "./danmaku-settings.js";
import {
  LIVE_BOTTOM_LAYOUT_SELECTORS,
  removeLiveBottomLayout,
} from "./dom-cleanup.js";
import { ensureGiftEffectsBlocked } from "./gift-effects.js";
import { findBestQualityOption, getQualityText } from "./quality.js";
import { registerPlaybackResumeEvents } from "./playback-resume.js";
import { registerRuntimeEvents } from "./runtime-events.js";
import { observeAndRemoveWishPopups } from "./wish-popup.js";

const REMOVE_ELEMENT_RULES = [
  {
    name: "全部商品",
    selector: '[data-douyin-live-product-entry="placeholder"]',
  },
];

let wishPopupObserver = null;
let playerAudioCheckedOnOpen = false;
let danmakuFiltersCheckedOnOpen = false;
let giftEffectBlockerTask = null;

const GIFT_EFFECT_BLOCKER_STATE_ATTRIBUTE =
  "data-douyin-live-gift-effect-blocker";

const QUALITY_RULES = [
  {
    name: "最高直播清晰度",
    menuSelector: '[data-e2e="quality"]',
    optionListSelector: '[data-e2e="quality-selector"]',
  },
];

(function () {
  "use strict";
  runMain();

  registerRuntimeEvents({
    history,
    window,
    runMain,
    removeLiveBottomLayouts,
  });

  registerPlaybackResumeEvents({ document, window });
})();

async function getTarget(str, needContent = true) {
  const target = await mscststs.wait(str, needContent, 50);
  return target;
}

function runMain() {
  console.log("userscript: douyin optim");
  removeMatchedElements();
  const giftEffectTask = enableGiftEffectBlocker();
  ensurePlayerAudioEnabled();
  disableDanmakuFiltersOnOpen(giftEffectTask);
  removeWishPopupWhenShown();
  selectQualityOptions();
  removeLiveBottomLayouts();
  getTarget('div[data-e2e="yellowCart-container"]').then((target) => {
    if (target) target.remove();
  });
}

function disableDanmakuFiltersOnOpen(previousTask) {
  if (danmakuFiltersCheckedOnOpen) return;

  danmakuFiltersCheckedOnOpen = true;
  Promise.resolve(previousTask)
    .then(() => ensureDanmakuFiltersDisabled({ document }))
    .then((result) => {
      console.debug(
        "userscript: douyin danmaku filters",
        JSON.stringify(result),
      );
    });
}

function ensurePlayerAudioEnabled() {
  if (playerAudioCheckedOnOpen) return;

  playerAudioCheckedOnOpen = true;
  ensurePlayerAudioOnOpen({ document }).then((result) => {
    console.debug(
      "userscript: douyin initial audio check",
      JSON.stringify(result),
    );
  });
}

function removeLiveBottomLayouts() {
  LIVE_BOTTOM_LAYOUT_SELECTORS.forEach((selector) => {
    getTarget(selector, false).then((target) => {
      removeLiveBottomLayout(target);
    });
  });
}

function removeMatchedElements() {
  REMOVE_ELEMENT_RULES.forEach((rule) => {
    getTarget(rule.selector).then((target) => {
      if (target) target.remove();
    });
  });
}

function enableGiftEffectBlocker() {
  const root = document.documentElement;
  const blockerState = root?.getAttribute(GIFT_EFFECT_BLOCKER_STATE_ATTRIBUTE);

  if (giftEffectBlockerTask || blockerState === "running" || blockerState === "done") {
    console.debug("userscript: douyin gift effect blocker skipped", blockerState);
    return giftEffectBlockerTask;
  }

  root?.setAttribute(GIFT_EFFECT_BLOCKER_STATE_ATTRIBUTE, "running");

  giftEffectBlockerTask = ensureGiftEffectsBlocked({
    document,
    sleep: (milliseconds) => mscststs.sleep(milliseconds),
  })
    .then(async (result) => {
      if (result.switchFound) {
        await mscststs.sleep(400);
        root?.setAttribute(GIFT_EFFECT_BLOCKER_STATE_ATTRIBUTE, "done");
      } else {
        root?.removeAttribute(GIFT_EFFECT_BLOCKER_STATE_ATTRIBUTE);
      }

      console.debug("userscript: douyin gift effect blocker", result);
      return result;
    })
    .catch((error) => {
      root?.removeAttribute(GIFT_EFFECT_BLOCKER_STATE_ATTRIBUTE);
      console.warn("userscript: douyin gift effect blocker failed", error);
    })
    .finally(() => {
      giftEffectBlockerTask = null;
    });

  return giftEffectBlockerTask;
}

function removeWishPopupWhenShown() {
  if (wishPopupObserver) return;

  wishPopupObserver = observeAndRemoveWishPopups({ document });
}

function selectQualityOptions() {
  QUALITY_RULES.forEach((rule) => {
    getTarget(rule.menuSelector).then((menu) => {
      if (!menu) return;

      const currentQuality = getQualityText(menu);
      menu.click();
      getTarget(rule.optionListSelector).then((optionList) => {
        const target = findBestQualityOption(optionList);
        if (!target) return;

        const bestQuality = getQualityText(target);
        if (!bestQuality.includes(currentQuality)) {
          target.click();
        }
      });
    });
  });
}

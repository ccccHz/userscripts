import mscststs from "../../../shared/mscststs.js";
import {
  LIVE_BOTTOM_LAYOUT_SELECTORS,
  removeLiveBottomLayout,
} from "./dom-cleanup.js";
import { ensureGiftEffectsBlocked } from "./gift-effects.js";
import { registerRuntimeEvents } from "./runtime-events.js";
import { observeAndRemoveWishPopups } from "./wish-popup.js";

const REMOVE_ELEMENT_RULES = [
  {
    name: "全部商品",
    selector: '[data-douyin-live-product-entry="placeholder"]',
  },
];

let wishPopupObserver = null;
let giftEffectBlockerTask = null;

const GIFT_EFFECT_BLOCKER_STATE_ATTRIBUTE =
  "data-douyin-live-gift-effect-blocker";

const CLICK_ELEMENT_RULES = [
  {
    name: "继续播放",
    selector: '[data-douyin-live-resume-button="placeholder"]',
  },
];

const QUALITY_RULES = [
  {
    name: "最高直播清晰度",
    menuSelector: '[data-e2e="quality"]',
    bestOptionSelector: '[data-e2e="quality-selector"] > :first-child',
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
})();

async function getTarget(str, needContent = true) {
  const target = await mscststs.wait(str, needContent, 50);
  return target;
}

function runMain() {
  console.log("userscript: douyin optim");
  removeMatchedElements();
  clickMatchedElements();
  enableGiftEffectBlocker();
  removeWishPopupWhenShown();
  selectQualityOptions();
  removeLiveBottomLayouts();
  getTarget('div[data-e2e="yellowCart-container"]').then((target) => {
    if (target) target.remove();
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

function clickMatchedElements() {
  CLICK_ELEMENT_RULES.forEach((rule) => {
    getTarget(rule.selector).then((target) => {
      if (target) target.click();
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

      const currentQuality = (menu.innerText || menu.textContent || "").trim();
      menu.click();
      getTarget(rule.bestOptionSelector).then((target) => {
        if (!target) return;

        const bestQuality = (target.innerText || target.textContent || "").trim();
        if (!bestQuality.includes(currentQuality)) {
          target.click();
        }
      });
    });
  });
}

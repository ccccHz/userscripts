import { LIVE_COMMERCE_AD_SELECTORS } from "./commerce-ads.js";
import { findWishPopups } from "./wish-popup.js";
import { LIVE_BOTTOM_LAYOUT_SELECTORS, findLiveBottomLayoutRoot } from "./dom-cleanup.js";

export const HIDDEN_ATTRIBUTE = "data-douyin-live-optimizer-hidden";

export function createVisibilityController({ document, MutationObserver = globalThis.MutationObserver } = {}) {
  let settings = {};
  const marked = new Map();
  const style = document.createElement("style");
  style.textContent = `[${HIDDEN_ATTRIBUTE}]{display:none!important}`;
  (document.head || document.documentElement).append(style);

  function release(node, key) {
    const tokens = (node.getAttribute(HIDDEN_ATTRIBUTE) || "").split(" ").filter((token) => token && token !== key);
    if (tokens.length) node.setAttribute(HIDDEN_ATTRIBUTE, tokens.join(" "));
    else node.removeAttribute(HIDDEN_ATTRIBUTE);
  }
  function clear(key) {
    for (const node of marked.get(key) || []) release(node, key);
    marked.delete(key);
  }
  function hide(key, nodes) {
    if (!marked.has(key)) marked.set(key, new Set());
    const tracked = marked.get(key);
    for (const old of tracked) {
      if (old.isConnected === false) {
        release(old, key);
        tracked.delete(old);
      }
    }
    for (const node of nodes) {
      if (!node) continue;
      const tokens = (node.getAttribute(HIDDEN_ATTRIBUTE) || "").split(" ").filter(Boolean);
      if (!tokens.includes(key)) node.setAttribute(HIDDEN_ATTRIBUTE, [...tokens, key].join(" "));
      tracked.add(node);
    }
  }
  function refresh() {
    if (settings.commerceAds) hide("commerceAds", LIVE_COMMERCE_AD_SELECTORS.flatMap((selector) => [...document.querySelectorAll(selector)]));
    if (settings.wishPopups) hide("wishPopups", findWishPopups(document));
    if (settings.bottomLayout) hide("bottomLayout", LIVE_BOTTOM_LAYOUT_SELECTORS.flatMap((selector) =>
      [...document.querySelectorAll(selector)].map(findLiveBottomLayoutRoot),
    ));
  }
  let scheduled = false;
  let timer;
  let destroyed = false;
  const observer = MutationObserver ? new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    timer = setTimeout(() => {
      scheduled = false;
      timer = undefined;
      if (!destroyed) refresh();
    }, 100);
  }) : null;
  observer?.observe(document.body || document.documentElement, { subtree: true, childList: true, characterData: true });
  return {
    update(next) {
      settings = next;
      for (const key of marked.keys()) if (!settings[key]) clear(key);
      refresh();
    },
    refresh,
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      observer?.disconnect();
      for (const key of marked.keys()) clear(key);
      style.remove();
    },
  };
}

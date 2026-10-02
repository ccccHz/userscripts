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
    const current = new Set(nodes.filter((node) => node && node.isConnected !== false));
    for (const old of marked.get(key) || []) if (!current.has(old)) release(old, key);
    for (const node of current) {
      const tokens = (node.getAttribute(HIDDEN_ATTRIBUTE) || "").split(" ").filter(Boolean);
      if (!tokens.includes(key)) node.setAttribute(HIDDEN_ATTRIBUTE, [...tokens, key].join(" "));
    }
    if (current.size) marked.set(key, current);
    else marked.delete(key);
  }
  function refresh() {
    if (destroyed) return;
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
  observer?.observe(document.body || document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    // Exclude our own marker and style; late site attributes still need a scan.
    attributeFilter: ["id", "class", "data-e2e", "data-container-id", "data-douyin-live-product-entry"],
  });
  return {
    update(next) {
      if (destroyed) return;
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

import assert from "node:assert/strict";
import test from "node:test";

import {
  findLiveBottomLayoutRoot,
  removeLiveBottomLayout,
} from "../src/dom-cleanup.js";

test("prefers removing the stable BottomLayout container", () => {
  const bottomLayout = el({ id: "BottomLayout" }, [
    el({ className: "layout" }, [
      el({ attributes: { "data-e2e": "gifts-container" } }),
      el({ id: "giftPanelEntrance", attributes: { "data-e2e": "gifts-switch" } }),
    ]),
  ]);
  const giftContainer = bottomLayout.childNodes[0].childNodes[0];

  assert.equal(findLiveBottomLayoutRoot(giftContainer), bottomLayout);
});

test("removes the shared gift bar root when BottomLayout is absent", () => {
  const giftBarRoot = el({ className: "RlvV_pZh" }, [
    el({ attributes: { "data-e2e": "gifts-container" } }, [
      el({ className: "gift_item_gift_bar" }),
    ]),
    el({ id: "giftPanelEntrance", attributes: { "data-e2e": "gifts-switch" } }),
  ]);
  const giftContainer = giftBarRoot.childNodes[0];

  assert.equal(removeLiveBottomLayout(giftContainer), giftBarRoot);
  assert.equal(giftBarRoot.removed, true);
  assert.equal(giftContainer.removed, false);
});

test("uses the full gift bar root from the fullscreen gift switch entry", () => {
  const giftBarRoot = el({ className: "fullscreen-gift-root" }, [
    el({ attributes: { "data-e2e": "gifts-container" } }),
    el({ id: "giftPanelEntrance", attributes: { "data-e2e": "gifts-switch" } }),
  ]);
  const giftSwitch = giftBarRoot.childNodes[1];

  assert.equal(findLiveBottomLayoutRoot(giftSwitch), giftBarRoot);
});

test("removes the fullscreen game layout root from its annie iframe", () => {
  const gameLayout = el({ className: "YWoVbeaa NP47LiqA isDark klDKYUkp" }, [
    el({}, [
      el({
        tagName: "IFRAME",
        attributes: { "data-container-id": "@annie/web_bydt27bjd8n_2" },
      }),
    ]),
    el({ textContent: "游戏" }),
  ]);
  const annieIframe = gameLayout.childNodes[0].childNodes[0];

  assert.equal(removeLiveBottomLayout(annieIframe), gameLayout);
  assert.equal(gameLayout.removed, true);
  assert.equal(annieIframe.removed, false);
});

test("does not remove unrelated annie iframes without a game layout", () => {
  const unrelated = el({
    tagName: "IFRAME",
    attributes: { "data-container-id": "@annie/web_hmmvwifxld9_0" },
  });

  assert.equal(removeLiveBottomLayout(unrelated), null);
  assert.equal(unrelated.removed, false);
});

test("does not remove the player ancestor for a service annie iframe", () => {
  const serviceIframe = el({
    tagName: "IFRAME",
    attributes: { "data-container-id": "@annie/web_hmmvwifxld9_0" },
  });
  const playerRoot = el({ id: "PlayerLayout", textContent: "高清 更多直播" }, [
    el({ id: "ServiceCenterLayout" }, [el({}, [serviceIframe])]),
  ]);
  const bottomLayout = el({ id: "BottomLayout", textContent: "充值 游戏" }, [
    el({
      tagName: "IFRAME",
      attributes: { "data-container-id": "@annie/web_74gzhjg5qho_1" },
    }),
  ]);
  const pageRoot = el({}, [playerRoot, bottomLayout]);

  assert.equal(removeLiveBottomLayout(serviceIframe), null);
  assert.equal(pageRoot.removed, false);
  assert.equal(playerRoot.removed, false);
  assert.equal(serviceIframe.removed, false);
});

test("keeps the old gitBarOptimizeEnabled ancestor fallback", () => {
  const outer = el({ className: "old-gift-bar-root" }, [
    el({ className: "shell" }, [el({ className: "gitBarOptimizeEnabled" })]),
    el({ className: "side-action" }),
    el({ className: "anchor-sibling" }),
  ]);
  const oldMarker = outer.childNodes[0].childNodes[0];

  assert.equal(findLiveBottomLayoutRoot(oldMarker), outer.childNodes[0]);
});

function el(options = {}, children = []) {
  const node = {
    tagName: options.tagName || "DIV",
    id: options.id || "",
    className: options.className || "",
    attributes: options.attributes || {},
    childNodes: [],
    parentNode: null,
    parentElement: null,
    removed: false,
    textContent: options.textContent || "",
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    remove() {
      this.removed = true;
    },
  };

  node.childNodes = children;
  for (const child of children) {
    child.parentNode = node;
    child.parentElement = node;
  }

  return node;
}

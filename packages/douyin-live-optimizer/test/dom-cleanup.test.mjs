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

test("a gift entry outside BottomLayout cannot hide LeftBackgroundLayout containing the player", () => {
  const entry = el({ id: "giftPanelEntrance", attributes: { "data-e2e": "gifts-switch" } });
  const gifts = el({ attributes: { "data-e2e": "gifts-container" } });
  const bottom = el({ id: "BottomLayout" }, [gifts]);
  const player = el({ id: "PlayerLayout" }, [el({ tagName: "VIDEO" })]);
  const left = el({ id: "LeftBackgroundLayout" }, [el({ id: "HeaderLayout" }, [entry]), player, bottom]);
  assert.equal(findLiveBottomLayoutRoot(entry), entry);
  assert.equal(findLiveBottomLayoutRoot(gifts), bottom);
  removeLiveBottomLayout(entry);
  assert.equal(left.removed, false);
  assert.equal(player.removed, false);
});

test("unknown shared gift ancestors containing video or chat are never layout targets", () => {
  for (const content of [el({ tagName: "VIDEO" }), el({ id: "chatInput" })]) {
    const entry = el({ id: "giftPanelEntrance" });
    const wrapper = el({}, [el({ attributes: { "data-e2e": "gifts-container" } }), entry, content]);
    assert.equal(findLiveBottomLayoutRoot(entry), entry);
    assert.equal(findLiveBottomLayoutRoot(wrapper), null);
    assert.equal(wrapper.removed, false);
  }
});

test("a recognized BottomLayout containing a player is rejected instead of trusting its id", () => {
  const bottom = el({ id: "BottomLayout" }, [el({ tagName: "VIDEO" })]);
  assert.equal(removeLiveBottomLayout(bottom), null);
  assert.equal(bottom.removed, false);
});

test("legacy ancestor climbing stops before a player with one child", () => {
  const marker = el({ className: "gitBarOptimizeEnabled" });
  const bar = el({}, [marker]);
  const player = el({ className: "douyin-player" }, [bar]);
  assert.equal(findLiveBottomLayoutRoot(marker), bar);
  assert.equal(player.removed, false);
});

test("a game iframe inside the player cannot select the whole player as its game layout", () => {
  const iframe = el({ tagName: "IFRAME", attributes: { "data-container-id": "@annie/web_service" } });
  const player = el({ className: "douyin-player", textContent: "游戏" }, [el({}, [iframe]), el({ tagName: "VIDEO" })]);
  assert.equal(removeLiveBottomLayout(iframe), null);
  assert.equal(player.removed, false);
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

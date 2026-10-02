import assert from "node:assert/strict";
import test from "node:test";
import { createVisibilityController, HIDDEN_ATTRIBUTE } from "../src/visibility.js";

function node(id = "") {
  const attributes = new Map();
  return { id, isConnected: true, childNodes: [], parentNode: null,
    getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key) };
}
function fixture() {
  const bottom = node("BottomLayout"); const commerce = node("EcmoCardLayout");
  const wish = node(); wish.className = "dylive-tooltip"; wish.textContent = "帮主播完成心愿吧";
  const matches = new Map([["#BottomLayout", [bottom]], ["#EcmoCardLayout", [commerce]]]);
  let callback; let disconnected = false; let removedStyle = false;
  const document = { body: { childNodes: [wish] }, head: { append() {} },
    createElement: () => ({ remove() { removedStyle = true; } }),
    querySelectorAll: (selector) => matches.get(selector) || [] };
  const controller = createVisibilityController({ document, MutationObserver: class {
    constructor(fn) { callback = fn; } observe() {} disconnect() { disconnected = true; }
  } });
  return { controller, bottom, commerce, wish, matches, notify: () => callback(), disconnected: () => disconnected, removedStyle: () => removedStyle };
}

test("layout hiding is reversible and never deletes the site's nodes", () => {
  const f = fixture();
  f.controller.update({ bottomLayout: true, commerceAds: true, wishPopups: true });
  assert.equal(f.bottom.getAttribute(HIDDEN_ATTRIBUTE), "bottomLayout");
  assert.equal(f.commerce.getAttribute(HIDDEN_ATTRIBUTE), "commerceAds");
  assert.equal(f.wish.getAttribute(HIDDEN_ATTRIBUTE), "wishPopups");
  f.controller.update({ bottomLayout: false, commerceAds: false, wishPopups: false });
  assert.equal(f.bottom.getAttribute(HIDDEN_ATTRIBUTE), null);
  assert.equal(f.commerce.getAttribute(HIDDEN_ATTRIBUTE), null);
  assert.equal(f.wish.getAttribute(HIDDEN_ATTRIBUTE), null);
  assert.equal(f.bottom.isConnected, true);
  f.controller.destroy();
});

test("late commerce nodes are hidden, and destroy cancels queued observer work", async () => {
  const f = fixture(); f.controller.update({ commerceAds: true });
  const late = node("EcmoCardLayout"); f.matches.set("#EcmoCardLayout", [late]);
  f.notify(); f.notify(); await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(late.getAttribute(HIDDEN_ATTRIBUTE), "commerceAds");
  f.notify(); f.controller.destroy(); await Promise.resolve();
  assert.equal(late.getAttribute(HIDDEN_ATTRIBUTE), null);
  assert.equal(f.disconnected(), true);
  assert.equal(f.removedStyle(), true);
});

test("overlapping hide rules release a node only when both rules are disabled", () => {
  const f = fixture(); f.matches.set("#EcmoCardLayout", [f.bottom]);
  f.controller.update({ bottomLayout: true, commerceAds: true });
  f.controller.update({ bottomLayout: false, commerceAds: true });
  assert.equal(f.bottom.getAttribute(HIDDEN_ATTRIBUTE), "commerceAds");
  f.controller.update({ bottomLayout: false, commerceAds: false });
  assert.equal(f.bottom.getAttribute(HIDDEN_ATTRIBUTE), null);
  f.controller.destroy();
});

test("detached nodes lose stale hide markers before being reused after disable", () => {
  const f = fixture();
  f.controller.update({ commerceAds: true });
  f.commerce.isConnected = false;
  f.matches.set("#EcmoCardLayout", []);
  f.controller.refresh();
  assert.equal(f.commerce.getAttribute(HIDDEN_ATTRIBUTE), null);
  f.controller.update({ commerceAds: false });
  f.commerce.isConnected = true;
  f.matches.set("#EcmoCardLayout", [f.commerce]);
  f.controller.refresh();
  assert.equal(f.commerce.getAttribute(HIDDEN_ATTRIBUTE), null);
  f.controller.destroy();
});

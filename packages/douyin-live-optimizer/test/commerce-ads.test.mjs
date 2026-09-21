import assert from "node:assert/strict";
import test from "node:test";

import {
  observeAndRemoveCommerceAds,
  removeCommerceAds,
} from "../src/commerce-ads.js";

test("removes the Ecmo shopping popup layout", () => {
  const popup = removableNode();
  const document = fakeDocument({ "#EcmoCardLayout": [popup] });

  assert.deepEqual(removeCommerceAds(document), [popup]);
  assert.equal(popup.removed, true);
});

test("keeps the existing live commerce cleanup selectors", () => {
  const yellowCart = removableNode();
  const productEntry = removableNode();
  const document = fakeDocument({
    'div[data-e2e="yellowCart-container"]': [yellowCart],
    '[data-douyin-live-product-entry="placeholder"]': [productEntry],
  });

  assert.deepEqual(removeCommerceAds(document), [yellowCart, productEntry]);
  assert.equal(yellowCart.removed, true);
  assert.equal(productEntry.removed, true);
});

test("keeps observing and removes commerce ads added later", () => {
  const root = {};
  const popup = removableNode();
  const matches = {};
  const document = fakeDocument(matches, root);
  let callback;

  const observer = observeAndRemoveCommerceAds({
    document,
    MutationObserver: class {
      constructor(next) {
        callback = next;
      }
      observe(target, options) {
        this.target = target;
        this.options = options;
      }
    },
  });

  matches["#EcmoCardLayout"] = [popup];
  callback();

  assert.equal(observer.target, root);
  assert.deepEqual(observer.options, { childList: true, subtree: true });
  assert.equal(popup.removed, true);
});

function removableNode() {
  return {
    removed: false,
    remove() {
      this.removed = true;
    },
  };
}

function fakeDocument(matches, body = {}) {
  return {
    body,
    querySelectorAll(selector) {
      return matches[selector] || [];
    },
  };
}

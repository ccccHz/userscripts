import assert from "node:assert/strict";
import test from "node:test";

import {
  findWishPopup,
  observeAndRemoveWishPopups,
  removeWishPopup,
  removeWishPopups,
  waitAndRemoveWishPopup,
} from "../src/wish-popup.js";

test("finds the wish tooltip by text", () => {
  const tooltip = el({ className: "dylive-tooltip undefined", textContent: "帮主播完成心愿吧" });
  const root = el({}, [el({ className: "other-tooltip", textContent: "点亮展馆" }), tooltip]);

  assert.equal(findWishPopup(root), tooltip);
});

test("removes the whole wish tooltip instead of only the label", () => {
  const label = el({ textContent: "帮主播完成心愿吧" });
  const tooltip = el({ className: "dylive-tooltip dylive-tooltip-placement-bottomRight" }, [
    el({}, [label]),
    el({ textContent: "赠送 送1个 1钻" }),
  ]);

  assert.equal(removeWishPopup(label), tooltip);
  assert.equal(tooltip.removed, true);
  assert.equal(label.removed, false);
});

test("removes the exhibition star tooltip by title text", () => {
  const tooltip = el({
    className: "dylive-tooltip dylive-tooltip-placement-bottomRight",
    textContent: "点亮展馆帮主播集星 大啤酒 差19个点亮",
  });

  assert.deepEqual(removeWishPopups(el({}, [tooltip])), [tooltip]);
  assert.equal(tooltip.removed, true);
});

test("keeps the legacy exhibition banner selector as a fallback", () => {
  const tooltip = el({
    className: "dylive-tooltip",
    textContent: "展馆活动",
  });
  const root = {
    body: el({}, [tooltip]),
    querySelectorAll(selector) {
      return selector === '[data-e2e="exhibition-banner"] .dylive-tooltip'
        ? [tooltip]
        : [];
    },
  };

  assert.deepEqual(removeWishPopups(root), [tooltip]);
  assert.equal(tooltip.removed, true);
});

test("keeps observing and removes matching tooltips added later", () => {
  const root = el();
  const document = { body: root };
  let callback;
  const observer = observeAndRemoveWishPopups({
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
  const tooltip = el({
    className: "dylive-tooltip",
    textContent: "点亮展馆帮主播集星",
  });

  appendChild(root, tooltip);
  callback();

  assert.equal(observer.target, root);
  assert.deepEqual(observer.options, { childList: true, subtree: true });
  assert.equal(tooltip.removed, true);
});

test("waits for the wish tooltip to appear later", async () => {
  const root = el();
  const tooltip = el({ className: "dylive-tooltip", textContent: "帮主播完成心愿吧" });
  let sleepCount = 0;

  const result = await waitAndRemoveWishPopup({
    document: root,
    interval: 1,
    maxAttempts: 3,
    sleep: async () => {
      sleepCount += 1;
      if (sleepCount === 2) appendChild(root, tooltip);
    },
  });

  assert.deepEqual(result, { removed: true, attempts: 3 });
  assert.equal(tooltip.removed, true);
});

test("ignores other live tooltips", () => {
  const tooltip = el({ className: "dylive-tooltip", textContent: "普通直播提示" });

  assert.equal(removeWishPopup(el({}, [tooltip])), null);
  assert.equal(tooltip.removed, false);
});

function el(options = {}, children = []) {
  const node = {
    className: options.className || "",
    childNodes: [],
    parentNode: null,
    parentElement: null,
    removed: false,
    textContent: options.textContent || "",
    remove() {
      this.removed = true;
    },
  };

  node.childNodes = children;
  for (const child of children) {
    child.parentNode = node;
    child.parentElement = node;
  }

  if (!node.textContent) {
    node.textContent = children.map((child) => child.textContent || "").join("");
  }

  return node;
}

function appendChild(parent, child) {
  child.parentNode = parent;
  child.parentElement = parent;
  parent.childNodes.push(child);
  parent.textContent += child.textContent || "";
}

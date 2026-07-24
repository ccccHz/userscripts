import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureDanmakuFiltersDisabled,
  findDanmakuFilterSwitch,
} from "../src/danmaku-settings.js";

test("finds danmaku filter switches by their row labels", () => {
  const fixture = createFixture({ giftEnabled: true, luckyBagEnabled: true });

  assert.equal(
    findDanmakuFilterSwitch(fixture.document, "送礼信息"),
    fixture.giftSwitch,
  );
  assert.equal(
    findDanmakuFilterSwitch(fixture.document, "福袋口令"),
    fixture.luckyBagSwitch,
  );
});

test("turns off gift messages and lucky bag phrases on open", async () => {
  const fixture = createFixture({ giftEnabled: true, luckyBagEnabled: true });

  const result = await ensureDanmakuFiltersDisabled({
    document: fixture.document,
    sleep: async () => {},
  });

  assert.deepEqual(result, {
    triggerFound: true,
    switchLabels: ["送礼信息", "福袋口令"],
    clickedLabels: ["送礼信息", "福袋口令"],
  });
  assert.equal(fixture.giftSwitch.clickCount, 1);
  assert.equal(fixture.luckyBagSwitch.clickCount, 1);
  assert.equal(fixture.trigger.clickCount, 0);
});

test("leaves danmaku filters alone when they are already off", async () => {
  const fixture = createFixture({
    giftEnabled: false,
    luckyBagEnabled: false,
  });

  const result = await ensureDanmakuFiltersDisabled({
    document: fixture.document,
    sleep: async () => {},
  });

  assert.deepEqual(result.clickedLabels, []);
  assert.equal(fixture.giftSwitch.clickCount, 0);
  assert.equal(fixture.luckyBagSwitch.clickCount, 0);
});

function createFixture({ giftEnabled, luckyBagEnabled }) {
  const trigger = clickableNode();
  const giftSwitch = switchNode(giftEnabled);
  const luckyBagSwitch = switchNode(luckyBagEnabled);
  const body = node("", [
    rowNode("送礼信息", giftSwitch),
    rowNode("福袋口令", luckyBagSwitch),
  ]);
  const document = {
    body,
    querySelector(selector) {
      return selector === '[data-e2e="danmaku-setting-icon"]'
        ? trigger
        : null;
    },
  };

  return { document, trigger, giftSwitch, luckyBagSwitch };
}

function rowNode(labelText, switchTarget) {
  const text = node(labelText);
  text.nodeType = 3;
  const label = node(labelText, [text]);
  label.children = [];
  label.firstElementChild = null;
  const wrapper = node("", [switchTarget]);
  return node(labelText, [label, wrapper]);
}

function switchNode(enabled) {
  const trackRect = { x: 0, y: 0, width: 30, height: 18 };
  const knobRect = {
    x: enabled ? 16 : 2,
    y: 2,
    width: 12,
    height: 12,
  };
  const knob = node();
  knob.getBoundingClientRect = () => knobRect;
  const target = clickableNode([knob]);
  target.getBoundingClientRect = () => trackRect;
  return target;
}

function clickableNode(children = []) {
  const result = node("", children);
  result.clickCount = 0;
  result.click = () => {
    result.clickCount += 1;
  };
  return result;
}

function node(textContent = "", children = []) {
  const result = {
    textContent,
    childNodes: children,
    children,
    firstElementChild: children[0] || null,
  };

  children.forEach((child) => {
    child.parentElement = result;
    child.parentNode = result;
  });

  return result;
}

import assert from "node:assert/strict";
import test from "node:test";

import { Diagnostics } from "../packages/douyu-web-enhancer/src/core/diagnostics.ts";
import {
  HIGHEST_VIDEO_QUALITY_ID,
  HIGHEST_VIDEO_QUALITY_VERIFY_MS,
  highestVideoQualityFeature,
  isActionableQualityOption,
  isDouyuNumericRoomPage,
  isQualityOptionRestricted,
} from "../packages/douyu-web-enhancer/src/features/highest-video-quality.ts";

class FakeElement {
  constructor(document, text = "", { className = "", visible = true } = {}) {
    this.ownerDocument = document;
    this.textContent = text;
    this.className = className;
    this.visible = visible;
    this.attributes = new Map();
    this.parentElement = null;
    this.children = [];
    this.clicked = 0;
  }

  append(...children) {
    this.children.push(...children);
    for (const child of children) child.parentElement = this;
    return this;
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
  closest(selector) {
    if (selector === "ul > li" && this.tagName === "LI") return this;
    if (selector === "[class^='rate-']") return this.rate ?? null;
    if (selector.includes("disabled") || selector.includes("inert")) return null;
    return null;
  }
  getBoundingClientRect() {
    return this.visible ? { width: 80, height: 20 } : { width: 0, height: 0 };
  }
  querySelector(selector) {
    if (selector === "ul") return this.options ? this : null;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === "ul > li") return this.optionsMounted === false ? [] : (this.options ?? []);
    if (selector === "input[value^='画质']") return this.inputs ?? [];
    if (selector === "div,span,button") return this.triggers ?? [];
    if (selector.includes("textLabel") || selector.includes("[class^='text-']")) return this.labels ?? [];
    return [];
  }
}

function createFakeQualityPage({ visible = false, selectedIndex = 1, optionsMounted = true } = {}) {
  const listeners = new Map();
  const document = {
    defaultView: {
      getComputedStyle(element) {
        return { display: element.visible ? "block" : "none", visibility: "visible", pointerEvents: "auto" };
      },
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const player = new FakeElement(document);
  const root = new FakeElement(document);
  const options = ["原画2K60", "蓝光8M", "蓝光4M", "超清", "高清"].map((label, index) =>
    new FakeElement(document, label, { className: index === selectedIndex ? "selected-ab" : "", visible }),
  );
  for (const option of options) option.tagName = "LI";
  const input = new FakeElement(document, "", { visible: false });
  const trigger = new FakeElement(document, options[selectedIndex].textContent);
  trigger.rate = root;
  const label = new FakeElement(document, options[selectedIndex].textContent, { visible: true });
  label.className = "textLabel-test";
  root.tagName = "DIV";
  root.options = options;
  root.optionsMounted = optionsMounted;
  root.inputs = [input];
  root.closest = (selector) => selector === "[class^='rate-']" ? root : null;
  root.contains = (element) => element === root || options.includes(element) || element === input;
  input.parentElement = root;
  input.closest = () => root;
  root.triggers = [trigger];
  root.labels = [label];
  player.querySelectorAll = (selector) => {
    if (selector === "input[value^='画质']") return [input];
    if (selector.includes("textLabel") || selector.includes("[class^='text-']")) return [label];
    return [];
  };
  player.contains = (element) => element === root || options.includes(element) || element === input || element === label || element === trigger;
  trigger.click = () => {
    trigger.clicked += 1;
    root.optionsMounted = true;
    const open = !root.options.some((option) => option.visible);
    root.options.forEach((option) => { option.visible = open; });
  };
  options.forEach((option) => {
    option.click = () => {
      option.clicked += 1;
      options.forEach((item) => { item.className = ""; });
      option.className = "selected-ab";
      label.textContent = option.textContent;
      trigger.textContent = option.textContent;
    };
  });
  return { document, player, options, trigger, listeners };
}

test("highest quality only applies to www numeric live-room paths", () => {
  assert.equal(isDouyuNumericRoomPage({ hostname: "www.douyu.com", pathname: "/5135383" }), true);
  assert.equal(isDouyuNumericRoomPage({ hostname: "douyu.com", pathname: "/5135383" }), false);
  assert.equal(isDouyuNumericRoomPage({ hostname: "www.douyu.com", pathname: "/room/5135383" }), false);
  assert.equal(isDouyuNumericRoomPage({ hostname: "www.douyu.com", pathname: "/5135383/" }), false);
});

test("highest quality skips restricted, hidden, and non-actionable options", () => {
  const document = { defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible", pointerEvents: "auto" }) } };
  const locked = new FakeElement(document, "原画2K60", { className: "quality-lock", visible: true });
  locked.tagName = "LI";
  const hidden = new FakeElement(document, "蓝光8M", { visible: false });
  hidden.tagName = "LI";
  const available = new FakeElement(document, "蓝光4M", { visible: true });
  available.tagName = "LI";
  assert.equal(isQualityOptionRestricted(locked), true);
  assert.equal(isActionableQualityOption(locked), false);
  assert.equal(isActionableQualityOption(hidden), false);
  assert.equal(isActionableQualityOption(available), true);
});

test("highest quality opens the official menu, clicks once, verifies, and then stops", async () => {
  const originalLocation = globalThis.location;
  const originalElement = globalThis.Element;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: "www.douyu.com", pathname: "/5135383" } });
  globalThis.Element = FakeElement;
  const page = createFakeQualityPage({ visible: false, selectedIndex: 1 });
  let scan;
  const diagnostics = new Diagnostics();
  const dispose = highestVideoQualityFeature.start({
    diagnostics,
    document: page.document,
    observerHub: { subscribe(callback) { scan = callback; return () => { scan = undefined; }; } },
    selectors: { find(name) { return name === "player" ? { element: page.player, selector: ".player" } : null; } },
  });
  await new Promise((resolve) => setTimeout(resolve, HIGHEST_VIDEO_QUALITY_VERIFY_MS + 300));
  const diagnostic = diagnostics.snapshot("test", "https://www.douyu.com/5135383").features.find((item) => item.id === HIGHEST_VIDEO_QUALITY_ID);
  assert.equal(page.trigger.clicked, 2);
  assert.equal(page.options[0].clicked, 1);
  assert.equal(page.options.some((option) => option.visible), false);
  assert.equal(diagnostic.status, "active");
  assert.match(diagnostic.detail, /原画2K60/);
  assert.equal(typeof scan, "function");
  dispose();
  assert.equal(scan, undefined);
  assert.equal(page.listeners.has("click"), false);
  assert.equal(page.listeners.has("pointerdown"), false);
  Object.defineProperty(globalThis, "location", { configurable: true, value: originalLocation });
  globalThis.Element = originalElement;
});

test("highest quality opens a menu whose options mount only after the trigger", async () => {
  const originalLocation = globalThis.location;
  const originalElement = globalThis.Element;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: "www.douyu.com", pathname: "/2016309" } });
  globalThis.Element = FakeElement;
  const page = createFakeQualityPage({ visible: false, selectedIndex: 1, optionsMounted: false });
  const diagnostics = new Diagnostics();
  const dispose = highestVideoQualityFeature.start({
    diagnostics,
    document: page.document,
    observerHub: { subscribe() { return () => {}; } },
    selectors: { find(name) { return name === "player" ? { element: page.player, selector: ".player" } : null; } },
  });
  await new Promise((resolve) => setTimeout(resolve, HIGHEST_VIDEO_QUALITY_VERIFY_MS + 350));
  const diagnostic = diagnostics.snapshot("test", "https://www.douyu.com/2016309").features.find((item) => item.id === HIGHEST_VIDEO_QUALITY_ID);
  assert.equal(page.trigger.clicked, 2);
  assert.equal(page.options[0].clicked, 1);
  assert.equal(diagnostic.status, "active");
  dispose();
  Object.defineProperty(globalThis, "location", { configurable: true, value: originalLocation });
  globalThis.Element = originalElement;
});

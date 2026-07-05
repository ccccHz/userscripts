import assert from "node:assert/strict";
import test from "node:test";

import { createDomToastRenderer, createNotifier } from "../src/notifier.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.id = "";
    this.textContent = "";
    this.eventListeners = new Map();
    this.style = {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, value);
      },
    };
    this.classList = {
      values: new Set(),
      add: (...names) => {
        names.forEach((name) => this.classList.values.add(name));
      },
      contains: (name) => this.classList.values.has(name),
    };
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  removeChild(node) {
    this.children = this.children.filter((child) => child !== node);
    node.parentNode = null;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  addEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) ?? [];
    handlers.push(handler);
    this.eventListeners.set(type, handlers);
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners.get(event.type) ?? [];
    handlers.forEach((handler) => handler(event));
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement("head");
    this.body = new FakeElement("body");
    this.fullscreenElement = null;
    this.eventListeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById(id) {
    return findById(this.head, id) ?? findById(this.body, id);
  }

  addEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) ?? [];
    handlers.push(handler);
    this.eventListeners.set(type, handlers);
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners.get(event.type) ?? [];
    handlers.forEach((handler) => handler(event));
  }
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children) {
    const match = findById(child, id);
    if (match) return match;
  }
  return null;
}

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => now,
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    tick(ms) {
      now += ms;
      const dueTimers = Array.from(timers.entries())
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      dueTimers.forEach(([id, timer]) => {
        if (!timers.has(id)) return;
        timers.delete(id);
        timer.callback();
      });
    },
  };
}

test("dispatches typed toast messages through the renderer", () => {
  const rendered = [];
  const logged = [];
  const notifier = createNotifier({
    renderer: {
      show(message) {
        rendered.push(message);
      },
    },
    logger: {
      log(...args) {
        logged.push(args);
      },
    },
  });

  notifier.info("开始");
  notifier.success("完成");
  notifier.warning("注意");
  notifier.error("失败");

  assert.deepEqual(rendered, [
    { type: "info", message: "开始" },
    { type: "success", message: "完成" },
    { type: "warning", message: "注意" },
    { type: "error", message: "失败" },
  ]);
  assert.deepEqual(logged, [
    ["toast", "info", "开始"],
    ["toast", "success", "完成"],
    ["toast", "warning", "注意"],
    ["toast", "error", "失败"],
  ]);
});

test("keeps notifier calls from breaking the userscript when rendering fails", () => {
  const logged = [];
  const notifier = createNotifier({
    renderer: {
      show() {
        throw new Error("broken renderer");
      },
    },
    logger: {
      log(...args) {
        logged.push(args);
      },
    },
  });

  assert.doesNotThrow(() => notifier.success("完成"));
  assert.equal(logged.length, 2);
  assert.deepEqual(logged[0], ["toast", "success", "完成"]);
  assert.equal(logged[1][0], "toast render failed");
});

test("mounts toast root inside the fullscreen element when present", () => {
  const document = new FakeDocument();
  const fullscreenElement = new FakeElement("div");
  document.body.appendChild(fullscreenElement);
  document.fullscreenElement = fullscreenElement;
  const clock = createFakeClock();
  const renderer = createDomToastRenderer({
    document,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
  });

  renderer.show({ type: "success", message: "完成" });

  assert.equal(
    document.getElementById("chz-auto-fans-continue-toast-root").parentNode,
    fullscreenElement,
  );
});

test("pauses toast timeout while the mouse is hovering", () => {
  const document = new FakeDocument();
  const clock = createFakeClock();
  const renderer = createDomToastRenderer({
    document,
    timeoutMs: 100,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
  });

  renderer.show({ type: "success", message: "完成" });
  const root = document.getElementById("chz-auto-fans-continue-toast-root");
  const item = root.children[0];

  clock.tick(60);
  item.dispatchEvent({ type: "mouseenter" });
  clock.tick(1000);

  assert.equal(root.children.includes(item), true);

  item.dispatchEvent({ type: "mouseleave" });
  clock.tick(40);
  clock.tick(180);

  assert.equal(root.children.includes(item), false);
});

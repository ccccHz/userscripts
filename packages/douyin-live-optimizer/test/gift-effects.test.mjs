import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureGiftEffectsBlocked,
  findGiftEffectSwitch,
  findGiftSettingTrigger,
  getGiftEffectClickTarget,
  hoverGiftSetting,
  isSwitchEnabled,
  leaveGiftSetting,
} from "../src/gift-effects.js";

test("finds the stable gift setting trigger", () => {
  const root = el({}, [
    el({ attributes: { "data-e2e": "quality" } }),
    el({ attributes: { "data-e2e": "gift-setting" } }),
  ]);

  assert.equal(findGiftSettingTrigger(root), root.childNodes[1]);
});

test("dispatches the verified hover sequence on the gift setting trigger", () => {
  const events = [];
  class FakeEvent {
    constructor(type, options) {
      this.type = type;
      this.options = options;
    }
  }
  const trigger = el({ rect: { x: 100, y: 200, width: 40, height: 20 } });
  trigger.ownerDocument = {
    defaultView: { PointerEvent: FakeEvent, MouseEvent: FakeEvent },
  };
  trigger.dispatchEvent = (event) => events.push(event);

  hoverGiftSetting(trigger);

  assert.deepEqual(events.map((event) => event.type), [
    "pointerover",
    "pointerenter",
    "pointermove",
    "mouseover",
    "mouseenter",
    "mousemove",
  ]);
  assert.equal(events[0].options.clientX, 120);
  assert.equal(events[0].options.clientY, 210);
  assert.equal(events[1].options.bubbles, false);
  assert.equal(events[4].options.bubbles, false);
});

test("dispatches leave events and moves to the player after switching", () => {
  const triggerEvents = [];
  const outsideEvents = [];
  class FakeEvent {
    constructor(type, options) {
      this.type = type;
      this.options = options;
    }
  }
  const outside = el({ rect: { x: 20, y: 30, width: 200, height: 100 } });
  outside.dispatchEvent = (event) => outsideEvents.push(event);
  const trigger = el();
  trigger.dispatchEvent = (event) => triggerEvents.push(event);
  trigger.ownerDocument = {
    body: outside,
    defaultView: {
      innerWidth: 1200,
      innerHeight: 900,
      PointerEvent: FakeEvent,
      MouseEvent: FakeEvent,
    },
    elementFromPoint() {
      return outside;
    },
  };

  leaveGiftSetting(trigger);

  assert.deepEqual(triggerEvents.map((event) => event.type), [
    "pointerout",
    "pointerleave",
    "mouseout",
    "mouseleave",
  ]);
  assert.deepEqual(outsideEvents.map((event) => event.type), [
    "pointerover",
    "mouseover",
    "mousemove",
  ]);
  assert.equal(triggerEvents[1].options.bubbles, false);
  assert.equal(triggerEvents[3].options.bubbles, false);
  assert.equal(triggerEvents[0].options.relatedTarget, outside);
});

test("prefers the stable gift effect switch selector", () => {
  const effectSwitch = el({ attributes: { "data-e2e": "effect-switch" } });
  const root = el({}, [
    el({}, [el({ textContent: "屏蔽礼物特效" }), effectSwitch]),
  ]);

  assert.equal(findGiftEffectSwitch(root), effectSwitch);
});

test("finds the stable gift effect switch without depending on popup text", () => {
  const effectSwitch = el({ attributes: { "data-e2e": "effect-switch" } });
  const root = {
    querySelector(selector) {
      return selector === '[data-e2e="effect-switch"]' ? effectSwitch : null;
    },
  };

  assert.equal(findGiftEffectSwitch(root), effectSwitch);
});

test("clicks the gift effect switch when it is not enabled", async () => {
  const switchNode = el({
    attributes: { role: "switch", "aria-checked": "false" },
  });
  const root = el({}, [
    el({ attributes: { "data-e2e": "gift-setting" } }),
    el({}, [el({ textContent: "屏蔽礼物特效" }), switchNode]),
  ]);

  const result = await ensureGiftEffectsBlocked({
    document: root,
    sleep: async () => {},
  });

  assert.deepEqual(result, {
    triggerFound: true,
    switchFound: true,
    clicked: true,
  });
  assert.equal(root.childNodes[0].clicked, false);
  assert.equal(switchNode.clicked, true);
});

test("clicks the inner effect switch track when the stable wrapper is found", async () => {
  const innerTrack = el();
  const switchNode = el({
    attributes: { "data-e2e": "effect-switch" },
  }, [innerTrack]);
  const root = el({}, [
    el({ attributes: { "data-e2e": "gift-setting" } }),
    el({}, [el({ textContent: "屏蔽礼物特效" }), switchNode]),
  ]);

  const result = await ensureGiftEffectsBlocked({
    document: root,
    sleep: async () => {},
  });

  assert.deepEqual(result, {
    triggerFound: true,
    switchFound: true,
    clicked: true,
  });
  assert.equal(switchNode.clicked, false);
  assert.equal(innerTrack.clicked, true);
});

test("does not click the gift effect switch when it is already enabled", async () => {
  const switchNode = el({
    attributes: { role: "switch", "aria-checked": "true" },
  });
  const root = el({}, [
    el({ attributes: { "data-e2e": "gift-setting" } }),
    el({}, [el({ textContent: "屏蔽礼物特效" }), switchNode]),
  ]);

  const result = await ensureGiftEffectsBlocked({
    document: root,
    sleep: async () => {},
  });

  assert.deepEqual(result, {
    triggerFound: true,
    switchFound: true,
    clicked: false,
  });
  assert.equal(root.childNodes[0].clicked, false);
  assert.equal(switchNode.clicked, false);
});

test("waits for the gift effect panel to render after opening settings", async () => {
  const trigger = el({ attributes: { "data-e2e": "gift-setting" } });
  const switchNode = el({
    attributes: { role: "switch", "aria-checked": "false" },
  });
  const root = el({}, [trigger]);
  let sleepCount = 0;

  const result = await ensureGiftEffectsBlocked({
    document: root,
    sleep: async () => {
      sleepCount += 1;
      if (sleepCount === 2) {
        appendChild(root, el({}, [el({ textContent: "屏蔽礼物特效" }), switchNode]));
      }
    },
  });

  assert.deepEqual(result, {
    triggerFound: true,
    switchFound: true,
    clicked: true,
  });
  assert.equal(trigger.clicked, false);
  assert.equal(switchNode.clicked, true);
  assert.equal(sleepCount, 3);
});

test("waits for the gift setting trigger to render", async () => {
  const trigger = el({ attributes: { "data-e2e": "gift-setting" } });
  const switchNode = el({
    attributes: { role: "switch", "aria-checked": "false" },
  });
  const root = el();
  let sleepCount = 0;

  const result = await ensureGiftEffectsBlocked({
    document: root,
    sleep: async () => {
      sleepCount += 1;
      if (sleepCount === 2) {
        appendChild(root, trigger);
        appendChild(root, el({}, [el({ textContent: "屏蔽礼物特效" }), switchNode]));
      }
    },
  });

  assert.deepEqual(result, {
    triggerFound: true,
    switchFound: true,
    clicked: true,
  });
  assert.equal(trigger.clicked, false);
  assert.equal(switchNode.clicked, true);
  assert.equal(sleepCount, 4);
});

test("can use the right-side control in the gift effect row as a fallback", () => {
  const fallbackSwitch = el({ className: "hashedSwitchKnob" });
  const root = el({}, [
    el({}, [el({ textContent: "屏蔽礼物特效" }), fallbackSwitch]),
  ]);

  assert.equal(findGiftEffectSwitch(root), fallbackSwitch);
});

test("uses the right-side control by position when switch classes are hashed", () => {
  const hashedSwitch = el({
    className: "J3xYz9",
    rect: { x: 260, y: 12, width: 40, height: 22 },
  });
  const root = el({}, [
    el({ rect: { x: 80, y: 0, width: 240, height: 48 } }, [
      el({
        textContent: "屏蔽礼物特效",
        rect: { x: 96, y: 12, width: 96, height: 22 },
      }),
      hashedSwitch,
    ]),
  ]);

  assert.equal(findGiftEffectSwitch(root), hashedSwitch);
});

test("uses the first child of the stable effect switch as the click target", () => {
  const innerTrack = el();
  const switchNode = el({
    attributes: { "data-e2e": "effect-switch" },
  }, [innerTrack]);

  assert.equal(getGiftEffectClickTarget(switchNode), innerTrack);
});

test("detects common enabled switch states", () => {
  assert.equal(
    isSwitchEnabled(el({ attributes: { "aria-checked": "true" } })),
    true,
  );
  assert.equal(isSwitchEnabled(el({ className: "is-checked" })), true);
  assert.equal(isSwitchEnabled(el({ attributes: { "aria-checked": "false" } })), false);
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
    clicked: false,
    checked: options.checked,
    textContent: options.textContent || "",
    get firstElementChild() {
      return this.childNodes.find((child) => child.tagName) || null;
    },
    getBoundingClientRect() {
      return options.rect || { x: 0, y: 0, width: 0, height: 0 };
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    click() {
      this.clicked = true;
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

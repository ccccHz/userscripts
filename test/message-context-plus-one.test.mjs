import assert from "node:assert/strict";
import test from "node:test";
import { interceptOfficialPlusOne } from "../packages/douyu-web-enhancer/src/features/message-context-action-fallback.ts";

test("native +1 capture consumes one action, preserves other actions and does not double-handle fallback", () => {
  const previousElement = globalThis.Element;
  const previousHTMLElement = globalThis.HTMLElement;
  class Element {
    isConnected = true;
    ownerDocument = { defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible" }) } };
    constructor(text, custom = false) { this.textContent = text; this.custom = custom; this.icon = new Icon(); }
    getBoundingClientRect() { return { width: 40, height: 30 }; }
    hasAttribute(name) { return this.custom && name === "data-dwe-message-action"; }
    contains(target) { return target === this || target === this.icon; }
  }
  class Icon {}
  Object.setPrototypeOf(Icon.prototype, Element.prototype);
  globalThis.Element = globalThis.HTMLElement = Element;
  try {
    const plus = new Element("加一"), reply = new Element("回复"), fallback = new Element("加一", true);
    const panel = { querySelectorAll: () => [plus, reply, fallback] };
    let sends = 0;
    const event = (target, type = "click", key, repeat = false) => ({
      target, type, key, repeat, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; },
    });
    for (const label of ["加一", "+1"]) {
      plus.textContent = label;
      const click = event(plus.icon);
      assert.equal(interceptOfficialPlusOne(click, panel, () => sends++), true);
      assert.equal(click.prevented && click.stopped, true);
    }
    assert.equal(sends, 2, "two deliberate clicks submit twice without an extra +1 cooldown");
    for (const target of [reply.icon, fallback.icon, new Icon()]) {
      const click = event(target);
      assert.equal(interceptOfficialPlusOne(click, panel, () => sends++), false);
      assert.equal(click.prevented || click.stopped, false);
    }
    const repeat = event(plus, "keydown", "Enter", true);
    assert.equal(interceptOfficialPlusOne(repeat, panel, () => sends++), true);
    assert.equal(sends, 2, "holding Enter cannot start automatic repeated sends");
    const enter = event(plus, "keydown", "Enter");
    const space = event(plus, "keydown", " ");
    assert.equal(interceptOfficialPlusOne(enter, panel, () => sends++), true);
    assert.equal(interceptOfficialPlusOne(space, panel, () => sends++), true);
    assert.equal(sends, 4);
    const letter = event(plus, "keydown", "a");
    assert.equal(interceptOfficialPlusOne(letter, panel, () => sends++), false);
    plus.isConnected = false;
    assert.equal(interceptOfficialPlusOne(event(plus), panel, () => sends++), false);
  } finally {
    if (previousElement === undefined) delete globalThis.Element; else globalThis.Element = previousElement;
    if (previousHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = previousHTMLElement;
  }
});

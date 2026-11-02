import assert from "node:assert/strict";
import test from "node:test";
import { installYubaBlur, isYubaEditor } from "../src/yuba-focus-guard.js";

function editor(attributes = {}) {
  return {
    attributes: {
      contenteditable: "true",
      "aria-roledescription": "Editor",
      "data-placeholder": "评论一下吧~",
      ...attributes,
    },
    blurCount: 0,
    getAttribute(name) { return this.attributes[name] ?? null; },
    blur() { this.blurCount++; },
  };
}

test("recognizes Yuba composers and comments independently of CSS module hashes", () => {
  for (const className of ["SR5oVG_editor", "Editor-module__SR5oVG__editor", "newhash_editor"]) {
    assert.equal(isYubaEditor(editor({ class: className })), true);
    assert.equal(isYubaEditor(editor({ class: className, "data-placeholder": "分享这一刻的想法…" })), true);
  }
});

test("leaves search, unrelated editables and inactive editor placeholders alone", () => {
  assert.equal(isYubaEditor(null), false);
  assert.equal(isYubaEditor(editor({ contenteditable: null, placeholder: "搜索" })), false);
  assert.equal(isYubaEditor(editor({ "aria-roledescription": null })), false);
  assert.equal(isYubaEditor(editor({ "data-placeholder": " " })), false);
  assert.equal(isYubaEditor(editor({ contenteditable: "false" })), false);
});

test("handles initial focus, ready-time focus and SPA editors with one removable listener", () => {
  const listeners = new Map();
  const firstEditor = editor();
  const documentObject = {
    activeElement: firstEditor,
    readyState: "loading",
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
  const dispose = installYubaBlur(documentObject);
  assert.equal(firstEditor.blurCount, 1);
  assert.equal(installYubaBlur(documentObject), dispose);
  assert.equal(firstEditor.blurCount, 1);

  const spaEditor = editor();
  listeners.get("focusin")({ target: spaEditor });
  assert.equal(spaEditor.blurCount, 1);
  const search = editor({ contenteditable: null });
  listeners.get("focusin")({ target: search });
  assert.equal(search.blurCount, 0);

  documentObject.activeElement = spaEditor;
  listeners.get("DOMContentLoaded")();
  assert.equal(spaEditor.blurCount, 2);
  dispose();
  assert.equal(listeners.size, 0);
  assert.notEqual(installYubaBlur(documentObject), dispose);
});

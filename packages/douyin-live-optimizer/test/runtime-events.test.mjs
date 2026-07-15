import assert from "node:assert/strict";
import test from "node:test";

import { registerRuntimeEvents } from "../src/runtime-events.js";

test("reruns main workflow when live room URL changes", () => {
  const calls = [];
  const window = fakeWindow();
  const history = {
    pushState() {
      calls.push("raw-push");
    },
    replaceState() {
      calls.push("raw-replace");
    },
  };

  registerRuntimeEvents({
    history,
    window,
    runMain: () => calls.push("run-main"),
    removeLiveBottomLayouts: () => calls.push("remove-bottom-layouts"),
    logger: { log: () => {} },
  });

  history.pushState({}, "", "/next");
  window.dispatch("popstate");

  assert.deepEqual(calls, [
    "raw-push",
    "run-main",
    "run-main",
  ]);
});

test("cleans the bottom gift layout when fullscreen state changes", () => {
  const calls = [];
  const window = fakeWindow();

  registerRuntimeEvents({
    history: {
      pushState() {},
      replaceState() {},
    },
    window,
    runMain: () => calls.push("run-main"),
    removeLiveBottomLayouts: () => calls.push("remove-bottom-layouts"),
    logger: { log: () => {} },
  });

  window.dispatch("fullscreenchange");

  assert.deepEqual(calls, ["remove-bottom-layouts"]);
});

function fakeWindow() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) {
        listener();
      }
    },
  };
}

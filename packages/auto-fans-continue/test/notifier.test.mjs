import assert from "node:assert/strict";
import test from "node:test";

import { createNotifier } from "../src/notifier.js";

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

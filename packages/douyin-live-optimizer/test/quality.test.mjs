import assert from "node:assert/strict";
import test from "node:test";

import {
  findBestQualityOption,
  getQualityText,
  ensureHighestQuality,
  findBestQuality,
  findQualityHandler,
  ensureQuality,
} from "../src/quality.js";

test("new hook-based quality options can switch directly without opening the menu", async () => {
  let menuClicks = 0;
  const menu = { textContent: "原画", click() { menuClicks++; } };
  const option = { textContent: "高清", __reactProps$test: { onClick() { menu.textContent = "高清"; } } };
  const document = { querySelectorAll: () => [], querySelector: (selector) => selector.includes("quality-selector") ? { children: [option] } : menu };
  const result = await ensureQuality({ document, requested: "sd", sleepFn: async () => {} });
  assert.equal(result.method, "react-option"); assert.equal(result.applied, true); assert.equal(menuClicks, 0);
});

test("selects the first quality option below automatic mode", () => {
  const automatic = { textContent: "自动" };
  const original = { textContent: "原画" };
  const highDefinition = { textContent: "高清" };

  assert.equal(
    findBestQualityOption({
      children: [automatic, original, highDefinition],
    }),
    original,
  );
});

test("skips automatic mode when its label includes the adaptive quality", () => {
  const original = { textContent: "原画" };

  for (const label of ["自动(高清)", "自动(原画)", "自动（高清）"]) {
    assert.equal(
      findBestQualityOption({
        children: [{ textContent: label }, original],
      }),
      original,
    );
  }
});

test("keeps the first option when automatic mode is absent", () => {
  const original = { innerText: " 原画 " };
  const highDefinition = { textContent: "高清" };

  assert.equal(
    findBestQualityOption({ children: [original, highDefinition] }),
    original,
  );
  assert.equal(getQualityText(original), "原画");
});

test("returns null when automatic mode is the only option", () => {
  assert.equal(
    findBestQualityOption({ children: [{ textContent: " 自动 " }] }),
    null,
  );
});

test("quality ranking does not depend on menu order or mutate the native list", () => {
  const list = ["hd", "auto", "origin", "sd", "uhd"];
  assert.equal(findBestQuality(list), "origin");
  assert.deepEqual(list, ["hd", "auto", "origin", "sd", "uhd"]);
  assert.equal(findBestQuality(["hd", "sd"]), "hd");
  assert.equal(findBestQuality(["auto", "unknown"]), null);
  const options = [{ textContent: "高清" }, { textContent: "蓝光" }, { textContent: "原画" }];
  assert.equal(findBestQualityOption({ children: options }), options[2]);
});

test("uses a recognized native quality handler with its receiver and confirms the change", async () => {
  const qualities = ["sd", "hd"];
  const handler = { current: "sd", getCurrentQualityList() { return qualities; },
    setCurrentQuality(quality) { this.current = quality; }, getCurrentQuality() { return this.current; } };
  const node = { __reactFiber$test: { return: { memoizedProps: { qualityHandler: handler } } } };
  let clicks = 0;
  const menu = { textContent: "高清", click() { clicks++; } };
  const document = { querySelectorAll: () => [node], querySelector: () => menu };
  assert.equal(findQualityHandler(document).handler, handler);
  assert.deepEqual(await ensureHighestQuality({ document, sleepFn: async () => {} }), { applied: true, method: "player", quality: "hd" });
  assert.equal(clicks, 0);
});

test("broken internal paths fall back to the menu and verify the final label", async () => {
  const handler = { getCurrentQualityList: () => ["origin"], setCurrentQuality() { throw new Error("upstream changed"); } };
  const menu = { textContent: "高清", click() {} };
  const option = { textContent: "原画", click() { menu.textContent = "原画"; } };
  const document = {
    querySelectorAll: () => [{ __reactProps$test: { qualityHandler: handler } }],
    querySelector: (selector) => selector.includes("quality-selector") ? { children: [option] } : menu,
  };
  const result = await ensureHighestQuality({ document, sleepFn: async () => {} });
  assert.deepEqual(result, { applied: true, method: "menu", quality: "原画" });
});

test("does not claim success when a quality menu click is ignored", async () => {
  const menu = { textContent: "高清", click() {} };
  const option = { textContent: "原画", click() {} };
  const document = { querySelectorAll: () => [], querySelector: (selector) => selector.includes("quality-selector") ? { children: [option] } : menu };
  assert.equal((await ensureHighestQuality({ document, sleepFn: async () => {} })).applied, false);
});

test("a navigation abort before menu readiness prevents any click", async () => {
  const controller = new AbortController(); let clicks = 0; let ready = false;
  const menu = { textContent: "高清", click() { clicks++; } };
  const document = { querySelector: () => ready ? menu : null };
  await assert.rejects(ensureHighestQuality({ document, signal: controller.signal, sleepFn: async () => {
    ready = true; controller.abort();
  } }), { name: "AbortError" });
  assert.equal(clicks, 0);
});

test("automatic mode mentioning the highest label is still changed to explicit highest quality", async () => {
  let clicks = 0;
  const menu = { textContent: "自动(原画)", click() {} };
  const option = { textContent: "原画", click() { clicks++; menu.textContent = "原画"; } };
  const document = { querySelectorAll: () => [], querySelector: (selector) => selector.includes("quality-selector") ? { children: [option] } : menu };
  assert.equal((await ensureHighestQuality({ document, sleepFn: async () => {} })).applied, true);
  assert.equal(clicks, 1);
});

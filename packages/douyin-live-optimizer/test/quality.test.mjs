import assert from "node:assert/strict";
import test from "node:test";

import {
  findBestQualityOption,
  getQualityText,
} from "../src/quality.js";

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

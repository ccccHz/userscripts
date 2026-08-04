import assert from "node:assert/strict";
import test from "node:test";

import { packageNames, parseArguments } from "../scripts/dev.mjs";

test("accepts package names and forwards Vite arguments", () => {
  assert.deepEqual(
    parseArguments(["vimium-c-blur-input-focus", "--host", "127.0.0.1"]),
    {
      packageName: "vimium-c-blur-input-focus",
      viteArguments: ["--host", "127.0.0.1"],
    },
  );
  assert.deepEqual(parseArguments(["--", "skip-ads", "--host", "0.0.0.0"]), {
    packageName: "skip-ads",
    viteArguments: ["--host", "0.0.0.0"],
  });
  assert.equal(packageNames.length, 8);
  assert.ok(packageNames.includes("weibo-improvement"));
});

test("accepts shell-completable package paths", () => {
  for (const packagePath of [
    "packages/vimium-c-blur-input-focus",
    "packages/vimium-c-blur-input-focus/",
    "./packages/vimium-c-blur-input-focus",
  ]) {
    assert.deepEqual(parseArguments([packagePath]), {
      packageName: "vimium-c-blur-input-focus",
      viteArguments: [],
    });
  }
});

test("rejects missing and unknown package arguments", () => {
  assert.throws(() => parseArguments([]), /请指定一个 package/);
  assert.throws(() => parseArguments(["packages/not-a-package"]), /未知 package/);
});

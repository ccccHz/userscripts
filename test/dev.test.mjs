import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  createDevelopmentProxy,
  discoverPackageNames,
  packageNames,
  parseArguments,
} from "../scripts/dev.mjs";

test("accepts package names and forwards Vite arguments", () => {
  assert.deepEqual(
    parseArguments(["vimium-c-blur-input-focus", "--host", "127.0.0.1"]),
    {
      mode: "file",
      packageName: "vimium-c-blur-input-focus",
      viteArguments: ["--host", "127.0.0.1"],
    },
  );
  assert.deepEqual(parseArguments(["--", "skip-ads", "--host", "0.0.0.0"]), {
    mode: "file",
    packageName: "skip-ads",
    viteArguments: ["--host", "0.0.0.0"],
  });
  assert.deepEqual(packageNames, discoverPackageNames());
  assert.ok(packageNames.includes("weibo-improvement"));
  assert.ok(packageNames.includes("douyu-web-enhancer"));
});

test("accepts shell-completable package paths", () => {
  for (const packagePath of [
    "packages/vimium-c-blur-input-focus",
    "packages/vimium-c-blur-input-focus/",
    "./packages/vimium-c-blur-input-focus",
  ]) {
    assert.deepEqual(parseArguments([packagePath]), {
      mode: "file",
      packageName: "vimium-c-blur-input-focus",
      viteArguments: [],
    });
  }
});

test("keeps the localhost HMR mode available explicitly", () => {
  assert.deepEqual(
    parseArguments([
      "--hmr",
      "--",
      "douyin-live-optimizer",
      "--host",
      "localhost",
    ]),
    {
      mode: "hmr",
      packageName: "douyin-live-optimizer",
      viteArguments: ["--host", "localhost"],
    },
  );
});

test("creates a metadata-only file proxy for the watched bundle", () => {
  const bundlePath = "/Users/test/直播插件/dist/example.user.js";
  const source = `// ==UserScript==
// @name         Example
// @name:zh-CN   示例
// @namespace    https://example.com/release
// @version      1.2.3
// @match        https://example.com/*
// @grant        GM_log
// @updateURL    https://example.com/example.meta.js
// @downloadURL  https://example.com/example.user.js
// ==/UserScript==
console.log("production bundle");`;

  const proxy = createDevelopmentProxy(source, {
    bundlePath,
    packageName: "example",
  });

  assert.match(proxy, /@name\s+\[DEV\] Example/);
  assert.match(proxy, /@name:zh-CN\s+\[DEV\] 示例/);
  assert.match(
    proxy,
    /@namespace\s+https:\/\/github\.com\/ccccHz\/userscripts\/dev\/example/,
  );
  assert.match(proxy, /@version\s+300/);
  assert.match(proxy, /@match\s+https:\/\/example\.com\/\*/);
  assert.match(proxy, /@grant\s+GM_log/);
  assert.ok(proxy.includes(`@require      ${pathToFileURL(bundlePath).href}`));
  assert.doesNotMatch(proxy, /updateURL|downloadURL|production bundle/);
});

test("rejects bundles without userscript metadata", () => {
  assert.throws(
    () =>
      createDevelopmentProxy("console.log('missing metadata')", {
        bundlePath: "/tmp/example.user.js",
        packageName: "example",
      }),
    /缺少 userscript 元数据/,
  );
});

test("rejects missing and unknown package arguments", () => {
  assert.throws(() => parseArguments([]), /请指定一个 package/);
  assert.throws(() => parseArguments(["packages/not-a-package"]), /未知 package/);
});

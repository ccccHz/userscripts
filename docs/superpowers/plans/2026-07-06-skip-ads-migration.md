# Skip Ads Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Tampermonkey 中仍在启用的 `skip ads` 从 `file://` 本地引用迁移为 `userscripts/packages/skip-ads` package。

**Architecture:** 保留原 `nga/main.js` 的行为，只把源码复制到 package 的 `src/main.js`，由 `vite-plugin-monkey` 在 `vite.config.ts` 中生成 userscript metadata。workspace 结构测试负责确认新 package 被发现且标准文件齐全。

**Tech Stack:** pnpm workspace, Vite, `vite-plugin-monkey`, Node `node:test`, plain JavaScript.

---

### Task 1: Add Workspace Test For `skip-ads`

**Files:**
- Modify: `userscripts/test/workspace.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test("discovers migrated userscript packages in priority order", async () => {
  const result = await inspectWorkspace();

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.packages.map((pkg) => pkg.name),
    ["auto-fans-continue", "skip-ads"],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`

Expected: FAIL because `result.packages.map((pkg) => pkg.name)` only contains `["auto-fans-continue"]`.

### Task 2: Create `skip-ads` Package

**Files:**
- Create: `userscripts/packages/skip-ads/package.json`
- Create: `userscripts/packages/skip-ads/tsconfig.json`
- Create: `userscripts/packages/skip-ads/vite.config.ts`
- Create: `userscripts/packages/skip-ads/src/main.js`

- [ ] **Step 1: Create package files**

`package.json`:

```json
{
  "name": "skip-ads",
  "private": true,
  "version": "2025.2.28",
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "type-check": "tsc -p tsconfig.json --noEmit"
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.js", "vite.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.js",
      userscript: {
        name: "skip ads",
        namespace: "http://tampermonkey.net/",
        version: "2025-02-28",
        description: "Remove NGA ad lazy-load state.",
        author: "You",
        match: ["https://bbs.nga.cn/*", "https://nga.178.com/*"],
        icon: "https://www.google.com/s2/favicons?sz=64&domain=nga.cn",
        grant: "none",
      },
      build: {
        autoGrant: false,
        fileName: "skip-ads.user.js",
      },
    }),
  ],
});
```

`src/main.js`:

```js
function ad_rm() {
  localStorage.removeItem("adslazyload_bbs_ads12");
}

(function () {
  "use strict";
  ad_rm();
})();
```

- [ ] **Step 2: Run focused verification**

Run: `pnpm test`

Expected: PASS, including the workspace package discovery test.

### Task 3: Update Migration Docs

**Files:**
- Modify: `userscripts/docs/migration-status.md`
- Modify: `userscripts/docs/todo.md`
- Modify: `userscripts/docs/tampermonkey-inventory.md`

- [ ] **Step 1: Record migration status**

Update docs so `skip ads` / `nga/main.js` is no longer only a migration candidate. Mark it as migrated to `userscripts/packages/skip-ads`, with browser validation still pending.

- [ ] **Step 2: Run docs and workspace verification**

Run:

```bash
pnpm validate
pnpm test
pnpm --filter skip-ads type-check
pnpm --filter skip-ads build
```

Expected: all commands exit `0`, and `packages/skip-ads/dist/skip-ads.user.js` is generated locally but remains ignored by git.

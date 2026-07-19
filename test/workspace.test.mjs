import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspectWorkspace } from "../scripts/inspect-workspace.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

test("discovers migrated userscript packages in priority order", async () => {
  const result = await inspectWorkspace();

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.packages.map((pkg) => pkg.name),
    [
      "auto-fans-continue",
      "douyin-live-optimizer",
      "huya-extend",
      "kuaishou-live-optimizer",
      "skip-ads",
      "vimium-c-blur-input-focus",
      "weibo-improvement",
      "wikipedia-auto-dark",
    ],
  );
});

test("requires every userscript package to have its standard files", async () => {
  const result = await inspectWorkspace();

  for (const pkg of result.packages) {
    assert.deepEqual(pkg.files, {
      packageJson: true,
      viteConfig: true,
      entry: true,
    });
  }
});

test("live optimizer packages use the shared local mscststs helper", async () => {
  for (const pkg of ["douyin-live-optimizer", "kuaishou-live-optimizer"]) {
    const packageRoot = join(workspaceRoot, "packages", pkg);
    const entry = await readFile(join(packageRoot, "src/main.js"), "utf8");
    const viteConfig = await readFile(join(packageRoot, "vite.config.ts"), "utf8");

    assert.match(
      entry,
      /from "\.\.\/\.\.\/\.\.\/shared\/mscststs\.js"/,
      `${pkg} should import the local shared helper`,
    );
    assert.doesNotMatch(
      viteConfig,
      /MSCSTSTS-TOOLS|require:\s*\[/,
      `${pkg} should not depend on remote @require for mscststs`,
    );
  }
});

test("all packages use stable shared dev and release configuration", async () => {
  const sharedConfig = await readFile(
    join(workspaceRoot, "shared", "userscript-config.ts"),
    "utf8",
  );

  assert.match(sharedConfig, /devPort\s*=\s*5173/);
  assert.doesNotMatch(sharedConfig, /strictPort:\s*true/);
  assert.match(sharedConfig, /https:\/\/ccccHz\.github\.io\/userscripts/);
  assert.match(sharedConfig, /metaFileName/);

  const result = await inspectWorkspace();
  for (const pkg of result.packages) {
    const packageJson = JSON.parse(
      await readFile(
        join(workspaceRoot, "packages", pkg.name, "package.json"),
        "utf8",
      ),
    );
    const viteConfig = await readFile(
      join(workspaceRoot, "packages", pkg.name, "vite.config.ts"),
      "utf8",
    );
    assert.match(
      viteConfig,
      new RegExp(
        `createUserscriptConfig\\(\\s*\\"${pkg.name}\\",\\s*packageJson\\.version`,
      ),
      `${pkg.name} should use the shared userscript config`,
    );
    assert.equal(
      packageJson.scripts.dev,
      "vite",
      `${pkg.name} dev should use the official Vite serve flow`,
    );
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { inspectWorkspace } from "../scripts/inspect-workspace.mjs";

test("discovers the migrated auto-fans-continue userscript package", async () => {
  const result = await inspectWorkspace();

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.packages.map((pkg) => pkg.name),
    ["auto-fans-continue"],
  );
});

test("requires every userscript package to have its standard files", async () => {
  const result = await inspectWorkspace();
  const [pkg] = result.packages;

  assert.deepEqual(pkg.files, {
    packageJson: true,
    viteConfig: true,
    entry: true,
  });
});


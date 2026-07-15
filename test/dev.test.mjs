import assert from "node:assert/strict";
import test from "node:test";

import { packageNames, parseArguments } from "../scripts/dev.mjs";

test("requires exactly one known package and forwards Vite arguments", () => {
  assert.deepEqual(parseArguments(["--", "skip-ads", "--host", "0.0.0.0"]), {
    packageName: "skip-ads",
    viteArguments: ["--host", "0.0.0.0"],
  });
  assert.equal(packageNames.length, 6);
  assert.throws(() => parseArguments([]), /请指定一个 package/);
  assert.throws(() => parseArguments(["unknown"]), /未知 package/);
});

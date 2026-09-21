import assert from "node:assert/strict";
import test from "node:test";

import { shouldPublishPackage } from "../scripts/prepare-pages.mjs";

test("Pages excludes only packages explicitly marked as previews", () => {
  assert.equal(shouldPublishPackage({}), true);
  assert.equal(shouldPublishPackage({ userscript: { publish: true } }), true);
  assert.equal(shouldPublishPackage({ userscript: { publish: false } }), false);
});

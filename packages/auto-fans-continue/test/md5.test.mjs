import assert from "node:assert/strict";
import test from "node:test";

import { md5 } from "../src/md5.js";

test("calculates standard MD5 vectors", () => {
  assert.equal(md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(
    md5("The quick brown fox jumps over the lazy dog"),
    "9e107d9d372bb6826bd81d3542a419d6",
  );
});

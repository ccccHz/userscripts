import assert from "node:assert/strict";
import test from "node:test";

import { createBackpackUrl, createDonateBody } from "../src/douyu-api.js";

test("builds the current backpack v5 URL with the requested room id", () => {
  assert.equal(
    createBackpackUrl("12306"),
    "https://www.douyu.com/japi/prop/backpack/web/v5?rid=12306",
  );
});

test("builds the bag gift donate request body", () => {
  assert.equal(
    createDonateBody({ giftId: 268, count: 2, roomId: "12306" }),
    "propId=268&propCount=2&roomId=12306&bizExt=%7B%22yzxq%22%3A%7B%7D%7D",
  );
});

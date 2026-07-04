import assert from "node:assert/strict";
import test from "node:test";

import {
  createBackpackUrl,
  createDonateBody,
  getBagGifts,
  sendBagGift,
} from "../src/douyu-api.js";

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

test("fetches backpack JSON without no-cors so the response body remains readable", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.notEqual(options.mode, "no-cors");
      return {
        json: async () => ({ data: { list: [] } }),
      };
    };

    await getBagGifts("12306");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends bag gifts without no-cors so JSON errors are visible", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.notEqual(options.mode, "no-cors");
      return {
        json: async () => ({ msg: "success" }),
      };
    };

    await sendBagGift({ giftId: 268, count: 1, roomId: "100" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

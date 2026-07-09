import assert from "node:assert/strict";
import test from "node:test";

import {
  createBackpackUrl,
  createDonateBody,
  extractFanRoomIds,
  getBagGifts,
  sendBagGift,
} from "../src/douyu-api.js";

function createNode(attributes = {}, children = []) {
  return {
    children,
    lastElementChild: children.at(-1) ?? null,
    getAttribute(name) {
      return attributes[name] ?? null;
    },
  };
}

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

test("extracts unique fan room ids from direct badge rows only", () => {
  const nestedRoomNode = createNode({ "data-fans-room": "999" });
  const room100 = createNode({ "data-fans-room": "100" }, [nestedRoomNode]);
  const room200 = createNode({ "data-fans-room": " 200 " });
  const duplicateRoom200 = createNode({ "data-fans-room": "200" });
  const invalidRoom = createNode({ "data-fans-room": "abc" });
  const listBody = createNode({}, [
    room100,
    room200,
    duplicateRoom200,
    invalidRoom,
  ]);
  const list = createNode({}, [createNode(), listBody]);
  const doc = {
    getElementsByClassName(name) {
      return name === "fans-badge-list" ? [list] : [];
    },
    querySelectorAll() {
      return [
        room100,
        nestedRoomNode,
        room200,
        duplicateRoom200,
        invalidRoom,
      ];
    },
  };

  assert.deepEqual(extractFanRoomIds(doc), ["100", "200"]);
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

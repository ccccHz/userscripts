import assert from "node:assert/strict";
import test from "node:test";

import {
  REST_ROOM_ID_KEY,
  getRestRoomId,
  normalizeRoomId,
  registerRestRoomMenu,
} from "../src/config.js";

function createStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(REST_ROOM_ID_KEY, String(initialValue));
  }

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("normalizes positive numeric room ids", () => {
  assert.equal(normalizeRoomId(" 71415 "), "71415");
  assert.equal(normalizeRoomId("0"), null);
  assert.equal(normalizeRoomId("0123"), null);
  assert.equal(normalizeRoomId("room-123"), null);
});

test("uses the configured room id and falls back to 12306", () => {
  assert.equal(getRestRoomId(createStorage("71415")), "71415");
  assert.equal(getRestRoomId(createStorage("invalid")), "12306");
  assert.equal(getRestRoomId(createStorage()), "12306");
});

test("menu saves a valid room id for the next run", () => {
  const storage = createStorage();
  const alerts = [];
  let menuLabel;
  let menuHandler;

  registerRestRoomMenu({
    storage,
    registerMenuCommand(label, handler) {
      menuLabel = label;
      menuHandler = handler;
      return 1;
    },
    prompt: () => "71415",
    alert: (message) => alerts.push(message),
  });

  assert.equal(menuLabel, "设置剩余荧光棒房间（当前 12306）");
  menuHandler();
  assert.equal(getRestRoomId(storage), "71415");
  assert.deepEqual(alerts, ["已保存房间 71415，下次执行生效"]);
});

test("empty menu input restores the default room", () => {
  const storage = createStorage("71415");
  let menuHandler;

  registerRestRoomMenu({
    storage,
    registerMenuCommand(_label, handler) {
      menuHandler = handler;
    },
    prompt: () => " ",
    alert() {},
  });

  menuHandler();
  assert.equal(getRestRoomId(storage), "12306");
});

test("invalid menu input leaves the current room unchanged", () => {
  const storage = createStorage("71415");
  const alerts = [];
  let menuHandler;

  registerRestRoomMenu({
    storage,
    registerMenuCommand(_label, handler) {
      menuHandler = handler;
    },
    prompt: () => "abc",
    alert: (message) => alerts.push(message),
  });

  menuHandler();
  assert.equal(getRestRoomId(storage), "71415");
  assert.deepEqual(alerts, ["房间号无效，请输入非 0 开头的纯数字房间号"]);
});

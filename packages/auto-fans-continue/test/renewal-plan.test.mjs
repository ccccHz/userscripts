import assert from "node:assert/strict";
import test from "node:test";

import { createRenewalPlan, selectStickGift } from "../src/renewal-plan.js";

test("selects 268 before 2358 when both stick gifts exist", () => {
  const gift = selectStickGift([
    { id: 2358, count: 8 },
    { id: 268, count: 3 },
  ]);

  assert.deepEqual(gift, { id: 268, count: 3 });
});

test("falls back to 2358 when 268 does not exist", () => {
  const gift = selectStickGift([
    { id: 999, count: 20 },
    { id: 2358, count: 4 },
  ]);

  assert.deepEqual(gift, { id: 2358, count: 4 });
});

test("returns null when there is no usable stick gift", () => {
  assert.equal(selectStickGift([{ id: 999, count: 20 }]), null);
  assert.equal(selectStickGift([{ id: 268, count: 0 }]), null);
});

test("sends one stick to each fan room and sends the rest to the default room", () => {
  const plan = createRenewalPlan({
    gift: { id: 268, count: 5 },
    fanRoomIds: ["100", "200", "300"],
  });

  assert.deepEqual(plan, {
    perRoom: [
      { giftId: 268, count: 1, roomId: "100" },
      { giftId: 268, count: 1, roomId: "200" },
      { giftId: 268, count: 1, roomId: "300" },
    ],
    rest: { giftId: 268, count: 2, roomId: "12306" },
  });
});

test("can explicitly skip sending the rest", () => {
  const plan = createRenewalPlan({
    gift: { id: 268, count: 5 },
    fanRoomIds: ["100", "200", "300"],
    sendRest: false,
  });

  assert.equal(plan.rest, null);
});

test("does not create impossible sends when stick count is lower than room count", () => {
  const plan = createRenewalPlan({
    gift: { id: 2358, count: 2 },
    fanRoomIds: ["100", "200", "300"],
  });

  assert.deepEqual(plan, {
    perRoom: [
      { giftId: 2358, count: 1, roomId: "100" },
      { giftId: 2358, count: 1, roomId: "200" },
    ],
    rest: null,
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { ActivityFilterReview, decodeActivityFilterRecord } from "../packages/douyu-web-enhancer/src/features/activity-filter-review.ts";

test("review records only bounded confirmed activity details", async () => {
  assert.equal(decodeActivityFilterRecord("type@=chatmsg/txt@=ordinary/", "52", 1), null);
  assert.deepEqual(decodeActivityFilterRecord("type@=chatmsg/gadid@=29/txt@=活动@S内容/", "52", 1), {
    roomId: "52", activity: "保卫鱼娘", text: "活动/内容", at: 1, nickname: "",
  });
  const review = new ActivityFilterReview(null);
  for (let index = 0; index < 60; index++) review.record("52", `type@=chatmsg/gadid@=48/txt@=${index}/`, index);
  assert.equal(review.snapshot().length, 50);
  assert.equal(review.snapshot()[0].text, "59");
  assert.equal(review.snapshot().at(-1).text, "10");
});

test("review keeps the sender's escaped nickname and numeric UID without looking up identities", () => {
  const record = decodeActivityFilterRecord("type@=chatmsg/uid@=123456/nn@=昵称@A@S昵称/gadid@=48/txt@=合成大西瓜/", "52", 2);
  assert.equal(record.nickname, "昵称@/昵称");
  assert.equal(record.uid, "123456");
  assert.equal(record.text, "合成大西瓜");
  const missing = decodeActivityFilterRecord("type@=chatmsg/uid@=not-an-id/nn@=/gadid@=48/txt@=合成大西瓜/", "52", 3);
  assert.equal(missing.nickname, "");
  assert.equal(missing.uid, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readGiftBlocked, setGiftBlocked, setWebFullscreen, setChatCollapsed, readChatCollapsed, readAudio, setAudio } from "../src/native-controls.js";
const sleepFn = async () => {};
test("gift effects use the native enable flag with inverse blocking semantics and verify it", async () => {
  const props = { effectSwitchStatus: true, onSwitch(value) { this.effectSwitchStatus = value; } };
  const node = { __reactFiber$test: { return: { memoizedProps: props } } };
  const document = { querySelector: () => node };
  assert.equal(readGiftBlocked(document), false);
  assert.equal((await setGiftBlocked({ document, blocked: true, sleepFn })).verified, true);
  assert.equal(props.effectSwitchStatus, false);
  assert.equal((await setGiftBlocked({ document, blocked: false, sleepFn })).verified, true);
});
test("ignored native setters are not marked as verified", async () => {
  const document = { querySelector: () => ({ __reactProps$test: { effectSwitchStatus: true, onSwitch() {} } }) };
  assert.equal((await setGiftBlocked({ document, blocked: true, sleepFn })).verified, false);
});
test("web fullscreen calls its boolean native setter and never requests browser fullscreen", async () => {
  let calls = 0;
  const props = { on: true, onSwitch(value) { calls++; this.on = value; node.textContent = value ? "网页全屏" : "退出网页全屏"; } };
  const node = { textContent: "进入网页全屏", __reactFiber$test: { memoizedProps: props } };
  const document = { querySelectorAll: () => [node] };
  assert.equal((await setWebFullscreen({ document, enabled: true, sleepFn })).applied, true);
  assert.equal(props.on, false); assert.equal(calls, 1);
  await setWebFullscreen({ document, enabled: true, sleepFn }); assert.equal(calls, 1);
  document.fullscreenElement = {};
  assert.equal((await setWebFullscreen({ document, enabled: false, sleepFn })).applied, false);
  assert.equal(calls, 1);
});
test("chat folding is reversible through native callbacks and zero-width loading is unknown", async () => {
  const chat = { style: {}, getBoundingClientRect: () => ({ width: chat.style.display === "none" ? 0 : 320 }) };
  const close = { __reactProps$test: { onClick() { chat.style.display = "none"; } } };
  const open = { __reactProps$test: { onClick() { chat.style.display = ""; } } };
  const document = { querySelector: (selector) => selector === "#chatroom" ? chat : selector === ".chat_room_fold" ? open : close };
  assert.equal((await setChatCollapsed({ document, collapsed: true, sleepFn })).applied, true);
  assert.equal(readChatCollapsed(document), true);
  assert.equal((await setChatCollapsed({ document, collapsed: false, sleepFn })).applied, true);
  chat.getBoundingClientRect = () => ({ width: 0 }); assert.equal(readChatCollapsed(document), null);
});
test("audio restores exact volume and muted independently without clicking UI", () => {
  const video = { muted: false, volume: .8 };
  assert.equal(setAudio(video, { muted: true, volume: .31 }).applied, true);
  assert.deepEqual(readAudio(video), { muted: true, volume: .31 });
});


test("gift control reads the observable store even when rendered props are stale", async () => {
  const store = { effectSwitchStatus: true, setEffectSwitchStatus(value) { this.effectSwitchStatus = value; } };
  const node = { __reactFiber$test: { memoizedProps: {effectSwitchStatus:false,onSwitch(){throw Error('stale')}}, dependencies: {firstContext:{memoizedValue:{giftStore:store}}} } };
  const document = {querySelector:()=>node};
  assert.equal(readGiftBlocked(document),false);
  const result = await setGiftBlocked({document,blocked:true,sleepFn});
  assert.equal(result.method,'store');assert.equal(store.effectSwitchStatus,false);
});
test("late native reset during settling is repaired before success", async () => {
  let changes=0, pauses=0;
  const store={effectSwitchStatus:true,setEffectSwitchStatus(value){changes++;this.effectSwitchStatus=value}};
  const node={__reactFiber$test:{dependencies:{firstContext:{memoizedValue:{giftStore:store}}}}};
  const document={querySelector:()=>node};
  const result=await setGiftBlocked({document,blocked:true,sleepFn:async ms=>{if(ms===500&&pauses++===0)store.effectSwitchStatus=true}});
  assert.equal(result.verified,true);assert.equal(changes,2);assert.equal(store.effectSwitchStatus,false);
});

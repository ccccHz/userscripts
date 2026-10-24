import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerMemory } from "../src/player-memory.js";
import { createPlayerPreferenceStore } from "../src/player-preferences.js";

function fixture() {
  const events = new Map(), timers = new Map(), data = new Map(), calls = [];
  let nextTimer = 0, collapsed = false;
  const video = { muted: false, volume: .8, readyState: 4, addEventListener() {}, removeEventListener() {} };
  const chat = { get style() { return { display: collapsed ? "none" : "" }; }, getBoundingClientRect: () => ({ width: collapsed ? 0 : 320 }) };
  const document = { querySelector: (selector) => selector === "#chatroom" ? chat : null,
    addEventListener: (key, fn) => events.set(key, fn), removeEventListener: (key) => events.delete(key) };
  const window = { setTimeout(fn, delay) { timers.set(++nextTimer, { fn, delay }); return nextTimer; }, clearTimeout: (key) => timers.delete(key) };
  const preferences = createPlayerPreferenceStore({ storage: { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) } });
  const memory = createPlayerMemory({ document, window, preferences, reapply: (keys) => calls.push(keys), sleepFn: async () => {} });
  memory.begin({ video });
  const target = (match) => ({ closest: (selector) => selector.includes(match) ? {} : null, textContent: "" });
  return { memory, video, events, timers, preferences, calls, target,
    collapse(value) { collapsed = value; },
    action(match, trusted = true) { events.get("click")({ isTrusted: trusted, target: target(match), composedPath: () => [] }); },
    tick() { for (const [key, timer] of [...timers]) { timers.delete(key); timer.fn(); } } };
}
test("a trusted native chat fold is remembered and a synthetic click is ignored", () => {
  const f = fixture(); f.collapse(true); f.action("KH9DQgyz", false); f.tick();
  assert.equal(f.preferences.get("chatCollapsed").state, null);
  f.action("KH9DQgyz"); f.tick(); assert.equal(f.preferences.get("chatCollapsed").state, true);
  f.memory.destroy(); assert.equal(f.events.size, 0); assert.equal(f.timers.size, 0);
});
test("native mute and volume changes are learned together instead of reopening sound", () => {
  const f = fixture(); f.video.volume = .27; f.video.muted = true;
  f.action("douyin-player-volume"); f.tick();
  assert.deepEqual(f.preferences.get("audio").state, { muted: true, volume: .27 });
  assert.equal(f.calls.length, 0); f.memory.destroy();
});
test("fixed mode corrects a native choice while unmanaged mode leaves it untouched", () => {
  const f = fixture(); f.preferences.setMode("chatCollapsed", "on"); f.action("KH9DQgyz"); f.tick();
  assert.ok(f.calls.length > 0); f.calls.length = 0;
  f.collapse(true); f.action("KH9DQgyz"); f.tick(); assert.equal(f.calls.length, 0);
  f.preferences.setMode("chatCollapsed", "unmanaged"); f.collapse(false); f.action("KH9DQgyz"); f.tick();
  assert.equal(f.calls.length, 0); f.memory.destroy();
});
test("navigation cancels pending captures before the next room's defaults can overwrite memory", () => {
  const f = fixture(); f.preferences.remember("chatCollapsed", true); f.action("KH9DQgyz");
  f.memory.begin({ video: {} }); f.tick(); assert.equal(f.preferences.get("chatCollapsed").state, true);
  f.memory.destroy();
});
test("restoring audio does not overwrite its saved state with the new room's initial volume", async () => {
  const f = fixture(); f.preferences.remember("audio", { muted: true, volume: .34 });
  await f.memory.apply("audio", { signal: new AbortController().signal });
  assert.equal(f.video.volume, .34); assert.equal(f.video.muted, true);
  assert.deepEqual(f.preferences.get("audio").state, { muted: true, volume: .34 }); f.memory.destroy();
});
test("an aborted restoration cannot change the next room's video", async () => {
  const f = fixture(); f.preferences.remember("audio", { muted: true, volume: .34 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.memory.apply("audio", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(f.video.volume, .8); assert.equal(f.video.muted, false); f.memory.destroy();
});

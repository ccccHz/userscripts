import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeController, registerLifecycleEvents, isLiveLocation, getPlayerScope } from "../src/runtime.js";
import { createSettingsStore } from "../src/settings.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  let scope = { url: "https://live.douyin.com/1", player: {}, video: {} };
  const store = createSettingsStore({ logger: { warn() {} } });
  const calls = [];
  const statuses = [];
  const runtime = createRuntimeController({
    getScope: () => scope,
    settingsStore: store,
    runFeature(key, options) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      calls.push({ key, ...options, resolve });
      return promise;
    },
    onStatus: (key, status) => statuses.push([key, status]),
  });
  return { runtime, calls, statuses, store, setScope(next) { scope = next; }, getScope: () => scope };
}

test("unrelated DOM changes do not repeat player automation", async () => {
  const f = fixture();
  f.runtime.refresh(); await flush();
  assert.equal(f.calls.length, 4);
  f.runtime.refresh(); f.runtime.refresh(); await flush();
  assert.equal(f.calls.length, 4);
  f.runtime.destroy();
});

test("room navigation aborts all old tasks and ignores their late completion", async () => {
  const f = fixture(); f.runtime.refresh(); await flush();
  const old = f.calls.slice();
  f.setScope({ ...f.getScope(), url: "https://live.douyin.com/2" });
  f.runtime.refresh(); await flush();
  assert.equal(f.calls.length, 8);
  assert.ok(old.every((call) => call.signal.aborted));
  const count = f.statuses.length;
  old.forEach((call) => call.resolve({ verified: true })); await flush();
  assert.equal(f.statuses.length, count);
  f.calls.at(-1).resolve({ applied: false }); await flush();
  assert.deepEqual(f.statuses.at(-1), ["quality", "unavailable"]);
  f.runtime.destroy();
});

test("a replacement video restarts tasks even when URL and player root stay unchanged", async () => {
  const f = fixture(); f.runtime.refresh(); await flush();
  const old = f.calls.slice();
  f.setScope({ ...f.getScope(), video: {} }); f.runtime.refresh(); await flush();
  assert.equal(f.calls.length, 8);
  assert.ok(old.every((call) => call.signal.aborted));
  f.runtime.destroy();
});

test("a native player instance replacement invalidates the scope without replacing DOM", async () => {
  const f = fixture(); f.setScope({ ...f.getScope(), instance: {} });
  f.runtime.refresh(); await flush();
  const old = f.calls.slice();
  f.setScope({ ...f.getScope(), instance: {} }); f.runtime.refresh(); await flush();
  assert.equal(f.calls.length, 8);
  assert.ok(old.every((call) => call.signal.aborted));
  f.runtime.destroy();
});

test("player scope reads native instance identity and ignores query-only URL changes", () => {
  const video = {}; const instance = {};
  const player = { _player: { proxy: instance }, querySelector: () => video };
  const document = { querySelector: () => player };
  const first = getPlayerScope(document, new URL("https://live.douyin.com/123?from=a"));
  const second = getPlayerScope(document, new URL("https://live.douyin.com/123?from=b"));
  assert.equal(first.instance, instance);
  assert.equal(first.url, second.url);
  assert.equal(first.video, video);
});

test("an empty old player root cannot own a fallback video's new native instance", () => {
  const oldInstance = {}; const newInstance = {};
  const oldPlayer = { _player: { proxy: oldInstance }, querySelector: () => null };
  const newPlayer = { _player: { proxy: newInstance } };
  const video = { parentElement: newPlayer, closest: () => newPlayer };
  const document = { querySelector: (selector) => selector.includes("#PlayerLayout video") ? video : oldPlayer };
  const scope = getPlayerScope(document, new URL("https://live.douyin.com/123"));
  assert.equal(scope.player, newPlayer);
  assert.equal(scope.video, video);
  assert.equal(scope.instance, newInstance);
});

test("rapid gift toggles cancel the previous task and apply the latest desired state", async () => {
  const f = fixture(); f.runtime.refresh(); await flush();
  const old = f.calls.find((call) => call.key === "giftEffects");
  f.store.set("giftEffects", false); await flush();
  assert.equal(old.signal.aborted, true);
  assert.equal(f.calls.at(-1).value, false);
  f.store.set("giftEffects", true); await flush();
  assert.equal(f.calls.at(-2).signal.aborted, true);
  assert.equal(f.calls.at(-1).value, true);
  f.store.set("quality", false); await flush();
  assert.equal(f.calls.find((call) => call.key === "quality").signal.aborted, true);
  assert.equal(f.calls.filter((call) => call.key === "quality").length, 1);
  f.runtime.destroy();
});

test("leaving live playback and teardown cancel tasks and prevent further retries", async () => {
  const f = fixture(); f.runtime.refresh(); await flush();
  f.setScope(null); f.runtime.refresh(); await flush();
  assert.ok(f.calls.every((call) => call.signal.aborted));
  f.runtime.destroy(); f.store.set("audio", false); f.runtime.retry(); await flush();
  assert.equal(f.calls.length, 4);
});

test("live routing includes station-internal follow/root rooms without running on normal videos", () => {
  for (const url of ["https://live.douyin.com/1", "https://www.douyin.com/follow/live/1", "https://www.douyin.com/root/live/1"]) {
    assert.equal(isLiveLocation(new URL(url)), true);
  }
  for (const url of ["https://live.douyin.com/", "https://www.douyin.com/follow", "https://www.douyin.com/video/1", "https://example.com/root/live/1"]) {
    assert.equal(isLiveLocation(new URL(url)), false);
  }
});

test("lifecycle observers coalesce mutations and restore only their own history wrappers", () => {
  const listeners = new Map(); const timers = new Map(); let nextTimer = 0;
  const window = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key),
    setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: (id) => timers.delete(id) };
  const document = { body: {}, addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
  const rawPush = function () { return "result"; }; const rawReplace = function () {};
  const history = { pushState: rawPush, replaceState: rawReplace };
  let callback; let disconnected = false; let refreshes = 0; let options;
  const cleanup = registerLifecycleEvents({ document, window, history, refresh: () => refreshes++, MutationObserver: class {
    constructor(fn) { callback = fn; } observe(target, next) { options = next; } disconnect() { disconnected = true; }
  } });
  assert.equal(history.pushState(), "result");
  callback(); callback();
  assert.equal(timers.size, 1);
  assert.equal(options.attributes, true);
  assert.deepEqual(options.attributeFilter, ["id", "class", "data-e2e"]);
  const externalWrapper = function () {};
  history.pushState = externalWrapper;
  cleanup();
  assert.equal(history.pushState, externalWrapper);
  assert.equal(history.replaceState, rawReplace);
  assert.equal(disconnected, true);
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(refreshes, 2);
});

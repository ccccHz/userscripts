import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerPreferenceStore, PREFERENCE_PREFIX } from "../src/player-preferences.js";

function fixture() {
  const data = new Map(), events = new Map();
  return { data, events, storage: { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) },
    eventTarget: { addEventListener: (key, fn) => events.set(key, fn), removeEventListener: (key) => events.delete(key) } };
}
test("new player features default to memory while preserving the old gift/filter preference", () => {
  const store = createPlayerPreferenceStore({ legacy: { giftEffects: false, danmakuFilters: true } });
  assert.deepEqual(store.get("giftEffects"), { mode: "remember", state: false });
  assert.deepEqual(store.get("danmakuFilters").state, { gift: false, lucky: false });
  assert.deepEqual(store.get("audio"), { mode: "remember", state: null });
  assert.deepEqual(store.get("webFullscreen"), { mode: "remember", state: null });
});
test("remembers independent volume and mute state through reload", () => {
  const f = fixture(), store = createPlayerPreferenceStore(f);
  store.remember("audio", { muted: true, volume: .37 });
  assert.deepEqual(createPlayerPreferenceStore(f).get("audio").state, { muted: true, volume: .37 });
  const copy = store.get("audio"); copy.state.volume = 1;
  assert.equal(store.get("audio").state.volume, .37);
});
test("fixed/unmanaged modes do not learn native changes; switching back retains the saved state", () => {
  const f = fixture(), store = createPlayerPreferenceStore(f);
  store.remember("quality", "hd"); store.setMode("quality", "on"); store.remember("quality", "origin");
  assert.equal(store.get("quality").state, "hd");
  store.setMode("quality", "unmanaged"); store.remember("quality", "ld");
  store.setMode("quality", "remember"); assert.equal(store.get("quality").state, "hd");
});
test("two tabs changing different features do not overwrite each other", () => {
  const f = fixture(), left = createPlayerPreferenceStore(f), right = createPlayerPreferenceStore(f);
  left.remember("audio", { muted: false, volume: .2 }); right.remember("quality", "sd");
  const fresh = createPlayerPreferenceStore(f);
  assert.equal(fresh.get("quality").state, "sd"); assert.equal(fresh.get("audio").state.volume, .2);
});
test("a stale tab capture reads a newly changed mode before writing", () => {
  const f = fixture(), left = createPlayerPreferenceStore(f), right = createPlayerPreferenceStore(f);
  left.setMode("chatCollapsed", "on"); right.remember("chatCollapsed", false);
  assert.equal(createPlayerPreferenceStore(f).get("chatCollapsed").mode, "on");
});
test("storage events identify external changes and teardown removes the listener", () => {
  const f = fixture(), store = createPlayerPreferenceStore(f), calls = [];
  store.subscribe((key, value, origin) => calls.push({ key, value, origin }));
  f.data.set(PREFERENCE_PREFIX + "chatCollapsed", JSON.stringify({ mode: "remember", state: true }));
  f.events.get("storage")({ key: PREFERENCE_PREFIX + "chatCollapsed" });
  assert.equal(calls[0].origin, "external"); assert.equal(calls[0].value.state, true);
  f.events.get("storage")({ key: "unrelated" }); assert.equal(calls.length, 1);
  store.destroy(); assert.equal(f.events.size, 0);
});
test("invalid state or mode cannot drive a player operation", () => {
  const f = fixture(); f.data.set(PREFERENCE_PREFIX + "audio", '{"mode":"remember","state":{"muted":true,"volume":8}}');
  const store = createPlayerPreferenceStore(f);
  assert.equal(store.get("audio").state, null);
  store.remember("audio", { muted: false, volume: -1 }); store.remember("quality", "unknown");
  store.setMode("quality", "off"); assert.equal(store.get("quality").mode, "remember");
  assert.equal(store.get("quality").state, null);
});
test("unavailable storage preserves in-page modes and remembered states", () => {
  const store = createPlayerPreferenceStore({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } }, logger: { warn() {} } });
  store.remember("audio", { muted: true, volume: .6 }); store.setMode("audio", "unmanaged");
  store.remember("audio", { muted: false, volume: .7 }); store.setMode("audio", "remember");
  assert.deepEqual(store.get("audio").state, { muted: true, volume: .6 }); assert.equal(store.isPersisted(), false);
});

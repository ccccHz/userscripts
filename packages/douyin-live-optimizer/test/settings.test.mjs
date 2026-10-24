import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsStore, DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/settings.js";

function fixture(saved = null) {
  const data = new Map(saved === null ? [] : [[SETTINGS_KEY, saved]]);
  const events = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  const eventTarget = { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name) };
  return { data, storage, eventTarget, events };
}

test("defaults preserve all existing optimizations and ignore unrecognized saved values", () => {
  const f = fixture('{"audio":false,"quality":"false","unknown":true}');
  const store = createSettingsStore(f);
  assert.deepEqual(store.get(), { ...DEFAULT_SETTINGS, audio: false });
  const values = store.get(); values.giftEffects = false;
  assert.equal(store.get().giftEffects, true);
  store.destroy();
});

test("a setting takes effect, persists, reloads and notifies once", () => {
  const f = fixture();
  const store = createSettingsStore(f);
  const calls = [];
  const unsubscribe = store.subscribe((values, changed) => calls.push({ values, changed }));
  store.set("giftEffects", false);
  store.set("giftEffects", false);
  store.set("unknown", false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].changed, ["giftEffects"]);
  assert.equal(createSettingsStore(f).get().giftEffects, false);
  unsubscribe(); store.set("audio", false);
  assert.equal(calls.length, 1);
  store.destroy();
});

test("unavailable storage keeps settings usable and reports that persistence failed", () => {
  const storage = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  const store = createSettingsStore({ storage, logger: { warn() {} } });
  store.set("bottomLayout", false);
  assert.equal(store.get().bottomLayout, false);
  assert.equal(store.isPersisted(), false);
});

test("same-origin storage events update changed settings and are removed on teardown", () => {
  const f = fixture();
  const store = createSettingsStore(f);
  const calls = [];
  store.subscribe((values, changed) => calls.push(changed));
  f.data.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, quality: false }));
  f.events.get("storage")({ key: "unrelated" });
  assert.equal(calls.length, 0);
  f.events.get("storage")({ key: SETTINGS_KEY });
  assert.deepEqual(calls, [["quality"]]);
  assert.equal(store.get().quality, false);
  store.destroy();
  assert.equal(f.events.size, 0);
});

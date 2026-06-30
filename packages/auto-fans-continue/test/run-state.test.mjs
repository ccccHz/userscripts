import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKED_DATE_KEY,
  markChecked,
  shouldRunToday,
} from "../src/run-state.js";

function createStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) values.set(CHECKED_DATE_KEY, initialValue);

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("runs when localStorage has no checked date", () => {
  const storage = createStorage();

  assert.equal(shouldRunToday(storage, new Date("2026-06-29T12:00:00")), true);
});

test("skips when localStorage checked date is today", () => {
  const storage = createStorage("2026-06-29T00:30:00");

  assert.equal(shouldRunToday(storage, new Date("2026-06-29T12:00:00")), false);
});

test("runs when localStorage checked date is stale or invalid", () => {
  const staleStorage = createStorage("2026-06-28T23:59:59");
  const invalidStorage = createStorage("not-a-date");
  const today = new Date("2026-06-29T12:00:00");

  assert.equal(shouldRunToday(staleStorage, today), true);
  assert.equal(shouldRunToday(invalidStorage, today), true);
});

test("marks checked date in localStorage", () => {
  const storage = createStorage();

  markChecked(storage, new Date("2026-06-29T12:00:00Z"));

  assert.equal(storage.getItem(CHECKED_DATE_KEY), "2026-06-29T12:00:00.000Z");
});

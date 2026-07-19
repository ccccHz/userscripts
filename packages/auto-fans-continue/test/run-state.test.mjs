import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKED_DATE_KEY,
  RUNNING_LOCK_KEY,
  RUNNING_LOCK_TTL_MS,
  acquireRunningLock,
  markChecked,
  releaseRunningLock,
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
    removeItem(key) {
      values.delete(key);
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

test("acquires and releases the running lock", () => {
  const storage = createStorage();
  const token = acquireRunningLock(
    storage,
    new Date("2026-06-29T12:00:00.000Z"),
  );

  assert.equal(typeof token, "string");
  assert.equal(
    acquireRunningLock(storage, new Date("2026-06-29T12:00:01.000Z")),
    null,
  );

  releaseRunningLock(storage, token);

  assert.equal(storage.getItem(RUNNING_LOCK_KEY), null);
});

test("does not release another runner's lock", () => {
  const storage = createStorage();
  const firstToken = acquireRunningLock(
    storage,
    new Date("2026-06-29T12:00:00.000Z"),
  );

  releaseRunningLock(storage, "different-token");

  assert.equal(
    acquireRunningLock(storage, new Date("2026-06-29T12:00:01.000Z")),
    null,
  );
  assert.notEqual(storage.getItem(RUNNING_LOCK_KEY), null);

  releaseRunningLock(storage, firstToken);
});

test("overwrites stale running lock", () => {
  const storage = createStorage();
  const lockedAt = new Date("2026-06-29T12:00:00.000Z");
  const firstToken = acquireRunningLock(
    storage,
    lockedAt,
  );
  const secondToken = acquireRunningLock(
    storage,
    new Date(lockedAt.getTime() + RUNNING_LOCK_TTL_MS + 1),
  );

  assert.notEqual(firstToken, secondToken);
  assert.equal(typeof secondToken, "string");
});

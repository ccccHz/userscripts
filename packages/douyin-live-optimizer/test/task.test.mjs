import assert from "node:assert/strict";
import test from "node:test";
import { waitFor, sleep } from "../src/task.js";

test("waiting for an absent target has a finite attempt budget", async () => {
  let reads = 0; let waits = 0;
  const result = await waitFor(() => { reads++; return null; }, { attempts: 3, sleepFn: async () => { waits++; } });
  assert.equal(result, null); assert.equal(reads, 3); assert.equal(waits, 2);
});

test("an abort during delay prevents subsequent target reads", async () => {
  const controller = new AbortController(); let reads = 0;
  await assert.rejects(waitFor(() => { reads++; return null; }, {
    signal: controller.signal, sleepFn: async () => controller.abort(),
  }), { name: "AbortError" });
  assert.equal(reads, 1);
});

test("sleep aborts promptly rather than blocking the next room's work", async () => {
  const controller = new AbortController();
  const promise = sleep(10000, controller.signal);
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" });
});

import assert from "node:assert/strict";
import test from "node:test";

import { LOGGER_STATE_KEY, createLogger } from "../src/logger.js";

test("captures a bound console method and records events on the target", () => {
  const calls = [];
  const consoleLike = {
    info(...args) {
      calls.push(args);
    },
  };
  const target = {};
  const logger = createLogger(consoleLike, {
    target,
    prefix: "chz_script",
  });

  consoleLike.info = () => {
    throw new Error("console was replaced after logger creation");
  };

  logger.log("start!", { ok: true });

  assert.deepEqual(calls, [["chz_script", "start!", { ok: true }]]);
  assert.equal(target[LOGGER_STATE_KEY].lastEvent.message, "start!");
  assert.deepEqual(target[LOGGER_STATE_KEY].lastEvent.args, [
    "start!",
    { ok: true },
  ]);
});

test("keeps runtime status even when console methods fail", () => {
  const target = {};
  const logger = createLogger(
    {
      info() {
        throw new Error("broken info");
      },
      warn() {
        throw new Error("broken warn");
      },
    },
    { target, maxEvents: 1 },
  );

  assert.doesNotThrow(() => logger.log("first"));
  assert.doesNotThrow(() => logger.log("second"));

  assert.equal(target[LOGGER_STATE_KEY].events.length, 1);
  assert.equal(target[LOGGER_STATE_KEY].lastEvent.message, "second");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  findResumeButton,
  registerPlaybackResumeEvents,
  resumePausedPlayback,
} from "../src/playback-resume.js";

test("finds and clicks the resume button only when the inactivity pause is shown", () => {
  let clicks = 0;
  const button = fakeElement("继续播放", () => clicks++);
  const document = fakeDocument({
    pageText: "长时间无操作，已 暂停播放 累计节能 2 分钟 继续播放",
    candidates: [button],
  });

  assert.equal(findResumeButton(document), button);
  assert.equal(
    resumePausedPlayback({ document, logger: { info() {} } }),
    true,
  );
  assert.equal(clicks, 1);
});

test("does not click an unrelated continue button without the pause message", () => {
  let clicks = 0;
  const button = fakeElement("继续播放", () => clicks++);
  const document = fakeDocument({
    pageText: "继续播放精彩内容",
    candidates: [button],
  });

  assert.equal(resumePausedPlayback({ document }), false);
  assert.equal(clicks, 0);
});

test("retries resuming playback after the tab becomes visible", () => {
  let clicks = 0;
  const button = fakeElement("继续播放", () => clicks++);
  const document = fakeEventTarget({
    hidden: true,
    body: {
      innerText: "长时间无操作，已暂停播放 继续播放",
      querySelectorAll: () => [button],
    },
  });
  const window = fakeEventTarget();
  const scheduledDelays = [];

  registerPlaybackResumeEvents({
    document,
    window,
    retryDelays: [0, 250, 1000],
    setTimeoutFn(callback, delay) {
      scheduledDelays.push(delay);
      callback();
    },
    logger: { info() {} },
  });

  document.dispatch("visibilitychange");
  assert.equal(clicks, 0);

  document.hidden = false;
  document.dispatch("visibilitychange");

  assert.deepEqual(scheduledDelays, [0, 250, 1000]);
  assert.equal(clicks, 1);
});

function fakeDocument({ pageText, candidates }) {
  return {
    body: {
      innerText: pageText,
      querySelectorAll: () => candidates,
    },
  };
}

function fakeElement(text, click) {
  return {
    innerText: text,
    disabled: false,
    click,
    closest: () => null,
    getAttribute: () => null,
  };
}

function fakeEventTarget(properties = {}) {
  const listeners = new Map();

  return {
    ...properties,
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener();
    },
  };
}

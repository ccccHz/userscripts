import assert from "node:assert/strict";
import test from "node:test";

import {
  startHomePageRedirect,
  waitForElement,
} from "../src/navigation.js";

test("waitForElement retries until the selector is available", async () => {
  const element = {};
  let checks = 0;
  const documentObject = {
    querySelector(selector) {
      assert.equal(selector, ".target");
      checks += 1;
      return checks === 2 ? element : null;
    },
  };

  const result = await waitForElement(".target", {
    documentObject,
    setTimeoutFunction(callback) {
      callback();
    },
  });

  assert.equal(result, element);
  assert.equal(checks, 2);
});

test("redirects the bare main homepage to the latest feed", async () => {
  const element = {
    clicks: 0,
    click() {
      this.clicks += 1;
    },
  };
  const selectors = [];

  await startHomePageRedirect({
    documentObject: {},
    windowObject: { location: { href: "https://weibo.com/" } },
    waitForElementFunction(selector) {
      selectors.push(selector);
      return Promise.resolve(element);
    },
  });

  assert.deepEqual(selectors, ['[title="最新微博"]']);
  assert.equal(element.clicks, 1);
});

test("does not start redirect polling on other pages", () => {
  let waitCalls = 0;

  const result = startHomePageRedirect({
    documentObject: {},
    windowObject: { location: { href: "https://s.weibo.com/" } },
    waitForElementFunction() {
      waitCalls += 1;
      return Promise.resolve();
    },
  });

  assert.equal(result, null);
  assert.equal(waitCalls, 0);
});

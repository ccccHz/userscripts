import assert from "node:assert/strict";
import test from "node:test";

import mscststs, {
  hijackXMLHttpRequest,
  sleep,
  wait,
} from "../shared/mscststs.js";

test("shared mscststs exposes the original helper surface", () => {
  assert.equal(mscststs.sleep, sleep);
  assert.equal(typeof mscststs.wait, "function");
  assert.equal(typeof wait, "function");
  assert.equal(mscststs.hijackXMLHttpRequest, hijackXMLHttpRequest);
});

test("wait resolves the first matching element after polling", async (t) => {
  const originalDocument = globalThis.document;
  const element = { innerText: "ready" };
  let calls = 0;

  globalThis.document = {
    querySelector(selector) {
      assert.equal(selector, ".ready");
      calls += 1;
      return calls > 1 ? element : null;
    },
  };
  t.after(() => {
    globalThis.document = originalDocument;
  });

  const result = await wait(".ready", false, 2);

  assert.equal(result, element);
  assert.equal(calls, 3);
});

test("hijackXMLHttpRequest wraps matching method calls and can restore", () => {
  class RawXMLHttpRequest {
    open(method, url) {
      return `${method}:${url}`;
    }
  }
  const fakeWindow = { XMLHttpRequest: RawXMLHttpRequest };

  const restore = hijackXMLHttpRequest(
    {
      beforeopen(method, url) {
        return [method.toLowerCase(), `${url}?from=test`];
      },
      afteropen(result) {
        return `wrapped:${result}`;
      },
    },
    fakeWindow,
  );

  const xhr = new fakeWindow.XMLHttpRequest();
  assert.equal(xhr.open("GET", "/path"), "wrapped:get:/path?from=test");

  restore();
  assert.equal(fakeWindow.XMLHttpRequest, RawXMLHttpRequest);
});

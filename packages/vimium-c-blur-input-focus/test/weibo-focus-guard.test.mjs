import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  installWeiboPreventScrollFocus,
  isWeiboCommentInput,
} from "../src/weibo-focus-guard.js";

test("recognizes the current and semantic Weibo comment input markers", () => {
  assert.equal(
    isWeiboCommentInput({
      className: "foo _input_1fox3_8 bar",
      getAttribute: () => null,
    }),
    true,
  );
  assert.equal(
    isWeiboCommentInput({
      className: "unrelated",
      getAttribute: (name) =>
        name === "data-placeholder" ? "发布你的评论" : null,
    }),
    true,
  );
  assert.equal(
    isWeiboCommentInput({
      className: "unrelated",
      getAttribute: () => null,
    }),
    false,
  );
});

test("adds preventScroll only when Weibo focuses a comment input", () => {
  const calls = [];
  function HTMLElement() {}
  HTMLElement.prototype.focus = function (...args) {
    calls.push({ element: this, args });
  };

  const windowObject = { HTMLElement };
  assert.equal(installWeiboPreventScrollFocus(windowObject), true);
  assert.equal(installWeiboPreventScrollFocus(windowObject), false);

  const commentInput = Object.create(HTMLElement.prototype);
  commentInput.className = "_input_1fox3_8";
  commentInput.getAttribute = () => null;
  commentInput.focus({ focusVisible: true, preventScroll: false });

  const otherInput = Object.create(HTMLElement.prototype);
  otherInput.className = "other-input";
  otherInput.getAttribute = () => null;
  otherInput.focus();

  assert.deepEqual(calls[0].args, [
    { focusVisible: true, preventScroll: true },
  ]);
  assert.deepEqual(calls[1].args, []);
});

test("runs early in the page context", async () => {
  const config = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(config, /"run-at": "document-start"/);
  assert.match(config, /sandbox: "raw"/);
  assert.match(config, /grant: "none"/);
});

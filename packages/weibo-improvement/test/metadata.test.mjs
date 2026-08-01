import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configUrl = new URL("../vite.config.ts", import.meta.url);

test("runs at document-start on only the supported Weibo hosts", async () => {
  const config = await readFile(configUrl, "utf8");

  assert.match(config, /"run-at": "document-start"/);
  assert.match(config, /"https:\/\/weibo\.com\/\*"/);
  assert.match(config, /"https:\/\/www\.weibo\.com\/\*"/);
  assert.match(config, /"https:\/\/s\.weibo\.com\/\*"/);
  assert.doesNotMatch(config, /https:\/\/\*\.weibo\.com/);
  assert.match(config, /grant: "none"/);
});

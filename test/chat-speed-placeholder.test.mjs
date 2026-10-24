import assert from "node:assert/strict";
import test from "node:test";
import { mountChatSpeedPlaceholder } from "../packages/douyu-web-enhancer/src/features/chat-speed-placeholder.ts";

test("speed placeholder preserves drafts, handles replacement and restores only owned attributes", () => {
  const makeInput = () => ({ tagName: "DIV", isConnected: true, textContent: "未发送草稿", attributes: new Map([["data-placeholder", "这里输入聊天内容"]]),
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); } });
  const first = makeInput();
  let inputs = [first], notify, unsubscribed = false;
  let speed = { enabled: true, roomId: "52", count: 12, instantRate: 144, averageRate: 12, observedSeconds: 60 };
  const binding = mountChatSpeedPlaceholder({ querySelectorAll: () => inputs },
    { subscribe(callback) { notify = callback; return () => { unsubscribed = true; }; } }, () => speed);
  assert.equal(first.getAttribute("data-placeholder"), "弹幕时速：144条/分");
  assert.equal(first.textContent, "未发送草稿");
  first.setAttribute("data-placeholder", "官方新提示");
  speed.count = 34;
  speed.instantRate = 408;
  speed.averageRate = 34;
  binding.refresh();
  speed.enabled = false;
  binding.refresh();
  assert.equal(first.getAttribute("data-placeholder"), "官方新提示");
  speed.enabled = true;
  notify();
  const second = makeInput();
  first.isConnected = false;
  inputs = [second];
  notify();
  assert.equal(first.getAttribute("data-placeholder"), "官方新提示");
  assert.equal(second.getAttribute("data-placeholder"), "弹幕时速：408条/分");
  second.setAttribute("data-placeholder", "另一功能已接管");
  binding.dispose();
  assert.equal(second.getAttribute("data-placeholder"), "另一功能已接管");
  assert.equal(second.textContent, "未发送草稿");
  assert.ok(unsubscribed);
});

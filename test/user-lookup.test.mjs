import assert from "node:assert/strict";
import test from "node:test";
import { parseUserLookupInput, readVerifiedProfile, lookupDouyuUser } from "../packages/douyu-web-enhancer/src/features/user-lookup.ts";

const user = { uid: 123, safeUid: "abcDEF123", nickName: "测试用户" };
const profile = (detail = user) => `<script>self.__next_f.push(${JSON.stringify([1, '16:' + JSON.stringify(["$", "component", null, { userDetail: detail }]) + '\n'])})</script>`;
test("lookup accepts supported identities and rejects external URLs and misleading profile fields", () => {
  assert.deepEqual(parseUserLookupInput("123"), { uid: "123" });
  assert.deepEqual(parseUserLookupInput("测试用户"), { nickname: "测试用户" });
  assert.deepEqual(parseUserLookupInput("https://yuba.douyu.com/member/abcDEF123/main/news"), { safeUid: "abcDEF123" });
  assert.deepEqual(parseUserLookupInput("https://yuba.douyu.com/wbapi/web/jumpusercenter?id=123"), { uid: "123" });
  assert.throws(() => parseUserLookupInput("https://yuba.douyu.com.attacker.example/member/abcDEF123"));
  assert.throws(() => parseUserLookupInput("http://yuba.douyu.com/member/abcDEF123"));
  assert.throws(() => readVerifiedProfile(profile(), { uid: "456" }));
  assert.throws(() => readVerifiedProfile(profile(), { safeUid: "unrelated" }));
  assert.throws(() => readVerifiedProfile('<div data-uid="123">测试用户</div>', { uid: "123" }));
  assert.equal(readVerifiedProfile(profile(), { uid: "123" }).nickname, "测试用户");
});
test("nickname lookup verifies encoded identity against the public profile, using only read-only endpoints", async () => {
  const calls = [];
  const request = details => {
    calls.push(details);
    if (details.url.endsWith('/curl/csrf/getCsrfCookie')) {
      details.onload({ status: 200, response: '{}', responseHeaders: 'Set-Cookie: post-csrfToken=synthetic_token; Path=/; Secure; SameSite=None' });
      return;
    }
    details.onload({ status: 200, response: details.method === "POST" ? { status_code: 200, data: [{ uid: user.safeUid, nickname: user.nickName }] } : profile() });
  };
  assert.equal((await lookupDouyuUser("测试用户", request)).uid, "123");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://msg.douyu.com/curl/csrf/getCsrfCookie");
  assert.equal(calls[1].url, "https://msg.douyu.com/v3/friend/search");
  assert.equal(calls[1].headers['dy-csrf-token'], 'synthetic_token');
  assert.equal(new URLSearchParams(calls[1].data).get("keyword"), "测试用户");
  assert.equal(calls[2].url, "https://yuba.douyu.com/member/abcDEF123/main/news");
  await assert.rejects(lookupDouyuUser("另一个用户", request), /唯一/);
  await assert.rejects(lookupDouyuUser("测试用户", details => details.onload({ status: 200, responseHeaders: 'set-cookie: post-csrfToken=synthetic_token; Path=/', response: { status_code: 21001 } })), /官方验证/);
  await assert.rejects(lookupDouyuUser("123", details => details.ontimeout({})), /超时/);
});
test('nickname lookup stops before search if the official CSRF cookie is unavailable; profile lookup needs none', async () => {
  const calls = [];
  await assert.rejects(lookupDouyuUser('测试用户', details => {
    calls.push(details.url);
    details.onload({ status: 200, response: '{}' });
  }), /查询校验/);
  assert.deepEqual(calls, ['https://msg.douyu.com/curl/csrf/getCsrfCookie']);
  assert.equal((await lookupDouyuUser('https://yuba.douyu.com/member/abcDEF123/main/news', details => {
    assert.equal(details.url, 'https://yuba.douyu.com/member/abcDEF123/main/news');
    assert.equal(details.headers, undefined);
    details.onload({ status: 200, response: profile() });
  })).uid, '123');
});

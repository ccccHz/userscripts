import { validUid } from "./user-blocking.ts";
import type { GmRequest } from "./daily-automation.ts";

export interface VerifiedDouyuUser { uid: string; nickname: string; safeUid: string; profileUrl: string }
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9]{6,32}$/.test(value);
const row = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

/** Parse public server-rendered profile data, never execute scripts from a profile. */
export function readVerifiedProfile(html: string, expected: { uid?: string; safeUid?: string }): VerifiedDouyuUser {
  if (html.length > 5_000_000) throw new Error("用户资料过大，无法校验");
  const chunks: string[] = [];
  for (const match of html.matchAll(/self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)/g)) {
    try { const chunk: unknown = JSON.parse(match[1]!); if (Array.isArray(chunk) && typeof chunk[1] === "string") chunks.push(chunk[1]); } catch { /* Unknown server format is not verified. */ }
  }
  let visits = 0;
  const found: VerifiedDouyuUser[] = [];
  const walk = (value: unknown, depth = 0): void => {
    if (++visits > 50_000 || depth > 40 || !value || typeof value !== "object") return;
    const data = row(row(value).userDetail);
    const uid = String(data.uid ?? "");
    if (validUid(uid) && safeId(data.safeUid) && typeof data.nickName === "string" && data.nickName.trim()) {
      if ((!expected.uid || expected.uid === uid) && (!expected.safeUid || expected.safeUid === data.safeUid)) {
        found.push({ uid, safeUid: data.safeUid, nickname: data.nickName.slice(0, 128), profileUrl: `https://yuba.douyu.com/member/${data.safeUid}/main/news` });
      }
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  };
  for (const line of chunks.join("").split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    try { walk(JSON.parse(line.slice(colon + 1))); } catch { /* Non-JSON RSC records are ignored. */ }
  }
  const identities = new Map(found.map(user => [user.uid, user]));
  if (identities.size !== 1) throw new Error("无法核对用户身份，请检查输入或稍后重试");
  return [...identities.values()][0]!;
}

export function parseUserLookupInput(input: string): { uid?: string; safeUid?: string; nickname?: string } {
  const value = input.trim();
  if (!value || value.length > 256) throw new Error("请输入 UID、昵称或鱼吧主页链接");
  if (validUid(value)) return { uid: value };
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "yuba.douyu.com") throw new Error("只支持 HTTPS 鱼吧用户主页链接");
    const member = /^\/member\/([a-zA-Z0-9]{6,32})(?:\/|$)/.exec(url.pathname);
    if (member) return { safeUid: member[1]! };
    if (url.pathname === "/wbapi/web/jumpusercenter" && validUid(url.searchParams.get("id") ?? "")) return { uid: url.searchParams.get("id")! };
    throw new Error("无法识别该用户主页链接");
  }
  if (value.length > 128) throw new Error("昵称过长");
  return { nickname: value };
}

export async function lookupDouyuUser(input: string, request: GmRequest): Promise<VerifiedDouyuUser> {
  const target = parseUserLookupInput(input);
  // The IM host has its own CSRF cookie. Never use the live page's cookie or
  // persist/log this value; the browser cookie jar supplies the matching cookie.
  let csrfToken: string | undefined;
  const load = (url: string, data?: string): Promise<unknown> => new Promise((resolve, reject) => {
    request({ url, method: data === undefined ? "GET" : "POST", data, responseType: data === undefined ? "text" : "json", timeout: 12_000,
      headers: data === undefined ? undefined : { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/vnd.msg.douyu.com.v2+json", "dy-client": "web", "dy-device-id": "-", "dy-csrf-token": csrfToken!, Origin: "https://msg.douyu.com", Referer: "https://msg.douyu.com/web/index.html?isfullmode=1" },
      onload(response) {
        if (response.status !== 200) { reject(new Error("用户查询失败，请稍后重试")); return; }
        if (url === "https://msg.douyu.com/curl/csrf/getCsrfCookie") {
          const cookie = /^set-cookie:\s*post-csrfToken=([^;\r\n]+)/im.exec(response.responseHeaders ?? "");
          if (cookie && /^[a-zA-Z0-9_-]{1,256}$/.test(cookie[1]!)) csrfToken = cookie[1];
        }
        resolve(response.response);
      },
      onerror() { reject(new Error("用户查询网络失败，请检查脚本权限")); }, ontimeout() { reject(new Error("用户查询超时")); }, onabort() { reject(new Error("用户查询已取消")); },
    });
  });
  if (target.nickname) {
    await load("https://msg.douyu.com/curl/csrf/getCsrfCookie");
    if (!csrfToken) throw new Error("无法取得站内信查询校验，请改用鱼吧主页链接");
    const response = row(await load("https://msg.douyu.com/v3/friend/search", new URLSearchParams({ keyword: target.nickname }).toString()));
    csrfToken = undefined;
    if (Number(response.status_code) === 21001) throw new Error("昵称查询需要官方验证，请在站内信加号搜索中完成验证，或改用主页链接");
    if (Number(response.status_code) !== 200) throw new Error(`昵称查询被官方拒绝${typeof response.status_code === "number" ? `（${response.status_code}）` : ""}，请改用主页链接`);
    const matches = Array.isArray(response.data) ? response.data.filter(item => row(item).nickname === target.nickname && safeId(row(item).uid)) : [];
    if (matches.length !== 1) throw new Error("未找到唯一的同名用户，请改用 UID 或主页链接");
    target.safeUid = String(row(matches[0]).uid);
  }
  const url = target.safeUid ? `https://yuba.douyu.com/member/${target.safeUid}/main/news`
    : `https://yuba.douyu.com/wbapi/web/jumpusercenter?id=${target.uid}`;
  const html = await load(url);
  if (typeof html !== "string") throw new Error("用户资料格式异常");
  let user: VerifiedDouyuUser;
  try { user = readVerifiedProfile(html, target); }
  catch (error) { if (target.uid) throw new Error("官方 UID 跳转暂未返回有效资料，请改用昵称或鱼吧主页链接校验"); throw error; }
  if (target.nickname && user.nickname !== target.nickname) throw new Error("用户昵称已变化，请使用主页链接重新查询");
  return user;
}

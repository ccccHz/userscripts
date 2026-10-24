import type { AutomationTask, AutomationTaskResult } from "../core/automation.ts";
import { AUTOMATION_TASK_KEY_PREFIX, acquireAutomationLease, AutomationAuditLog, AutomationTaskStore, DailyAutomationRunner, releaseAutomationLease } from "../core/automation.ts";
import type { FeatureDefinition } from "../core/feature.ts";
import { createNotifier, type Notifier } from "../core/notifier.ts";
import { runAutoFansContinue } from "../../../auto-fans-continue/src/auto-fans-continue.js";
import { getRestRoomId } from "../../../auto-fans-continue/src/config.js";

export const DAILY_AUTOMATION_ID = "daily-automation";
export const FIXED_TASK_ROOM_ID = "3186571";
export const FIXED_TASK_POST_ID = "555691541586843641";
export const DEFAULT_AUTOMATION_ROOM_ID = "12306";
export const FOLLOW_RESTORE_KEY = "douyu-web-enhancer:automation:follow-restore:3186571";

type Row = Record<string, unknown>;
interface GmResponse { status?: number; response?: unknown; responseHeaders?: string }
export interface GmRequestDetails {
  method: string; url: string; data?: string; responseType: "json" | "text";
  headers?: Record<string, string>; timeout?: number;
  onload(value: GmResponse): void; onerror(value: unknown): void;
  ontimeout(value: unknown): void; onabort?(value: unknown): void;
}
export type GmRequest = (details: GmRequestDetails) => unknown;
type CookieReader = () => string;
type ValueReader = (key: string, fallback: unknown) => unknown | Promise<unknown>;
type ValueWriter = (key: string, value: unknown) => void | Promise<void>;

const row = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const message = (value: unknown): string => String(row(value).message ?? row(value).msg ?? "");
const code = (value: unknown): number | null => {
  for (const key of ["error", "code"]) {
    const result = Number(row(value)[key]);
    if (Number.isFinite(result)) return result;
  }
  return null;
};
const already = (value: unknown): boolean => /已签到|已经签到|今日已|已完成|重复|已领取/.test(message(value));
/** A completed request is not proof that the server awarded the requested benefit. */
export const hasVerifiedSuccess = (value: unknown): boolean => code(value) === 0;
const succeeded = hasVerifiedSuccess;
const missingGroup = (value: unknown): boolean => /小组不存在|群组不存在/.test(message(value));
const form = (values: Record<string, string>): string => new URLSearchParams(values).toString();
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function parseCookieString(cookie: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookie.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) result[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return result;
}

export function createDouyuToken(cookie: string): string | null {
  const values = parseCookieString(cookie);
  const keys = ["acf_uid", "acf_biz", "acf_stk", "acf_ct", "acf_ltkid"];
  return keys.every((key) => values[key]) ? keys.map((key) => values[key]).join("_") : null;
}

const ctn = (cookie: string): string => parseCookieString(cookie).acf_ccn || "1";
export const currentAutomationRoomId = (pathname: string): string =>
  /^\/[1-9]\d*$/.test(pathname) ? pathname.slice(1) : DEFAULT_AUTOMATION_ROOM_ID;

async function gmJson(request: GmRequest, details: Omit<GmRequestDetails, "responseType" | "onload" | "onerror" | "ontimeout" | "onabort">): Promise<unknown> {
  return new Promise((resolve, reject) => request({
    ...details, responseType: "json", timeout: 15_000,
    onload(value) {
      if (value.status && (value.status < 200 || value.status >= 300)) reject(new Error(`HTTP ${value.status}`));
      else resolve(value.response);
    },
    onerror: () => reject(new Error("跨域请求失败")),
    ontimeout: () => reject(new Error("跨域请求超时")),
    onabort: () => reject(new Error("跨域请求已取消")),
  }));
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function yubaGroups(request: GmRequest, token: string): Promise<string[]> {
  const result: string[] = [];
  let page = 1;
  let count = 1;
  do {
    const response = row(await gmJson(request, {
      method: "GET", url: `https://yuba.douyu.com/wbapi/web/group/myFollow?page=${page}&limit=30`,
      headers: { "dy-client": "pc", "dy-token": token },
    }));
    const data = row(response.data);
    for (const item of array(data.list)) {
      const id = String(row(item).group_id ?? "");
      if (/^[1-9]\d*$/.test(id)) result.push(id);
    }
    count = Math.max(1, Math.min(100, Number(data.count_page) || 1));
    page += 1;
  } while (page <= count);
  return [...new Set(result)];
}

async function signYuba(request: GmRequest, token: string): Promise<AutomationTaskResult> {
  const groups = await yubaGroups(request, token);
  const fast = await gmJson(request, {
    method: "POST", url: "https://mapi-yuba.douyu.com/wb/v3/fastSign",
    headers: { client: "android", token, "Content-Type": "application/x-www-form-urlencoded" },
  });
  const details = [];
  for (const groupId of groups) {
    let response: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await gmJson(request, {
        method: "POST", url: "https://yuba.douyu.com/ybapi/topic/sign", data: form({ group_id: groupId }),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "dy-client": "pc", "dy-token": token, Referer: `https://yuba.douyu.com/group/${groupId}` },
      });
      if (message(response) !== "签到失败" || attempt === 3) break;
      await wait(2_000);
    }
    details.push({
      groupId,
      outcome: succeeded(response) ? "success" : already(response) ? "already-done" : missingGroup(response) ? "invalid-group" : "failed",
      code: code(response), message: message(response),
    });
  }
  const failed = details.filter((item) => item.outcome === "failed").length;
  const invalid = details.filter((item) => item.outcome === "invalid-group").length;
  const fastOutcome = succeeded(fast) ? "success" : already(fast) ? "already-done" : code(fast) === null ? "unverified" : "failed";
  return {
    outcome: failed ? "failed" : "success",
    summary: `鱼吧签到 ${groups.length - failed - invalid}/${groups.length}，失效小组 ${invalid}，失败 ${failed}${fastOutcome === "unverified" ? "；快速签到请求完成但收益未证实" : fastOutcome === "failed" ? `；快速签到失败：${message(fast) || "未知响应"}` : ""}`,
    complete: failed === 0,
    detail: { fast: { outcome: fastOutcome, code: code(fast), message: message(fast) }, groups: details },
  };
}

async function signClient(request: GmRequest, token: string): Promise<AutomationTaskResult> {
  const response = await gmJson(request, {
    method: "POST", url: "https://apiv2.douyucdn.cn/h5nc/sign/sendSign", data: form({ token }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const isDone = Array.isArray(row(response).data) && array(row(response).data).length === 0;
  const rewards = array(row(row(response).data).sign_pl).map((item) => ({ name: String(row(item).name ?? ""), count: Number(row(item).cnt) || 0 }));
  const complete = isDone || succeeded(response);
  return { outcome: isDone ? "already-done" : complete ? "success" : "failed", summary: isDone ? "客户端今日已签到" : complete ? `客户端签到成功，奖励 ${rewards.length} 项` : `客户端签到失败：${message(response) || "未知响应"}`, complete, detail: { code: code(response), message: message(response), rewards } };
}

async function fanRoomIds(): Promise<string[]> {
  const response = await fetch("https://www.douyu.com/member/cp/getFansBadgeList", { credentials: "include" });
  if (!response.ok) throw new Error(`粉丝牌列表 HTTP ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  return [...new Set([...doc.querySelectorAll<HTMLElement>(".fans-badge-list [data-fans-room]")]
    .map((item) => item.dataset.fansRoom ?? "").filter((id) => /^[1-9]\d*$/.test(id)))];
}

async function signFansHome(getCookie: CookieReader): Promise<AutomationTaskResult> {
  const rooms = await fanRoomIds();
  const url = "https://www.douyu.com/japi/interactnc/web/fanshome/sign";
  const details = [];
  for (const roomId of rooms) {
    const response = await fetchJson(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ ctn: ctn(getCookie()), rid: roomId }) });
    details.push({ roomId, outcome: succeeded(response) ? "success" : already(response) ? "already-done" : "failed", code: code(response), message: message(response) });
    await wait(150);
  }
  const failed = details.filter((item) => item.outcome === "failed").length;
  return { outcome: failed ? "failed" : rooms.length ? "success" : "no-op", summary: `粉丝家园签到 ${rooms.length - failed}/${rooms.length}，失败 ${failed}`, complete: failed === 0, detail: details };
}

async function unsupportedSuperFansSign(): Promise<AutomationTaskResult> {
  return {
    outcome: "unsupported",
    summary: "旧超级粉丝签到接口已下线，当前官方模块未发现替代签到动作",
    complete: true,
    detail: { previousEndpointStatus: 404 },
  };
}

async function readPost(request: GmRequest, token: string): Promise<AutomationTaskResult> {
  const details = [];
  for (let index = 0; index < 5; index += 1) {
    const response = await gmJson(request, {
      method: "GET", url: `https://yuba.douyu.com/wbapi/web/post/detail/${FIXED_TASK_POST_ID}?cid=&timestamp=${Date.now()}`,
      headers: { "dy-client": "pc", "dy-token": token },
    });
    details.push({ index: index + 1, outcome: succeeded(response) ? "success" : already(response) ? "already-done" : code(response) === null ? "unverified" : "failed", code: code(response), message: message(response) });
    if (index < 4) await wait(2_000);
  }
  const unverified = details.filter((item) => item.outcome === "unverified").length;
  const failed = details.filter((item) => item.outcome === "failed").length;
  if (failed) return { outcome: "failed", summary: `固定鱼吧帖子读取失败 ${failed}/5`, complete: false, detail: details };
  return { outcome: "no-op", summary: `固定鱼吧帖子请求完成 5/5，阅读收益未证实${unverified ? `（空响应 ${unverified}/5）` : ""}`, complete: true, detail: details };
}

async function followedRooms(): Promise<Set<string>> {
  const result = new Set<string>();
  let page = 1;
  let pages = 1;
  do {
    const response = row(await fetchJson(`https://www.douyu.com/wgapi/livenc/liveweb/follow/list?page=${page}`));
    const data = row(response.data);
    for (const item of array(data.list)) result.add(String(row(item).room_id ?? ""));
    pages = Math.max(1, Math.min(100, Number(data.pageCount) || 1));
    page += 1;
  } while (page <= pages);
  return result;
}

async function changeFollow(action: "add" | "rm", getCookie: CookieReader): Promise<unknown> {
  return fetchJson(`https://www.douyu.com/wgapi/livenc/liveweb/follow/${action}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ ctn: ctn(getCookie()), rid: FIXED_TASK_ROOM_ID }),
  });
}

async function followTask(getCookie: CookieReader, read: ValueReader, write: ValueWriter): Promise<AutomationTaskResult> {
  const priorState = row(await read(`${AUTOMATION_TASK_KEY_PREFIX}sign-follow-task`, {}));
  const pendingRestore = Boolean(await read(FOLLOW_RESTORE_KEY, false))
    || (priorState.lastOutcome === "failed" && /取消关注失败|恢复原状态失败/.test(String(priorState.summary ?? "")));
  const wasFollowed = (await followedRooms()).has(FIXED_TASK_ROOM_ID);
  if (wasFollowed && !pendingRestore) return { outcome: "no-op", summary: "固定任务房间原本已关注，为保护原状态已跳过", complete: true, detail: { roomId: FIXED_TASK_ROOM_ID, wasFollowed } };
  if (wasFollowed && pendingRestore) {
    const remove = await changeFollow("rm", getCookie);
    const restored = succeeded(remove);
    if (restored) await write(FOLLOW_RESTORE_KEY, false);
    return { outcome: restored ? "success" : "failed", summary: restored ? "已恢复上次中断后残留的关注状态" : `恢复残留关注失败：${message(remove) || "未知响应"}`, complete: restored, detail: { roomId: FIXED_TASK_ROOM_ID, recovery: true, code: code(remove), message: message(remove) } };
  }
  const add = await changeFollow("add", getCookie);
  if (!succeeded(add)) return { outcome: "failed", summary: `固定房间关注失败：${message(add) || "未知响应"}`, complete: false, detail: { roomId: FIXED_TASK_ROOM_ID, add } };
  await write(FOLLOW_RESTORE_KEY, true);
  let remove: unknown;
  try { remove = await changeFollow("rm", getCookie); }
  catch (error) { throw new Error(`关注成功但恢复原状态失败：${error instanceof Error ? error.message : String(error)}`); }
  const restored = succeeded(remove);
  if (restored) await write(FOLLOW_RESTORE_KEY, false);
  return { outcome: restored ? "success" : "failed", summary: restored ? "固定房间关注任务完成并恢复未关注状态" : `取消关注失败：${message(remove) || "未知响应"}`, complete: restored, detail: { roomId: FIXED_TASK_ROOM_ID, add, remove } };
}

export const LEVEL_TASK_CONFIRMED_EVENT = "douyu-web-enhancer:danmaku-send-confirmed";
const LEVEL_TASK_PRIMARY_GOALS = ["login", "watch-5", "watch-30", "follow"] as const;
export type LevelTaskPrimaryGoal = (typeof LEVEL_TASK_PRIMARY_GOALS)[number];
type LevelTaskGoalState = "claimed" | "pending" | "missing";
type LevelTaskDiagnosticGoalState = LevelTaskGoalState | "unknown";

export const LEVEL_TASK_SCHEDULER_DIAGNOSTIC_ID = "level-task-claim-scheduler";

export interface LevelTaskSchedulerDiagnostic {
  lifecycle: "running" | "stopped";
  runningCheck: boolean;
  queuedReason: string | null;
  lastTrigger: string | null;
  primaryGoals: Record<LevelTaskPrimaryGoal, LevelTaskDiagnosticGoalState>;
  remainingPrimaryGoals: LevelTaskPrimaryGoal[];
  timeSchedulingStopped: boolean;
  stopReason: string | null;
  timers: {
    total: number;
    milestones: number;
    retries: number;
    debouncePending: boolean;
  };
  nextTrigger: {
    kind: "milestone" | "retry" | "debounce";
    reason: string;
    at: string;
  } | null;
}

function levelTaskGoal(task: Row): LevelTaskPrimaryGoal | null {
  const name = String(task.name ?? task.taskName ?? "");
  if (/登录/.test(name)) return "login";
  if (/观看.*(?:30|三十).*分钟|(?:30|三十).*分钟.*观看/.test(name)) return "watch-30";
  if (/观看.*(?:5|五).*分钟|(?:5|五).*分钟.*观看/.test(name)) return "watch-5";
  if (/关注/.test(name)) return "follow";
  return null;
}

function levelGoalStates(tasks: Row[]): Record<LevelTaskPrimaryGoal, LevelTaskGoalState> {
  const states = Object.fromEntries(LEVEL_TASK_PRIMARY_GOALS.map((goal) => [goal, "missing"])) as Record<LevelTaskPrimaryGoal, LevelTaskGoalState>;
  for (const task of tasks) {
    const goal = levelTaskGoal(task);
    if (goal) states[goal] = Number(task.prizeStatus) === 1 ? "claimed" : "pending";
  }
  return states;
}

export async function claimLevelTasks(roomId: string, getCookie: CookieReader): Promise<AutomationTaskResult> {
  const detail = row(await fetchJson(`https://www.douyu.com/japi/interactnc/web/userLevel/userLevelDetail?rid=${roomId}`));
  const ids = array(row(detail.data).taskIds).map(String).filter(Boolean);
  if (!ids.length) return { outcome: "unsupported", summary: "等级任务接口未返回任务 ID", complete: false, detail: { code: code(detail), message: message(detail), primaryGoals: {} } };
  const status = row(await fetchJson(`https://www.douyu.com/japi/tasksys/userLevelTask/getTaskStatus?taskIds=${encodeURIComponent(ids.join(","))}`));
  const tasks = array(row(status.data).list).map(row);
  const pending = tasks.filter((task) => Number(task.taskStatus) === 1 && Number(task.prizeStatus) === 0);
  const claims = [];
  for (const task of pending) {
    const response = await fetchJson("https://www.douyu.com/japi/tasksys/userLevelTask/getPrize", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ ctn: ctn(getCookie()), taskIds: String(task.taskId), roomId }),
    });
    claims.push({ taskId: String(task.taskId), name: String(task.name ?? task.taskName ?? ""), outcome: succeeded(response) ? "success" : already(response) ? "already-done" : code(response) === null ? "unverified" : "failed", code: code(response), message: message(response), rewards: row(response).data });
  }
  const failed = claims.filter((item) => item.outcome === "failed" || item.outcome === "unverified").length;
  const primaryGoals = levelGoalStates(tasks);
  for (const task of pending) {
    const claim = claims.find((item) => item.taskId === String(task.taskId));
    const goal = levelTaskGoal(task);
    if (goal && (claim?.outcome === "success" || claim?.outcome === "already-done")) primaryGoals[goal] = "claimed";
  }
  return { outcome: failed ? "failed" : pending.length ? "success" : "already-done", summary: pending.length ? `等级奖励领取 ${pending.length - failed}/${pending.length}${claims.some((item) => item.outcome === "unverified") ? "，部分领取收益未证实" : ""}` : "当前没有可领取的等级任务奖励", complete: failed === 0, detail: { taskCount: tasks.length, primaryGoals, claims } };
}

type LevelTaskSchedulerTimer = ReturnType<typeof setTimeout>;
type LevelTaskSchedulerTimerKind = "milestone" | "retry";
interface LevelTaskSchedulerTimerState {
  kind: LevelTaskSchedulerTimerKind;
  reason: string;
  dueAt: number;
}
type LevelTaskSchedulerOptions = {
  claim(): Promise<AutomationTaskResult>;
  storage: Storage;
  audit: AutomationAuditLog;
  document: Document;
  debounceMs?: number;
  milestoneMs?: readonly [number, number];
  retryMs?: readonly number[];
  onDiagnostic?(diagnostic: LevelTaskSchedulerDiagnostic): void;
};

/** A finite, event-driven claim lifecycle; never the archive's permanent 35s poll. */
export class LevelTaskClaimScheduler {
  readonly #claim: () => Promise<AutomationTaskResult>;
  readonly #storage: Storage;
  readonly #audit: AutomationAuditLog;
  readonly #document: Document;
  readonly #debounceMs: number;
  readonly #milestoneMs: readonly [number, number];
  readonly #retryMs: readonly number[];
  readonly #onDiagnostic?: (diagnostic: LevelTaskSchedulerDiagnostic) => void;
  readonly #timers = new Map<LevelTaskSchedulerTimer, LevelTaskSchedulerTimerState>();
  #debounceTimer: LevelTaskSchedulerTimer | null = null;
  #debounceDueAt: number | null = null;
  #debounceReason: string | null = null;
  #running = false;
  #queuedReason: string | null = null;
  #stopped = false;
  #timeSchedulingStopped = false;
  #lastTrigger: string | null = null;
  #stopReason: string | null = null;
  #primaryGoals = Object.fromEntries(
    LEVEL_TASK_PRIMARY_GOALS.map((goal) => [goal, "unknown"]),
  ) as Record<LevelTaskPrimaryGoal, LevelTaskDiagnosticGoalState>;

  constructor(options: LevelTaskSchedulerOptions) {
    this.#claim = options.claim;
    this.#storage = options.storage;
    this.#audit = options.audit;
    this.#document = options.document;
    this.#debounceMs = options.debounceMs ?? 1_500;
    this.#milestoneMs = options.milestoneMs ?? [5 * 60_000, 30 * 60_000];
    this.#retryMs = options.retryMs ?? [15_000, 45_000];
    this.#onDiagnostic = options.onDiagnostic;
  }

  #publishDiagnostic(): void {
    this.#onDiagnostic?.(this.diagnostic());
  }

  diagnostic(): LevelTaskSchedulerDiagnostic {
    const timerStates = [...this.#timers.values()];
    const nextCandidates: Array<{
      kind: "milestone" | "retry" | "debounce";
      reason: string;
      dueAt: number;
    }> = timerStates.map((timer) => timer);
    if (this.#debounceDueAt !== null) {
      nextCandidates.push({ kind: "debounce", reason: this.#debounceReason ?? "合并事件触发", dueAt: this.#debounceDueAt });
    }
    const next = nextCandidates.sort((left, right) => left.dueAt - right.dueAt)[0];
    return {
      lifecycle: this.#stopped ? "stopped" : "running",
      runningCheck: this.#running,
      queuedReason: this.#queuedReason,
      lastTrigger: this.#lastTrigger,
      primaryGoals: { ...this.#primaryGoals },
      remainingPrimaryGoals: LEVEL_TASK_PRIMARY_GOALS.filter((goal) => this.#primaryGoals[goal] !== "claimed"),
      timeSchedulingStopped: this.#timeSchedulingStopped,
      stopReason: this.#stopReason,
      timers: {
        total: timerStates.length,
        milestones: timerStates.filter((timer) => timer.kind === "milestone").length,
        retries: timerStates.filter((timer) => timer.kind === "retry").length,
        debouncePending: this.#debounceTimer !== null,
      },
      nextTrigger: next ? { kind: next.kind, reason: next.reason, at: new Date(next.dueAt).toISOString() } : null,
    };
  }

  #setTimer(kind: LevelTaskSchedulerTimerKind, reason: string, callback: () => void, delay: number): void {
    const dueAt = Date.now() + delay;
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      this.#publishDiagnostic();
      callback();
    }, delay);
    this.#timers.set(timer, { kind, reason, dueAt });
    this.#publishDiagnostic();
  }

  #clearTimers(): void {
    for (const timer of this.#timers.keys()) clearTimeout(timer);
    this.#timers.clear();
    this.#publishDiagnostic();
  }

  #recordPrimaryGoals(result: AutomationTaskResult): void {
    const states = row(result.detail).primaryGoals as Record<string, unknown> | undefined;
    if (!states) return;
    for (const goal of LEVEL_TASK_PRIMARY_GOALS) {
      const state = states[goal];
      if (state === "claimed" || state === "pending" || state === "missing") this.#primaryGoals[goal] = state;
    }
  }

  #allPrimaryGoalsClaimed(result: AutomationTaskResult): boolean {
    const states = row(result.detail).primaryGoals as Record<string, unknown> | undefined;
    return states !== undefined && LEVEL_TASK_PRIMARY_GOALS.every((goal) => states[goal] === "claimed");
  }

  #scheduleMilestone(name: string, delay: number): void {
    this.#setTimer("milestone", `观看 ${name}`, () => {
      if (this.#stopped || this.#timeSchedulingStopped) return;
      void this.check(`观看 ${name}`).then((result) => {
        if (!result || this.#timeSchedulingStopped) return;
        for (const retry of this.#retryMs) {
          const reason = `观看 ${name} 后服务端延迟复查`;
          this.#setTimer("retry", reason, () => void this.check(reason), retry);
        }
      });
    }, delay);
  }

  start(): () => void {
    const onVisibility = (): void => { if (this.#document.visibilityState === "visible") this.debounce("页面恢复可见"); };
    const onConfirmedDanmaku = (): void => this.debounce("真实弹幕发送成功");
    this.#document.addEventListener("visibilitychange", onVisibility);
    this.#document.addEventListener(LEVEL_TASK_CONFIRMED_EVENT, onConfirmedDanmaku);
    void this.check("页面初始化");
    this.#scheduleMilestone("约 5 分钟里程碑", this.#milestoneMs[0]);
    this.#scheduleMilestone("约 30 分钟里程碑", this.#milestoneMs[1]);
    this.#publishDiagnostic();
    return () => {
      this.#stopped = true;
      this.#stopReason = "每日自动化已停用或页面正在卸载";
      this.#document.removeEventListener("visibilitychange", onVisibility);
      this.#document.removeEventListener(LEVEL_TASK_CONFIRMED_EVENT, onConfirmedDanmaku);
      if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
      this.#debounceDueAt = null;
      this.#debounceReason = null;
      this.#clearTimers();
      this.#publishDiagnostic();
    };
  }

  debounce(reason: string): void {
    if (this.#stopped) return;
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceReason = reason;
    this.#debounceDueAt = Date.now() + this.#debounceMs;
    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null;
      this.#debounceDueAt = null;
      this.#debounceReason = null;
      this.#publishDiagnostic();
      void this.check(reason);
    }, this.#debounceMs);
    this.#publishDiagnostic();
  }

  async check(reason: string): Promise<AutomationTaskResult | null> {
    if (this.#stopped) {
      this.#publishDiagnostic();
      return null;
    }
    if (this.#running) {
      this.#queuedReason = reason;
      this.#publishDiagnostic();
      return null;
    }
    this.#lastTrigger = reason;
    const token = acquireAutomationLease(this.#storage, "level-task-auto-claim");
    if (!token) {
      await this.#audit.append({ at: new Date().toISOString(), taskId: "level-task-auto-claim", phase: "skip", outcome: "skipped", summary: `${reason}：其他页面正在检查等级奖励` });
      this.#publishDiagnostic();
      return null;
    }
    this.#running = true;
    this.#publishDiagnostic();
    const startedAt = Date.now();
    try {
      await this.#audit.append({ at: new Date().toISOString(), taskId: "level-task-auto-claim", phase: "start", summary: `${reason}：开始检查等级奖励` });
      const result = await this.#claim();
      await this.#audit.append({ at: new Date().toISOString(), taskId: "level-task-auto-claim", phase: "finish", outcome: result.outcome, summary: `${reason}：${result.summary}`, durationMs: Date.now() - startedAt, detail: result.detail });
      this.#recordPrimaryGoals(result);
      if (this.#allPrimaryGoalsClaimed(result)) {
        this.#timeSchedulingStopped = true;
        this.#stopReason = "登录、观看 5/30 分钟和关注四个主要目标均已领取；已取消全部时间里程碑和延迟复查";
        this.#clearTimers();
      }
      this.#publishDiagnostic();
      return result;
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      await this.#audit.append({ at: new Date().toISOString(), taskId: "level-task-auto-claim", phase: "error", outcome: "failed", summary: `${reason}：${summary}`, durationMs: Date.now() - startedAt, detail: error });
      return null;
    } finally {
      this.#running = false;
      releaseAutomationLease(this.#storage, "level-task-auto-claim", token);
      const queued = this.#queuedReason;
      this.#queuedReason = null;
      this.#publishDiagnostic();
      if (queued && !this.#stopped) void this.check(queued);
    }
  }
}

export function createDouyuDailyTasks(options: {
  request: GmRequest; cookie: string | CookieReader; pathname: string; storage: Storage;
  read?: ValueReader; write?: ValueWriter;
  /** Settings-owned target room. Undefined keeps the standalone script's legacy setting. */
  autoFansRestRoomId?: () => string | undefined;
  autoFansContinueEnabled?: () => boolean;
  notifier: Notifier; logger: Pick<Console, "log">;
}): AutomationTask[] {
  const { request, storage, notifier, logger } = options;
  const getCookie = typeof options.cookie === "function" ? options.cookie : () => options.cookie as string;
  const read = options.read ?? ((_key: string, fallback: unknown) => fallback);
  const write = options.write ?? (() => undefined);
  const token = createDouyuToken(getCookie());
  const autoFansLogger = {
    state: { startedAt: new Date().toISOString(), events: [] },
    log: (...args: unknown[]) => logger.log(...args),
  };
  const autoFansNotifier = {
    ...notifier,
    notify(type: string, text: string) {
      if (type === "success" || type === "warning" || type === "error") {
        notifier[type](text);
      } else {
        notifier.info(text);
      }
    },
  };
  const auth = (run: (value: string) => Promise<AutomationTaskResult>) => async (): Promise<AutomationTaskResult> =>
    token ? run(token) : { outcome: "failed", summary: "当前斗鱼登录态不完整", complete: false };
  return [
    { id: "sign-yuba", name: "鱼吧签到", run: auth((value) => signYuba(request, value)) },
    { id: "sign-client", name: "客户端签到", run: auth((value) => signClient(request, value)) },
    { id: "sign-fans-home", name: "粉丝家园签到", run: () => signFansHome(getCookie) },
    { id: "sign-super-fans", name: "超级粉丝签到", run: unsupportedSuperFansSign },
    { id: "sign-read-post", name: "固定帖子阅读", run: auth((value) => readPost(request, value)) },
    { id: "sign-follow-task", name: "固定房间关注任务", run: () => followTask(getCookie, read, write) },
    {
      id: "auto-fans-continue", name: "自动续荧光棒", async run() {
        if (options.autoFansContinueEnabled?.() === false) {
          return { outcome: "skipped", summary: "控制中心已停用自动续荧光棒", complete: true };
        }
        const result = row(await runAutoFansContinue({ storage, logger: autoFansLogger, notifier: autoFansNotifier, restRoomId: options.autoFansRestRoomId?.() ?? getRestRoomId(storage) }));
        const status = String(result.status ?? "failed");
        const complete = status === "completed" || status === "skipped";
        const failures = array(result.results).map(row).filter((item) => !item.success).map((item) => {
          const planItem = row(item.item);
          return { roomId: String(planItem.roomId ?? ""), count: Number(planItem.count) || 0, message: message(item.data) || (row(item.error).message ? String(row(item.error).message) : "请求失败") };
        });
        const detail = {
          status,
          successCount: Number(result.successCount) || 0,
          failureCount: Number(result.failureCount) || 0,
          skippedRoomCount: Number(result.skippedRoomCount) || 0,
          failures,
        };
        return { outcome: status === "skipped" ? "already-done" : complete ? "success" : "failed", summary: status === "skipped" ? "自动荧光棒今日已执行" : complete ? `自动荧光棒完成：成功 ${detail.successCount}，失败 ${detail.failureCount}` : `自动荧光棒未完成：${status}`, complete, detail };
      },
    },
  ];
}

export function createDailyAutomationFeature(options: {
  request: GmRequest;
  read: (key: string, fallback: unknown) => unknown | Promise<unknown>;
  write: (key: string, value: unknown) => void | Promise<void>;
  storage?: Storage; cookie?: () => string; pathname?: () => string;
  logger?: Pick<Console, "log">;
  autoFansRestRoomId?: () => string | undefined;
  autoFansContinueEnabled?: () => boolean;
}): FeatureDefinition {
  return { id: DAILY_AUTOMATION_ID, start({ diagnostics, document }) {
    const storage = options.storage ?? localStorage;
    const logger = options.logger ?? console;
    const notifier = createNotifier(document, logger);
    const audit = new AutomationAuditLog(options.read, options.write);
    const runner = new DailyAutomationRunner({
      tasks: createDouyuDailyTasks({ request: options.request, cookie: options.cookie ?? (() => document.cookie), pathname: options.pathname?.() ?? location.pathname, storage, notifier, logger, read: options.read, write: options.write, autoFansRestRoomId: options.autoFansRestRoomId, autoFansContinueEnabled: options.autoFansContinueEnabled }),
      store: new AutomationTaskStore(options.read, options.write), audit, storage, notifier,
    });
    const levelScheduler = new LevelTaskClaimScheduler({
      claim: () => claimLevelTasks(
        currentAutomationRoomId(options.pathname?.() ?? location.pathname),
        options.cookie ?? (() => document.cookie),
      ),
      storage, audit, document,
      onDiagnostic: (scheduler) => diagnostics.update(
        LEVEL_TASK_SCHEDULER_DIAGNOSTIC_ID,
        scheduler.lifecycle === "stopped" ? "disabled" : scheduler.runningCheck ? "active" : scheduler.timeSchedulingStopped ? "waiting" : "active",
        {
          detail: scheduler.stopReason
            ?? `主要目标剩余 ${scheduler.remainingPrimaryGoals.join(", ") || "无"}；有限计时器 ${scheduler.timers.total}（里程碑 ${scheduler.timers.milestones}，延迟复查 ${scheduler.timers.retries}，去抖 ${scheduler.timers.debouncePending ? "待执行" : "无"}）${scheduler.nextTrigger ? `；下次 ${scheduler.nextTrigger.reason}` : ""}`,
          data: scheduler,
        },
      ),
    });
    let disposed = false;
    const run = async (): Promise<unknown> => {
      diagnostics.update(DAILY_AUTOMATION_ID, "starting", { detail: "正在检查每日任务" });
      const result = await runner.run();
      if (result.results.some(({ id, result: taskResult }) => id === "sign-follow-task" && taskResult.complete)) {
        void levelScheduler.check("固定关注任务完成");
      }
      if (!disposed) diagnostics.update(DAILY_AUTOMATION_ID, result.status === "locked" ? "waiting" : "active", { detail: result.status === "locked" ? "其他页面正在执行每日自动化" : `本次检查 ${result.results.length} 项` });
      return result;
    };
    const stopLevelScheduler = levelScheduler.start();
    void run().catch((error: unknown) => !disposed && diagnostics.update(DAILY_AUTOMATION_ID, "error", { detail: error instanceof Error ? error.message : String(error) }));
    Object.defineProperty(globalThis, "__douyuWebEnhancerDailyAutomation", { configurable: true, value: { run, audit: () => audit.list() } });
    return () => { disposed = true; stopLevelScheduler(); delete (globalThis as Record<string, unknown>).__douyuWebEnhancerDailyAutomation; };
  } };
}

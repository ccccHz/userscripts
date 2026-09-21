import type { Notifier } from "./notifier.ts";

export const AUTOMATION_AUDIT_KEY = "douyu-web-enhancer:automation:audit";
export const AUTOMATION_TASK_KEY_PREFIX = "douyu-web-enhancer:automation:task:";
export const AUTOMATION_LOCK_KEY_PREFIX = "douyu-web-enhancer:automation:lock:";
export const AUTOMATION_AUDIT_LIMIT = 500;
export const AUTOMATION_AUDIT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
export const AUTOMATION_LOCK_TTL_MS = 10 * 60 * 1_000;
export const AUTOMATION_RETRY_COOLDOWN_MS = 30 * 60 * 1_000;

type ValueReader = (key: string, fallback: unknown) => unknown | Promise<unknown>;
type ValueWriter = (key: string, value: unknown) => void | Promise<void>;

export type AutomationOutcome =
  | "success"
  | "already-done"
  | "no-op"
  | "skipped"
  | "unsupported"
  | "failed";

export interface AutomationTaskResult {
  outcome: AutomationOutcome;
  summary: string;
  complete: boolean;
  detail?: unknown;
}

export interface AutomationTask {
  id: string;
  name: string;
  run(): Promise<AutomationTaskResult>;
}

export interface AutomationAuditEvent {
  at: string;
  taskId: string;
  phase: "start" | "finish" | "skip" | "error";
  outcome?: AutomationOutcome;
  summary: string;
  durationMs?: number;
  detail?: unknown;
}

export interface AutomationTaskState {
  lastAttemptAt?: string;
  lastSuccessDay?: string;
  lastOutcome?: AutomationOutcome;
  summary?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function sanitizeDetail(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (depth >= 5) return "[已截断]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDetail(item, depth + 1));
  const record = asRecord(value);
  if (!record) return value;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record).slice(0, 30)) {
    if (/cookie|token|authorization|password|ctn|csrf|user_?id|nickname|messages/i.test(key)) continue;
    sanitized[key] = sanitizeDetail(item, depth + 1);
  }
  return sanitized;
}

export function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class AutomationAuditLog {
  readonly #read: ValueReader;
  readonly #write: ValueWriter;

  constructor(read: ValueReader, write: ValueWriter) {
    this.#read = read;
    this.#write = write;
  }

  async list(): Promise<AutomationAuditEvent[]> {
    const value = await this.#read(AUTOMATION_AUDIT_KEY, []);
    return Array.isArray(value)
      ? (value as AutomationAuditEvent[]).map((event) => ({
          ...event,
          detail: sanitizeDetail(event.detail),
        }))
      : [];
  }

  async append(event: AutomationAuditEvent): Promise<void> {
    const cutoff = Date.now() - AUTOMATION_AUDIT_MAX_AGE_MS;
    const events = (await this.list())
      .filter((item) => Date.parse(item.at) >= cutoff)
      .slice(-(AUTOMATION_AUDIT_LIMIT - 1));
    events.push({ ...event, detail: sanitizeDetail(event.detail) });
    await this.#write(AUTOMATION_AUDIT_KEY, events);
  }

  async clear(): Promise<void> {
    await this.#write(AUTOMATION_AUDIT_KEY, []);
  }
}

export class AutomationTaskStore {
  readonly #read: ValueReader;
  readonly #write: ValueWriter;

  constructor(read: ValueReader, write: ValueWriter) {
    this.#read = read;
    this.#write = write;
  }

  async load(taskId: string): Promise<AutomationTaskState> {
    const value = asRecord(await this.#read(`${AUTOMATION_TASK_KEY_PREFIX}${taskId}`, {}));
    return value ? (value as AutomationTaskState) : {};
  }

  async save(taskId: string, state: AutomationTaskState): Promise<void> {
    await this.#write(`${AUTOMATION_TASK_KEY_PREFIX}${taskId}`, state);
  }
}

interface Lease {
  token: string;
  lockedAt: string;
}

function parseLease(value: string | null): Lease | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Lease;
    return typeof parsed.token === "string" && typeof parsed.lockedAt === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function acquireAutomationLease(
  storage: Storage,
  id: string,
  now = new Date(),
  ttlMs = AUTOMATION_LOCK_TTL_MS,
): string | null {
  const key = `${AUTOMATION_LOCK_KEY_PREFIX}${id}`;
  const existing = parseLease(storage.getItem(key));
  const lockedAt = Date.parse(existing?.lockedAt ?? "");
  if (existing && Number.isFinite(lockedAt) && now.getTime() - lockedAt <= ttlMs) return null;
  const token = `${now.toISOString()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  storage.setItem(key, JSON.stringify({ token, lockedAt: now.toISOString() }));
  return parseLease(storage.getItem(key))?.token === token ? token : null;
}

export function releaseAutomationLease(storage: Storage, id: string, token: string): void {
  const key = `${AUTOMATION_LOCK_KEY_PREFIX}${id}`;
  if (parseLease(storage.getItem(key))?.token === token) storage.removeItem(key);
}

export interface AutomationRunSummary {
  status: "completed" | "locked";
  results: Array<{ id: string; name: string; result: AutomationTaskResult }>;
}

export class DailyAutomationRunner {
  readonly #tasks: AutomationTask[];
  readonly #store: AutomationTaskStore;
  readonly #audit: AutomationAuditLog;
  readonly #storage: Storage;
  readonly #notifier: Notifier;

  constructor(options: {
    tasks: AutomationTask[];
    store: AutomationTaskStore;
    audit: AutomationAuditLog;
    storage: Storage;
    notifier: Notifier;
  }) {
    this.#tasks = options.tasks;
    this.#store = options.store;
    this.#audit = options.audit;
    this.#storage = options.storage;
    this.#notifier = options.notifier;
  }

  async run(now = new Date()): Promise<AutomationRunSummary> {
    const workflowToken = acquireAutomationLease(this.#storage, "daily-workflow", now);
    if (!workflowToken) return { status: "locked", results: [] };
    const results: AutomationRunSummary["results"] = [];
    try {
      for (const task of this.#tasks) {
        const state = await this.#store.load(task.id);
        if (state.lastSuccessDay === localDay(now)) {
          const result = { outcome: "skipped", summary: "今日已确认完成", complete: true } as const;
          results.push({ id: task.id, name: task.name, result });
          await this.#audit.append({ at: new Date().toISOString(), taskId: task.id, phase: "skip", outcome: result.outcome, summary: result.summary });
          continue;
        }
        const lastAttempt = Date.parse(state.lastAttemptAt ?? "");
        if (Number.isFinite(lastAttempt) && now.getTime() - lastAttempt < AUTOMATION_RETRY_COOLDOWN_MS) {
          const result = { outcome: "skipped", summary: "失败后处于重试冷却期", complete: false } as const;
          results.push({ id: task.id, name: task.name, result });
          await this.#audit.append({
            at: new Date().toISOString(), taskId: task.id, phase: "skip", outcome: result.outcome,
            summary: state.lastOutcome ? result.summary : "上次执行被页面生命周期中断，处于重试冷却期",
          });
          continue;
        }
        const taskToken = acquireAutomationLease(this.#storage, task.id, now);
        if (!taskToken) continue;
        const startedAt = Date.now();
        await this.#store.save(task.id, { ...state, lastAttemptAt: now.toISOString() });
        await this.#audit.append({ at: new Date().toISOString(), taskId: task.id, phase: "start", summary: `开始${task.name}` });
        try {
          const result = await task.run();
          await this.#store.save(task.id, {
            lastAttemptAt: now.toISOString(),
            lastSuccessDay: result.complete ? localDay(now) : state.lastSuccessDay,
            lastOutcome: result.outcome,
            summary: result.summary,
          });
          await this.#audit.append({
            at: new Date().toISOString(), taskId: task.id, phase: "finish", outcome: result.outcome,
            summary: result.summary, durationMs: Date.now() - startedAt, detail: result.detail,
          });
          results.push({ id: task.id, name: task.name, result });
        } catch (error) {
          const summary = error instanceof Error ? error.message : String(error);
          const result: AutomationTaskResult = { outcome: "failed", summary, complete: false };
          await this.#store.save(task.id, { lastAttemptAt: now.toISOString(), lastOutcome: "failed", summary });
          await this.#audit.append({ at: new Date().toISOString(), taskId: task.id, phase: "error", outcome: "failed", summary, durationMs: Date.now() - startedAt, detail: error });
          results.push({ id: task.id, name: task.name, result });
        } finally {
          releaseAutomationLease(this.#storage, task.id, taskToken);
        }
      }
    } finally {
      releaseAutomationLease(this.#storage, "daily-workflow", workflowToken);
    }

    const attempted = results.filter(({ result }) => result.outcome !== "skipped");
    if (attempted.length > 0) {
      const completed = attempted.filter(({ result }) => result.complete).length;
      const failed = attempted.length - completed;
      const message = `每日自动化完成：成功/已完成 ${completed}，待重试 ${failed}`;
      (failed > 0 ? this.#notifier.warning : this.#notifier.success)(message);
    }
    return { status: "completed", results };
  }
}

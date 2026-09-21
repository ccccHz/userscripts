import type { PendingChatSend } from "../core/chat-send-tracker.ts";

export const DANMAKU_SEND_OBSERVATIONS_KEY =
  "douyu-web-enhancer:danmaku-send-observations";
export const DANMAKU_SEND_OBSERVATIONS_FALLBACK_KEY =
  "douyu-web-enhancer:danmaku-send-observations-v2";
export const DANMAKU_SEND_OBSERVATIONS_DATABASE = "douyu-web-enhancer";
export const DANMAKU_SEND_OBSERVATIONS_STORE = "danmaku-send-observations";
export const DANMAKU_SEND_OBSERVATIONS_LIMIT = 500;

export interface DanmakuSendObservation {
  id: string;
  observedAt: string;
  roomId: string;
  message: string;
  evidence: "unconfirmed" | "suspected";
  resolution: "pending" | "confirmed-delayed";
  resolvedAt?: string;
}

interface StoredDanmakuSendObservations {
  schemaVersion: 1;
  events: DanmakuSendObservation[];
}

export interface DanmakuSendObservationExport {
  schema: "douyu-web-enhancer:danmaku-send-observations";
  version: 1;
  exportedAt: string;
  events: DanmakuSendObservation[];
}

export interface DanmakuSendObservationPersistence {
  load(): Promise<DanmakuSendObservation[]>;
  commit(
    changed: readonly DanmakuSendObservation[],
    removedIds: readonly string[],
    snapshot: readonly DanmakuSendObservation[],
  ): Promise<void>;
}

function isDanmakuSendObservation(value: unknown): value is DanmakuSendObservation {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" &&
    typeof record.observedAt === "string" &&
    /^\d+$/.test(String(record.roomId)) &&
    typeof record.message === "string" && Boolean(record.message.trim()) &&
    (record.evidence === "unconfirmed" || record.evidence === "suspected") &&
    (record.resolution === "pending" || record.resolution === "confirmed-delayed") &&
    (record.resolvedAt === undefined || typeof record.resolvedAt === "string");
}

function sortObservations(
  events: readonly DanmakuSendObservation[],
): DanmakuSendObservation[] {
  return [...events].sort((left, right) => {
    const timeDifference = Date.parse(left.observedAt) - Date.parse(right.observedAt);
    return Number.isFinite(timeDifference) && timeDifference !== 0
      ? timeDifference
      : 0;
  });
}

function mergeObservations(
  ...sources: readonly (readonly DanmakuSendObservation[])[]
): DanmakuSendObservation[] {
  const merged = new Map<string, DanmakuSendObservation>();
  for (const source of sources) {
    for (const event of source) merged.set(event.id, event);
  }
  return sortObservations([...merged.values()]);
}

export function parseDanmakuSendObservations(
  value: unknown,
): StoredDanmakuSendObservations {
  const empty: StoredDanmakuSendObservations = { schemaVersion: 1, events: [] };
  if (!value || typeof value !== "object") return empty;
  const events = (value as { events?: unknown }).events;
  if (!Array.isArray(events)) return empty;
  empty.events = sortObservations(events.filter(isDanmakuSendObservation))
    .slice(-DANMAKU_SEND_OBSERVATIONS_LIMIT);
  return empty;
}

export function parseDanmakuSendObservationImport(
  value: unknown,
): DanmakuSendObservation[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("导入文件不是有效的检测记录 JSON。");
  }
  const source = value as Record<string, unknown>;
  if (source.schema !== "douyu-web-enhancer:danmaku-send-observations" || source.version !== 1) {
    throw new Error("不支持的检测记录导出格式。");
  }
  if (typeof source.exportedAt !== "string" || !Array.isArray(source.events)) {
    throw new Error("导入文件缺少检测记录。");
  }
  return parseDanmakuSendObservations({ events: source.events }).events;
}

export function exportDanmakuSendObservations(
  events: readonly DanmakuSendObservation[],
): string {
  return JSON.stringify({
    schema: "douyu-web-enhancer:danmaku-send-observations",
    version: 1,
    exportedAt: new Date().toISOString(),
    events: sortObservations(events),
  } satisfies DanmakuSendObservationExport, null, 2);
}

function parseSerializedObservations(value: string | null): DanmakuSendObservation[] {
  if (!value) return [];
  try {
    return parseDanmakuSendObservations(JSON.parse(value)).events;
  } catch {
    return [];
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

export function createBrowserDanmakuSendObservationPersistence(
  windowObject: Window | null,
): DanmakuSendObservationPersistence {
  let databasePromise: Promise<IDBDatabase | null> | null = null;
  let indexedDbDisabled = false;

  const localStorage = (): Storage | null => {
    try {
      return windowObject?.localStorage ?? null;
    } catch {
      return null;
    }
  };

  const disableIndexedDb = (database?: IDBDatabase | null): void => {
    indexedDbDisabled = true;
    database?.close();
  };

  const openDatabase = (): Promise<IDBDatabase | null> => {
    if (indexedDbDisabled) return Promise.resolve(null);
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve) => {
      let settled = false;
      const finish = (database: IDBDatabase | null): void => {
        if (settled) {
          database?.close();
          return;
        }
        settled = true;
        resolve(database);
      };
      let factory: IDBFactory | undefined;
      try {
        factory = windowObject?.indexedDB;
      } catch {
        finish(null);
        return;
      }
      if (!factory) {
        finish(null);
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DANMAKU_SEND_OBSERVATIONS_DATABASE, 1);
      } catch {
        finish(null);
        return;
      }
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(DANMAKU_SEND_OBSERVATIONS_STORE)
          ? request.transaction?.objectStore(DANMAKU_SEND_OBSERVATIONS_STORE)
          : database.createObjectStore(DANMAKU_SEND_OBSERVATIONS_STORE, {
              keyPath: "id",
            });
        if (!store) return;
        if (!store.indexNames.contains("observedAt")) {
          store.createIndex("observedAt", "observedAt");
        }
        if (!store.indexNames.contains("roomId")) store.createIndex("roomId", "roomId");
        if (!store.indexNames.contains("evidence")) {
          store.createIndex("evidence", "evidence");
        }
        if (!store.indexNames.contains("resolution")) {
          store.createIndex("resolution", "resolution");
        }
      });
      request.addEventListener("success", () => finish(request.result));
      request.addEventListener("error", () => finish(null));
      request.addEventListener("blocked", () => finish(null));
    });
    return databasePromise;
  };

  const writeIndexedDb = async (
    database: IDBDatabase,
    changed: readonly DanmakuSendObservation[],
    removedIds: readonly string[],
  ): Promise<void> => {
    const transaction = database.transaction(DANMAKU_SEND_OBSERVATIONS_STORE, "readwrite");
    const store = transaction.objectStore(DANMAKU_SEND_OBSERVATIONS_STORE);
    for (const event of changed) store.put(event);
    for (const id of removedIds) store.delete(id);
    await transactionComplete(transaction);
  };

  const writeFallback = (snapshot: readonly DanmakuSendObservation[]): void => {
    const storage = localStorage();
    if (!storage) throw new Error("浏览器本地存储不可用");
    storage.setItem(DANMAKU_SEND_OBSERVATIONS_FALLBACK_KEY, JSON.stringify({
      schemaVersion: 1,
      events: [...snapshot],
    } satisfies StoredDanmakuSendObservations));
  };

  return {
    async load() {
      const storage = localStorage();
      const fallback = parseSerializedObservations(
        storage?.getItem(DANMAKU_SEND_OBSERVATIONS_FALLBACK_KEY) ?? null,
      );
      const database = await openDatabase();
      if (!database) return fallback;
      try {
        const transaction = database.transaction(
          DANMAKU_SEND_OBSERVATIONS_STORE,
          "readonly",
        );
        const stored = await requestResult(
          transaction.objectStore(DANMAKU_SEND_OBSERVATIONS_STORE)
            .index("observedAt").getAll() as IDBRequest<DanmakuSendObservation[]>,
        );
        const validStored = stored.filter(isDanmakuSendObservation);
        if (fallback.length > 0) {
          await writeIndexedDb(database, fallback, []);
          storage?.removeItem(DANMAKU_SEND_OBSERVATIONS_FALLBACK_KEY);
        }
        return mergeObservations(validStored, fallback);
      } catch {
        disableIndexedDb(database);
        return fallback;
      }
    },
    async commit(changed, removedIds, snapshot) {
      const database = await openDatabase();
      if (database) {
        try {
          await writeIndexedDb(database, changed, removedIds);
          return;
        } catch {
          disableIndexedDb(database);
        }
      }
      writeFallback(snapshot);
    },
  };
}

export class DanmakuSendObservationStore {
  readonly #persistence: DanmakuSendObservationPersistence;
  readonly #ready: Promise<void>;
  #events: DanmakuSendObservation[] = [];
  #operationQueue: Promise<void> = Promise.resolve();
  #listeners = new Set<(events: readonly DanmakuSendObservation[]) => void>();

  constructor(
    legacyValue: unknown,
    persistence: DanmakuSendObservationPersistence,
  ) {
    this.#persistence = persistence;
    const legacy = parseDanmakuSendObservations(legacyValue).events;
    this.#ready = this.#initialize(legacy);
  }

  async #initialize(legacy: readonly DanmakuSendObservation[]): Promise<void> {
    const stored = await this.#persistence.load();
    const storedIds = new Set(stored.map(event => event.id));
    const migrated = legacy.filter(event => !storedIds.has(event.id));
    const merged = mergeObservations(legacy, stored);
    const removed = merged.length > DANMAKU_SEND_OBSERVATIONS_LIMIT
      ? merged.slice(0, -DANMAKU_SEND_OBSERVATIONS_LIMIT)
      : [];
    this.#events = merged.slice(-DANMAKU_SEND_OBSERVATIONS_LIMIT);
    if (migrated.length > 0 || removed.length > 0) {
      await this.#persistence.commit(
        migrated.filter(event => this.#events.some(current => current.id === event.id)),
        removed.map(event => event.id),
        this.#events,
      );
    }
    this.#notify();
  }

  ready(): Promise<void> {
    return this.#ready;
  }

  events(): readonly DanmakuSendObservation[] {
    return this.#events;
  }

  subscribe(listener: (events: readonly DanmakuSendObservation[]) => void): () => void {
    this.#listeners.add(listener);
    listener([...this.#events]);
    return () => this.#listeners.delete(listener);
  }

  exportJson(): string {
    return exportDanmakuSendObservations(this.#events);
  }

  async importJson(serialized: string): Promise<{ imported: number; retained: number }> {
    let value: unknown;
    try {
      value = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("导入文件不是有效 JSON。");
    }
    const imported = parseDanmakuSendObservationImport(value);
    if (imported.length === 0) throw new Error("导入文件中没有有效的检测记录。");
    return this.#mutate(() => {
      const current = new Map(this.#events.map(event => [event.id, event]));
      for (const event of imported) {
        const existing = current.get(event.id);
        // A late correction is stronger local evidence than a stale exported pending state.
        if (existing?.resolution === "confirmed-delayed" && event.resolution !== "confirmed-delayed") continue;
        current.set(event.id, event);
      }
      const merged = sortObservations([...current.values()]);
      const removed = merged.length > DANMAKU_SEND_OBSERVATIONS_LIMIT
        ? merged.slice(0, -DANMAKU_SEND_OBSERVATIONS_LIMIT)
        : [];
      const next = merged.slice(-DANMAKU_SEND_OBSERVATIONS_LIMIT);
      const previous = new Map(this.#events.map(event => [event.id, event]));
      this.#events = next;
      const changed = next.filter(event => JSON.stringify(previous.get(event.id)) !== JSON.stringify(event));
      return {
        changed,
        removedIds: removed.map(event => event.id),
        result: { imported: imported.length, retained: next.length },
      };
    });
  }

  async clear(): Promise<number> {
    return this.#mutate(() => {
      const removedIds = this.#events.map(event => event.id);
      this.#events = [];
      return { changed: [], removedIds, result: removedIds.length };
    });
  }

  async addUnconfirmed(
    id: string,
    attempt: PendingChatSend,
    observedAt = new Date(),
  ): Promise<boolean> {
    return this.addObservation(id, attempt, "unconfirmed", observedAt);
  }

  async addObservation(
    id: string,
    attempt: PendingChatSend,
    evidence: DanmakuSendObservation["evidence"],
    observedAt = new Date(),
  ): Promise<boolean> {
    const roomId = attempt.scope?.match(/^\/(\d+)(?:\/|$)/)?.[1];
    if (!roomId || !attempt.message.trim()) return false;
    return this.#mutate(() => {
      const existing = this.#events.find(event => event.id === id);
      const event: DanmakuSendObservation = existing
        ? { ...existing, evidence }
        : {
            id,
            observedAt: observedAt.toISOString(),
            roomId,
            message: attempt.message.trim(),
            evidence,
            resolution: "pending",
          };
      const withoutCurrent = this.#events.filter(candidate => candidate.id !== id);
      const merged = sortObservations([...withoutCurrent, event]);
      const removed = merged.length > DANMAKU_SEND_OBSERVATIONS_LIMIT
        ? merged.slice(0, -DANMAKU_SEND_OBSERVATIONS_LIMIT)
        : [];
      this.#events = merged.slice(-DANMAKU_SEND_OBSERVATIONS_LIMIT);
      return { changed: [event], removedIds: removed.map(item => item.id), result: true };
    });
  }

  async setEvidence(
    id: string,
    evidence: DanmakuSendObservation["evidence"],
  ): Promise<boolean> {
    return this.#mutate(() => {
      const index = this.#events.findIndex(candidate => candidate.id === id);
      if (index < 0 || this.#events[index].resolution !== "pending") return null;
      const event = { ...this.#events[index], evidence };
      this.#events.splice(index, 1, event);
      return { changed: [event], removedIds: [], result: true };
    });
  }

  async markConfirmedDelayed(id: string, resolvedAt = new Date()): Promise<boolean> {
    return this.#mutate(() => {
      const index = this.#events.findIndex(candidate => candidate.id === id);
      if (index < 0 || this.#events[index].resolution !== "pending") return null;
      const event: DanmakuSendObservation = {
        ...this.#events[index],
        resolution: "confirmed-delayed",
        resolvedAt: resolvedAt.toISOString(),
      };
      this.#events.splice(index, 1, event);
      return { changed: [event], removedIds: [], result: true };
    });
  }

  #notify(): void {
    const snapshot = [...this.#events];
    for (const listener of this.#listeners) listener(snapshot);
  }

  async #mutate<T>(
    mutation: () => {
      changed: DanmakuSendObservation[];
      removedIds: string[];
      result: T;
    } | null,
  ): Promise<T> {
    let result = false as T;
    const operation = this.#operationQueue
      .catch(() => undefined)
      .then(async () => {
        await this.#ready;
        const change = mutation();
        if (!change) return;
        result = change.result;
        await this.#persistence.commit(change.changed, change.removedIds, this.#events);
        this.#notify();
      });
    this.#operationQueue = operation;
    await operation;
    return result;
  }
}

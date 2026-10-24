export interface ActivityRoomStats { roomId: string; count: number; lastAt: number }
export interface ActivityCleanupSnapshot {
  count: number;
  lastAt: number;
  rooms: ActivityRoomStats[];
}
export interface ActivityCleanupPersistence {
  load(roomId: string | null): Promise<ActivityCleanupSnapshot>;
  /** Atomically add deltas to stored totals, including writes from other tabs. */
  commit(deltas: readonly ActivityRoomStats[], roomId: string | null): Promise<ActivityCleanupSnapshot>;
}
const empty = (): ActivityCleanupSnapshot => ({ count: 0, lastAt: 0, rooms: [] });
const validRoom = (roomId: string): boolean => /^[1-9]\d{0,11}$/.test(roomId);
function normalizeRoom(value: unknown, roomId: string): ActivityRoomStats {
  const source = value as Partial<ActivityRoomStats> | null;
  return { roomId, count: Number.isSafeInteger(source?.count) && source!.count! >= 0 ? source!.count! : 0,
    lastAt: Number.isFinite(source?.lastAt) && source!.lastAt! >= 0 ? source!.lastAt! : 0 };
}
export function mergeActivityStats(base: ActivityRoomStats, delta: ActivityRoomStats): ActivityRoomStats {
  return { roomId: base.roomId, count: Math.min(Number.MAX_SAFE_INTEGER, base.count + delta.count), lastAt: Math.max(base.lastAt, delta.lastAt) };
}

/** Counts confirmed Socket messages withheld from native delivery. Earlier stored totals remain intact. */
export class ActivityCleanupStats {
  readonly #persistence: ActivityCleanupPersistence;
  readonly #roomId: () => string | null;
  readonly #listeners = new Set<() => void>();
  #base = empty();
  #pending = new Map<string, ActivityRoomStats>();
  #inflight = new Map<string, ActivityRoomStats>();
  #write: Promise<void> | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  status: "saved" | "pending" | "error" = "saved";
  constructor(persistence: ActivityCleanupPersistence, roomId: () => string | null) {
    this.#persistence = persistence; this.#roomId = roomId;
  }
  async load(): Promise<void> {
    try { this.#base = await this.#persistence.load(this.#roomId()); }
    catch { this.status = "error"; }
  }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  recordFiltered(roomId: string, count = 1, at = Date.now()): void {
    if (this.#disposed || !validRoom(roomId) || !Number.isSafeInteger(count) || count < 1 || !Number.isFinite(at) || at < 0) return;
    const delta = this.#pending.get(roomId) ?? { roomId, count: 0, lastAt: 0 };
    this.#pending.set(roomId, mergeActivityStats(delta, { roomId, count, lastAt: at }));
    this.status = "pending";
    this.#schedule();
  }
  snapshot(): ActivityCleanupSnapshot {
    const rooms = new Map(this.#base.rooms.map(room => [room.roomId, { ...room }]));
    let count = this.#base.count, lastAt = this.#base.lastAt;
    for (const delta of [...this.#inflight.values(), ...this.#pending.values()]) {
      count = Math.min(Number.MAX_SAFE_INTEGER, count + delta.count); lastAt = Math.max(lastAt, delta.lastAt);
      rooms.set(delta.roomId, mergeActivityStats(rooms.get(delta.roomId) ?? { roomId: delta.roomId, count: 0, lastAt: 0 }, delta));
    }
    return { count, lastAt, rooms: [...rooms.values()].sort((a, b) => b.lastAt - a.lastAt || a.roomId.localeCompare(b.roomId)) };
  }
  #schedule(): void {
    if (this.#disposed || this.#timer !== undefined) return;
    // One bounded write/notification per batch, not one UI update per message.
    this.#timer = setTimeout(() => { this.#timer = undefined; void this.flush(); }, 1000);
  }
  async flush(): Promise<void> {
    if (this.#write) { await this.#write; return; }
    if (this.#timer !== undefined) { clearTimeout(this.#timer); this.#timer = undefined; }
    if (!this.#pending.size) return;
    const deltas = this.#pending; this.#pending = new Map(); this.#inflight = deltas;
    this.#write = (async () => {
      try {
        this.#base = await this.#persistence.commit([...deltas.values()], this.#roomId());
        this.status = this.#pending.size ? "pending" : "saved";
      } catch {
        for (const [id, delta] of deltas) this.#pending.set(id, mergeActivityStats(delta, this.#pending.get(id) ?? { roomId: id, count: 0, lastAt: 0 }));
        this.status = "error";
      } finally {
        this.#inflight = new Map(); this.#write = null; this.#notify();
        if (this.status !== "error" && this.#pending.size) this.#schedule();
      }
    })();
    await this.#write;
  }
  dispose(): void {
    this.#disposed = true;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#listeners.clear();
  }
}

export function createBrowserActivityCleanupPersistence(windowObject: Window | null): ActivityCleanupPersistence {
  let opening: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { if (!windowObject?.indexedDB) throw new Error("本地存储不可用"); request = windowObject.indexedDB.open("douyu-web-enhancer:activity-cleanup-stats", 1); }
    catch (error) { reject(error); return; }
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error("本地存储打开超时")); }, 2000);
    request.onupgradeneeded = () => { request.result.createObjectStore("counts", { keyPath: "roomId" }).createIndex("lastAt", "lastAt"); };
    request.onsuccess = () => { clearTimeout(timer); if (settled) { request.result.close(); return; } settled = true; request.result.onversionchange = () => { request.result.close(); opening = undefined; }; resolve(request.result); };
    request.onerror = request.onblocked = () => { clearTimeout(timer); settled = true; reject(request.error ?? new Error("本地存储被占用")); };
  }).catch((error: unknown) => { opening = undefined; throw error; });
  const complete = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("本地统计保存失败"));
  });
  const readSnapshot = (store: IDBObjectStore, roomId: string | null): ActivityCleanupSnapshot => {
    const snapshot = empty(), rooms = new Map<string, ActivityRoomStats>();
    const total = store.get("total"); total.onsuccess = () => { const value = normalizeRoom(total.result, "total"); snapshot.count = value.count; snapshot.lastAt = value.lastAt; };
    if (roomId && validRoom(roomId)) { const current = store.get(roomId); current.onsuccess = () => { if (current.result) rooms.set(roomId, normalizeRoom(current.result, roomId)); snapshot.rooms = [...rooms.values()]; }; }
    // Memory and drawer are bounded; older room aggregates remain on disk.
    let recentCount = 0;
    const cursor = store.index("lastAt").openCursor(null, "prev");
    cursor.onsuccess = () => {
      const entry = cursor.result; if (!entry) return;
      const id = String(entry.primaryKey);
      if (validRoom(id)) { rooms.set(id, normalizeRoom(entry.value, id)); recentCount++; snapshot.rooms = [...rooms.values()]; }
      if (recentCount < 100) entry.continue();
    };
    return snapshot;
  };
  const load = async (roomId: string | null): Promise<ActivityCleanupSnapshot> => {
    const db = await open(); const tx = db.transaction("counts", "readonly"); const done = complete(tx);
    const snapshot = readSnapshot(tx.objectStore("counts"), roomId);
    await done; return snapshot;
  };
  return {
    load,
    async commit(deltas, roomId) {
      const db = await open(); const tx = db.transaction("counts", "readwrite"); const done = complete(tx), store = tx.objectStore("counts");
      const valid = deltas.filter(delta => validRoom(delta.roomId) && Number.isSafeInteger(delta.count) && delta.count > 0 && Number.isFinite(delta.lastAt) && delta.lastAt >= 0);
      const sum = valid.reduce((total, delta) => mergeActivityStats(total, delta), { roomId: "total", count: 0, lastAt: 0 });
      let remaining = valid.length + 1, snapshot = empty();
      for (const delta of [...valid, sum]) {
        const request = store.get(delta.roomId);
        request.onsuccess = () => {
          store.put(mergeActivityStats(normalizeRoom(request.result, delta.roomId), delta));
          // Queue the snapshot after all puts, in the same transaction. A read failure
          // must roll back the deltas, so the owner can retry without double counting.
          if (--remaining === 0) snapshot = readSnapshot(store, roomId);
        };
      }
      await done; return snapshot;
    },
  };
}

export interface ActivityFilterRecord {
  id?: number;
  roomId: string;
  activity: "保卫鱼娘" | "合成大西瓜";
  text: string;
  at: number;
  nickname?: string;
  uid?: string;
}

const LIMIT = 50;
const DATABASE = "douyu-web-enhancer:activity-filter-review";

export function decodeActivityFilterRecord(message: string, roomId: string, at: number): ActivityFilterRecord | null {
  const id = /(?:^|\/)gadid@=(29|48)\//.exec(message)?.[1];
  const raw = /(?:^|\/)txt@=([^/]*)\//.exec(message)?.[1];
  if (!id || raw === undefined || !/^[1-9]\d{0,11}$/.test(roomId)) return null;
  const decode = (value: string): string => value.replace(/@S/g, "/").replace(/@A/g, "@");
  const nickname = decode(/(?:^|\/)nn@=([^/]*)\//.exec(message)?.[1] ?? "").trim().slice(0, 128);
  const uid = /(?:^|\/)uid@=([1-9]\d{0,19})\//.exec(message)?.[1];
  return {
    roomId,
    activity: id === "29" ? "保卫鱼娘" : "合成大西瓜",
    text: decode(raw).slice(0, 200),
    at,
    nickname,
    ...(uid ? { uid } : {}),
  };
}

/** Local, bounded review log. Only frames actually withheld by the Socket hook reach record(). */
export class ActivityFilterReview {
  readonly #window: Window | null;
  readonly #listeners = new Set<() => void>();
  #database: Promise<IDBDatabase> | null = null;
  #records: ActivityFilterRecord[] = [];
  #write: Promise<void> = Promise.resolve();
  status: "saved" | "pending" | "error" = "saved";

  constructor(windowObject: Window | null) { this.#window = windowObject; }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  snapshot(): readonly ActivityFilterRecord[] { return [...this.#records]; }

  #open(): Promise<IDBDatabase> {
    return this.#database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.#window?.indexedDB) { reject(new Error("本地记录存储不可用")); return; }
      const request = this.#window.indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("records", { keyPath: "id", autoIncrement: true }); };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.#database = null; }; resolve(request.result); };
      request.onerror = request.onblocked = () => reject(request.error ?? new Error("本地记录存储失败"));
    }).catch((error: unknown) => { this.#database = null; throw error; });
  }

  async load(): Promise<void> {
    try {
      const db = await this.#open();
      const records = await new Promise<ActivityFilterRecord[]>((resolve, reject) => {
        const request = db.transaction("records", "readonly").objectStore("records").getAll();
        request.onsuccess = () => resolve((request.result as ActivityFilterRecord[]).slice(-LIMIT).reverse());
        request.onerror = () => reject(request.error);
      });
      this.#records = records;
      this.status = "saved";
    } catch { this.status = "error"; }
    this.#notify();
  }

  record(roomId: string, message: string, at = Date.now()): void {
    const item = decodeActivityFilterRecord(message, roomId, at);
    if (!item) return;
    this.#records = [item, ...this.#records].slice(0, LIMIT);
    this.status = "pending";
    this.#notify();
    this.#write = this.#write.catch(() => undefined).then(async () => {
      try {
        const db = await this.#open();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("records", "readwrite");
          const store = tx.objectStore("records");
          store.add(item);
          const cursor = store.openCursor(null, "prev");
          let seen = 0;
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            seen++;
            if (seen > LIMIT) row.delete();
            row.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
        this.status = "saved";
      } catch { this.status = "error"; }
      this.#notify();
    });
  }
}

import type { BlockedChatMessage } from "../core/douyu-message-filter.ts";
import { validUid, validRoomId, type UserBlockRule } from "./user-blocking.ts";

export interface BlockedChatSample extends BlockedChatMessage { id: string; at: number; roomName: string; kind?: "chatmsg" | "uenter" | "dgb" }
export interface UserBlockHistoryEntry {
  uid: string;
  nickname: string;
  nicknameAt: number;
  count: number;
  recent: BlockedChatSample[];
}
export interface BlockRoomInfo { roomId: string; name: string; updatedAt: number }
export interface UserBlockHistoryPersistence {
  load(uids: readonly string[], roomIds: readonly string[]): Promise<{ users: UserBlockHistoryEntry[]; rooms: BlockRoomInfo[] }>;
  commit(users: readonly UserBlockHistoryEntry[], rooms: readonly BlockRoomInfo[]): Promise<UserBlockHistoryEntry[]>;
  clear(uid: string): Promise<void>;
}

const blank = (uid: string): UserBlockHistoryEntry => ({ uid, nickname: "", nicknameAt: 0, count: 0, recent: [] });
const copy = (entry: UserBlockHistoryEntry): UserBlockHistoryEntry => ({ ...entry, recent: entry.recent.map((sample) => ({ ...sample })) });

/** Both persisted totals and unsaved increments use this shape. Merge deltas, never overwrite totals. */
export function mergeBlockHistory(base: UserBlockHistoryEntry, delta: UserBlockHistoryEntry, limit = 10): UserBlockHistoryEntry {
  const recent = new Map([...base.recent, ...delta.recent].map((sample) => [sample.id, sample]));
  const newerName = delta.nickname && delta.nicknameAt >= base.nicknameAt;
  return {
    uid: base.uid,
    nickname: newerName ? delta.nickname : base.nickname,
    nicknameAt: newerName ? delta.nicknameAt : base.nicknameAt,
    count: Math.min(Number.MAX_SAFE_INTEGER, base.count + delta.count),
    recent: [...recent.values()].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)).slice(0, limit),
  };
}

function normalizeEntry(value: unknown, uid: string, limit = 10): UserBlockHistoryEntry {
  if (!value || typeof value !== "object") return blank(uid);
  const entry = value as UserBlockHistoryEntry;
  if (entry.uid !== uid || !Number.isSafeInteger(entry.count) || entry.count < 0) return blank(uid);
  return {
    uid, count: entry.count,
    nickname: typeof entry.nickname === "string" ? entry.nickname.slice(0, 128) : "",
    nicknameAt: Number.isFinite(entry.nicknameAt) ? entry.nicknameAt : 0,
    recent: Array.isArray(entry.recent) ? entry.recent.filter((sample) => sample && sample.uid === uid
      && typeof sample.id === "string" && typeof sample.roomId === "string" && validRoomId(sample.roomId)
      && Number.isFinite(sample.at) && typeof sample.text === "string" && typeof sample.nickname === "string")
      .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)).slice(0, limit)
      .map((sample) => ({ ...sample, id: sample.id.slice(0, 100), nickname: sample.nickname.slice(0, 128),
        text: sample.text.slice(0, 2048), roomName: typeof sample.roomName === "string" ? sample.roomName.slice(0, 128) : "" })) : [],
  };
}

/** Cache only active UIDs; removed users remain on disk and are loaded if blocked again. */
export class UserBlockHistory {
  readonly #persistence: UserBlockHistoryPersistence | null;
  readonly #limit: number;
  readonly #base = new Map<string, UserBlockHistoryEntry>();
  readonly #rooms = new Map<string, BlockRoomInfo>();
  readonly #listeners = new Set<() => void>();
  #uids = new Set<string>();
  #pending = new Map<string, UserBlockHistoryEntry>();
  #pendingRooms = new Map<string, BlockRoomInfo>();
  #inflight = new Map<string, UserBlockHistoryEntry>();
  #write: Promise<void> | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #sequence = 0;
  readonly #source = Math.random().toString(36).slice(2);
  status: "saved" | "pending" | "error" = "saved";

  constructor(persistence: UserBlockHistoryPersistence | null = null, limit = 10) { this.#persistence = persistence; this.#limit = limit; }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #notify(): void { for (const listener of this.#listeners) listener(); }

  async setRules(rules: readonly UserBlockRule[]): Promise<void> {
    await this.flush();
    this.#uids = new Set(rules.map((rule) => rule.uid));
    const roomIds = [...new Set(rules.flatMap((rule) => rule.roomId ? [rule.roomId] : []))];
    try {
      const stored = await this.#persistence?.load([...this.#uids], roomIds);
      for (const entry of stored?.users ?? []) if (this.#uids.has(entry.uid)) this.#base.set(entry.uid, normalizeEntry(entry, entry.uid, this.#limit));
      for (const room of stored?.rooms ?? []) this.#rememberLoadedRoom(room);
    } catch { this.status = "error"; }
    for (const uid of this.#base.keys()) if (!this.#uids.has(uid)) this.#base.delete(uid);
    // Names for active scopes plus ten samples per active UID keep the page cache bounded.
    const usedRooms = new Set([...roomIds, ...this.snapshot().flatMap((entry) => entry.recent.map((sample) => sample.roomId))]);
    for (const roomId of this.#rooms.keys()) if (!usedRooms.has(roomId) && !this.#pendingRooms.has(roomId)) this.#rooms.delete(roomId);
    this.#notify();
  }

  #rememberLoadedRoom(room: BlockRoomInfo): void {
    if (!room || typeof room.roomId !== "string" || !validRoomId(room.roomId) || typeof room.name !== "string" || !Number.isFinite(room.updatedAt)) return;
    const current = this.#rooms.get(room.roomId);
    if (!current || current.updatedAt <= room.updatedAt) this.#rooms.set(room.roomId, { ...room, name: room.name.slice(0, 128) });
  }
  roomName(roomId: string): string { return this.#rooms.get(roomId)?.name ?? ""; }
  rememberRoom(roomId: string | null, name: string, at = Date.now()): void {
    const trimmed = name.trim().slice(0, 128);
    if (!roomId || !validRoomId(roomId) || !trimmed || this.roomName(roomId) === trimmed) return;
    const room = { roomId, name: trimmed, updatedAt: at };
    this.#rooms.set(roomId, room);
    this.#pendingRooms.set(roomId, room);
    this.#schedule();
  }
  rememberNickname(uid: string, nickname: string, at = Date.now()): void {
    if (!this.#uids.has(uid) || !nickname.trim()) return;
    const current = [this.#pending.get(uid), this.#inflight.get(uid), this.#base.get(uid)]
      .filter((entry): entry is UserBlockHistoryEntry => Boolean(entry?.nickname)).sort((a, b) => b.nicknameAt - a.nicknameAt);
    if (current[0]?.nickname === nickname.trim().slice(0, 128)) return;
    const delta = this.#pending.get(uid) ?? blank(uid);
    delta.nickname = nickname.trim().slice(0, 128);
    delta.nicknameAt = at;
    this.#pending.set(uid, delta);
    this.#schedule();
  }
  record(messages: readonly (BlockedChatMessage & { kind?: "chatmsg" | "uenter" | "dgb" })[], at = Date.now()): void {
    for (const message of messages) {
      if (!this.#uids.has(message.uid)) continue;
      const delta = this.#pending.get(message.uid) ?? blank(message.uid);
      delta.count += 1;
      if (message.nickname) { delta.nickname = message.nickname.slice(0, 128); delta.nicknameAt = at; }
      delta.recent.unshift({ ...message, nickname: message.nickname.slice(0, 128), text: message.text.slice(0, 2048),
        at, id: `${this.#source}-${String(++this.#sequence).padStart(12, "0")}`, roomName: this.roomName(message.roomId) });
      delta.recent.length = Math.min(delta.recent.length, this.#limit);
      this.#pending.set(message.uid, delta);
    }
    if (messages.length) this.#schedule();
  }
  snapshot(): UserBlockHistoryEntry[] {
    return [...this.#uids].map((uid) => copy(mergeBlockHistory(
      mergeBlockHistory(this.#base.get(uid) ?? blank(uid), this.#inflight.get(uid) ?? blank(uid), this.#limit),
      this.#pending.get(uid) ?? blank(uid), this.#limit)));
  }
  #schedule(): void {
    this.status = "pending";
    if (!this.#persistence || this.#timer !== undefined) return;
    this.#timer = setTimeout(() => { this.#timer = undefined; void this.flush(); }, 1000);
  }
  async flush(): Promise<void> {
    if (this.#write) { await this.#write; return; }
    if (this.#timer !== undefined) { clearTimeout(this.#timer); this.#timer = undefined; }
    if (!this.#persistence || (!this.#pending.size && !this.#pendingRooms.size)) return;
    const deltas = this.#pending;
    const rooms = this.#pendingRooms;
    this.#pending = new Map(); this.#pendingRooms = new Map(); this.#inflight = deltas;
    this.#write = (async () => {
      try {
        const saved = await this.#persistence!.commit([...deltas.values()], [...rooms.values()]);
        for (const entry of saved) if (this.#uids.has(entry.uid)) this.#base.set(entry.uid, entry);
        this.status = this.#pending.size || this.#pendingRooms.size ? "pending" : "saved";
      } catch {
        for (const [uid, delta] of deltas) this.#pending.set(uid, mergeBlockHistory(delta, this.#pending.get(uid) ?? blank(uid), this.#limit));
        for (const [roomId, room] of rooms) if (!this.#pendingRooms.has(roomId)) this.#pendingRooms.set(roomId, room);
        this.status = "error";
      } finally {
        this.#inflight = new Map(); this.#write = null; this.#notify();
        if (this.status !== "error" && (this.#pending.size || this.#pendingRooms.size)) this.#schedule();
      }
    })();
    await this.#write;
  }
  async clear(uid: string): Promise<void> {
    await this.flush();
    await this.flush();
    if (this.status === "error") throw new Error("本地保存失败，请稍后重试");
    await this.#persistence?.clear(uid);
    const entry = this.#base.get(uid) ?? blank(uid);
    this.#base.set(uid, { ...entry, count: 0, recent: [] });
    if (!this.#persistence) this.#pending.delete(uid);
    this.#notify();
  }
  dispose(): void { if (this.#timer !== undefined) clearTimeout(this.#timer); this.#listeners.clear(); }
}

export function createBrowserUserBlockHistoryPersistence(windowObject: Window | null, databaseName = "douyu-web-enhancer:user-block-history", limit = 10): UserBlockHistoryPersistence {
  let opening: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { if (!windowObject?.indexedDB) throw new Error("本地存储不可用"); request = windowObject.indexedDB.open(databaseName, 1); }
    catch (error) { reject(error); return; }
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error("本地存储打开超时")); }, 2000);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("users", { keyPath: "uid" });
      request.result.createObjectStore("rooms", { keyPath: "roomId" });
    };
    request.onsuccess = () => { clearTimeout(timer); if (settled) { request.result.close(); return; } settled = true; request.result.onversionchange = () => { request.result.close(); opening = undefined; }; resolve(request.result); };
    request.onerror = request.onblocked = () => { clearTimeout(timer); settled = true; reject(request.error ?? new Error("本地存储被占用")); };
  }).catch((error: unknown) => { opening = undefined; throw error; });
  const complete = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("本地记录保存失败"));
  });
  return {
    async load(uids, roomIds) {
      const db = await open();
      const tx = db.transaction(["users", "rooms"], "readonly");
      const done = complete(tx);
      const users: UserBlockHistoryEntry[] = []; const rooms: BlockRoomInfo[] = [];
      for (const uid of uids) { const request = tx.objectStore("users").get(uid); request.onsuccess = () => { if (request.result) users.push(normalizeEntry(request.result, uid, limit)); }; }
      for (const roomId of roomIds) { const request = tx.objectStore("rooms").get(roomId); request.onsuccess = () => { if (request.result) rooms.push(request.result); }; }
      await done; return { users, rooms };
    },
    async commit(deltas, rooms) {
      const db = await open();
      const tx = db.transaction(["users", "rooms"], "readwrite");
      const done = complete(tx); const users = tx.objectStore("users"); const roomStore = tx.objectStore("rooms");
      const saved: UserBlockHistoryEntry[] = [];
      for (const delta of deltas) {
        if (!validUid(delta.uid)) continue;
        const request = users.get(delta.uid);
        request.onsuccess = () => { const entry = mergeBlockHistory(normalizeEntry(request.result, delta.uid, limit), delta, limit); users.put(entry); saved.push(entry); };
      }
      for (const room of rooms) {
        const request = roomStore.get(room.roomId);
        request.onsuccess = () => { if (!request.result || request.result.updatedAt <= room.updatedAt) roomStore.put(room); };
      }
      await done; return saved;
    },
    async clear(uid) {
      const db = await open(); const tx = db.transaction("users", "readwrite"); const done = complete(tx);
      const store = tx.objectStore("users"); const request = store.get(uid);
      request.onsuccess = () => { const entry = normalizeEntry(request.result, uid, limit); store.put({ ...entry, count: 0, recent: [] }); };
      await done;
    },
  };
}

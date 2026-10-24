import { parseRoomEvent, type RoomEvent } from "../core/room-messages.ts";
export const ROOM_EVENTS_OPTIONS_KEY = "douyu-web-enhancer:room-events-options";
export interface RoomEventOptions { record: boolean; remind: boolean }
export function parseRoomEventOptions(value: unknown): RoomEventOptions {
  const v = value as Partial<RoomEventOptions> | null;
  return { record: v?.record === true, remind: v?.remind === true };
}
export interface RoomEventEntry extends RoomEvent { id: string }
export interface RoomEventPersistence {
  load(): Promise<RoomEventEntry[]>;
  append(entries: readonly RoomEventEntry[]): Promise<RoomEventEntry[]>;
}
export class RoomEvents {
  #entries: RoomEventEntry[] = [];
  #pending: RoomEventEntry[] = [];
  #seen = new Map<string, number>();
  #write: Promise<void> | undefined;
  #disposed = false;
  status: "saved" | "pending" | "error" = "saved";
  readonly persistence: RoomEventPersistence;
  readonly changed: () => void;
  constructor(persistence: RoomEventPersistence, changed: () => void) { this.persistence=persistence;this.changed=changed; }
  get entries(): readonly RoomEventEntry[] { return this.#entries; }
  async load(): Promise<void> { try { this.#entries = (await this.persistence.load()).slice(0, 200); } catch { this.status = "error"; } }
  observe(packets: readonly string[], room: string | null, options: RoomEventOptions, remind: (event: RoomEvent) => void, at = Date.now()): void {
    if (this.#disposed || (!options.record && !options.remind)) return;
    let added = false;
    for (const packet of packets) {
      const event = parseRoomEvent(packet, room, at); if (!event) continue;
      const key = `${room}:${packet}`;
      const last = this.#seen.get(key);
      if (last !== undefined && at - last < 5000) continue;
      this.#seen.delete(key); this.#seen.set(key, at);
      if (this.#seen.size > 200) this.#seen.delete(this.#seen.keys().next().value!);
      if (options.record) {
        added = true;
        const entry = { ...event, id: crypto.randomUUID() };
        this.#pending.push(entry); this.#pending = this.#pending.slice(-200);
        this.#entries = [entry, ...this.#entries].slice(0, 200); this.status = "pending";
      }
      if (options.remind) remind(event);
    }
    if (added) void this.flush();
  }
  async flush(): Promise<void> {
    if (this.#write) return this.#write;
    if (!this.#pending.length) return;
    const batch = this.#pending; this.#pending = [];
    this.#write = (async () => {
      try {
        const saved = await this.persistence.append(batch);
        const merged = new Map([...saved, ...this.#pending].map(e => [e.id,e]));
        this.#entries = [...merged.values()].sort((a,b)=>b.at-a.at).slice(0,200);
        this.status = this.#pending.length ? "pending" : "saved";
      } catch { this.#pending = [...batch, ...this.#pending].slice(-200); this.status = "error"; }
      finally { this.#write = undefined; if (!this.#disposed) this.changed(); }
    })();
    await this.#write;
    if (this.#pending.length && this.status !== "error") await this.flush();
  }
  dispose(): void { this.#disposed = true; this.#seen.clear(); }
}
export function createRoomEventPersistence(window: Window | null): RoomEventPersistence {
  let opening: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => opening ??= new Promise((resolve,reject) => {
    if (!window?.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
    const request = window.indexedDB.open("douyu-web-enhancer:room-events",1);
    request.onupgradeneeded = () => request.result.createObjectStore("events",{keyPath:"id"});
    request.onerror = () => { opening = undefined; reject(request.error); };
    request.onsuccess = () => { const db=request.result; db.onversionchange=()=>{db.close();opening=undefined;};resolve(db); };
  });
  const transact = async (entries?: readonly RoomEventEntry[]): Promise<RoomEventEntry[]> => {
    const db=await open();
    return new Promise((resolve,reject) => {
      const tx=db.transaction("events",entries ? "readwrite" : "readonly"); const store=tx.objectStore("events");
      if (entries) for (const entry of entries) store.put(entry);
      let snapshot: RoomEventEntry[]=[];
      const read=store.getAll();
      read.onsuccess=()=>{const all=(read.result as RoomEventEntry[]).sort((a,b)=>b.at-a.at);snapshot=all.slice(0,200);if(entries)for(const item of all.slice(200))store.delete(item.id);};
      tx.oncomplete=()=>resolve(snapshot);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error ?? new Error("Transaction aborted"));
    });
  };
  return {load:()=>transact(),append:entries=>transact(entries)};
}

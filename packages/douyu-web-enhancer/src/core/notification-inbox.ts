export type FollowNoticeKind = "chatmsg" | "uenter" | "dgb";
export type FollowNoticeMode = "off" | "toast" | "pending";
export type FollowUnreadOverrides = Readonly<Record<string, Partial<Record<FollowNoticeKind, FollowNoticeMode>>>>;
const validMode = (value: unknown): value is FollowNoticeMode => value === "off" || value === "toast" || value === "pending";
export interface NoticeRecord {
  id: string; at: number; title: string; text: string; source: "general" | "follow" | "room";
  uid?: string; roomId?: string; kind?: FollowNoticeKind; nickname?: string; read: boolean;
}
export const INBOX_KEY = "douyu-web-enhancer:notification-inbox";
export type NoticeSource = NoticeRecord["source"];
export const DEFAULT_UNREAD_PREFERENCES: Record<NoticeSource, boolean> = {general:false,follow:true,room:true};
const RETENTION = 7 * 86400_000;
export class NotificationInbox {
  #entries: NoticeRecord[] = [];
  #sequence = 0;
  #followOverrides: Record<string, Partial<Record<FollowNoticeKind, FollowNoticeMode>>> = {};
  #followDefaults: Record<FollowNoticeKind, FollowNoticeMode> = {chatmsg:"pending",uenter:"pending",dgb:"pending"};
  #hasFollowDefaults = false;
  get followDefaults(): Readonly<Record<FollowNoticeKind, FollowNoticeMode>> { return {...this.#followDefaults}; }
  migrateFollowDefaults(legacy: Record<FollowNoticeKind, boolean>): void {
    if (this.#hasFollowDefaults) return;
    for (const kind of ["chatmsg","uenter","dgb"] as const) this.#followDefaults[kind] = legacy[kind] ? (this.#preferences.follow ? "pending" : "toast") : "off";
    for (const rules of Object.values(this.#followOverrides)) for (const kind of ["chatmsg","uenter","dgb"] as const) if (!legacy[kind] && rules[kind] !== undefined) rules[kind] = "off";
    this.#hasFollowDefaults = true; this.#save();
  }
  setFollowDefault(kind: FollowNoticeKind, mode: FollowNoticeMode): void { this.#followDefaults[kind] = mode; this.#hasFollowDefaults = true; this.#save(); }
  followMode(uid: string, kind: FollowNoticeKind): FollowNoticeMode { return this.#followOverrides[uid]?.[kind] ?? this.#followDefaults[kind]; }
  followsKind(kind: FollowNoticeKind): boolean { return this.#followDefaults[kind] !== "off" || Object.values(this.#followOverrides).some(rules => rules[kind] !== undefined && rules[kind] !== "off"); }
  get followOverrides(): FollowUnreadOverrides { return Object.fromEntries(Object.entries(this.#followOverrides).map(([uid, rules]) => [uid, {...rules}])); }
  setFollowUnread(uid: string, kind: FollowNoticeKind, enabled: FollowNoticeMode | boolean | null): void {
    if (!/^[1-9]\d{0,19}$/.test(uid)) throw new Error("用户 UID 无效");
    if (!(uid in this.#followOverrides) && enabled !== null && Object.keys(this.#followOverrides).length >= 1000) throw new Error("最多保存 1000 位用户的未读设置，请先恢复不用的设置为默认");
    const rules = {...this.#followOverrides[uid]};
    if (enabled === null) delete rules[kind]; else rules[kind] = typeof enabled === "boolean" ? (enabled ? "pending" : "toast") : enabled;
    if (Object.keys(rules).length) this.#followOverrides[uid] = rules; else delete this.#followOverrides[uid];
    this.#save();
  }
  resetFollowUnread(uid: string): void { if (uid in this.#followOverrides) { delete this.#followOverrides[uid]; this.#save(); } }
  retainsUnread(entry: Pick<NoticeRecord, "source" | "uid" | "kind">): boolean {
    if (entry.source === "follow" && entry.uid && entry.kind) return this.followMode(entry.uid, entry.kind) === "pending";
    return this.#preferences[entry.source];
  }
  #preferences = {...DEFAULT_UNREAD_PREFERENCES};
  get preferences(): Readonly<Record<NoticeSource, boolean>> { return {...this.#preferences}; }
  setRetainUnread(source: NoticeSource, enabled: boolean): void { this.#preferences[source] = enabled; this.#save(); }
  status: "saved" | "error" = "saved";
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  readonly changed: () => void;
  readonly now: () => number;
  constructor(storage: Pick<Storage, "getItem" | "setItem"> | null, changed: () => void, now = Date.now) {
    this.storage = storage; this.changed = changed; this.now = now;
    try {
      const raw: unknown = JSON.parse(storage?.getItem(INBOX_KEY) ?? "[]");
      const saved = raw as {entries?: unknown; preferences?: Partial<Record<NoticeSource, unknown>>; followOverrides?: unknown; followDefaults?: unknown};
      const entries = Array.isArray(raw) ? raw : saved?.entries;
      if (!Array.isArray(entries)) throw new Error("Invalid inbox");
      for (const source of ["general","follow","room"] as const) if (typeof saved?.preferences?.[source] === "boolean") this.#preferences[source] = saved.preferences[source] as boolean;
      if (saved?.followDefaults && typeof saved.followDefaults === "object" && ["chatmsg","uenter","dgb"].every(kind => validMode((saved.followDefaults as Record<string, unknown>)[kind]))) {
        this.#followDefaults = {...saved.followDefaults as Record<FollowNoticeKind, FollowNoticeMode>}; this.#hasFollowDefaults = true;
      }
      if (saved?.followOverrides && typeof saved.followOverrides === "object" && !Array.isArray(saved.followOverrides)) {
        for (const [uid, rawRules] of Object.entries(saved.followOverrides).slice(0,1000)) {
          if (!/^[1-9]\d{0,19}$/.test(uid) || !rawRules || typeof rawRules !== "object") continue;
          const rules: Partial<Record<FollowNoticeKind, FollowNoticeMode>> = {};
          for (const kind of ["chatmsg", "uenter", "dgb"] as const) {
            const value = (rawRules as Record<string, unknown>)[kind];
            if (validMode(value)) rules[kind] = value;
            else if (typeof value === "boolean") rules[kind] = value ? "pending" : "toast";
          }
          if (Object.keys(rules).length) this.#followOverrides[uid] = rules;
        }
      }
      this.#entries = entries.filter((v): v is NoticeRecord => Boolean(v && typeof v.id === "string" && Number.isFinite(v.at) && typeof v.title === "string" && typeof v.text === "string" && ["general", "follow", "room"].includes(v.source) && typeof v.read === "boolean"));
      if (this.#prune()) this.#save();
      if (!storage) this.status = "error";
    } catch { this.status = "error"; }
  }
  #prune(): boolean {
    const before = this.#entries.length;
    this.#entries = this.#entries.filter(e => e.at > this.now() - RETENTION && e.at <= this.now()).slice(0, 500);
    return before !== this.#entries.length;
  }
  #save(): void {
    try { if (!this.storage) throw new Error("Storage unavailable"); this.storage.setItem(INBOX_KEY, JSON.stringify({entries:this.#entries,preferences:this.#preferences,followOverrides:this.#followOverrides,...(this.#hasFollowDefaults ? {followDefaults:this.#followDefaults}:{})})); this.status = "saved"; }
    catch { this.status = "error"; }
    this.changed();
  }
  snapshot(): readonly NoticeRecord[] { if (this.#prune()) this.#save(); return this.#entries.map(e => ({...e})); }
  unread(uid?: string): number { return this.snapshot().filter(e => !e.read && (uid === undefined || (e.source === "follow" && e.uid === uid))).length; }
  add(entry: Omit<NoticeRecord, "id" | "at" | "read">, pending = this.retainsUnread(entry)): void {
    this.#entries.unshift({...entry, id: `${this.now()}-${++this.#sequence}-${Math.random().toString(36).slice(2)}`, at: this.now(), read: !pending});
    this.#prune(); this.#save();
  }
  markManyRead(ids: readonly string[]): void {
    const selected = new Set(ids);
    let changed = false;
    for (const entry of this.#entries) if (!entry.read && selected.has(entry.id)) {entry.read = true;changed = true;}
    if (changed) this.#save();
  }
  markAllRead(source?: NoticeSource): void {
    this.#prune();
    let changed = false;
    for (const entry of this.#entries) if (!entry.read && (!source || entry.source === source)) { entry.read = true; changed = true; }
    if (changed) this.#save();
  }
  markRead(id: string): void { const entry = this.#entries.find(e => e.id === id); if (entry && !entry.read) { entry.read = true; this.#save(); } }
  markUserRead(uid: string): void { let changed = false; for (const e of this.#entries) if (e.source === "follow" && e.uid === uid && !e.read) { e.read = true; changed = true; } if (changed) this.#save(); }
}

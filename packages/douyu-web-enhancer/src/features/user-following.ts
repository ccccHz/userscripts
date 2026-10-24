import type { DouyuUserMessage } from "../core/douyu-user-messages.ts";
import { validUid, type UserBlockRule } from "./user-blocking.ts";

export const USER_FOLLOWING_KEY = "douyu-web-enhancer:user-following";
export interface UserFollowingState {
  schemaVersion: 1;
  chatsEnabled: boolean;
  entriesEnabled: boolean;
  giftsEnabled: boolean;
  chatReminders: boolean;
  entryReminders: boolean;
  giftReminders: boolean;
  speedEnabled: boolean;
  uids: string[];
}
export const DEFAULT_USER_FOLLOWING_STATE: UserFollowingState = {
  schemaVersion: 1, chatsEnabled: false, entriesEnabled: false, giftsEnabled: false, chatReminders: false, entryReminders: false, giftReminders: false, speedEnabled: false, uids: [],
};
export function normalizeUserFollowingState(value: unknown): UserFollowingState {
  const empty = () => structuredClone(DEFAULT_USER_FOLLOWING_STATE);
  if (!value || typeof value !== "object") return empty();
  const source = value as Partial<UserFollowingState>;
  if (source.schemaVersion !== 1 || !Array.isArray(source.uids) || source.uids.length > 500
    || source.uids.some(uid => typeof uid !== "string" || !validUid(uid))) return empty();
  return { schemaVersion: 1, chatsEnabled: source.chatsEnabled === true, entriesEnabled: source.entriesEnabled === true,
    giftsEnabled: source.giftsEnabled === true, chatReminders: source.chatReminders === true, entryReminders: source.entryReminders === true, giftReminders: source.giftReminders === true,
    speedEnabled: source.speedEnabled === true, uids: [...new Set(source.uids)] };
}
export function changeUserFollow(state: UserFollowingState, uid: string, add: boolean): UserFollowingState {
  if (!validUid(uid)) throw new Error("无法识别用户 UID");
  if (!add) return { ...state, uids: state.uids.filter(value => value !== uid) };
  if (!state.uids.includes(uid) && state.uids.length >= 500) throw new Error("最多关注 500 位用户");
  return { ...state, chatsEnabled: true, uids: state.uids.includes(uid) ? state.uids : [...state.uids, uid] };
}
export function followHistoryRules(state: UserFollowingState): UserBlockRule[] {
  return state.uids.map(uid => ({ uid, roomId: null }));
}
export function selectFollowedMessages(state: UserFollowingState, roomId: string | null, messages: readonly DouyuUserMessage[]): DouyuUserMessage[] {
  if (!roomId) return [];
  const uids = new Set(state.uids);
  return messages.filter(message => message.roomId === roomId && uids.has(message.uid)
    && (message.kind === "chatmsg" ? state.chatsEnabled || state.chatReminders : message.kind === "uenter" ? state.entriesEnabled || state.entryReminders : state.giftsEnabled || state.giftReminders));
}

/** Only observed behaviour affects ranking; nickname lookups and marking read do not. */
export function sortFollowingByRecentActivity(uids: readonly string[], history: readonly { uid: string; recent: readonly { at: number }[] }[]): string[] {
  const lastAt = new Map(history.map(entry => [entry.uid, entry.recent.reduce((latest, sample) => Number.isFinite(sample.at) ? Math.max(latest, sample.at) : latest, 0)]));
  return [...uids].sort((a, b) => (lastAt.get(b) ?? 0) - (lastAt.get(a) ?? 0));
}

export function shouldRemindUser(state: UserFollowingState, message: DouyuUserMessage): boolean {
  return state.uids.includes(message.uid) && (message.kind === "chatmsg" ? state.chatReminders : message.kind === "uenter" ? state.entryReminders : state.giftReminders);
}

export interface ChatSpeedSnapshot { roomId: string | null; count: number; observedSeconds: number; enabled: boolean; instantRate: number | null; averageRate: number | null }
/** At most 60 second buckets, never a retained chat log or a per-message timer. */
export class ChatSpeedWindow {
  #roomId: string | null = null;
  #enabled = false;
  #startedAt = 0;
  readonly #buckets = new Map<number, number>();
  configure(enabled: boolean, roomId: string | null, now = Date.now()): void {
    if (this.#enabled === enabled && this.#roomId === roomId) return;
    this.#enabled = enabled; this.#roomId = roomId; this.#startedAt = now; this.#buckets.clear();
  }
  record(messages: readonly DouyuUserMessage[], now = Date.now()): void {
    if (!this.#enabled || !this.#roomId) return;
    const count = messages.filter(message => message.kind === "chatmsg" && message.roomId === this.#roomId).length;
    const second = Math.floor(now / 1000);
    this.#prune(second);
    if (count) this.#buckets.set(second, (this.#buckets.get(second) ?? 0) + count);
  }
  #prune(second: number): void {
    for (const key of this.#buckets.keys()) if (key <= second - 60 || key > second) this.#buckets.delete(key);
  }
  snapshot(now = Date.now()): ChatSpeedSnapshot {
    const second = Math.floor(now / 1000);
    this.#prune(second);
    const elapsed = this.#enabled ? Math.max(0, (now - this.#startedAt) / 1000) : 0;
    let count = 0, recent = 0;
    for (const [key, value] of this.#buckets) { count += value; if (key > second - 5) recent += value; }
    const ready = this.#enabled && this.#roomId !== null && elapsed >= 1;
    return { roomId: this.#roomId, count, observedSeconds: Math.min(60, Math.floor(elapsed)), enabled: this.#enabled,
      instantRate: ready ? Math.round(recent * 60 / Math.min(5, elapsed)) : null,
      averageRate: ready ? Math.round(count * 60 / Math.min(60, elapsed)) : null };
  }
}

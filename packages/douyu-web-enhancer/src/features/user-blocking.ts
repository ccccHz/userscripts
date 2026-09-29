export const USER_BLOCKING_KEY = "douyu-web-enhancer:user-blocking";
export const USER_BLOCKING_ID = "user-blocking";
export const MAX_USER_BLOCK_RULES = 500;

export interface UserBlockRule {
  uid: string;
  /** null applies to every room the user visits. */
  roomId: string | null;
}

export interface UserBlockingState {
  schemaVersion: 1;
  enabled: boolean;
  rules: UserBlockRule[];
}

export const DEFAULT_USER_BLOCKING_STATE: UserBlockingState = {
  schemaVersion: 1,
  enabled: false,
  rules: [],
};

export function validUid(value: string): boolean {
  return /^[1-9]\d{0,19}$/.test(value);
}

export function validRoomId(value: string): boolean {
  return /^[1-9]\d{0,11}$/.test(value);
}

export function normalizeUserBlockingState(value: unknown): UserBlockingState {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_USER_BLOCKING_STATE);
  const source = value as Partial<UserBlockingState>;
  if (source.schemaVersion !== 1 || typeof source.enabled !== "boolean" || !Array.isArray(source.rules)
    || source.rules.length > MAX_USER_BLOCK_RULES) return structuredClone(DEFAULT_USER_BLOCKING_STATE);
  const seen = new Set<string>();
  const rules: UserBlockRule[] = [];
  for (const item of source.rules) {
    if (!item || typeof item !== "object" || typeof item.uid !== "string" || !validUid(item.uid)
      || (item.roomId !== null && (typeof item.roomId !== "string" || !validRoomId(item.roomId)))) {
      return structuredClone(DEFAULT_USER_BLOCKING_STATE);
    }
    const key = `${item.roomId ?? "*"}:${item.uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({ uid: item.uid, roomId: item.roomId });
  }
  return { schemaVersion: 1, enabled: source.enabled, rules };
}

export function addUserBlockRule(state: UserBlockingState, uid: string, roomId: string | null): UserBlockingState {
  const normalizedUid = uid.trim();
  if (!validUid(normalizedUid)) throw new Error("用户 UID 必须是非 0 开头、最多 20 位的正整数");
  if (roomId !== null && !validRoomId(roomId)) throw new Error("房间号必须是非 0 开头、最多 12 位的正整数");
  if (state.rules.some((rule) => rule.uid === normalizedUid && rule.roomId === roomId)) return state;
  if (state.rules.length >= MAX_USER_BLOCK_RULES) throw new Error(`最多保存 ${MAX_USER_BLOCK_RULES} 条屏蔽规则`);
  return { ...state, rules: [...state.rules, { uid: normalizedUid, roomId }] };
}

export function removeUserBlockRule(state: UserBlockingState, uid: string, roomId: string | null): UserBlockingState {
  return { ...state, rules: state.rules.filter((rule) => rule.uid !== uid || rule.roomId !== roomId) };
}

export function shouldBlockUser(state: UserBlockingState, currentRoomId: string | null, uid: string, messageRoomId: string): boolean {
  return state.enabled && currentRoomId !== null && messageRoomId === currentRoomId
    && state.rules.some((rule) => rule.uid === uid && (rule.roomId === null || rule.roomId === currentRoomId));
}

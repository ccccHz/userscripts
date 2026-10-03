export const PREFERENCE_PREFIX = "douyin-live-optimizer:player:v1:";
export const PLAYER_PREFERENCES = {
  giftEffects: { label: "礼物特效", on: "始终屏蔽", off: "始终显示" },
  danmakuFilters: { label: "送礼信息与福袋口令", on: "始终隐藏", off: "始终显示" },
  danmakuEnabled: { label: "画面弹幕", on: "始终开启", off: "始终关闭" },
  audio: { label: "声音与音量", on: "保持有声", off: "保持静音" },
  quality: { label: "清晰度", on: "始终选择最高" },
  webFullscreen: { label: "网页全屏", on: "始终进入", off: "始终退出" },
  chatCollapsed: { label: "右侧聊天栏", on: "始终收起", off: "始终展开" },
};

export function validPlayerState(key, state) {
  if (key === "audio") return state && typeof state.muted === "boolean" &&
    Number.isFinite(state.volume) && state.volume >= 0 && state.volume <= 1;
  if (key === "quality") return ["auto", "ld", "sd", "hd", "uhd", "origin"].includes(state);
  if (key === "danmakuFilters") return state && typeof state.gift === "boolean" && typeof state.lucky === "boolean";
  return Object.hasOwn(PLAYER_PREFERENCES, key) && typeof state === "boolean";
}

// Each feature has its own record: two tabs editing different features cannot
// overwrite each other's modes or remembered states with a stale full snapshot.
export function createPlayerPreferenceStore({ storage, eventTarget, legacy = {}, logger = console } = {}) {
  const listeners = new Set();
  let persisted = Boolean(storage);
  const records = {};
  function fallback(key) {
    const state = key === "giftEffects" ? legacy.giftEffects ?? true : key === "danmakuFilters"
      ? { gift: legacy.danmakuFilters === false, lucky: legacy.danmakuFilters === false } : null;
    return { mode: "remember", state };
  }
  function read(key) {
    if (!persisted && records[key]) return structuredClone(records[key]);
    try {
      const record = JSON.parse(storage?.getItem(PREFERENCE_PREFIX + key) || "null");
      const modes = PLAYER_PREFERENCES[key].off ? ["on", "off", "remember", "unmanaged"] : ["on", "remember", "unmanaged"];
      return record && modes.includes(record.mode)
        ? { mode: record.mode, state: validPlayerState(key, record.state) ? record.state : null } : fallback(key);
    } catch (error) {
      if (!(error instanceof SyntaxError)) persisted = false;
      return records[key] ? structuredClone(records[key]) : fallback(key);
    }
  }
  for (const key of Object.keys(PLAYER_PREFERENCES)) records[key] = read(key);
  function emit(key, origin) { listeners.forEach((fn) => fn(key, get(key), origin)); }
  function get(key) { return structuredClone(records[key]); }
  function write(key, record, origin) {
    if (JSON.stringify(records[key]) === JSON.stringify(record)) return;
    // Merge with the most recent record before changing only the requested field.
    records[key] = record;
    try {
      if (!storage) throw new Error("Storage unavailable");
      storage.setItem(PREFERENCE_PREFIX + key, JSON.stringify(record));
      persisted = true;
    } catch {
      persisted = false;
      logger.warn?.("userscript: douyin player preferences apply only to this page");
    }
    emit(key, origin);
  }
  const onStorage = (event) => {
    for (const key of Object.keys(records)) {
      if (event.key !== null && event.key !== PREFERENCE_PREFIX + key) continue;
      const next = read(key);
      if (JSON.stringify(next) === JSON.stringify(records[key])) continue;
      records[key] = next;
      emit(key, "external");
    }
  };
  eventTarget?.addEventListener("storage", onStorage);
  return {
    get,
    isPersisted: () => persisted,
    setMode(key, mode) {
      if (!Object.hasOwn(records, key) || !["on", "off", "remember", "unmanaged"].includes(mode) ||
        (mode === "off" && !PLAYER_PREFERENCES[key].off)) return;
      write(key, { ...read(key), mode }, "mode");
    },
    remember(key, state) {
      if (!Object.hasOwn(records, key) || !validPlayerState(key, state)) return;
      const latest = read(key);
      if (latest.mode !== "remember") return;
      write(key, { ...latest, state: structuredClone(state) }, "capture");
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    destroy() { eventTarget?.removeEventListener("storage", onStorage); listeners.clear(); },
  };
}

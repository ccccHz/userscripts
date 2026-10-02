export const SETTINGS_KEY = "douyin-live-optimizer:settings:v1";

export const SETTING_GROUPS = [
  { name: "礼物与页面", items: [
    { key: "giftEffects", label: "屏蔽礼物特效", hint: "使用播放器原生开关；关闭后恢复特效。" },
    { key: "bottomLayout", label: "隐藏底部礼物与游戏栏" },
    { key: "wishPopups", label: "隐藏心愿与展馆提示" },
    { key: "commerceAds", label: "隐藏电商广告与小黄车" },
  ] },
  { name: "弹幕", items: [
    { key: "danmakuFilters", label: "隐藏送礼信息与福袋口令", hint: "关闭后恢复这两类弹幕；保留普通弹幕。" },
  ] },
  { name: "播放", items: [
    { key: "audio", label: "播放器初次就绪时开启声音", hint: "保留随后手动静音；关闭只停止自动处理。" },
    { key: "quality", label: "自动选择最高画质", hint: "关闭后保留当前画质；下次进房不再自动选择。" },
    { key: "playbackResume", label: "返回页面时恢复无操作暂停", hint: "只处理无操作暂停提示，不覆盖手动暂停。" },
  ] },
];
export const DEFAULT_SETTINGS = Object.freeze(Object.fromEntries(
  SETTING_GROUPS.flatMap((group) => group.items.map(({ key }) => [key, true])),
));

export function createSettingsStore({ storage, eventTarget, logger = console } = {}) {
  const listeners = new Set();
  let persisted = Boolean(storage);
  let values = read();

  function read() {
    try {
      const saved = JSON.parse(storage?.getItem(SETTINGS_KEY) || "{}");
      return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) =>
        [key, typeof saved?.[key] === "boolean" ? saved[key] : fallback],
      ));
    } catch (error) {
      if (!(error instanceof SyntaxError)) persisted = false;
      return { ...DEFAULT_SETTINGS };
    }
  }
  function emit(changed) {
    for (const listener of listeners) listener({ ...values }, changed, persisted);
  }
  const onStorage = (event) => {
    if (event.key !== SETTINGS_KEY && event.key !== null) return;
    const next = read();
    const changed = Object.keys(values).filter((key) => values[key] !== next[key]);
    values = next;
    if (changed.length) emit(changed);
  };
  eventTarget?.addEventListener("storage", onStorage);
  return {
    get: () => ({ ...values }),
    isPersisted: () => persisted,
    set(key, value) {
      if (!(key in DEFAULT_SETTINGS) || typeof value !== "boolean" || values[key] === value) return;
      values = { ...values, [key]: value };
      try {
        if (!storage) throw new Error("Storage unavailable");
        storage.setItem(SETTINGS_KEY, JSON.stringify(values));
        persisted = true;
      } catch {
        persisted = false;
        logger.warn?.("userscript: douyin settings apply only to this page; storage unavailable");
      }
      emit([key]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      eventTarget?.removeEventListener("storage", onStorage);
      listeners.clear();
    },
  };
}

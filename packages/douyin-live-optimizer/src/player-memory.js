import { readAudio, readChatCollapsed, readGiftBlocked, readWebFullscreen, setAudio, setChatCollapsed, setWebFullscreen } from "./native-controls.js";
import { ensureQuality, readQuality, findBestQualityOption, getQualityText } from "./quality.js";
import { ensureGiftEffectsBlocked } from "./gift-effects.js";
import { ensureDanmakuEnabled, ensureDanmakuFiltersDisabled, readDanmakuEnabled, readDanmakuFilters } from "./danmaku-settings.js";
import { sleep, throwIfAborted, waitFor } from "./task.js";

export function createPlayerMemory({ document, window, preferences, reapply, cancelKeys = () => {}, onResult = () => {}, sleepFn = sleep, withMenu = (signal, action) => action() }) {
  let scope = null;
  let epoch = 0;
  const applying = new Map();
  const timers = new Set();
  const intent = new Set();
  function read(key) {
    if (!scope) return null;
    try {
      return key === "audio" ? readAudio(scope.video) : key === "quality" ? readQuality(document)
        : key === "giftEffects" ? readGiftBlocked(document) : key === "danmakuFilters" ? readDanmakuFilters(document)
          : key === "danmakuEnabled" ? readDanmakuEnabled(document) : key === "webFullscreen" ? readWebFullscreen(document)
            : key === "chatCollapsed" ? readChatCollapsed(document) : null;
    } catch { return null; }
  }
  function capture(keys) {
    for (const key of keys) {
      if (applying.has(key) || !scope) continue;
      const policy = preferences.get(key);
      const state = read(key);
      if (state === null) continue;
      if (policy.mode === "remember") preferences.remember(key, state);
      else if (policy.mode !== "unmanaged") {
        const on = policy.mode === "on";
        const matches = key === "audio" ? state.muted === !on && (!on || state.volume > 0)
          : key === "quality" ? getQualityText(findBestQualityOption(document.querySelector('[data-e2e="quality-selector"]')))
            === getQualityText(document.querySelector('[data-e2e="quality"]'))
            : key === "danmakuFilters" ? state.gift === !on && state.lucky === !on : state === on;
        if (!matches) reapply([key]);
      }
      if (key === "webFullscreen" && state === true) reapply(["chatCollapsed"]);
    }
  }
  function later(action, delay) {
    const token = window.setTimeout(() => { timers.delete(token); action(); }, delay);
    timers.add(token);
  }
  function rememberIntent(keys) {
    if (!scope) return;
    keys.forEach((key) => intent.add(key));
    // A fixed number of reads covers native transitions without polling forever.
    // Keep the last stable result; an unresolved native switch is never guessed.
    const currentEpoch = epoch;
    for (const delay of [100, 400, 1000]) later(() => {
      if (epoch === currentEpoch) capture(keys);
    }, delay);
    later(() => { if (epoch === currentEpoch) keys.forEach((key) => intent.delete(key)); }, 1500);
  }
  function onUserAction(event) {
    if (!event.isTrusted || event.composedPath?.().some((n) => n?.hasAttribute?.("data-douyin-live-optimizer-panel"))) return;
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    const keys = [];
    if (target?.closest('[data-e2e="quality-selector"], [data-e2e="quality"], .QualitySwitchNewPlugin')) keys.push("quality");
    if (target?.closest('.douyin-player-volume, .xgplayer-volume')) keys.push("audio");
    if (target?.closest('#chatroom .KH9DQgyz, #chatroom .chatroom_close, .chat_room_fold')) keys.push("chatCollapsed");
    if (target?.closest('[data-e2e="gift-setting"], [data-e2e="effect-switch"]')) keys.push("giftEffects");
    let filterRow = target;
    let hasFilterLabel = false;
    for (let depth = 0; filterRow && depth < 4; depth++, filterRow = filterRow.parentElement) {
      const text = filterRow.textContent || "";
      if (text.length < 80 && /送礼信息|福袋口令|开启弹幕|弹幕开关/.test(text)) hasFilterLabel = true;
    }
    if (target?.closest('[data-e2e="danmaku-setting-icon"], [data-e2e="danmaku-switch"]') || hasFilterLabel) {
      keys.push("danmakuFilters", "danmakuEnabled");
    }
    if (target?.closest('.douyin-player-controls-right slot[data-index="2"], xg-icon.xgplayer-page-full-screen')) keys.push("webFullscreen");
    if (event.type === "keydown" && !target?.closest('input,textarea,[contenteditable="true"]')) {
      if (["ArrowUp", "ArrowDown", "m", "M"].includes(event.key)) keys.push("audio");
      if (["y", "Y"].includes(event.key)) keys.push("webFullscreen");
      if (["b", "B"].includes(event.key)) keys.push("danmakuEnabled");
    }
    if (keys.length) {
      const unique = [...new Set(keys)];
      // A real choice made during startup outranks an old remembered value.
      cancelKeys(unique.filter((key) => preferences.get(key).mode === "remember"));
      rememberIntent(unique);
    }
  }
  function volumeChanged() { if (intent.has("audio")) capture(["audio"]); }
  for (const type of ["click", "pointerup", "keydown"]) document.addEventListener(type, onUserAction, true);
  return {
    begin(next) {
      epoch++;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear(); intent.clear(); applying.clear();
      scope?.video?.removeEventListener?.("volumechange", volumeChanged);
      scope = next;
      scope?.video?.addEventListener?.("volumechange", volumeChanged);
    },
    async apply(key, { signal }) {
      const policy = preferences.get(key);
      if (!scope || policy.mode === "unmanaged") return { applied: true, method: "unmanaged" };
      const ownEpoch = epoch;
      const token = { key };
      // Set membership is guarded by epoch so an old canceled task cannot
      // release the new scope's restoration barrier.
      applying.set(key, token);
      try {
        if (policy.mode === "remember" && policy.state === null) {
          await sleepFn(300, signal);
          const inspection = key === "danmakuEnabled" ? await withMenu(signal, () => ensureDanmakuEnabled({ document, signal, sleepFn })) : null;
          const found = inspection?.applied ? { state: inspection.state } : await waitFor(() => {
            const state = read(key);
            return state === null ? null : { state };
          }, { signal, attempts: 80, sleepFn });
          if (!found) return { applied: false, method: "unavailable" };
          throwIfAborted(signal);
          preferences.remember(key, found.state);
          onResult(key, { method: "remembered" });
          return { applied: true, method: "remembered" };
        }
        const on = policy.mode === "on";
        const state = policy.mode === "remember" ? policy.state : key === "audio"
          ? { muted: !on, volume: readAudio(scope.video)?.volume || 0.5 }
          : key === "danmakuFilters" ? { gift: !on, lucky: !on } : on;
        throwIfAborted(signal);
        let result;
        if (key === "audio") {
          const ready = await waitFor(() => scope.video.readyState === undefined || scope.video.readyState > 0, { signal, attempts: 80, sleepFn });
          if (!ready) return { applied: false };
          throwIfAborted(signal);
          result = setAudio(scope.video, state);
        }
        else if (key === "quality") result = await ensureQuality({ document, signal, requested: policy.mode === "remember" ? state : undefined, withMenu: (action) => withMenu(signal, action) });
        else if (key === "giftEffects") result = await ensureGiftEffectsBlocked({ document, signal, blocked: state, withMenu: (action) => withMenu(signal, action) });
        else if (key === "danmakuFilters") result = await withMenu(signal, () => ensureDanmakuFiltersDisabled({ document, signal, states: state }));
        else if (key === "danmakuEnabled") result = await withMenu(signal, () => ensureDanmakuEnabled({ document, signal, enabled: state }));
        else if (key === "webFullscreen") result = await setWebFullscreen({ document, signal, enabled: state });
        else if (key === "chatCollapsed") result = await setChatCollapsed({ document, signal, collapsed: state });
        throwIfAborted(signal);
        onResult(key, result);
        return result;
      } finally {
        if (ownEpoch === epoch && applying.get(key) === token) applying.delete(key);
      }
    },
    destroy() {
      this.begin(null);
      for (const type of ["click", "pointerup", "keydown"]) document.removeEventListener(type, onUserAction, true);
    },
  };
}

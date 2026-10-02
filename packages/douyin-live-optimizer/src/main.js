import { GM_registerMenuCommand } from "$";
import { ensurePlayerAudioOnOpen } from "./audio.js";
import { ensureDanmakuFiltersDisabled } from "./danmaku-settings.js";
import { ensureGiftEffectsBlocked } from "./gift-effects.js";
import { createSettingsPanel } from "./panel.js";
import { registerPlaybackResumeEvents } from "./playback-resume.js";
import { ensureHighestQuality } from "./quality.js";
import { createRuntimeController, getPlayerScope, registerLifecycleEvents, isLiveLocation, samePlayerScope } from "./runtime.js";
import { createSettingsStore } from "./settings.js";
import { sleep, throwIfAborted } from "./task.js";
import { createVisibilityController } from "./visibility.js";

// @sandbox raw requests the page realm; native player expandos and history
// wrappers must also be checked in the actual installed userscript.
const INSTANCE_KEY = "__douyinLiveOptimizerRuntimeV1";

export function startOptimizer({ document, window, history, registerMenuCommand } = {}) {
  let storage;
  try { storage = window.localStorage; } catch { /* Settings still work in memory. */ }
  const settingsStore = createSettingsStore({ storage, eventTarget: window });
  let visibility;
  let currentScope;
  let menuBusy = false;
  let menuQueue = Promise.resolve();
  const checkedAudioVideos = new WeakSet();
  let panel;
  let resume;

  function updateVisibility() {
    if (!settingsStore.get().playbackResume) resume?.cancel();
    if (!visibility) return;
    const values = settingsStore.get();
    // Temporarily restore a hidden toolbar while operating its native settings.
    visibility.update({ ...values, bottomLayout: values.bottomLayout && !menuBusy });
  }
  function withPlayerMenu(signal, action) {
    const result = menuQueue.catch(() => {}).then(async () => {
      throwIfAborted(signal);
      menuBusy = true;
      updateVisibility();
      try {
        await sleep(250, signal);
        return await action();
      } finally {
        menuBusy = false;
        updateVisibility();
      }
    });
    menuQueue = result;
    return result;
  }

  const runtime = createRuntimeController({
    getScope: () => getPlayerScope(document, window.location),
    settingsStore,
    onScope(scope) {
      resume?.cancel();
      currentScope = scope;
      visibility?.destroy();
      visibility = scope ? createVisibilityController({ document, MutationObserver: window.MutationObserver }) : null;
    },
    onSettings: updateVisibility,
    onStatus: (key, status) => panel?.setStatus(key, status),
    runFeature(key, { scope, value, signal: taskSignal }) {
      const signal = {
        get aborted() {
          const current = getPlayerScope(document, window.location);
          return taskSignal.aborted || !samePlayerScope(current, scope);
        },
        addEventListener: taskSignal.addEventListener.bind(taskSignal),
        removeEventListener: taskSignal.removeEventListener.bind(taskSignal),
      };
      if (key === "giftEffects") return withPlayerMenu(signal, () =>
        ensureGiftEffectsBlocked({ document, signal, blocked: value }),
      );
      if (key === "danmakuFilters") return withPlayerMenu(signal, () =>
        ensureDanmakuFiltersDisabled({ document, signal, disabled: value }),
      );
      if (key === "quality") return withPlayerMenu(signal, () => ensureHighestQuality({ document, signal }));
      if (key === "audio") {
        if (checkedAudioVideos.has(scope.video)) return { buttonFound: true, clicked: false };
        const playerDocument = {
          querySelector(selector) {
            return selector === "video" ? scope.video : scope.player?.querySelector(selector);
          },
        };
        return ensurePlayerAudioOnOpen({ document: playerDocument, signal }).then((result) => {
          if (result.buttonFound) checkedAudioVideos.add(scope.video);
          return result;
        });
      }
    },
  });
  panel = createSettingsPanel({ document, window, settingsStore, retry: runtime.retry, registerMenuCommand });
  const stopLifecycle = registerLifecycleEvents({
    document, window, history, refresh: runtime.refresh,
    refreshLayout: () => { runtime.refresh(); visibility?.refresh(); },
  });
  resume = registerPlaybackResumeEvents({
    document, window,
    isEnabled: () => Boolean(currentScope) && isLiveLocation(window.location) && settingsStore.get().playbackResume,
  });
  return {
    openSettings: panel.open,
    destroy() {
      stopLifecycle();
      runtime.destroy();
      resume.destroy();
      panel.destroy();
      settingsStore.destroy();
    },
  };
}

function boot() {
  window[INSTANCE_KEY]?.destroy();
  window[INSTANCE_KEY] = startOptimizer({ document, window, history,
    registerMenuCommand: typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : undefined,
  });
}
if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
}

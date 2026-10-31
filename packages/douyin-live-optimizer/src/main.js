import { GM_registerMenuCommand } from "$";
import { createSettingsPanel } from "./panel.js";
import { registerPlaybackResumeEvents } from "./playback-resume.js";
import { createPlayerMemory } from "./player-memory.js";
import { createPlayerPreferenceStore, PLAYER_PREFERENCES } from "./player-preferences.js";
import { createRuntimeController, getPlayerScope, registerLifecycleEvents, isLiveLocation, samePlayerScope } from "./runtime.js";
import { createSettingsStore } from "./settings.js";
import { sleep, throwIfAborted } from "./task.js";
import { createVisibilityController } from "./visibility.js";
import { createChatTools } from "./chat-tools.js";

// @sandbox raw requests the page realm; native player expandos and history
// wrappers must also be checked in the actual installed userscript.
const INSTANCE_KEY = "__douyinLiveOptimizerRuntimeV1";

export function startOptimizer({ document, window, history, registerMenuCommand } = {}) {
  let storage;
  try { storage = window.localStorage; } catch { /* Settings still work in memory. */ }
  const settingsStore = createSettingsStore({ storage, eventTarget: window });
  const preferences = createPlayerPreferenceStore({ storage, eventTarget: window, legacy: settingsStore.get() });
  let visibility;
  let currentScope;
  let menuQueue = Promise.resolve();
  let memory;
  let panel;
  let resume;
  let chatTools;

  function updateVisibility() {
    if (!settingsStore.get().playbackResume) resume?.cancel();
    if (!isLiveLocation(window.location)) { visibility?.destroy(); visibility = null; return; }
    // Install stable CSS before the video instance is ready, not after autoplay.
    visibility ||= createVisibilityController({ document, MutationObserver: window.MutationObserver });
    const values = settingsStore.get();
    visibility.update(values);
  }
  function withPlayerMenu(signal, action) {
    const result = menuQueue.catch(() => {}).then(async () => {
      throwIfAborted(signal);
      try {
        await sleep(400, signal);
        return await action();
      } finally {
        // Let the previous popup finish closing before another setting opens.
        await sleep(400, signal);
      }
    });
    menuQueue = result;
    return result;
  }

  const runtime = createRuntimeController({
    getScope: () => getPlayerScope(document, window.location),
    settingsStore,
    features: Object.keys(PLAYER_PREFERENCES),
    shouldRun: (key) => preferences.get(key).mode !== "unmanaged",
    onScope(scope) {
      resume?.cancel();
      currentScope = scope;
      memory?.begin(scope);
      chatTools?.refresh();
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
      return memory.apply(key, { signal });
    },
  });
  memory = createPlayerMemory({ document, window, preferences, reapply: runtime.runKeys, cancelKeys: runtime.cancelKeys,
    withMenu: withPlayerMenu,
    onResult: (key, result) => {
      panel?.setMethod(key, result?.method);
      if (key === "webFullscreen" && result?.applied && preferences.get("chatCollapsed").mode !== "unmanaged")
        runtime.runKeys(["chatCollapsed"]);
    },
  });
  const stopPreferences = preferences.subscribe((key, policy, origin) => {
    if (origin !== "capture") runtime.runKeys([key]);
  });
  panel = createSettingsPanel({ document, window, settingsStore, preferences,
    retry: () => runtime.runKeys(Object.keys(PLAYER_PREFERENCES)), registerMenuCommand,
  });
  chatTools = createChatTools({ document, window, settingsStore });
  updateVisibility();
  let lastLocation = window.location.origin + window.location.pathname;
  const stopLifecycle = registerLifecycleEvents({
    document, window, history, refresh: () => {
      runtime.refresh();
      const next = window.location.origin + window.location.pathname;
      if (next !== lastLocation) { lastLocation = next; updateVisibility(); chatTools.refresh(); }
    },
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
      visibility?.destroy();
      stopPreferences();
      memory.destroy();
      resume.destroy();
      panel.destroy();
      chatTools.destroy();
      settingsStore.destroy();
      preferences.destroy();
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

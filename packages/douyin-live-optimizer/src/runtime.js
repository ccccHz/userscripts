export function isLiveLocation(location) {
  return location.hostname === "live.douyin.com" || (
    ["www.douyin.com", "douyin.com"].includes(location.hostname) &&
    /^\/(?:follow|root)\/live(?:\/|$)/.test(location.pathname)
  );
}

export function getPlayerScope(document, location) {
  if (!isLiveLocation(location)) return null;
  const player = document.querySelector(
    '#PlayerLayout .douyin-player, [id^="living_player_container"] .douyin-player, .basicPlayer[data-e2e="basicPlayer"]',
  );
  const video = player?.querySelector("video") || document.querySelector('#PlayerLayout video, [data-e2e="living-container"] video');
  if (!video) return null;
  const root = player || video.parentElement;
  return {
    url: `${location.origin}${location.pathname.replace(/\/$/, "")}`,
    player: root, video, instance: getPlayerInstance(root),
  };
}

function getPlayerInstance(player) {
  try {
    if (player?._player?.proxy) return player._player.proxy;
    for (const key of Object.getOwnPropertyNames(player || {})) {
      if (!/^__reactFiber\$/.test(key)) continue;
      const instance = player[key]?.return?.memoizedProps?.playerInstance;
      if (instance) return instance;
    }
  } catch { /* An inaccessible private instance must not break site navigation. */ }
  return null;
}

export function samePlayerScope(left, right) {
  return left?.url === right?.url && left?.player === right?.player && left?.video === right?.video && left?.instance === right?.instance;
}

const FEATURES = ["giftEffects", "danmakuFilters", "audio", "quality"];
const RESTORABLE = new Set(["giftEffects", "danmakuFilters"]);

export function createRuntimeController({ getScope, settingsStore, runFeature, onScope = () => {}, onSettings = () => {}, onStatus = () => {} }) {
  let scope = null;
  let generation = 0;
  let destroyed = false;
  const tasks = new Map();
  let values = settingsStore.get();

  function cancel(key) {
    tasks.get(key)?.abort();
    tasks.delete(key);
  }
  function run(key) {
    cancel(key);
    if (destroyed || !scope || (!values[key] && !RESTORABLE.has(key))) return;
    const controller = new AbortController();
    tasks.set(key, controller);
    const currentGeneration = generation;
    const currentScope = scope;
    const value = values[key];
    onStatus(key, "running");
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      return runFeature(key, { scope: currentScope, value, signal: controller.signal });
    }).then((result) => {
      if (controller.signal.aborted || currentGeneration !== generation) return;
      onStatus(key, result?.verified === false || result?.applied === false || result?.buttonFound === false || result?.triggerFound === false ? "unavailable" : "done");
    }).catch((error) => {
      if (controller.signal.aborted || currentGeneration !== generation) return;
      onStatus(key, "unavailable");
      console.warn("userscript: douyin feature unavailable", key, error?.name || "Error");
    }).finally(() => {
      if (tasks.get(key) === controller) tasks.delete(key);
    });
  }
  function refresh() {
    if (destroyed) return;
    const next = getScope();
    if (samePlayerScope(scope, next)) return;
    for (const key of tasks.keys()) cancel(key);
    scope = next;
    generation += 1;
    onScope(scope);
    onSettings(values, scope);
    for (const key of FEATURES) {
      onStatus(key, !scope || !values[key] ? "idle" : "waiting");
      run(key);
    }
  }
  const unsubscribe = settingsStore.subscribe((next, changed) => {
    values = next;
    onSettings(values, scope);
    for (const key of changed) {
      if (!FEATURES.includes(key)) continue;
      onStatus(key, "idle");
      run(key);
    }
  });
  return {
    refresh,
    retry() {
      refresh();
      for (const key of ["giftEffects", "danmakuFilters", "quality"]) run(key);
    },
    destroy() {
      destroyed = true;
      for (const key of tasks.keys()) cancel(key);
      unsubscribe();
      scope = null;
      onScope(null);
    },
  };
}

export function registerLifecycleEvents({ document, window, history, refresh, refreshLayout = () => {}, MutationObserver = window.MutationObserver }) {
  let timer;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => { timer = undefined; refresh(); }, 100);
  };
  // Cancel stale work synchronously on navigation; DOM readiness is handled by refresh.
  const navigation = () => { refresh(); schedule(); };
  const wrappers = [];
  for (const key of ["pushState", "replaceState"]) {
    const original = history[key];
    const wrapper = function (...args) {
      const result = original.apply(this, args);
      navigation();
      return result;
    };
    history[key] = wrapper;
    wrappers.push({ key, original, wrapper });
  }
  window.addEventListener("popstate", navigation);
  window.addEventListener("pageshow", navigation);
  document.addEventListener("fullscreenchange", refreshLayout);
  const observer = MutationObserver ? new MutationObserver(schedule) : null;
  observer?.observe(document.body || document.documentElement, { childList: true, subtree: true });
  refresh();
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    observer?.disconnect();
    window.removeEventListener("popstate", navigation);
    window.removeEventListener("pageshow", navigation);
    document.removeEventListener("fullscreenchange", refreshLayout);
    for (const { key, original, wrapper } of wrappers) if (history[key] === wrapper) history[key] = original;
  };
}

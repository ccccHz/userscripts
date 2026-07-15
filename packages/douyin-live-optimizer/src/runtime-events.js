export function registerRuntimeEvents({
  history,
  window,
  runMain,
  removeLiveBottomLayouts,
  logger = console,
}) {
  const rawPushState = history.pushState;
  history.pushState = function () {
    const result = rawPushState.apply(this, arguments);
    onUrlChange();
    return result;
  };

  const rawReplaceState = history.replaceState;
  history.replaceState = function () {
    const result = rawReplaceState.apply(this, arguments);
    onUrlChange();
    return result;
  };

  window.addEventListener("popstate", onUrlChange);
  window.addEventListener("fullscreenchange", removeLiveBottomLayouts);

  function onUrlChange() {
    logger.log("userscript: URL changed to", getLocationHref(window));
    runMain();
  }
}

function getLocationHref(window) {
  return window.location?.href || globalThis.location?.href || "";
}

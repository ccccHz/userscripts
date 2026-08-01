const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";
const DARK_MODE_KEY = "darkMode";
const DARK_MODE_HISTORY_KEY = "darkModeHistory";
const SEARCH_HOSTNAME = "s.weibo.com";
const MAIN_HOSTNAMES = new Set(["weibo.com", "www.weibo.com"]);
const SEARCH_STYLE_ID = "weibo-improvement-search-dark";
const LIVE_PATH_PREFIX = "/l/wblive/";
const LIVE_STYLE_ID = "weibo-improvement-live-dark";
const EARLY_DARK_BACKGROUND = "#0c0c0c";
const EARLY_LIGHT_BACKGROUND = "#ffffff";

export const SEARCH_DARK_CSS = `
:root[data-theme="dark"] {
  color-scheme: dark;
}

:root[data-theme="dark"] body {
  background: var(--frame-background, #0c0c0c);
  color: var(--w-main, #d3d3d3);
}

:root[data-theme="dark"] .card-wrap {
  border-color: var(--w-card-border, #202025);
}

:root[data-theme="dark"] :is(
  .m-main-nav,
  .m-sub-nav,
  .m-filtertab,
  .card-topic,
  .m-page,
  .m-error,
  .hot-band-container,
  .hot-band-tabs-item,
  .hot-band-tabs-item-active,
  .hot-band-footer-link,
  .ai_module,
  [class^="zhisou_"],
  [class*=" zhisou_"]
) {
  background-color: var(--w-card-background, #16161a);
  border-color: var(--w-card-border, #202025);
  color: var(--w-main, #d3d3d3);
}

:root[data-theme="dark"] .card-wrap .card-sender .input textarea {
  background-color: var(--w-input-background, #25252c) !important;
  border: 1px solid var(--w-off-border, #29292b) !important;
  color: var(--w-main, #d3d3d3) !important;
}

:root[data-theme="dark"] .card-wrap .card-sender .input textarea::placeholder {
  color: var(--w-sub, #939393);
}

:root[data-theme="dark"] .m-page a {
  border-color: var(--w-card-border, #202025);
  color: var(--w-main, #d3d3d3);
}

:root[data-theme="dark"] .m-error a {
  color: var(--w-link, #eb7350);
}

:root[data-theme="dark"] .hot-band-container :is(
  .hot-band-header-title,
  .hot-band-header-refresh,
  .hot-band-tabs-list-item-content-title
) {
  color: var(--w-main, #d3d3d3);
}

:root[data-theme="dark"] .card-top .icon-title.icon-star {
  background-image: none;
  color: #f2a100;
  font-size: 17px;
  font-style: normal;
  line-height: 17px;
  text-align: center;
}

:root[data-theme="dark"] .card-top .icon-title.icon-star::before {
  content: "★";
}

:root[data-theme="dark"] .hot-band-header-refresh img {
  display: none;
}

:root[data-theme="dark"] .hot-band-header-refresh::before {
  content: "↻";
  color: var(--w-main, #d3d3d3);
  font-size: 17px;
  line-height: 14px;
}

:root[data-theme="dark"] .card-about .tag {
  background-color: var(--w-card-background, #16161a);
  border-color: var(--w-card-border, #202025);
  color: var(--w-main, #d3d3d3);
}

:root[data-theme="dark"] .card-about .tag::before {
  border-color: transparent var(--w-card-border, #202025) transparent var(--w-card-background, #16161a);
}

:root[data-theme="dark"] .card-about .tag::after {
  border-color: transparent var(--w-card-background, #16161a) transparent var(--w-card-background, #16161a);
}

:root[data-theme="dark"] :is(
  [class^="zhisou_"],
  [class*=" zhisou_"]
) {
  background-color: var(--w-card-background, #16161a) !important;
}
`;

export const LIVE_DARK_CSS = `
:root[data-theme="dark"] body {
  background-color: #121315;
  color: var(--star-font-color-a, var(--w-main, #d3d3d3));
}

:root[data-theme="dark"] :is(
  [class^="Frame_main2_"],
  [class*=" Frame_main2_"]
) {
  background-color: #17181b;
  border: 1px solid #24252a;
  border-radius: 8px;
  overflow: hidden;
}

:root[data-theme="dark"] :is(
  [class^="Frame_side2_"],
  [class*=" Frame_side2_"]
) {
  background-color: #18191c;
  border: 1px solid #24252a;
  border-radius: 8px;
  overflow: hidden;
}

:root[data-theme="dark"] :is(
  [class^="Detail_wrap_"],
  [class*=" Detail_wrap_"]
) {
  background-color: #1b1c20;
  border-top: 1px solid #292a30;
}

:root[data-theme="dark"] .sending-form {
  background-color: #1b1c20;
  border-top: 1px solid #292a30;
}

:root[data-theme="dark"] :is(
  .pribtn,
  .tool-panel-main,
  .weibo-message .weibo-message-wrapper,
  .global-setting,
  .btn-body,
  .setting-form-box
) {
  background-color: var(--w-card-background, #16161a);
  border-color: var(--w-card-border, #202025);
  color: var(--w-main, #d3d3d3);
}

:root[data-theme="dark"] .tool-panel-main .tool-panel-title {
  background-color: var(--w-repost-background, #25252c);
  color: var(--w-main, #d3d3d3);
}
`;

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getStorage(windowObject) {
  try {
    return windowObject.localStorage;
  } catch {
    return null;
  }
}

function getCurrentUid(windowObject, storedDarkMode) {
  const config = windowObject.$CONFIG;
  return config?.user?.id ?? config?.uid ?? storedDarkMode?.uid ?? null;
}

function readHistory(value) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) return new Map();

  try {
    return new Map(parsed);
  } catch {
    return new Map();
  }
}

function setStorageItem(storage, key, value) {
  try {
    if (storage.getItem(key) !== value) {
      storage.setItem(key, value);
    }
  } catch {
    // Theme application must continue when storage is unavailable.
  }
}

export function synchronizeMainThemeStorage({
  windowObject = window,
  isDark,
} = {}) {
  if (!MAIN_HOSTNAMES.has(windowObject.location?.hostname)) return false;

  const storage = getStorage(windowObject);
  if (!storage) return false;

  let storedDarkMode = null;
  let storedHistory = null;
  try {
    storedDarkMode = parseJson(storage.getItem(DARK_MODE_KEY), null);
    storedHistory = storage.getItem(DARK_MODE_HISTORY_KEY);
  } catch {
    return false;
  }

  const uid = getCurrentUid(windowObject, storedDarkMode);
  if (uid === null || uid === undefined || uid === "") return false;

  const mode = isDark ? 1 : 0;
  const history = readHistory(storedHistory);
  history.set(uid, mode);

  setStorageItem(
    storage,
    DARK_MODE_KEY,
    JSON.stringify({ uid, mode }),
  );
  setStorageItem(
    storage,
    DARK_MODE_HISTORY_KEY,
    JSON.stringify(Array.from(history.entries())),
  );
  return true;
}

export function applyWeiboTheme({
  documentObject = document,
  windowObject = window,
  isDark,
} = {}) {
  const htmlElement = documentObject.documentElement;
  if (!htmlElement) return false;

  const theme = isDark ? "dark" : "light";
  try {
    htmlElement.style?.setProperty(
      "background-color",
      isDark ? EARLY_DARK_BACKGROUND : EARLY_LIGHT_BACKGROUND,
    );
    htmlElement.style?.setProperty("color-scheme", theme);
  } catch {
    // Theme application must continue when the root style is unavailable.
  }

  if (htmlElement.getAttribute("data-theme") !== theme) {
    htmlElement.setAttribute("data-theme", theme);
  }

  synchronizeMainThemeStorage({ windowObject, isDark });
  return true;
}

export function startWeiboThemeController({
  documentObject = document,
  windowObject = window,
  MutationObserverClass = MutationObserver,
} = {}) {
  const mediaQuery = windowObject.matchMedia(DARK_MODE_QUERY);
  let desiredDark = Boolean(mediaQuery.matches);
  let themeObserver = null;
  let documentObserver = null;

  const enforce = () =>
    applyWeiboTheme({
      documentObject,
      windowObject,
      isDark: desiredDark,
    });

  const observeTheme = () => {
    const htmlElement = documentObject.documentElement;
    if (!htmlElement || themeObserver) return false;

    themeObserver = new MutationObserverClass(enforce);
    themeObserver.observe(htmlElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    enforce();
    return true;
  };

  if (!observeTheme()) {
    documentObserver = new MutationObserverClass(() => {
      if (!observeTheme()) return;
      documentObserver?.disconnect();
      documentObserver = null;
    });
    documentObserver.observe(documentObject, { childList: true, subtree: true });
  }

  const handleSystemThemeChange = (event) => {
    desiredDark = Boolean(event.matches);
    enforce();
  };
  mediaQuery.addEventListener("change", handleSystemThemeChange);

  const handleDocumentReady = () => enforce();
  documentObject.addEventListener?.(
    "DOMContentLoaded",
    handleDocumentReady,
    { once: true },
  );

  return {
    enforce,
    stop() {
      mediaQuery.removeEventListener?.("change", handleSystemThemeChange);
      documentObject.removeEventListener?.(
        "DOMContentLoaded",
        handleDocumentReady,
      );
      themeObserver?.disconnect();
      documentObserver?.disconnect();
    },
  };
}

export function installSearchDarkCompatibility({
  documentObject = document,
  windowObject = window,
} = {}) {
  if (windowObject.location?.hostname !== SEARCH_HOSTNAME) return null;

  const existingStyle = documentObject.getElementById?.(SEARCH_STYLE_ID);
  if (existingStyle) return existingStyle;

  const parent = documentObject.head || documentObject.documentElement;
  if (!parent) {
    documentObject.addEventListener?.(
      "DOMContentLoaded",
      () => installSearchDarkCompatibility({ documentObject, windowObject }),
      { once: true },
    );
    return null;
  }

  const styleElement = documentObject.createElement("style");
  styleElement.id = SEARCH_STYLE_ID;
  styleElement.textContent = SEARCH_DARK_CSS;
  parent.append(styleElement);
  return styleElement;
}

export function installLiveDarkCompatibility({
  documentObject = document,
  windowObject = window,
} = {}) {
  if (
    !MAIN_HOSTNAMES.has(windowObject.location?.hostname) ||
    !windowObject.location?.pathname?.startsWith(LIVE_PATH_PREFIX)
  ) {
    return null;
  }

  const existingStyle = documentObject.getElementById?.(LIVE_STYLE_ID);
  if (existingStyle) return existingStyle;

  const parent = documentObject.head || documentObject.documentElement;
  if (!parent) {
    documentObject.addEventListener?.(
      "DOMContentLoaded",
      () => installLiveDarkCompatibility({ documentObject, windowObject }),
      { once: true },
    );
    return null;
  }

  const styleElement = documentObject.createElement("style");
  styleElement.id = LIVE_STYLE_ID;
  styleElement.textContent = LIVE_DARK_CSS;
  parent.append(styleElement);
  return styleElement;
}

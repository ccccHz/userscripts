import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWeiboTheme,
  installLiveDarkCompatibility,
  installSearchDarkCompatibility,
  LIVE_DARK_CSS,
  SEARCH_DARK_CSS,
  startWeiboThemeController,
  synchronizeMainThemeStorage,
} from "../src/theme-controller.js";

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.children = [];
    this.style = {
      properties: new Map(),
      setProperty: (name, value) => this.style.properties.set(name, value),
    };
  }

  append(element) {
    this.children.push(element);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

class FakeStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
    this.writes = [];
  }

  getItem(key) {
    return this.entries.get(key) ?? null;
  }

  setItem(key, value) {
    this.entries.set(key, value);
    this.writes.push([key, value]);
  }
}

function createMediaQuery(matches) {
  const listeners = new Set();
  return {
    matches,
    addEventListener(type, listener) {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "change") listeners.delete(listener);
    },
    emit(nextMatches) {
      this.matches = nextMatches;
      for (const listener of listeners) listener({ matches: nextMatches });
    },
  };
}

function createEnvironment({
  hostname = "weibo.com",
  isDark = false,
  uid = "current-user",
  htmlElement = new FakeElement(),
  storage = new FakeStorage(),
} = {}) {
  const mediaQuery = createMediaQuery(isDark);
  const documentListeners = new Map();
  const documentObject = {
    documentElement: htmlElement,
    head: null,
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (documentListeners.get(type) === listener) {
        documentListeners.delete(type);
      }
    },
    createElement() {
      return new FakeElement();
    },
    getElementById(id) {
      return this.documentElement?.children.find((item) => item.id === id) ?? null;
    },
    emit(type) {
      documentListeners.get(type)?.();
    },
  };
  const windowObject = {
    location: { hostname, pathname: "/" },
    localStorage: storage,
    $CONFIG: uid === null ? undefined : { user: { id: uid } },
    matchMedia() {
      return mediaQuery;
    },
  };

  return { documentObject, mediaQuery, storage, windowObject };
}

function createObserverClass() {
  const instances = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      instances.push(this);
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }
  }
  return { FakeMutationObserver, instances };
}

test("applies the initial system theme without clicking page controls", () => {
  const { documentObject, windowObject } = createEnvironment({ isDark: true });

  assert.equal(
    applyWeiboTheme({ documentObject, windowObject, isDark: true }),
    true,
  );
  assert.equal(documentObject.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(
    documentObject.documentElement.style.properties.get("background-color"),
    "#0c0c0c",
  );
  assert.equal(
    documentObject.documentElement.style.properties.get("color-scheme"),
    "dark",
  );
});

test("follows system changes and corrects page theme rewrites", () => {
  const { documentObject, mediaQuery, windowObject } = createEnvironment();
  const { FakeMutationObserver, instances } = createObserverClass();

  const controller = startWeiboThemeController({
    documentObject,
    windowObject,
    MutationObserverClass: FakeMutationObserver,
  });

  assert.equal(documentObject.documentElement.getAttribute("data-theme"), "light");
  assert.equal(
    documentObject.documentElement.style.properties.get("background-color"),
    "#ffffff",
  );
  mediaQuery.emit(true);
  assert.equal(documentObject.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(
    documentObject.documentElement.style.properties.get("background-color"),
    "#0c0c0c",
  );

  documentObject.documentElement.setAttribute("data-theme", "light");
  instances[0].callback();
  assert.equal(documentObject.documentElement.getAttribute("data-theme"), "dark");

  controller.stop();
  assert.equal(instances[0].disconnected, true);
});

test("waits safely when the document element is not available yet", () => {
  const { documentObject, windowObject } = createEnvironment({
    htmlElement: null,
    isDark: true,
  });
  const { FakeMutationObserver, instances } = createObserverClass();

  startWeiboThemeController({
    documentObject,
    windowObject,
    MutationObserverClass: FakeMutationObserver,
  });

  assert.equal(instances.length, 1);
  documentObject.documentElement = new FakeElement();
  instances[0].callback();

  assert.equal(instances.length, 2);
  assert.equal(documentObject.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(instances[0].disconnected, true);
});

test("syncs official main-site storage while preserving other accounts", () => {
  const storage = new FakeStorage({
    darkMode: JSON.stringify({ uid: "current-user", mode: 0 }),
    darkModeHistory: JSON.stringify([
      ["other-user", 0],
      ["current-user", 0],
    ]),
  });
  const { windowObject } = createEnvironment({ storage });

  assert.equal(synchronizeMainThemeStorage({ windowObject, isDark: true }), true);
  assert.deepEqual(JSON.parse(storage.getItem("darkMode")), {
    uid: "current-user",
    mode: 1,
  });
  assert.deepEqual(JSON.parse(storage.getItem("darkModeHistory")), [
    ["other-user", 0],
    ["current-user", 1],
  ]);
});

test("recovers malformed theme history and can use the stored uid", () => {
  const storage = new FakeStorage({
    darkMode: JSON.stringify({ uid: "stored-user", mode: 0 }),
    darkModeHistory: "not-json",
  });
  const { windowObject } = createEnvironment({ storage, uid: null });

  assert.equal(synchronizeMainThemeStorage({ windowObject, isDark: true }), true);
  assert.deepEqual(JSON.parse(storage.getItem("darkModeHistory")), [
    ["stored-user", 1],
  ]);
});

test("does not write main-site storage without a uid or on other domains", () => {
  const noUid = createEnvironment({ uid: null });
  const search = createEnvironment({ hostname: "s.weibo.com" });

  assert.equal(
    synchronizeMainThemeStorage({
      windowObject: noUid.windowObject,
      isDark: true,
    }),
    false,
  );
  assert.equal(
    synchronizeMainThemeStorage({
      windowObject: search.windowObject,
      isDark: true,
    }),
    false,
  );
  assert.deepEqual(noUid.storage.writes, []);
  assert.deepEqual(search.storage.writes, []);
});

test("continues applying the theme when localStorage access fails", () => {
  const { documentObject, windowObject } = createEnvironment();
  Object.defineProperty(windowObject, "localStorage", {
    get() {
      throw new Error("denied");
    },
  });

  assert.doesNotThrow(() =>
    applyWeiboTheme({ documentObject, windowObject, isDark: true }),
  );
  assert.equal(documentObject.documentElement.getAttribute("data-theme"), "dark");
});

test("injects the scoped compatibility CSS only on the search domain", () => {
  const search = createEnvironment({ hostname: "s.weibo.com" });
  const main = createEnvironment();

  const style = installSearchDarkCompatibility(search);

  assert.ok(style);
  assert.equal(style.textContent, SEARCH_DARK_CSS);
  assert.match(style.textContent, /:root\[data-theme="dark"\] body/);
  assert.match(style.textContent, /\.card-wrap/);
  for (const selector of [
    ".m-main-nav",
    ".m-sub-nav",
    ".m-filtertab",
    ".card-topic",
    ".card-wrap .card-sender .input textarea",
    ".m-page",
    ".m-error",
    ".hot-band-container",
    ".hot-band-tabs-item",
    ".hot-band-tabs-item-active",
    ".hot-band-footer-link",
    ".hot-band-header-title",
    ".hot-band-header-refresh",
    ".hot-band-tabs-list-item-content-title",
    ".card-top .icon-title.icon-star",
    ".card-about .tag",
    ".ai_module",
    '[class^="zhisou_"]',
  ]) {
    assert.ok(style.textContent.includes(selector));
  }
  assert.match(
    style.textContent,
    /background-color: var\(--w-card-background, #16161a\)/,
  );
  assert.match(
    style.textContent,
    /background-color: var\(--w-card-background, #16161a\) !important/,
  );
  assert.equal(installSearchDarkCompatibility(search), style);
  assert.equal(installSearchDarkCompatibility(main), null);
});

test("defers search CSS injection until the document root exists", () => {
  const search = createEnvironment({
    hostname: "s.weibo.com",
    htmlElement: null,
  });

  assert.equal(installSearchDarkCompatibility(search), null);
  search.documentObject.documentElement = new FakeElement();
  search.documentObject.emit("DOMContentLoaded");

  assert.equal(search.documentObject.documentElement.children.length, 1);
  assert.equal(
    search.documentObject.documentElement.children[0].textContent,
    SEARCH_DARK_CSS,
  );
});

test("injects live compatibility CSS only on Weibo live routes", () => {
  const live = createEnvironment();
  live.windowObject.location.pathname =
    "/l/wblive/p/show/1022:2321325327221098676958";
  const regularMain = createEnvironment();
  const search = createEnvironment({ hostname: "s.weibo.com" });
  search.windowObject.location.pathname = "/l/wblive/p/show/example";

  const style = installLiveDarkCompatibility(live);

  assert.ok(style);
  assert.equal(style.textContent, LIVE_DARK_CSS);
  assert.match(style.textContent, /--star-font-color-a/);
  assert.match(style.textContent, /Frame_main2_/);
  assert.match(style.textContent, /Frame_side2_/);
  assert.match(style.textContent, /\.sending-form/);
  assert.match(style.textContent, /\.tool-panel-main/);
  assert.doesNotMatch(style.textContent, /\.player_qrcode|\.qrcode/);
  assert.equal(installLiveDarkCompatibility(live), style);
  assert.equal(installLiveDarkCompatibility(regularMain), null);
  assert.equal(installLiveDarkCompatibility(search), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  enforceAutomaticTheme,
  startWikipediaPreferences,
  synchronizeWikipediaControls,
} from "../src/preferences.js";

class FakeClassList {
  constructor(classNames = []) {
    this.values = new Set(classNames);
  }

  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }

  add(className) {
    this.values.add(className);
  }

  contains(className) {
    return this.values.has(className);
  }

  remove(className) {
    this.values.delete(className);
  }
}

function createDocument({ ready = true, themeChecked = false, pinned = true } = {}) {
  const htmlElement = {
    classList: new FakeClassList([
      "skin-theme-clientpref-day",
      ...(ready ? ["vector-animations-ready"] : []),
      ...(pinned
        ? ["vector-feature-appearance-pinned-clientpref-1"]
        : ["vector-feature-appearance-pinned-clientpref-0"]),
    ]),
  };
  const automaticThemeInput = {
    checked: themeChecked,
    clicks: 0,
    click() {
      this.clicks += 1;
      this.checked = true;
    },
  };
  const appearanceUnpinButton = {
    clicks: 0,
    click() {
      this.clicks += 1;
      htmlElement.classList.remove(
        "vector-feature-appearance-pinned-clientpref-1",
      );
      htmlElement.classList.add(
        "vector-feature-appearance-pinned-clientpref-0",
      );
    },
  };

  return {
    documentObject: {
      documentElement: htmlElement,
      getElementById(id) {
        return id === "skin-client-pref-skin-theme-value-os"
          ? automaticThemeInput
          : null;
      },
      querySelector(selector) {
        return selector ===
          '[data-event-name="pinnable-header.vector-appearance.unpin"]'
          ? appearanceUnpinButton
          : null;
      },
    },
    htmlElement,
    automaticThemeInput,
    appearanceUnpinButton,
  };
}

test("replaces a forced theme class with the automatic theme", () => {
  const { htmlElement } = createDocument();

  enforceAutomaticTheme(htmlElement);

  assert.equal(htmlElement.classList.contains("skin-theme-clientpref-day"), false);
  assert.equal(htmlElement.classList.contains("skin-theme-clientpref-os"), true);
});

test("waits for Vector before clicking its preference controls", () => {
  const { documentObject, automaticThemeInput, appearanceUnpinButton } =
    createDocument({ ready: false });

  assert.equal(synchronizeWikipediaControls(documentObject), false);
  assert.equal(automaticThemeInput.clicks, 0);
  assert.equal(appearanceUnpinButton.clicks, 0);
});

test("selects automatic theme and hides the appearance sidebar", () => {
  const {
    documentObject,
    htmlElement,
    automaticThemeInput,
    appearanceUnpinButton,
  } = createDocument();

  assert.equal(synchronizeWikipediaControls(documentObject), true);
  assert.equal(automaticThemeInput.clicks, 1);
  assert.equal(appearanceUnpinButton.clicks, 1);
  assert.equal(htmlElement.classList.contains("skin-theme-clientpref-os"), true);
  assert.equal(
    htmlElement.classList.contains(
      "vector-feature-appearance-pinned-clientpref-1",
    ),
    false,
  );
});

test("observes page initialization and disconnects after synchronization", () => {
  const { documentObject } = createDocument({ ready: false });

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  const observer = startWikipediaPreferences({
    documentObject,
    MutationObserverClass: FakeMutationObserver,
  });

  assert.equal(observer.disconnected, false);
  documentObject.documentElement.classList.add("vector-animations-ready");
  observer.callback();
  assert.equal(observer.disconnected, true);
});

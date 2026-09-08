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

for (const state of ["initializing", "missing controls"]) {
  test(`observer settles while ${state} instead of feeding its own mutations`, () => {
    const { documentObject, htmlElement } = createDocument({
      ready: state !== "initializing",
    });
    if (state === "missing controls") {
      documentObject.getElementById = () => null;
    }

    let pending = false;
    let observing = false;
    // DOMTokenList.add updates the class attribute even for an existing token.
    for (const method of ["add", "remove"]) {
      const original = htmlElement.classList[method].bind(htmlElement.classList);
      htmlElement.classList[method] = (token) => {
        original(token);
        if (observing) pending = true;
      };
    }
    class MutationObserverHarness {
      constructor(callback) { this.callback = callback; }
      observe() { observing = true; }
      disconnect() { observing = false; pending = false; }
    }
    const observer = startWikipediaPreferences({
      documentObject,
      MutationObserverClass: MutationObserverHarness,
    });
    htmlElement.classList.add("unrelated-page-class");
    let deliveries = 0;
    while (pending && deliveries < 20) {
      pending = false;
      deliveries += 1;
      observer.callback();
    }
    assert.equal(pending, false, "class mutations must stop without starving rendering");
    assert.equal(deliveries, 1);
    assert.equal(htmlElement.classList.contains("skin-theme-clientpref-os"), true);
    observer.disconnect();
  });
}

const THEME_CLASS_PREFIX = "skin-theme-clientpref-";
const AUTOMATIC_THEME_CLASS = `${THEME_CLASS_PREFIX}os`;
const AUTOMATIC_THEME_INPUT_ID = "skin-client-pref-skin-theme-value-os";
const APPEARANCE_PINNED_CLASS =
  "vector-feature-appearance-pinned-clientpref-1";
const APPEARANCE_UNPIN_SELECTOR =
  '[data-event-name="pinnable-header.vector-appearance.unpin"]';
const VECTOR_READY_CLASS = "vector-animations-ready";

export function enforceAutomaticTheme(htmlElement) {
  if (!htmlElement) return;

  for (const className of Array.from(htmlElement.classList)) {
    if (
      className.startsWith(THEME_CLASS_PREFIX) &&
      className !== AUTOMATIC_THEME_CLASS
    ) {
      htmlElement.classList.remove(className);
    }
  }

  htmlElement.classList.add(AUTOMATIC_THEME_CLASS);
}

export function synchronizeWikipediaControls(documentObject) {
  const htmlElement = documentObject.documentElement;
  enforceAutomaticTheme(htmlElement);

  if (!htmlElement.classList.contains(VECTOR_READY_CLASS)) {
    return false;
  }

  const automaticThemeInput = documentObject.getElementById(
    AUTOMATIC_THEME_INPUT_ID,
  );
  const appearanceUnpinButton = documentObject.querySelector(
    APPEARANCE_UNPIN_SELECTOR,
  );

  if (!automaticThemeInput || !appearanceUnpinButton) {
    return false;
  }

  if (!automaticThemeInput.checked) {
    automaticThemeInput.click();
  }

  if (htmlElement.classList.contains(APPEARANCE_PINNED_CLASS)) {
    appearanceUnpinButton.click();
  }

  enforceAutomaticTheme(htmlElement);

  return (
    automaticThemeInput.checked &&
    !htmlElement.classList.contains(APPEARANCE_PINNED_CLASS)
  );
}

export function startWikipediaPreferences({
  documentObject = document,
  MutationObserverClass = MutationObserver,
} = {}) {
  const htmlElement = documentObject.documentElement;
  enforceAutomaticTheme(htmlElement);

  let observer;
  const synchronize = () => {
    if (synchronizeWikipediaControls(documentObject)) {
      observer?.disconnect();
    }
  };

  observer = new MutationObserverClass(synchronize);
  observer.observe(htmlElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  synchronize();
  return observer;
}

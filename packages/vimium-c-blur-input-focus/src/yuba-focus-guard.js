const INSTALLATIONS = new WeakMap();

export function isYubaEditor(element) {
  if (typeof element?.getAttribute !== "function") return false;

  // The shared Yuba composer/comment editor exposes these semantic attributes.
  // Its CSS module class name changed when the site changed its build output.
  return (
    element.getAttribute("contenteditable") === "true" &&
    element.getAttribute("aria-roledescription") === "Editor" &&
    Boolean(element.getAttribute("data-placeholder")?.trim())
  );
}

export function installYubaBlur(documentObject = document) {
  if (INSTALLATIONS.has(documentObject)) {
    return INSTALLATIONS.get(documentObject);
  }

  const blurEditor = (element) => {
    if (isYubaEditor(element)) element.blur();
  };
  const onFocus = (event) => blurEditor(event.target);
  const onReady = () => blurEditor(documentObject.activeElement);
  const dispose = () => {
    documentObject.removeEventListener("focusin", onFocus);
    documentObject.removeEventListener("DOMContentLoaded", onReady);
    INSTALLATIONS.delete(documentObject);
  };

  INSTALLATIONS.set(documentObject, dispose);
  documentObject.addEventListener("focusin", onFocus);
  if (documentObject.readyState === "loading") {
    documentObject.addEventListener("DOMContentLoaded", onReady, { once: true });
  }
  onReady();
  return dispose;
}

const PAUSE_HINTS = ["长时间无操作", "暂停播放"];
const RESUME_TEXT = "继续播放";
const CLICKABLE_SELECTOR = "button, [role='button'], a, div, span";

export function findResumeButton(document) {
  const root = document.body || document.documentElement;
  if (!root || !containsPauseHints(getText(root))) return null;

  for (const element of root.querySelectorAll(CLICKABLE_SELECTOR)) {
    if (normalizeText(getText(element)) !== RESUME_TEXT) continue;

    const clickable = element.closest?.("button, [role='button'], a") || element;
    if (clickable.disabled || clickable.getAttribute?.("aria-disabled") === "true") {
      continue;
    }

    return clickable;
  }

  return null;
}

export function resumePausedPlayback({ document, logger = console }) {
  const button = findResumeButton(document);
  if (!button) return false;

  button.click();
  logger.info?.("userscript: douyin resumed paused live playback");
  return true;
}

export function registerPlaybackResumeEvents({
  document,
  window,
  logger = console,
  retryDelays = [0, 250, 1000, 2500],
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  isEnabled = () => true,
}) {
  let returnGeneration = 0;
  let timers = [];
  const cancel = () => {
    returnGeneration += 1;
    timers.forEach(clearTimeoutFn);
    timers = [];
  };

  const resumeAfterReturn = () => {
    cancel();
    if (document.hidden || !isEnabled()) return;

    const generation = ++returnGeneration;
    let resumed = false;

    for (const delay of retryDelays) {
      timers.push(setTimeoutFn(() => {
        if (generation !== returnGeneration || resumed || document.hidden || !isEnabled()) return;

        resumed = resumePausedPlayback({ document, logger });
      }, delay));
    }
  };

  document.addEventListener("visibilitychange", resumeAfterReturn);
  window.addEventListener("focus", resumeAfterReturn);
  window.addEventListener("pageshow", resumeAfterReturn);

  resumeAfterReturn.destroy = () => {
    cancel();
    document.removeEventListener("visibilitychange", resumeAfterReturn);
    window.removeEventListener("focus", resumeAfterReturn);
    window.removeEventListener("pageshow", resumeAfterReturn);
  };
  resumeAfterReturn.cancel = cancel;
  return resumeAfterReturn;
}

function containsPauseHints(text) {
  const normalized = normalizeText(text);
  return PAUSE_HINTS.every((hint) => normalized.includes(hint));
}

function getText(element) {
  return element.innerText || element.textContent || "";
}

function normalizeText(text) {
  return String(text).replace(/\s+/g, "").trim();
}

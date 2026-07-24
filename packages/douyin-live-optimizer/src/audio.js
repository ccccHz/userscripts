const VOLUME_BUTTON_SELECTOR =
  ".douyin-player-icon.douyin-player-volume";
const MUTED_SLIDER_SELECTOR =
  ".douyin-player-volume-slider.douyin-player-muted";

export function isPlayerMuted(root, volumeButton) {
  if (volumeButton?.querySelector?.(MUTED_SLIDER_SELECTOR)) return true;

  const video = root?.querySelector?.("video");
  return video?.muted === true || video?.volume === 0;
}

export function ensurePlayerUnmuted(root = globalThis.document) {
  const volumeButton = root?.querySelector?.(VOLUME_BUTTON_SELECTOR);
  if (!volumeButton || !isPlayerMuted(root, volumeButton)) {
    return { buttonFound: Boolean(volumeButton), clicked: false };
  }

  const video = root?.querySelector?.("video");
  volumeButton.click();

  if (video?.muted === true) video.muted = false;
  if (video?.volume === 0) {
    video.volume = getPreviousVolume(volumeButton) || 0.5;
  }

  return { buttonFound: true, clicked: true };
}

export async function ensurePlayerAudioOnOpen({
  document = globalThis.document,
  sleep = defaultSleep,
  interval = 100,
  maxAttempts = 600,
  settleDelay = 500,
} = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const volumeButton = document?.querySelector?.(VOLUME_BUTTON_SELECTOR);
    const video = document?.querySelector?.("video");

    if (volumeButton && video) {
      await sleep(settleDelay);
      return ensurePlayerUnmuted(document);
    }

    await sleep(interval);
  }

  return { buttonFound: false, clicked: false };
}

function getPreviousVolume(volumeButton) {
  const thumb = volumeButton?.querySelector?.(
    ".douyin-player-volume-slider-thumb",
  );
  const percentage = Number.parseFloat(thumb?.style?.height || "");

  if (!Number.isFinite(percentage) || percentage <= 0) return 0;
  return Math.min(percentage / 100, 1);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

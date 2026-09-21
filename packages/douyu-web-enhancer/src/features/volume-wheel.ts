import type { FeatureDefinition } from "../core/feature.ts";

export const VOLUME_WHEEL_ID = "volume-wheel";
export const VOLUME_WHEEL_STEP = 0.05;
const VOLUME_PER_WHEEL_PIXEL = VOLUME_WHEEL_STEP / 100;
const LINE_WHEEL_PIXELS = 100 / 3;
const PAGE_WHEEL_PIXELS = 100;
const MAX_VOLUME_DELTA_PER_FRAME = 0.08;

/** DouyuEx's original interaction, kept intentionally small. */
export function nextVolume(current: number, direction: -1 | 1): number {
  return Math.min(1, Math.max(0, current + direction * VOLUME_WHEEL_STEP));
}

export function applyVolumeStep(video: Pick<HTMLVideoElement, "volume" | "muted">, direction: -1 | 1): number {
  return applyVolumeDelta(video, direction * VOLUME_WHEEL_STEP);
}

function applyVolumeDelta(video: Pick<HTMLVideoElement, "volume" | "muted">, delta: number): number {
  const next = Math.min(1, Math.max(0, video.volume + delta));
  video.muted = next === 0;
  video.volume = next;
  return next;
}

/**
 * Convert every WheelEvent into a continuous volume delta. The caller
 * accumulates it until the next browser paint, so mixed-direction input
 * naturally cancels instead of jumping between artificial volume steps.
 */
export function volumeDeltaForWheel(
  event: Pick<WheelEvent, "deltaMode" | "deltaY">,
): number {
  if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return 0;
  const pixels = event.deltaY * (
    event.deltaMode === 1
      ? LINE_WHEEL_PIXELS
      : event.deltaMode === 2
        ? PAGE_WHEEL_PIXELS
        : 1
  );
  return Math.max(
    -MAX_VOLUME_DELTA_PER_FRAME,
    Math.min(MAX_VOLUME_DELTA_PER_FRAME, -pixels * VOLUME_PER_WHEEL_PIXEL),
  );
}

export const volumeWheelSelectors = {
  volumeControl: [".volume-07c230"],
  video: ["#__video2"],
} as const;

/**
 * No global wheel hook: the browser dispatches input to the real volume root
 * (and its expanded bar). Volume is applied once per animation frame, never
 * through a fixed 16 ms timer or a direction-confirmation state machine.
 */
export function createVolumeWheelFeature(): FeatureDefinition {
  return {
    id: VOLUME_WHEEL_ID,
    start({ diagnostics, document, observerHub }) {
      let boundControl: HTMLElement | null = null;
      let video: HTMLVideoElement | null = null;
      let pendingVolumeDelta = 0;
      let animationFrame: number | null = null;
      const ownerWindow = document.defaultView;

      const sync = (volume: number) => {
        const bar = document.querySelector<HTMLElement>(".volume-bar-93f0b0 .front-99e2aa");
        const point = document.querySelector<HTMLElement>(".volume-bar-93f0b0 .point-6ef744");
        const label = document.querySelector<HTMLElement>(".volume-bar-93f0b0 .tips2-9bb064");
        if (bar) bar.style.height = `${volume * 100}px`;
        if (point) point.style.bottom = `${volume * 100 + 7}px`;
        if (label) label.textContent = `音量${Math.round(volume * 100)}%`;
      };
      const flushPendingVolume = () => {
        animationFrame = null;
        const delta = pendingVolumeDelta;
        pendingVolumeDelta = 0;
        if (video && delta !== 0) applyVolumeDelta(video, delta);
      };
      const discardPendingVolume = () => {
        if (animationFrame !== null) ownerWindow?.cancelAnimationFrame(animationFrame);
        animationFrame = null;
        pendingVolumeDelta = 0;
      };
      const requestFlush = () => {
        if (animationFrame !== null) return;
        if (!ownerWindow) {
          flushPendingVolume();
          return;
        }
        animationFrame = ownerWindow.requestAnimationFrame(flushPendingVolume);
      };
      const onWheel = (event: WheelEvent) => {
        if (!video) return;
        event.preventDefault();
        event.stopPropagation();
        pendingVolumeDelta = Math.max(
          -MAX_VOLUME_DELTA_PER_FRAME,
          Math.min(MAX_VOLUME_DELTA_PER_FRAME, pendingVolumeDelta + volumeDeltaForWheel(event)),
        );
        requestFlush();
      };
      const onVolumeChange = () => sync(video?.volume ?? 0);
      const bind = () => {
        const control = document.querySelector<HTMLElement>(".volume-07c230");
        const player = document.getElementById("__video2") as HTMLVideoElement | null;
        if (!control || !player) return;
        if (control === boundControl && player === video) return;
        discardPendingVolume();
        boundControl?.removeEventListener("wheel", onWheel, true);
        video?.removeEventListener("volumechange", onVolumeChange);
        boundControl = control;
        video = player;
        control.addEventListener("wheel", onWheel, { capture: true, passive: false });
        video.addEventListener("volumechange", onVolumeChange);
        sync(video.volume);
        diagnostics.update(VOLUME_WHEEL_ID, "active", { detail: "音量控件内滚轮按显示帧连续调节" });
      };
      bind();
      const unsubscribe = observerHub.subscribe(bind);
      return () => {
        unsubscribe();
        discardPendingVolume();
        boundControl?.removeEventListener("wheel", onWheel, true);
        video?.removeEventListener("volumechange", onVolumeChange);
      };
    },
  };
}

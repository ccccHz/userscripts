import type { FeatureDefinition } from "../core/feature.ts";

export const LIVE_TIMESHIFT_CONTROLS_ID = "live-timeshift-controls";
export const LIVE_TIMESHIFT_STEP_SECONDS = 3;
export const LIVE_TIMESHIFT_ATTRIBUTE = "data-dwe-live-timeshift";
export const LIVE_TIMESHIFT_SYNC_ATTRIBUTE = "data-dwe-live-timeshift-sync";

export interface SeekableRange {
  start: number;
  end: number;
}

export const liveTimeshiftControlsSelectors = {
  video: ["#__video2", ".layout-Player-videoEntity video"],
  syncToolbar: [".left-d3671e", ".left-bfab3b"],
} as const;

export function isDouyuLiveRoomPage(
  locationLike: Pick<Location, "hostname" | "pathname">,
): boolean {
  return locationLike.hostname === "www.douyu.com" && /^\/\d+$/.test(locationLike.pathname);
}

export function readSeekableRanges(seekable: Pick<TimeRanges, "length" | "start" | "end">): SeekableRange[] {
  const ranges: SeekableRange[] = [];
  try {
    for (let index = 0; index < seekable.length; index += 1) {
      const start = seekable.start(index);
      const end = seekable.end(index);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        ranges.push({ start, end });
      }
    }
  } catch {
    return [];
  }
  return ranges;
}

export function readVideoSeekable(video: Pick<HTMLVideoElement, "seekable">): SeekableRange[] {
  try {
    return readSeekableRanges(video.seekable);
  } catch {
    return [];
  }
}

export function clampSeekTarget(
  currentTime: number,
  delta: number,
  ranges: readonly SeekableRange[],
): number | null {
  if (!ranges.length) return null;
  const safeRanges = ranges
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .slice()
    .sort((a, b) => a.start - b.start);
  if (!safeRanges.length) return null;

  const current = Number.isFinite(currentTime) ? currentTime : safeRanges[0].start;
  const candidate = current + (Number.isFinite(delta) ? delta : 0);
  const containing = safeRanges.find(({ start, end }) => candidate >= start && candidate <= end);
  if (containing) return candidate;

  if (delta < 0) {
    const previous = [...safeRanges].reverse().find(({ end }) => end < candidate);
    return previous?.end ?? safeRanges[0].start;
  }
  const next = safeRanges.find(({ start }) => start > candidate);
  return next?.start ?? safeRanges.at(-1)!.end;
}

function isEditableOrControlCenterTarget(event: KeyboardEvent): boolean {
  const target = event.target as (Element & { isContentEditable?: boolean }) | null;
  if (target?.isContentEditable) return true;
  if (typeof target?.closest === "function" && target.closest("input, textarea, [contenteditable]")) return true;
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  return path.some((item) =>
    typeof (item as Element | null)?.matches === "function" &&
    (item as Element).matches("input, textarea, [contenteditable], douyu-web-enhancer-control-center"),
  );
}

export function shouldIgnoreTimeshiftKey(event: KeyboardEvent, document: Pick<Document, "getSelection">): boolean {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.keyCode !== 37 && event.keyCode !== 39) return true;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return true;
  if (event.isComposing || event.keyCode === 229) return true;
  if (isEditableOrControlCenterTarget(event)) return true;
  const selection = document.getSelection();
  if (selection && !selection.isCollapsed) return true;
  return false;
}

const LIVE_TIMESHIFT_CSS = `
[${LIVE_TIMESHIFT_SYNC_ATTRIBUTE}] {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  height: 32px;
  justify-content: center;
  margin-left: 8px;
  min-width: 32px;
  padding: 0 6px;
}
[${LIVE_TIMESHIFT_SYNC_ATTRIBUTE}]:disabled {
  cursor: default;
  opacity: .45;
}
`;

export function createLiveTimeshiftControlsFeature(): FeatureDefinition {
  return {
    id: LIVE_TIMESHIFT_CONTROLS_ID,
    start({ diagnostics, document, observerHub, root, selectors, styles }) {
      const ownerWindow = document.defaultView;
      let currentVideo: HTMLVideoElement | null = null;
      let currentToolbar: HTMLElement | null = null;
      let syncButton: HTMLButtonElement | null = null;
      const removeStyle = styles.add(LIVE_TIMESHIFT_CONTROLS_ID, LIVE_TIMESHIFT_CSS);

      const uniqueElements = <T extends Element>(name: string): T[] => {
        const seen = new Set<Element>();
        return selectors.findAll<T>(name).flatMap(({ element }) => {
          if (seen.has(element)) return [];
          seen.add(element);
          return [element];
        });
      };
      const findVideo = (): HTMLVideoElement | null => {
        const videos = uniqueElements<HTMLVideoElement>("liveTimeshiftVideo");
        return videos.length === 1 ? videos[0] : null;
      };
      const findToolbar = (): HTMLElement | null => {
        const toolbars = uniqueElements<HTMLElement>("liveTimeshiftSyncToolbar");
        return toolbars.length === 1 ? toolbars[0] : null;
      };
      const currentLocation = () => ownerWindow?.location ?? (typeof location === "undefined" ? null : location);
      const isLiveRoom = () => {
        const locationLike = currentLocation();
        return Boolean(locationLike && isDouyuLiveRoomPage(locationLike));
      };
      const rangesFor = (video: HTMLVideoElement | null) => video ? readVideoSeekable(video) : [];
      const hasTimeshift = (video: HTMLVideoElement | null) => rangesFor(video).length > 0;
      const setDiagnostic = (status: "waiting" | "degraded" | "active", detail: string, selector?: string) => {
        diagnostics.update(LIVE_TIMESHIFT_CONTROLS_ID, status, { detail, selector });
      };
      const updateSyncButton = () => {
        if (!syncButton) return;
        const enabled = isLiveRoom() && hasTimeshift(currentVideo);
        syncButton.disabled = !enabled;
        syncButton.title = enabled ? "同步时间" : "同步时间（当前无有效时移）";
        syncButton.setAttribute("aria-label", "同步时间");
      };
      const onMediaStateChange = () => updateSyncButton();
      const unbindVideo = () => {
        if (!currentVideo) return;
        for (const type of ["progress", "durationchange", "loadedmetadata", "canplay", "emptied"]) {
          currentVideo.removeEventListener(type, onMediaStateChange);
        }
        currentVideo = null;
      };
      const removeButton = () => {
        syncButton?.remove();
        syncButton = null;
        currentToolbar = null;
      };
      const onSync = () => {
        const video = findVideo();
        const ranges = video ? readVideoSeekable(video) : [];
        if (!video || ranges.length === 0) {
          updateSyncButton();
          return;
        }
        try {
          video.currentTime = ranges.at(-1)!.end;
          updateSyncButton();
        } catch {
          setDiagnostic("degraded", "同步时间读取或跳转失败，已安全降级");
        }
      };
      const ensureButton = (toolbar: HTMLElement | null) => {
        if (toolbar !== currentToolbar) {
          removeButton();
          currentToolbar = toolbar;
        }
        if (!toolbar) return;
        if (!syncButton || !syncButton.isConnected || syncButton.parentElement !== toolbar) {
          syncButton?.remove();
          syncButton = document.createElement("button");
          syncButton.type = "button";
          syncButton.textContent = "↻";
          syncButton.setAttribute(LIVE_TIMESHIFT_SYNC_ATTRIBUTE, "");
          syncButton.setAttribute("aria-label", "同步时间");
          syncButton.addEventListener("click", onSync);
          toolbar.insertBefore(syncButton, toolbar.firstChild);
        }
        updateSyncButton();
      };
      const onKeydown = (event: KeyboardEvent) => {
        if (!isLiveRoom() || shouldIgnoreTimeshiftKey(event, document)) return;
        const video = findVideo();
        const ranges = video ? readVideoSeekable(video) : [];
        if (!video || ranges.length === 0) return;
        const direction = event.key === "ArrowLeft" || event.keyCode === 37 ? -1 : 1;
        const target = clampSeekTarget(video.currentTime, direction * LIVE_TIMESHIFT_STEP_SECONDS, ranges);
        if (target === null) return;
        try {
          event.preventDefault();
          video.currentTime = target;
          updateSyncButton();
        } catch {
          setDiagnostic("degraded", "左右键回看读取或跳转失败，已安全降级");
        }
      };
      const scan = () => {
        if (!isLiveRoom()) {
          unbindVideo();
          removeButton();
          root.removeAttribute(LIVE_TIMESHIFT_ATTRIBUTE);
          setDiagnostic("degraded", "当前不是数字直播间，未接管视频页或普通页面按键");
          return;
        }
        const video = findVideo();
        if (video !== currentVideo) {
          unbindVideo();
          currentVideo = video;
          if (currentVideo) {
            for (const type of ["progress", "durationchange", "loadedmetadata", "canplay", "emptied"]) {
              currentVideo.addEventListener(type, onMediaStateChange);
            }
          }
        }
        const toolbar = findToolbar();
        ensureButton(toolbar);
        root.setAttribute(LIVE_TIMESHIFT_ATTRIBUTE, "on");
        if (!video) {
          setDiagnostic("waiting", "等待唯一的直播播放器挂载");
        } else if (!hasTimeshift(video)) {
          setDiagnostic("degraded", "当前播放器没有有效 seekable 时移区间，按键与同步入口安全降级");
        } else {
          setDiagnostic("active", "左右键回看与同步时间已启用", toolbar ? "直播播放器 seekable | 播放器左侧控制区" : "直播播放器 seekable");
        }
      };

      document.addEventListener("keydown", onKeydown, true);
      const stopWatching = observerHub.subscribe(scan);
      document.addEventListener("fullscreenchange", scan);
      document.addEventListener("popstate", scan);
      document.addEventListener("hashchange", scan);
      scan();

      return () => {
        stopWatching();
        document.removeEventListener("keydown", onKeydown, true);
        document.removeEventListener("fullscreenchange", scan);
        document.removeEventListener("popstate", scan);
        document.removeEventListener("hashchange", scan);
        unbindVideo();
        removeButton();
        root.removeAttribute(LIVE_TIMESHIFT_ATTRIBUTE);
        removeStyle();
      };
    },
  };
}

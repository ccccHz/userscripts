import type { FeatureDefinition } from "../core/feature.ts";

export const DISABLE_OFFLINE_JUMP_ID = "disable-offline-jump";
export const DISABLE_OFFLINE_JUMP_SELECTOR = ".ClosingRecommend .dy-ModalRadius-close-x";
export const DISABLE_OFFLINE_JUMP_INTERVAL_MS = 1_000;

export const disableOfflineJumpSelectors = {
  closeButton: [DISABLE_OFFLINE_JUMP_SELECTOR],
} as const;

export function isDouyuLiveRoomPage(
  locationLike: Pick<Location, "hostname" | "pathname"> | null | undefined,
): boolean {
  return Boolean(
    locationLike &&
      locationLike.hostname === "www.douyu.com" &&
      /^\/[1-9]\d*$/.test(locationLike.pathname),
  );
}

/** Keep the official close-button workaround alive only for the current room. */
export function createDisableOfflineJumpFeature(): FeatureDefinition {
  return {
    id: DISABLE_OFFLINE_JUMP_ID,
    start({ diagnostics, document, observerHub }) {
      const ownerWindow = document.defaultView;
      let roomPath: string | null = null;
      let pollTimer: number | undefined;
      let scanCount = 0;
      let clickCount = 0;
      let lastWaitingDetail = "";

      const currentLocation = (): Pick<Location, "hostname" | "pathname"> | null =>
        ownerWindow?.location ?? null;

      const clearPollTimer = (): void => {
        if (pollTimer === undefined) return;
        ownerWindow?.clearInterval(pollTimer);
        pollTimer = undefined;
      };

      const reportWaiting = (detail: string): void => {
        if (detail === lastWaitingDetail) return;
        lastWaitingDetail = detail;
        diagnostics.update(DISABLE_OFFLINE_JUMP_ID, "waiting", {
          detail,
          selector: DISABLE_OFFLINE_JUMP_SELECTOR,
          data: { roomPath, pollIntervalMs: DISABLE_OFFLINE_JUMP_INTERVAL_MS },
        });
      };

      const scanCloseButton = (): void => {
        if (!roomPath) return;
        scanCount += 1;
        let closeButton: HTMLElement | null = null;
        try {
          closeButton = document.querySelector<HTMLElement>(DISABLE_OFFLINE_JUMP_SELECTOR);
        } catch {
          diagnostics.update(DISABLE_OFFLINE_JUMP_ID, "degraded", {
            detail: "官方关闭按钮选择器读取失败，继续等待后续轮询",
            selector: DISABLE_OFFLINE_JUMP_SELECTOR,
            data: { roomPath, scanCount, clickCount },
          });
          return;
        }
        if (!closeButton) {
          reportWaiting("已进入直播间，等待官方下播推荐关闭按钮");
          return;
        }
        try {
          closeButton.click();
          clickCount += 1;
          lastWaitingDetail = "";
          diagnostics.update(DISABLE_OFFLINE_JUMP_ID, "active", {
            detail: "已点击官方下播推荐关闭按钮；若弹窗仍在则继续轮询",
            selector: DISABLE_OFFLINE_JUMP_SELECTOR,
            data: {
              roomPath,
              scanCount,
              clickCount,
              pollIntervalMs: DISABLE_OFFLINE_JUMP_INTERVAL_MS,
            },
          });
        } catch {
          diagnostics.update(DISABLE_OFFLINE_JUMP_ID, "degraded", {
            detail: "官方关闭按钮点击失败，继续等待后续轮询",
            selector: DISABLE_OFFLINE_JUMP_SELECTOR,
            data: { roomPath, scanCount, clickCount },
          });
        }
      };

      function reconcileRoute(): boolean {
        const locationLike = currentLocation();
        if (!locationLike || !isDouyuLiveRoomPage(locationLike)) {
          clearPollTimer();
          roomPath = null;
          scanCount = 0;
          clickCount = 0;
          reportWaiting("当前不在数字直播间，未启动轮询");
          return false;
        }

        let restarted = false;
        if (roomPath !== locationLike.pathname) {
          clearPollTimer();
          roomPath = locationLike.pathname;
          scanCount = 0;
          clickCount = 0;
          lastWaitingDetail = "";
          restarted = true;
        }

        if (pollTimer === undefined) {
          pollTimer = ownerWindow?.setInterval(poll, DISABLE_OFFLINE_JUMP_INTERVAL_MS);
          restarted = true;
        }
        if (restarted) scanCloseButton();
        return restarted;
      }

      function poll(): void {
        const restarted = reconcileRoute();
        if (!restarted && roomPath) scanCloseButton();
      }

      const stopRouteWatching = observerHub.subscribe(() => { reconcileRoute(); });
      ownerWindow?.addEventListener("popstate", poll);
      ownerWindow?.addEventListener("hashchange", poll);
      poll();

      return () => {
        stopRouteWatching();
        ownerWindow?.removeEventListener("popstate", poll);
        ownerWindow?.removeEventListener("hashchange", poll);
        clearPollTimer();
        roomPath = null;
      };
    },
  };
}

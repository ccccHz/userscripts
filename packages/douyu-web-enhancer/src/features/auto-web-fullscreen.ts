import type { FeatureDefinition } from "../core/feature.ts";
import { isDouyuWebFullscreen } from "./compact-player.ts";

export const AUTO_WEB_FULLSCREEN_ID = "auto-web-fullscreen";
export const AUTO_WEB_FULLSCREEN_STATE_KEY =
  "douyu-web-enhancer:auto-web-fullscreen";

type ValueReader = (key: string, fallback: unknown) => unknown | Promise<unknown>;
type ValueWriter = (key: string, value: unknown) => void | Promise<void>;

export interface AutoWebFullscreenPreference {
  load(): Promise<boolean>;
  save(value: boolean): Promise<void>;
}

export function createAutoWebFullscreenPreference(
  read: ValueReader,
  write: ValueWriter,
): AutoWebFullscreenPreference {
  return {
    async load() {
      return (await read(AUTO_WEB_FULLSCREEN_STATE_KEY, true)) !== false;
    },
    async save(value) {
      await write(AUTO_WEB_FULLSCREEN_STATE_KEY, value);
    },
  };
}

export function isDouyuNumericRoomPath(pathname: string): boolean {
  return /^\/\d+$/.test(pathname);
}

export const AUTO_WEB_FULLSCREEN_MAX_SCROLL_ATTEMPTS = 4;

const scrollNavigationKeys = new Set([
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  " ",
  "Spacebar",
]);

export interface AutoWebFullscreenUserIntentEvent {
  type: string;
  isTrusted?: boolean;
  target?: EventTarget | null;
  key?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"),
  );
}

/**
 * Only direct, trusted user navigation can stop this room's bounded position
 * correction. We intentionally do not listen for `scroll`: it is emitted by
 * scrollIntoView, browser restoration, and layout changes as well as users.
 */
export function isAutoWebFullscreenUserScrollIntent(
  event: AutoWebFullscreenUserIntentEvent,
): boolean {
  if (event.isTrusted === false) return false;
  if (event.type === "wheel" || event.type === "touchmove") {
    return !event.ctrlKey && !event.metaKey;
  }
  if (event.type !== "keydown" || !event.key || isEditableTarget(event.target)) {
    return false;
  }
  return !event.altKey && !event.ctrlKey && !event.metaKey && scrollNavigationKeys.has(event.key);
}

export function isElementInViewport(
  element: Pick<Element, "getBoundingClientRect">,
  viewportHeight: number,
): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top < viewportHeight && rect.bottom > 0;
}

export function hasDouyuWebFullscreenIconSignature(element: Element): boolean {
  const signature = [...element.querySelectorAll("svg path")]
    .map((path) => path.getAttribute("d")?.replaceAll(/\s+/g, "") ?? "")
    .join("|");
  return (
    signature.includes("M2025h6v-6") &&
    signature.includes("M1312L87") &&
    signature.includes("M2625l-5-5")
  );
}

export const autoWebFullscreenSelectors = {
  webFullscreenControl: [
    'button[aria-label*="网页全屏"]',
    '[role="button"][aria-label*="网页全屏"]',
    '[title*="网页全屏"]',
    '[data-action="web-fullscreen"]',
  ],
  webFullscreenIconCandidates: [
    '#js-player-controlbar [class^="right-"] > i.icon-c8be96',
    '#js-player-controlbar [class*=" right-"] > i.icon-c8be96',
  ],
} as const;

/**
 * Prefer a named control. On the current player, the only non-text alternative
 * is the diagonal-corner SVG in the right control cluster. Its path signature
 * distinguishes it from the adjacent four-corner browser fullscreen icon.
 */
export function createAutoWebFullscreenFeature(
  preference: AutoWebFullscreenPreference,
): FeatureDefinition {
  return {
    id: AUTO_WEB_FULLSCREEN_ID,
    start({ diagnostics, document, observerHub, selectors }) {
      let disposed = false;
      let roomPath = location.pathname;
      let preferenceLoaded = false;
      let shouldRestore = true;
      let playerPositioned = false;
      let positioningAbandoned = false;
      let scrollAttempts = 0;
      let entryAttempted = false;
      let recoveryComplete = false;
      let stableMode: boolean | undefined;
      let stabilityTimer: ReturnType<typeof setTimeout> | undefined;
      let verificationTimer: ReturnType<typeof setTimeout> | undefined;
      let positionTimer: ReturnType<typeof setTimeout> | undefined;

      const clearTimers = () => {
        if (stabilityTimer !== undefined) clearTimeout(stabilityTimer);
        if (verificationTimer !== undefined) clearTimeout(verificationTimer);
        if (positionTimer !== undefined) clearTimeout(positionTimer);
        stabilityTimer = undefined;
        verificationTimer = undefined;
        positionTimer = undefined;
      };

      const clearPositionTimer = () => {
        if (positionTimer !== undefined) clearTimeout(positionTimer);
        positionTimer = undefined;
      };

      const findWebFullscreenControl = () => {
        const semanticControl = selectors.find<HTMLElement>("webFullscreenControl");
        if (semanticControl) return semanticControl;
        return selectors
          .findAll<HTMLElement>("webFullscreenIconCandidates")
          .find(({ element }) => hasDouyuWebFullscreenIconSignature(element)) ?? null;
      };

      const ensurePlayerPosition = (player: { element: HTMLElement; selector: string }) => {
        if (positioningAbandoned) return true;
        if (playerPositioned) return true;
        const viewportHeight = document.defaultView?.innerHeight ?? globalThis.innerHeight;
        if (isElementInViewport(player.element, viewportHeight)) {
          playerPositioned = true;
          return true;
        }
        playerPositioned = false;
        if (scrollAttempts >= AUTO_WEB_FULLSCREEN_MAX_SCROLL_ATTEMPTS) {
          positioningAbandoned = true;
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "degraded", {
            detail: "真实播放器在有界滚动校验后仍未进入视口",
            selector: player.selector,
          });
          return true;
        }

        scrollAttempts += 1;
        player.element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        if (positionTimer === undefined) {
          const delay = [120, 450, 1_000, 1_800][scrollAttempts - 1] ?? 1_800;
          positionTimer = setTimeout(() => {
            positionTimer = undefined;
            if (!disposed) scan();
          }, delay);
        }
        diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "waiting", {
          detail: `正在定位真实播放器（第 ${scrollAttempts}/${AUTO_WEB_FULLSCREEN_MAX_SCROLL_ATTEMPTS} 次几何校验）`,
          selector: player.selector,
        });
        return false;
      };

      const saveStableMode = (mode: boolean) => {
        stableMode = mode;
        void preference.save(mode).catch((error: unknown) => {
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "degraded", {
            detail: `网页全屏状态已变化，但记忆保存失败：${error instanceof Error ? error.message : String(error)}`,
          });
        });
      };

      const completeRecovery = (mode: boolean) => {
        recoveryComplete = true;
        stableMode = mode;
      };

      const watchStableManualMode = () => {
        if (!recoveryComplete || stabilityTimer !== undefined) return;
        const observed = isDouyuWebFullscreen(document);
        if (observed === stableMode) return;
        stabilityTimer = setTimeout(() => {
          stabilityTimer = undefined;
          if (disposed || !recoveryComplete) return;
          const confirmed = isDouyuWebFullscreen(document);
          if (confirmed === stableMode) return;
          saveStableMode(confirmed);
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "active", {
            detail: confirmed
              ? "已记住用户进入网页全屏"
              : "已记住用户退出网页全屏",
          });
        }, 180);
      };

      const scan = () => {
        if (disposed) return;
        if (roomPath !== location.pathname) {
          roomPath = location.pathname;
          playerPositioned = false;
          positioningAbandoned = false;
          scrollAttempts = 0;
          entryAttempted = false;
          recoveryComplete = false;
          stableMode = undefined;
          clearTimers();
        }

        if (!isDouyuNumericRoomPath(roomPath)) {
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "waiting", {
            detail: "等待数字直播间页面",
          });
          return;
        }

        const player = selectors.find<HTMLElement>("player");
        if (!player) {
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "waiting", {
            detail: "等待真实播放器挂载后定位",
          });
          return;
        }
        if (!ensurePlayerPosition(player)) return;
        if (!preferenceLoaded) return;

        const mode = isDouyuWebFullscreen(document);
        if (mode) {
          if (!recoveryComplete) completeRecovery(true);
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "active", {
            detail: "已定位真实播放器，当前为网页全屏",
            selector: player.selector,
          });
          watchStableManualMode();
          return;
        }

        if (!shouldRestore) {
          if (!recoveryComplete) completeRecovery(false);
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "active", {
            detail: "已定位真实播放器；已按全局记忆保持普通页面",
            selector: player.selector,
          });
          watchStableManualMode();
          return;
        }

        // Once initial coordination has settled, a transition back to normal
        // layout is a user result to remember, never a signal to re-enter.
        if (recoveryComplete) {
          watchStableManualMode();
          return;
        }

        if (entryAttempted) return;
        const control = findWebFullscreenControl();
        if (!control) {
          diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "degraded", {
            detail: "已定位真实播放器；未发现网页全屏语义控件或经 SVG 图形签名确认的控件，未执行点击",
            selector: player.selector,
          });
          return;
        }

        entryAttempted = true;
        control.element.click();
        verificationTimer = setTimeout(() => {
          verificationTimer = undefined;
          if (disposed) return;
          const confirmed = isDouyuWebFullscreen(document);
          if (confirmed) {
            completeRecovery(true);
            saveStableMode(true);
            diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "active", {
              detail: "已定位真实播放器并恢复网页全屏",
              selector: `${player.selector} | ${control.selector}`,
            });
          } else {
            completeRecovery(false);
            diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "degraded", {
              detail: "已定位真实播放器；网页全屏控件未在有界验证内生效",
              selector: `${player.selector} | ${control.selector}`,
            });
          }
        }, 300);
      };

      const abandonPositioningForUserIntent = (event: Event) => {
        if (disposed || positioningAbandoned || !isAutoWebFullscreenUserScrollIntent(event)) return;
        positioningAbandoned = true;
        clearPositionTimer();
        diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "active", {
          detail: "用户已主动滚动；本直播间不再纠正页面位置",
        });
        // Position correction is now relinquished, but the independent webpage
        // fullscreen recovery still needs a chance to complete.
        scan();
      };

      const stopWatching = observerHub.subscribe(scan);
      void preference.load().then((value) => {
        if (disposed) return;
        shouldRestore = value;
        preferenceLoaded = true;
        scan();
      }).catch((error: unknown) => {
        if (disposed) return;
        preferenceLoaded = true;
        diagnostics.update(AUTO_WEB_FULLSCREEN_ID, "degraded", {
          detail: `网页全屏记忆读取失败，按默认恢复：${error instanceof Error ? error.message : String(error)}`,
        });
        scan();
      });
      document.defaultView?.addEventListener("popstate", scan);
      document.defaultView?.addEventListener("load", scan);
      document.defaultView?.addEventListener("pageshow", scan);
      document.defaultView?.addEventListener("wheel", abandonPositioningForUserIntent, { passive: true });
      document.defaultView?.addEventListener("touchmove", abandonPositioningForUserIntent, { passive: true });
      document.defaultView?.addEventListener("keydown", abandonPositioningForUserIntent);
      scan();

      return () => {
        disposed = true;
        clearTimers();
        stopWatching();
        document.defaultView?.removeEventListener("popstate", scan);
        document.defaultView?.removeEventListener("load", scan);
        document.defaultView?.removeEventListener("pageshow", scan);
        document.defaultView?.removeEventListener("wheel", abandonPositioningForUserIntent);
        document.defaultView?.removeEventListener("touchmove", abandonPositioningForUserIntent);
        document.defaultView?.removeEventListener("keydown", abandonPositioningForUserIntent);
      };
    },
  };
}

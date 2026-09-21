import type { FeatureDefinition } from "../core/feature.ts";

export const COMPACT_PLAYER_ID = "compact-player";
export const COMPACT_PLAYER_FULL_PAGE_ATTRIBUTE = "data-dwe-player-full-page";
export const COMPACT_PLAYER_OFFSET_ATTRIBUTE = "data-dwe-player-controls-offset";
export const COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE =
  "data-dwe-compact-player-toolbar-host";

/**
 * Douyu's full-page mode is distinct from the browser Fullscreen API. Keep this
 * detection in one place so layout features and recovery features cannot drift.
 */
export function isDouyuWebFullscreen(document: Pick<Document, "querySelector">): boolean {
  return Boolean(
    document.querySelector(".wfs-2a8e83.removed-9d4c42, .toggle__P8TKM"),
  );
}

export const compactPlayerSelectors = {
  giftBar: [
    "#js-player-toolbar .PlayerToolbar > .PlayerToolbar-ContentRow:first-child",
    ".PlayerToolbar > .PlayerToolbar-ContentRow:first-child",
  ],
  player: [".layout-Player-video", ".stream__T55I3"],
  playerToolbar: ["#js-player-toolbar"],
} as const;

export const COMPACT_PLAYER_CSS = `
.PlayerToolbar > .PlayerToolbar-ContentRow:first-child {
  visibility: hidden !important;
  pointer-events: none !important;
}

.layout-Player-video,
.stream__T55I3 {
  bottom: 0 !important;
  z-index: 25 !important;
}

#js-player-toolbar {
  z-index: 30 !important;
}

[${COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE}="on"] {
  z-index: 20 !important;
}

html[${COMPACT_PLAYER_FULL_PAGE_ATTRIBUTE}="on"] #js-player-toolbar {
  z-index: 20 !important;
}

html[${COMPACT_PLAYER_OFFSET_ATTRIBUTE}="on"] .case__f4yex {
  bottom: -84px !important;
}

.PELact,
.pushTower-wrapper-gf1HG,
.PkView-9f6a2c,
.MorePk,
.RandomPKBar,
.LiveRoomLoopVideo,
.LiveRoomDianzan,
.maiMaitView-68e80c,
.PkView {
  display: none !important;
}
`;

export const compactPlayerFeature: FeatureDefinition = {
  id: COMPACT_PLAYER_ID,
  start({ diagnostics, document, observerHub, root, selectors, styles }) {
    const removeStyle = styles.add(COMPACT_PLAYER_ID, COMPACT_PLAYER_CSS);

    const scan = () => {
      const giftBar = selectors.find("giftBar");
      const player = selectors.find("player");
      const playerToolbar = selectors.find("playerToolbar");
      const toolbarHost = playerToolbar?.element.parentElement;
      document
        .querySelectorAll(`[${COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE}]`)
        .forEach((element) => {
          if (element !== toolbarHost) {
            element.removeAttribute(COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE);
          }
        });
      if (toolbarHost?.closest(".live-next-body")) {
        toolbarHost.setAttribute(COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE, "on");
      }
      const fullPage = isDouyuWebFullscreen(document);
      const browserFullScreen = Boolean(
        document.fullscreenElement ||
          (document as Document & { webkitFullscreenElement?: Element })
            .webkitFullscreenElement,
      );
      const chatPanelHidden = Boolean(document.querySelector(".shrink__Sd0uK"));
      if (fullPage) root.setAttribute(COMPACT_PLAYER_FULL_PAGE_ATTRIBUTE, "on");
      else root.removeAttribute(COMPACT_PLAYER_FULL_PAGE_ATTRIBUTE);
      if (browserFullScreen || (fullPage && chatPanelHidden)) {
        root.setAttribute(COMPACT_PLAYER_OFFSET_ATTRIBUTE, "on");
      } else {
        root.removeAttribute(COMPACT_PLAYER_OFFSET_ATTRIBUTE);
      }

      if (!giftBar || !player || !playerToolbar) {
        diagnostics.update(COMPACT_PLAYER_ID, "waiting", {
          detail: "等待斗鱼播放器、礼物栏和工具栏挂载",
        });
        return;
      }

      diagnostics.update(COMPACT_PLAYER_ID, "active", {
        detail: "礼物展示栏已隐藏，播放器已扩展且下层功能栏已保留",
        selector: `${giftBar.selector} | ${player.selector} | ${playerToolbar.selector}`,
      });
    };
    const stopWatching = observerHub.subscribe(scan);
    document.addEventListener("fullscreenchange", scan);
    scan();
    document.defaultView?.dispatchEvent(new Event("resize"));

    return () => {
      stopWatching();
      document.removeEventListener("fullscreenchange", scan);
      removeStyle();
      root.removeAttribute(COMPACT_PLAYER_FULL_PAGE_ATTRIBUTE);
      root.removeAttribute(COMPACT_PLAYER_OFFSET_ATTRIBUTE);
      document
        .querySelectorAll(`[${COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE}]`)
        .forEach((element) =>
          element.removeAttribute(COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE),
        );
      document.defaultView?.dispatchEvent(new Event("resize"));
    };
  },
};

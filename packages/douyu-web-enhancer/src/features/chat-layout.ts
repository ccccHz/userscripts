import type { FeatureDefinition } from "../core/feature.ts";

export const CHAT_LAYOUT_ID = "chat-layout";
export const chatLayoutSelectors = {
  barragePanel: [".Barrage"],
  rankPanel: [".layout-Player-rank"],
} as const;

export const CHAT_LAYOUT_CSS = `
.layout-Player-rank,
#js-room-activity {
  display: none !important;
}

.Barrage {
  top: 0 !important;
}
`;

export const chatLayoutFeature: FeatureDefinition = {
  id: CHAT_LAYOUT_ID,
  start({ diagnostics, observerHub, selectors, styles }) {
    const removeStyle = styles.add(CHAT_LAYOUT_ID, CHAT_LAYOUT_CSS);

    const scan = () => {
      const rankPanel = selectors.find("rankPanel");
      const barragePanel = selectors.find("barragePanel");
      if (!rankPanel || !barragePanel) {
        diagnostics.update(CHAT_LAYOUT_ID, "waiting", {
          detail: "等待斗鱼礼物榜和弹幕区挂载",
        });
        return;
      }

      diagnostics.update(CHAT_LAYOUT_ID, "active", {
        detail: "礼物榜已隐藏，弹幕区已拉高",
        selector: `${rankPanel.selector} | ${barragePanel.selector}`,
      });
      stopWatching();
    };
    const stopWatching = observerHub.subscribe(scan);
    scan();

    return () => {
      stopWatching();
      removeStyle();
    };
  },
};

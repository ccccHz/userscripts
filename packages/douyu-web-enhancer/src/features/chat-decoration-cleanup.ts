import type { FeatureDefinition } from "../core/feature.ts";

export const CHAT_DECORATION_CLEANUP_ID = "chat-decoration-cleanup";
export const chatDecorationSelectors = {
  barrageList: [".Barrage-list"],
} as const;

export const CHAT_DECORATION_CLEANUP_CSS = `
.UserCsgoGameDataMedal,
.Barrage-honor,
.Barrage-listItem .Barrage-icon,
.Barrage-listItem .FansMedal.is-made,
.Barrage-listItem .RoomLevel,
.Barrage-listItem .Motor,
.Barrage-listItem .ChatAchievement,
.Barrage-listItem .Barrage-hiIcon,
.Barrage-listItem .Medal,
.Barrage-listItem .MatchSystemTeamMedal,
.Barrage-listItem .Baby,
.FansMedalWrap {
  display: none !important;
}
`;

export const chatDecorationCleanupFeature: FeatureDefinition = {
  id: CHAT_DECORATION_CLEANUP_ID,
  start({ diagnostics, observerHub, selectors, styles }) {
    const removeStyle = styles.add(
      CHAT_DECORATION_CLEANUP_ID,
      CHAT_DECORATION_CLEANUP_CSS,
    );

    const scan = () => {
      const barrageList = selectors.find("barrageList");
      if (!barrageList) {
        diagnostics.update(CHAT_DECORATION_CLEANUP_ID, "waiting", {
          detail: "等待斗鱼弹幕列表挂载",
        });
        return;
      }

      diagnostics.update(CHAT_DECORATION_CLEANUP_ID, "active", {
        detail: "弹幕徽章和前缀已精简",
        selector: barrageList.selector,
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

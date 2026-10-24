import type { FeatureDefinition } from "../core/feature.ts";
import type { ActivityCleanupStats } from "./activity-cleanup-stats.ts";
import type { ActivityFilterReview } from "./activity-filter-review.ts";
import type { PageSocketHook } from "../core/page-socket-hook.ts";

export const ACTIVITY_LINK_CLEANUP_ID = "activity-link-cleanup";

// Confirmed by natural chatmsg samples, official templates and the rendered chat rows.
// These are action identifiers, not message text or user identities.
export const ACTIVITY_LINK_ACTIONS = [
  "_dyRn_DYRNTowerGame2606_openH5_subType1",
  "_dyRn_DYRNWatermelon2607_openH5_subType1",
] as const;

export const ACTIVITY_LINK_CLEANUP_CSS = `${ACTIVITY_LINK_ACTIONS.map((action) =>
  `.Barrage-list .Barrage-listItem:has(.js-barrage-activity-link[data-btype="${action}"])`,
).join(",\n")} {
  display: none !important;
}`;

export function confirmedActivityRoom(message: string, currentRoomId: string | null): string | null {
  if (!message.endsWith("/")) return null;
  const fields = message.split("/");
  const matches = (name: string): string[] => fields.filter(value => value.startsWith(`${name}@=`)).map(value => value.slice(name.length + 2));
  if (matches("type").length !== 1 || matches("type")[0] !== "chatmsg") return null;
  const ids = matches("gadid"), rooms = matches("rid"), texts = matches("txt");
  if (ids.length !== 1 || rooms.length !== 1 || texts.length !== 1) return null;
  const id = ids[0];
  if (id !== "29" && id !== "48") return null;
  const roomId = rooms[0];
  return roomId && roomId === currentRoomId && /^[1-9]\d{0,11}$/.test(roomId) ? roomId : null;
}

export function createActivityLinkCleanupFeature(stats: ActivityCleanupStats, currentRoomId: () => string | null, hook: Pick<PageSocketHook, "setActivityFilter">, review?: ActivityFilterReview): FeatureDefinition { return {
  id: ACTIVITY_LINK_CLEANUP_ID,
  start({ diagnostics, styles }) {
    const removeStyle = styles.add(ACTIVITY_LINK_CLEANUP_ID, ACTIVITY_LINK_CLEANUP_CSS);
    hook.setActivityFilter(message => confirmedActivityRoom(message, currentRoomId()), (rooms, messages) => {
      for (const [index, roomId] of rooms.entries()) {
        stats.recordFiltered(roomId);
        if (messages?.[index]) review?.record(roomId, messages[index]);
      }
    });
    diagnostics.update(ACTIVITY_LINK_CLEANUP_ID, "active", {
      detail: "已过滤新到达的合成大西瓜、保卫鱼娘活动弹幕；既有聊天行暂由样式隐藏",
    });
    return () => { hook.setActivityFilter(null); removeStyle(); void stats.flush(); };
  },
}; }

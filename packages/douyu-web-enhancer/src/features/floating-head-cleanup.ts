import type { FeatureDefinition } from "../core/feature.ts";

export const FLOATING_HEAD_CLEANUP_ID = "floating-head-cleanup";

// The official scroll renderer creates direct headpic children from leftPic,
// dcallPic and jhsPic. Body emoji live inside textWrap and have separate classes.
// Keep the rule scoped to the player and scroll renderer, including future hashes.
const scrollRow = '#__h5player :is([class^="danmu-"], [class*=" danmu-"]) > [data-comment-uuid]';
export const FLOATING_HEAD_CLEANUP_CSS = `
${scrollRow} > img[class^="headpic-"] {
  display: none !important;
}
${scrollRow}:has(> img[class^="headpic-"]) > [class^="text-"] {
  margin-left: 0 !important;
}
`;

export const floatingHeadCleanupFeature: FeatureDefinition = {
  id: FLOATING_HEAD_CLEANUP_ID,
  start({ diagnostics, styles }) {
    const removeStyle = styles.add(FLOATING_HEAD_CLEANUP_ID, FLOATING_HEAD_CLEANUP_CSS);
    diagnostics.update(FLOATING_HEAD_CLEANUP_ID, "active", {
      detail: "已隐藏普通飘屏的头部图像；保留正文、表情和彩字，特殊皮肤待覆盖",
    });
    return removeStyle;
  },
};

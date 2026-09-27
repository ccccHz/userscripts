import type { FeatureDefinition } from "../core/feature.ts";

export const TRANSIENT_GUIDANCE_CLEANUP_ID = "transient-guidance-cleanup";

export const transientGuidanceSelectors = {
  badgePrompt: [".FansMedalDialog-normal"],
  buffPrompt: ["#js-layout-fixed-buff-content > .AnchorPocketTips"],
} as const;

/** Hide only the two observed entry prompts and preserve their surrounding UI. */
export const TRANSIENT_GUIDANCE_CLEANUP_CSS = `
.FansMedalDialog-normal:has(> .FansMedalDialog-desc.is-geted > .FansMedalDialog-wareMedal) {
  display: none !important;
}

#js-layout-fixed-buff-content > .AnchorPocketTips {
  display: none !important;
}

#js-layout-fixed-buff:not(:has(> #js-layout-fixed-buff-content > *:not(.AnchorPocketTips))) > .close__D27HS {
  display: none !important;
}

#js-layout-fixed-buff-content:not(:has(> *:not(.AnchorPocketTips))) {
  display: none !important;
}

#js-layout-fixed-buff:has(> #js-layout-fixed-buff-content > .AnchorPocketTips):not(:has(> #js-layout-fixed-buff-content > *:not(.AnchorPocketTips))) {
  width: 0 !important;
  min-width: 0 !important;
  height: 0 !important;
  min-height: 0 !important;
  pointer-events: none !important;
}
`;

export const transientGuidanceCleanupFeature: FeatureDefinition = {
  id: TRANSIENT_GUIDANCE_CLEANUP_ID,
  start({ diagnostics, styles }) {
    const removeStyle = styles.add(
      TRANSIENT_GUIDANCE_CLEANUP_ID,
      TRANSIENT_GUIDANCE_CLEANUP_CSS,
    );
    diagnostics.update(TRANSIENT_GUIDANCE_CLEANUP_ID, "active", {
      detail: "已隐藏已拥有徽章提示和亲密度 BUFF 瞬态引导",
    });
    return removeStyle;
  },
};

export const LIVE_COMMERCE_AD_SELECTORS = [
  "#EcmoCardLayout",
  'div[data-e2e="yellowCart-container"]',
  '[data-douyin-live-product-entry="placeholder"]',
];

export function observeAndRemoveCommerceAds({
  document = globalThis.document,
  MutationObserver = document?.defaultView?.MutationObserver || globalThis.MutationObserver,
} = {}) {
  removeCommerceAds(document);
  if (!MutationObserver) return null;

  const target = document?.body || document?.documentElement;
  if (!target) return null;

  const observer = new MutationObserver(() => {
    removeCommerceAds(document);
  });
  observer.observe(target, {
    childList: true,
    subtree: true,
  });

  return observer;
}

export function removeCommerceAds(root) {
  const ads = LIVE_COMMERCE_AD_SELECTORS.flatMap((selector) =>
    Array.from(root?.querySelectorAll?.(selector) || []),
  ).filter((node, index, all) => all.indexOf(node) === index);

  ads.forEach((ad) => ad.remove());
  return ads;
}

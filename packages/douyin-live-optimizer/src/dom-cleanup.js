export const LIVE_BOTTOM_LAYOUT_SELECTORS = [
  "#BottomLayout",
  '[data-e2e="gifts-container"]',
  '[data-e2e="gifts-switch"]',
  "#giftPanelEntrance",
  ".gitBarOptimizeEnabled",
  'iframe[data-container-id^="@annie/web_"]',
];

const PROTECTED_IDS = new Set([
  "root", "ContainerBackgroundLayout", "LeftBackgroundLayout", "HeaderLayout", "PlayerLayout", "chatInput",
]);
const PROTECTED_DESCENDANTS = 'video, #PlayerLayout, .douyin-player, [data-e2e="basicPlayer"], [id^="living_player_container"], #chatInput, [data-douyin-live-optimizer-panel]';

export function isProtectedLayoutRoot(node) {
  if (!node) return false;
  if (isProtectedNode(node)) return true;
  if (node.querySelector) return Boolean(node.querySelector(PROTECTED_DESCENDANTS));
  return hasDescendantOrSelf(node, isProtectedNode);
}

function isProtectedNode(node) {
  return ["HTML", "BODY", "VIDEO"].includes(String(node.tagName || "").toUpperCase()) ||
    PROTECTED_IDS.has(node.id) || String(node.id || "").startsWith("living_player_container") ||
    hasClass(node, "douyin-player") || node.getAttribute?.("data-e2e") === "basicPlayer" ||
    node.getAttribute?.("data-douyin-live-optimizer-panel") != null;
}

export function removeLiveBottomLayout(target) {
  const root = findLiveBottomLayoutRoot(target);
  if (root) root.remove();
  return root;
}

export function findLiveBottomLayoutRoot(target) {
  if (!target || isProtectedLayoutRoot(target)) return null;

  const bottomLayout = closestBy(target, (node) => node.id === "BottomLayout");
  if (bottomLayout) return bottomLayout;

  const sharedGiftRoot = closestBy(target, hasGiftBarPair);
  if (sharedGiftRoot) return sharedGiftRoot;

  const fullscreenGameRoot = findFullscreenGameRoot(target);
  if (fullscreenGameRoot) return fullscreenGameRoot;

  const oldGiftBarMarker = closestBy(target, (node) =>
    hasClass(node, "gitBarOptimizeEnabled"),
  );
  if (oldGiftBarMarker) return findLegacyGiftBarRoot(oldGiftBarMarker);

  if (isAnnieIframe(target)) return null;

  return target;
}

function findFullscreenGameRoot(target) {
  if (!isAnnieIframe(target)) return null;

  let current = target;
  let depth = 0;

  while (current && depth <= 3) {
    if (isProtectedLayoutRoot(current)) return null;
    if (isFullscreenGameRoot(current)) return current;
    current = current.parentElement || current.parentNode || null;
    depth += 1;
  }

  return null;
}

function findLegacyGiftBarRoot(target) {
  let current = target;

  while (current?.parentNode && current.parentNode.childNodes.length <= 2 && !isProtectedLayoutRoot(current.parentNode)) {
    current = current.parentNode;
  }

  return current;
}

function hasGiftBarPair(node) {
  return (
    hasDescendantOrSelf(node, isGiftsContainer) &&
    hasDescendantOrSelf(node, isGiftSwitch)
  );
}

function isGiftsContainer(node) {
  return node.getAttribute?.("data-e2e") === "gifts-container";
}

function isGiftSwitch(node) {
  return (
    node.id === "giftPanelEntrance" ||
    node.getAttribute?.("data-e2e") === "gifts-switch"
  );
}

function isFullscreenGameRoot(node) {
  return hasDescendantOrSelf(node, isAnnieIframe) && getCompactText(node).includes("游戏");
}

function isAnnieIframe(node) {
  return (
    String(node.tagName || "").toUpperCase() === "IFRAME" &&
    String(node.getAttribute?.("data-container-id") || "").startsWith("@annie/web_")
  );
}

function closestBy(target, predicate) {
  let current = target;

  while (current) {
    if (isProtectedLayoutRoot(current)) return null;
    if (predicate(current)) return current;
    current = current.parentElement || current.parentNode || null;
  }

  return null;
}

function hasDescendantOrSelf(node, predicate) {
  if (predicate(node)) return true;

  for (const child of node.childNodes || []) {
    if (hasDescendantOrSelf(child, predicate)) return true;
  }

  return false;
}

function hasClass(node, className) {
  return String(node.className || "")
    .split(/\s+/)
    .includes(className);
}

function getCompactText(node) {
  let text = String(node.textContent || "");

  for (const child of node.childNodes || []) {
    text += getCompactText(child);
  }

  return text.replace(/\s+/g, "");
}

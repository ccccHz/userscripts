const BLOCKED_TOOLTIP_TEXTS = [
  "帮主播完成心愿吧",
  "点亮展馆帮主播集星",
];
const TOOLTIP_CLASS = "dylive-tooltip";
const LEGACY_EXHIBITION_TOOLTIP_SELECTOR =
  '[data-e2e="exhibition-banner"] .dylive-tooltip';

export function observeAndRemoveWishPopups({
  document = globalThis.document,
  MutationObserver = document?.defaultView?.MutationObserver || globalThis.MutationObserver,
} = {}) {
  removeWishPopups(document);
  if (!MutationObserver) return null;

  const target = document?.body || document?.documentElement;
  if (!target) return null;

  const observer = new MutationObserver(() => {
    removeWishPopups(document);
  });
  observer.observe(target, {
    childList: true,
    subtree: true,
  });

  return observer;
}

export async function waitAndRemoveWishPopup({
  document = globalThis.document,
  sleep = defaultSleep,
  interval = 1000,
  maxAttempts = 600,
} = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const popup = removeWishPopup(document);
    if (popup) return { removed: true, attempts: attempt + 1 };

    await sleep(interval);
  }

  return { removed: false, attempts: maxAttempts };
}

export function removeWishPopup(root) {
  const popup = findWishPopup(root);
  if (popup) popup.remove();
  return popup;
}

export function removeWishPopups(root) {
  const popups = findWishPopups(root);
  popups.forEach((popup) => popup.remove());
  return popups;
}

export function findWishPopup(root) {
  return findWishPopups(root)[0] || null;
}

export function findWishPopups(root) {
  const start = root?.body || root;
  const tooltips = collectDescendants(start).filter(isTooltip);
  const matchedTooltips = tooltips.filter(hasBlockedTooltipText);
  const legacyExhibitionTooltips = Array.from(
    root?.querySelectorAll?.(LEGACY_EXHIBITION_TOOLTIP_SELECTOR) ||
      start?.querySelectorAll?.(LEGACY_EXHIBITION_TOOLTIP_SELECTOR) ||
      [],
  );
  const directMatches = uniqueNodes([
    ...matchedTooltips,
    ...legacyExhibitionTooltips,
  ]);

  if (directMatches.length) return directMatches;

  const labels = collectDescendants(start).filter(hasBlockedTooltipText);

  return uniqueNodes(
    labels
      .map((label) => closestBy(label, isTooltip))
      .filter(Boolean),
  );
}

function isTooltip(node) {
  return hasClass(node, TOOLTIP_CLASS);
}

function hasBlockedTooltipText(node) {
  const text = getCompactText(node);
  return BLOCKED_TOOLTIP_TEXTS.some((blockedText) => text.includes(blockedText));
}

function uniqueNodes(nodes) {
  return nodes.filter((node, index, all) => all.indexOf(node) === index);
}

function closestBy(target, predicate) {
  let current = target;

  while (current) {
    if (predicate(current)) return current;
    current = current.parentElement || current.parentNode || null;
  }

  return null;
}

function collectDescendants(root) {
  const result = [];
  walk(root, result);
  return result;
}

function walk(node, result) {
  if (!node) return;

  result.push(node);
  for (const child of node.childNodes || []) {
    walk(child, result);
  }
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

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

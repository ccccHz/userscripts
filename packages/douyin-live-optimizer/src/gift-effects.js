const GIFT_EFFECT_LABEL = "屏蔽礼物特效";
const GIFT_EFFECT_SWITCH_SELECTOR = '[data-e2e="effect-switch"]';
const GIFT_SETTING_SELECTOR = '[data-e2e="gift-setting"]';

export async function ensureGiftEffectsBlocked({
  document = globalThis.document,
  sleep = defaultSleep,
} = {}) {
  const trigger = await waitForGiftSettingTrigger(document, sleep);
  if (!trigger) return giftEffectResult(false, false, false);

  openGiftSettingsPanel(trigger);

  const switchTarget = await waitForGiftEffectSwitch(document, sleep);
  if (!switchTarget) return giftEffectResult(true, false, false);
  if (isSwitchEnabled(switchTarget)) return giftEffectResult(true, true, false);

  activateGiftEffectSwitch(getGiftEffectClickTarget(switchTarget));
  await sleep(100);
  leaveGiftSetting(trigger);
  return giftEffectResult(true, true, true);
}

export function findGiftSettingTrigger(root) {
  return (
    root?.querySelector?.(GIFT_SETTING_SELECTOR) ||
    findDescendant(root, (node) => node.getAttribute?.("data-e2e") === "gift-setting")
  );
}

export function findGiftEffectSwitch(root) {
  const stableSwitch = root?.querySelector?.(GIFT_EFFECT_SWITCH_SELECTOR);
  if (stableSwitch) return stableSwitch;

  const label = findSmallestTextElement(root, GIFT_EFFECT_LABEL);
  if (!label) return null;

  let current = label;
  let depth = 0;

  while (current && depth < 8) {
    const semanticSwitch = findDescendant(current, isSemanticSwitchCandidate);
    if (semanticSwitch) return semanticSwitch;

    const nestedStableSwitch = findDescendant(current, isGiftEffectSwitch);
    if (nestedStableSwitch) return nestedStableSwitch;

    const fallbackSwitch = findFallbackSwitchCandidate(current);
    if (fallbackSwitch) return fallbackSwitch;

    const rightSideSwitch = findRightSideControlCandidate(current, label);
    if (rightSideSwitch) return rightSideSwitch;

    current = current.parentElement || current.parentNode || null;
    depth += 1;
  }

  return null;
}

export function isSwitchEnabled(target) {
  if (target.checked === true) return true;
  if (target.getAttribute?.("aria-checked") === "true") return true;
  if (target.getAttribute?.("data-state") === "checked") return true;
  if (isSwitchKnobOnRight(target)) return true;

  return /\b(?:checked|is-checked|active|selected|on)\b/i.test(
    String(target.className || ""),
  );
}

export function getGiftEffectClickTarget(target) {
  if (target?.getAttribute?.("data-e2e") !== "effect-switch") return target;

  return target.firstElementChild || target;
}

async function waitForGiftSettingTrigger(root, sleep) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const trigger = findGiftSettingTrigger(root);
    if (trigger) return trigger;

    await sleep(200);
  }

  return null;
}

async function waitForGiftEffectSwitch(root, sleep) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(200);

    const switchTarget = findGiftEffectSwitch(root);
    if (switchTarget) return switchTarget;
  }

  return null;
}

function openGiftSettingsPanel(trigger) {
  hoverGiftSetting(trigger);
}

function activateGiftEffectSwitch(target) {
  target?.click?.();
}

export function hoverGiftSetting(element) {
  if (!element?.dispatchEvent || !element?.getBoundingClientRect) return;

  const view = element.ownerDocument?.defaultView || globalThis;
  const rect = element.getBoundingClientRect();
  const options = {
    bubbles: true,
    cancelable: true,
    clientX: rect.x + rect.width / 2,
    clientY: rect.y + rect.height / 2,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };

  dispatchHoverEvent(view.PointerEvent, element, "pointerover", options);
  dispatchHoverEvent(view.PointerEvent, element, "pointerenter", {
    ...options,
    bubbles: false,
  });
  dispatchHoverEvent(view.MouseEvent, element, "mouseover", options);
  dispatchHoverEvent(view.MouseEvent, element, "mouseenter", {
    ...options,
    bubbles: false,
  });
  dispatchHoverEvent(view.MouseEvent, element, "mousemove", options);
}

export function leaveGiftSetting(element) {
  if (!element?.dispatchEvent || !element?.getBoundingClientRect) return;

  const doc = element.ownerDocument || globalThis.document;
  const view = doc?.defaultView || globalThis;
  const outside =
    doc?.elementFromPoint?.(
      Number(view.innerWidth || 0) / 2,
      Number(view.innerHeight || 0) / 2,
    ) || doc?.body;
  if (!outside?.dispatchEvent) return;

  const rect = outside.getBoundingClientRect?.() || {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  const position = {
    clientX: rect.x + rect.width / 2,
    clientY: rect.y + rect.height / 2,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };
  const leaveOptions = {
    ...position,
    bubbles: true,
    cancelable: true,
    relatedTarget: outside,
  };
  const enterOptions = {
    ...position,
    bubbles: true,
    cancelable: true,
    relatedTarget: element,
  };

  dispatchHoverEvent(view.PointerEvent, element, "pointerout", leaveOptions);
  dispatchHoverEvent(view.PointerEvent, element, "pointerleave", {
    ...leaveOptions,
    bubbles: false,
  });
  dispatchHoverEvent(view.MouseEvent, element, "mouseout", leaveOptions);
  dispatchHoverEvent(view.MouseEvent, element, "mouseleave", {
    ...leaveOptions,
    bubbles: false,
  });
  dispatchHoverEvent(view.PointerEvent, outside, "pointerover", enterOptions);
  dispatchHoverEvent(view.MouseEvent, outside, "mouseover", enterOptions);
  dispatchHoverEvent(view.MouseEvent, outside, "mousemove", enterOptions);
}

function dispatchHoverEvent(EventConstructor, target, type, options) {
  if (!EventConstructor) return;
  target.dispatchEvent(new EventConstructor(type, options));
}

function isSwitchKnobOnRight(target) {
  const track = target?.getAttribute?.("data-e2e") === "effect-switch"
    ? target.firstElementChild
    : target;
  const knob = track?.firstElementChild || null;
  const trackRect = getRect(track);
  const knobRect = getRect(knob);

  if (!isUsableRect(trackRect) || !isUsableRect(knobRect)) return false;

  const knobCenterX = knobRect.x + knobRect.width / 2;
  const ratio = (knobCenterX - trackRect.x) / trackRect.width;

  return ratio >= 0.58;
}

function findSmallestTextElement(root, text) {
  const matches = collectDescendants(root).filter((node) =>
    getCompactText(node).includes(text),
  );

  return matches.sort(
    (left, right) => getCompactText(left).length - getCompactText(right).length,
  )[0] || null;
}

function isSemanticSwitchCandidate(node) {
  const role = node.getAttribute?.("role");
  const inputType = node.getAttribute?.("type");

  return (
    role === "switch" ||
    inputType === "checkbox" ||
    node.getAttribute?.("aria-checked") !== null ||
    node.getAttribute?.("data-state") !== null
  );
}

function isGiftEffectSwitch(node) {
  return node.getAttribute?.("data-e2e") === "effect-switch";
}

function findFallbackSwitchCandidate(root) {
  const candidates = collectDescendants(root).filter((node) => {
    if (getCompactText(node)) return false;
    if ((node.childNodes || []).length > 1) return false;

    return /switch|toggle|checkbox|checked|knob/i.test(String(node.className || ""));
  });

  return candidates[candidates.length - 1] || null;
}

function findRightSideControlCandidate(root, label) {
  const labelRect = getRect(label);
  if (!isUsableRect(labelRect)) return null;

  const candidates = collectDescendants(root).filter((node) => {
    if (node === label) return false;
    if (containsNode(node, label)) return false;
    if (getCompactText(node)) return false;

    const rect = getRect(node);
    return (
      isUsableRect(rect) &&
      rect.x >= labelRect.x + labelRect.width - 4 &&
      hasVerticalOverlap(rect, labelRect) &&
      isLikelyClickableControlRect(rect)
    );
  });

  return candidates.sort(compareRightSideCandidates)[0] || null;
}

function findDescendant(root, predicate) {
  return collectDescendants(root).find(predicate) || null;
}

function collectDescendants(root) {
  const start = root?.body || root;
  const result = [];
  walk(start, result);
  return result;
}

function walk(node, result) {
  if (!node) return;

  result.push(node);
  for (const child of node.childNodes || []) {
    walk(child, result);
  }
}

function containsNode(parent, target) {
  if (parent === target) return true;

  for (const child of parent.childNodes || []) {
    if (containsNode(child, target)) return true;
  }

  return false;
}

function getRect(node) {
  if (!node?.getBoundingClientRect) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const rect = node.getBoundingClientRect?.();

  return {
    x: Number(rect?.x || 0),
    y: Number(rect?.y || 0),
    width: Number(rect?.width || 0),
    height: Number(rect?.height || 0),
  };
}

function isUsableRect(rect) {
  return rect.width > 0 && rect.height > 0;
}

function hasVerticalOverlap(left, right) {
  const leftBottom = left.y + left.height;
  const rightBottom = right.y + right.height;

  return Math.min(leftBottom, rightBottom) - Math.max(left.y, right.y) > 0;
}

function isLikelyClickableControlRect(rect) {
  return rect.width >= 12 && rect.width <= 120 && rect.height >= 10 && rect.height <= 60;
}

function compareRightSideCandidates(left, right) {
  const leftRect = getRect(left);
  const rightRect = getRect(right);
  const xDistance = leftRect.x - rightRect.x;

  if (xDistance !== 0) return xDistance;

  return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
}

function getCompactText(node) {
  let text = String(node.textContent || "");

  for (const child of node.childNodes || []) {
    text += getCompactText(child);
  }

  return text.replace(/\s+/g, "");
}

function giftEffectResult(triggerFound, switchFound, clicked) {
  return { triggerFound, switchFound, clicked };
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

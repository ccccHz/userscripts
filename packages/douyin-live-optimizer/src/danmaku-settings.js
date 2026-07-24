import {
  hoverGiftSetting,
  isSwitchEnabled,
  leaveGiftSetting,
} from "./gift-effects.js";

const DANMAKU_SETTING_TRIGGER_SELECTOR =
  '[data-e2e="danmaku-setting-icon"]';
const DISABLED_FILTER_LABELS = ["送礼信息", "福袋口令"];

export async function ensureDanmakuFiltersDisabled({
  document = globalThis.document,
  sleep = defaultSleep,
} = {}) {
  const trigger = await waitForElement(
    () => document?.querySelector?.(DANMAKU_SETTING_TRIGGER_SELECTOR),
    sleep,
  );
  if (!trigger) return danmakuResult(false, [], []);

  const hoverTarget = trigger.parentElement || trigger.parentNode || trigger;
  hoverGiftSetting(hoverTarget);
  if (hoverTarget !== trigger) hoverGiftSetting(trigger);

  const switches = await waitForElement(() => {
    const matched = DISABLED_FILTER_LABELS.map((label) =>
      findDanmakuFilterSwitch(document, label),
    );
    return matched.every(isVisibleSwitch) ? matched : null;
  }, sleep);

  if (!switches) {
    closeDanmakuSettingsPanel(trigger, hoverTarget);
    return danmakuResult(true, [], []);
  }

  const clickedLabels = [];
  DISABLED_FILTER_LABELS.forEach((label, index) => {
    const switchTarget = switches[index];
    if (!isDanmakuSwitchEnabled(switchTarget)) return;

    switchTarget.click();
    clickedLabels.push(label);
  });

  await sleep(100);
  closeDanmakuSettingsPanel(trigger, hoverTarget);

  return danmakuResult(
    true,
    [...DISABLED_FILTER_LABELS],
    clickedLabels,
  );
}

export function findDanmakuFilterSwitch(root, labelText) {
  const labels = collectDescendants(root).filter(
    (node) => node.nodeType !== 3 && getCompactText(node) === labelText,
  );
  const label = labels[labels.length - 1];
  if (!label) return null;

  const row = label.parentElement || label.parentNode;
  if (!row) return null;

  const siblings = Array.from(row.children || row.childNodes || []);
  const switchWrapper = siblings.find(
    (node) => node !== label && !containsNode(node, label),
  );

  return switchWrapper?.firstElementChild ||
    switchWrapper?.childNodes?.[0] ||
    null;
}

function closeDanmakuSettingsPanel(trigger, hoverTarget) {
  leaveGiftSetting(trigger);
  if (hoverTarget !== trigger) leaveGiftSetting(hoverTarget);
}

function isDanmakuSwitchEnabled(target) {
  const trackRect = target?.getBoundingClientRect?.();
  const knobRect = target?.firstElementChild?.getBoundingClientRect?.();

  if (
    Number(trackRect?.width || 0) > 0 &&
    Number(knobRect?.width || 0) > 0
  ) {
    const knobCenterX =
      Number(knobRect.x || 0) + Number(knobRect.width || 0) / 2;
    const ratio =
      (knobCenterX - Number(trackRect.x || 0)) /
      Number(trackRect.width || 1);

    return ratio >= 0.58;
  }

  return isSwitchEnabled(target);
}

function isVisibleSwitch(target) {
  if (!target?.getBoundingClientRect) return false;

  const rect = target.getBoundingClientRect();
  return Number(rect?.width || 0) > 0 && Number(rect?.height || 0) > 0;
}

async function waitForElement(
  find,
  sleep,
  maxAttempts = 600,
  interval = 100,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const element = find();
    if (element) return element;

    await sleep(interval);
  }

  return null;
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

function getCompactText(node) {
  return String(node.textContent || "").replace(/\s+/g, "");
}

function danmakuResult(triggerFound, switchLabels, clickedLabels) {
  return { triggerFound, switchLabels, clickedLabels };
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

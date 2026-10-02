import { throwIfAborted, waitFor } from "./task.js";

const QUALITY_RANKS = { auto: 0, ld: 1, sd: 2, hd: 3, uhd: 4, origin: 5 };
const QUALITY_LABELS = { origin: "原画", uhd: "蓝光", hd: "超清", sd: "高清", ld: "标清", auto: "自动" };

export function getQualityText(element) {
  return (element?.innerText || element?.textContent || "").trim();
}

export function findBestQualityOption(optionList) {
  return Array.from(optionList?.children || [])
    .filter((option) => !getQualityText(option).startsWith("自动"))
    .sort((a, b) => rankLabel(getQualityText(b)) - rankLabel(getQualityText(a)))[0] || null;
}

function rankLabel(text) {
  return Math.max(0, ...Object.entries(QUALITY_LABELS).map(([key, label]) =>
    text.includes(label) ? QUALITY_RANKS[key] : 0,
  ));
}

function hasQualityLabel(menu, label) {
  const text = getQualityText(menu);
  return !text.startsWith("自动") && text.includes(label);
}

export function findBestQuality(qualities) {
  return [...qualities].filter((quality) => quality !== "auto" && quality in QUALITY_RANKS)
    .sort((a, b) => QUALITY_RANKS[b] - QUALITY_RANKS[a])[0] || null;
}

// Only inspect known React paths near the quality controls, with a fixed budget.
// No webpack/global hook, cookies or network requests are needed.
export function findQualityHandler(root) {
  const nodes = root?.querySelectorAll?.(
    '.QualitySwitchNewPlugin, .QualitySwitchNewPlugin > div, [data-e2e="quality"], [data-e2e="quality-selector"]',
  ) || [];
  for (const node of nodes) {
    const queue = Object.getOwnPropertyNames(node)
      .filter((key) => /^__react(?:Fiber|Props)\$/.test(key))
      .map((key) => ({ value: node[key], depth: 0 }));
    const visited = new Set();
    for (let budget = 0; queue.length && budget < 60; budget += 1) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      const handler = value.qualityHandler || (
        typeof value.setCurrentQuality === "function" ? value : null
      );
      if (handler && typeof handler.setCurrentQuality === "function") {
        const list = typeof handler.getCurrentQualityList === "function"
          ? handler.getCurrentQualityList() : value.qualityList;
        if (Array.isArray(list) && findBestQuality(list)) return { handler, qualities: list };
      }
      if (depth >= 6) continue;
      for (const key of ["return", "child", "memoizedProps", "children", "props", "ref", "current"]) {
        const next = value[key];
        if (next && typeof next === "object") {
          const entries = Array.isArray(next) ? next.slice(0, 6) : [next];
          entries.forEach((value) => queue.push({ value, depth: depth + 1 }));
        }
      }
    }
  }
  return null;
}

export async function ensureHighestQuality({ document, signal, sleepFn } = {}) {
  const menu = await waitFor(() => document?.querySelector?.('[data-e2e="quality"]'), { signal, sleepFn });
  if (!menu) return { applied: false, method: "unavailable" };
  throwIfAborted(signal);
  try {
    const internal = findQualityHandler(document);
    if (internal) {
      const { handler, qualities } = internal;
      const quality = findBestQuality(qualities);
      if (handler.getCurrentQuality?.() !== quality) handler.setCurrentQuality(quality);
      const verified = await waitFor(() => {
        throwIfAborted(signal);
        return typeof handler.getCurrentQuality === "function"
          ? handler.getCurrentQuality() === quality : hasQualityLabel(menu, QUALITY_LABELS[quality]);
      }, { signal, attempts: 10, sleepFn });
      if (verified) return { applied: true, method: "player", quality };
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Internal paths are optional; continue through the existing menu.
  }
  throwIfAborted(signal);
  menu.click();
  let optionList;
  try {
    optionList = await waitFor(() => document.querySelector('[data-e2e="quality-selector"]'), { signal, sleepFn });
    const target = findBestQualityOption(optionList);
    if (!target) return { applied: false, method: "menu" };
    throwIfAborted(signal);
    const quality = getQualityText(target);
    if (!hasQualityLabel(menu, quality)) target.click();
    const applied = Boolean(await waitFor(() => hasQualityLabel(menu, quality), {
      signal, attempts: 10, sleepFn,
    }));
    return { applied, method: "menu", quality };
  } finally {
    if (!signal?.aborted && optionList?.isConnected && optionList.getBoundingClientRect?.().width > 0) menu.click();
  }
}

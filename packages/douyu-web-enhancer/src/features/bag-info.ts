import type { FeatureDefinition } from "../core/feature.ts";

export const BAG_INFO_ID = "bag-info";

export const bagInfoSelectors = {
  backpackPanel: ["#js-gift-expandPanel.BackpackExpandPanel.is-show", "#js-gift-expandPanel.BackpackExpandPanel"],
  header: [".BackpackExpandPanel-backpackHeader"],
  items: [".ToolbarBackpack-giftItem"],
} as const;

export const BAG_INFO_SUMMARY_ATTRIBUTE = "data-dwe-bag-info-summary";
export const BAG_INFO_EXPIRY_ATTRIBUTE = "data-dwe-bag-info-expiry";

export const BAG_INFO_CSS = `
.BackpackExpandPanel-backpackHeader {
  flex-wrap: wrap !important;
}

[${BAG_INFO_SUMMARY_ATTRIBUTE}] {
  display: flex;
  flex: 1 1 100%;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-height: 18px;
  padding: 0 8px 4px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

[${BAG_INFO_SUMMARY_ATTRIBUTE}] [data-dwe-bag-stat] + [data-dwe-bag-stat]::before {
  margin-right: 8px;
  color: rgba(255, 255, 255, 0.32);
  content: "·";
}

[${BAG_INFO_EXPIRY_ATTRIBUTE}] {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: rgba(255, 219, 126, 0.9);
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;

export interface BackpackBatchInfo {
  batchNum: number | null;
  name: string | null;
}

export interface BackpackItem {
  id: number;
  propType: number;
  count: number | null;
  expiry: number | null;
  met: number | null;
  exp: number | null;
  price: number | null;
  intimate: number | null;
  isValuable: 0 | 1 | null;
  batchInfo: Record<string, BackpackBatchInfo>;
}

export interface BackpackData {
  items: BackpackItem[];
  totalNum: number | null;
  validNum: number | null;
}

export interface BackpackSummary {
  totalValue: number | null;
  totalIntimacy: number | null;
}

export type BackpackExpiryStatus = "timed" | "permanent" | "expired" | "fallback" | "unknown";

export interface BackpackExpiryDisplay {
  status: BackpackExpiryStatus;
  text: string;
  title: string;
}

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface BackpackRawItem {
  id?: unknown;
  propType?: unknown;
  count?: unknown;
  expiry?: unknown;
  met?: unknown;
  exp?: unknown;
  price?: unknown;
  intimate?: unknown;
  isValuable?: unknown;
  batchInfo?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberOrNull(value: unknown): number | null {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function nonNegativeNumberOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number !== null && number >= 0 ? number : null;
}

function valuableFlag(value: unknown): 0 | 1 | null {
  const number = integerOrNull(value);
  return number === 0 || number === 1 ? number : null;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseBatchInfo(value: unknown): Record<string, BackpackBatchInfo> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).map(([key, raw]) => {
    const item = asRecord(raw);
    return [key, {
      batchNum: integerOrNull(item?.batchNum),
      name: typeof item?.name === "string" ? item.name : null,
    }];
  }));
}

function normalizeItem(value: unknown): BackpackItem | null {
  const raw = asRecord(value) as BackpackRawItem | null;
  const id = integerOrNull(raw?.id);
  const propType = integerOrNull(raw?.propType);
  if (id === null || propType === null) return null;
  return {
    id,
    propType,
    count: nonNegativeNumberOrNull(raw?.count),
    expiry: nonNegativeNumberOrNull(raw?.expiry),
    met: numberOrNull(raw?.met),
    exp: numberOrNull(raw?.exp),
    price: nonNegativeNumberOrNull(raw?.price),
    intimate: nonNegativeNumberOrNull(raw?.intimate),
    isValuable: valuableFlag(raw?.isValuable),
    batchInfo: parseBatchInfo(raw?.batchInfo),
  };
}

export function parseBackpackResponse(value: unknown): BackpackData | null {
  const response = asRecord(value);
  if (!response || Number(response.error) !== 0) return null;
  const data = asRecord(parseJsonValue(response.data));
  if (!data || !Array.isArray(data.list)) return null;
  return {
    items: data.list.map(normalizeItem).filter((item): item is BackpackItem => item !== null),
    totalNum: nonNegativeNumberOrNull(data.totalNum),
    validNum: nonNegativeNumberOrNull(data.validNum),
  };
}

export async function requestBackpackData(
  roomId: string,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<BackpackData> {
  const response = await fetchImpl(
    `/japi/prop/backpack/web/v5?rid=${encodeURIComponent(roomId)}`,
    { credentials: "same-origin", signal },
  );
  const payload = await response.json() as unknown;
  const data = parseBackpackResponse(payload);
  if (!response.ok || !data) {
    const raw = asRecord(payload);
    throw new Error(typeof raw?.msg === "string" ? raw.msg : `背包接口异常（HTTP ${response.status}）`);
  }
  return data;
}

export function calculateBackpackSummary(items: readonly BackpackItem[]): BackpackSummary {
  let totalValue = 0;
  let valueUnknown = false;
  let totalIntimacy = 0;
  let intimacyUnknown = false;

  for (const item of items) {
    if (item.isValuable === null || item.count === null) valueUnknown = true;
    if (item.isValuable === 1) {
      if (item.price === null || item.count === null) valueUnknown = true;
      else totalValue += item.price * item.count / 100;
    }
    if (item.intimate === null || item.count === null) intimacyUnknown = true;
    else totalIntimacy += item.intimate * item.count;
  }

  return {
    totalValue: valueUnknown ? null : totalValue,
    totalIntimacy: intimacyUnknown ? null : totalIntimacy,
  };
}

function fallbackExpiry(expiry: number | null): BackpackExpiryDisplay {
  if (expiry === null || expiry <= 0) {
    return { status: "unknown", text: "期限未知", title: "期限未知" };
  }
  if (expiry === 1) {
    return { status: "fallback", text: "今天到期", title: "官方仅提供剩余天数：今天到期" };
  }
  if (expiry === 2) {
    return { status: "fallback", text: "明天到期", title: "官方仅提供剩余天数：明天到期" };
  }
  const days = Math.ceil(expiry);
  return { status: "fallback", text: `约${days}天`, title: `官方仅提供剩余天数：约${days}天` };
}

export function formatBackpackExpiry(
  item: Pick<BackpackItem, "met" | "expiry">,
  nowMs = Date.now(),
): BackpackExpiryDisplay {
  if (item.met === -1) {
    return { status: "permanent", text: "永久有效", title: "永久有效" };
  }
  if (item.met !== null && Number.isFinite(item.met)) {
    if (item.met <= 0) return { status: "expired", text: "已到期", title: "已到期" };
    const expiresAt = item.met * 1000;
    const date = new Date(expiresAt);
    if (Number.isFinite(date.getTime())) {
      if (expiresAt <= nowMs) {
        return { status: "expired", text: "已到期", title: `到期时间：${date.toLocaleString()}` };
      }
      const remainingMs = expiresAt - nowMs;
      const title = `过期时间：${date.toLocaleString()}`;
      if (remainingMs < 60 * 60 * 1000) {
        return { status: "timed", text: `约${Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)))}小时`, title };
      }
      if (remainingMs < 24 * 60 * 60 * 1000) {
        return { status: "timed", text: `约${Math.ceil(remainingMs / (60 * 60 * 1000))}小时`, title };
      }
      return { status: "timed", text: `约${Math.ceil(remainingMs / (24 * 60 * 60 * 1000))}天`, title };
    }
  }
  return fallbackExpiry(item.expiry);
}

export function backpackItemKey(propType: number, id: number): string {
  return `${propType}:${id}`;
}

function itemMap(items: readonly BackpackItem[]): Map<string, BackpackItem[]> {
  const map = new Map<string, BackpackItem[]>();
  for (const item of items) {
    const key = backpackItemKey(item.propType, item.id);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function resolveDomItem(
  element: Element,
  itemsByKey: Map<string, BackpackItem[]>,
): BackpackItem | null {
  const propType = integerOrNull(element.getAttribute("data-proptype"));
  const id = integerOrNull(element.getAttribute("data-propid"));
  if (propType === null || id === null) return null;
  const matches = itemsByKey.get(backpackItemKey(propType, id)) ?? [];
  if (matches.length !== 1) return null;
  return matches[0];
}

function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
}

function ensureSummary(header: Element): HTMLElement {
  const existing = header.querySelector<HTMLElement>(`[${BAG_INFO_SUMMARY_ATTRIBUTE}]`);
  if (existing) return existing;
  const summary = header.ownerDocument.createElement("div");
  summary.setAttribute(BAG_INFO_SUMMARY_ATTRIBUTE, "true");
  summary.setAttribute("role", "status");
  summary.innerHTML = '<span data-dwe-bag-stat="value"></span><span data-dwe-bag-stat="intimacy"></span>';
  header.append(summary);
  return summary;
}

function renderSummary(header: Element, data: BackpackData): void {
  const summary = ensureSummary(header);
  const values = calculateBackpackSummary(data.items);
  const valueText = values.totalValue === null
    ? "总价值：未知（仅 isValuable=1）"
    : `总价值：${values.totalValue.toFixed(2)} 鱼翅（仅 isValuable=1）`;
  const intimacyText = values.totalIntimacy === null
    ? "基础亲密度：未知"
    : `基础亲密度：${values.totalIntimacy}`;
  setText(summary.querySelector('[data-dwe-bag-stat="value"]'), valueText);
  setText(summary.querySelector('[data-dwe-bag-stat="intimacy"]'), intimacyText);
  summary.setAttribute("aria-label", `${valueText}；${intimacyText}`);
}

function renderItemExpiry(panel: Element, data: BackpackData, nowMs: number): void {
  const itemsByKey = itemMap(data.items);
  panel.querySelectorAll<HTMLElement>(bagInfoSelectors.items[0]).forEach((element) => {
    let expiry = element.querySelector<HTMLElement>(`[${BAG_INFO_EXPIRY_ATTRIBUTE}]`);
    if (!expiry) {
      expiry = element.ownerDocument.createElement("span");
      expiry.setAttribute(BAG_INFO_EXPIRY_ATTRIBUTE, "true");
      element.querySelector(".ToolbarBackpack-giftItem--name")?.after(expiry);
      if (!expiry.parentElement) element.append(expiry);
    }
    const item = resolveDomItem(element, itemsByKey);
    const display = item ? formatBackpackExpiry(item, nowMs) : {
      status: "unknown" as const,
      text: "期限未知",
      title: "期限未知：同类型同 ID 存在多条数据或无法对应",
    };
    setText(expiry, display.text);
    expiry.title = display.title;
    expiry.setAttribute("aria-label", display.title);
    expiry.dataset.status = display.status;
  });
}

export function extractBackpackRoomId(locationLike: Pick<Location, "pathname"> | null | undefined): string | null {
  return locationLike?.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1] ?? null;
}

export function createBagInfoFeature(): FeatureDefinition {
  return {
    id: BAG_INFO_ID,
    start({ diagnostics, document, observerHub, selectors, styles }) {
      const removeStyle = styles.add(BAG_INFO_ID, BAG_INFO_CSS);
      const ownerWindow = document.defaultView;
      const fetchImpl = ownerWindow?.fetch?.bind(ownerWindow) ?? globalThis.fetch?.bind(globalThis);
      let roomId: string | null = null;
      let currentPanel: Element | null = null;
      let data: BackpackData | null = null;
      let requestSequence = 0;
      let abortController: AbortController | undefined;

      const removeInjected = (panel: Element | null): void => {
        panel?.querySelectorAll(`[${BAG_INFO_SUMMARY_ATTRIBUTE}], [${BAG_INFO_EXPIRY_ATTRIBUTE}]`).forEach((element) => element.remove());
      };

      const invalidateRoom = (nextRoomId: string | null): void => {
        if (roomId === nextRoomId) return;
        roomId = nextRoomId;
        requestSequence += 1;
        abortController?.abort();
        abortController = undefined;
        data = null;
        removeInjected(currentPanel);
        currentPanel = null;
      };

      const render = (panel: Element): void => {
        const header = panel.querySelector<HTMLElement>(bagInfoSelectors.header[0]);
        if (!header) {
          diagnostics.update(BAG_INFO_ID, "waiting", { detail: "等待原生背包头部挂载" });
          return;
        }
        if (!data) return;
        renderSummary(header, data);
        renderItemExpiry(panel, data, Date.now());
        diagnostics.update(BAG_INFO_ID, "active", {
          detail: "背包只读汇总与期限已更新；鱼翅价值仅统计 isValuable=1",
          selector: `${bagInfoSelectors.backpackPanel[0]} | ${bagInfoSelectors.items[0]}`,
          data: { roomId, itemCount: data.items.length },
        });
      };

      const load = async (targetRoomId: string): Promise<void> => {
        if (!fetchImpl) {
          diagnostics.update(BAG_INFO_ID, "degraded", { detail: "当前脚本环境没有 fetch，保留原生背包" });
          return;
        }
        const sequence = ++requestSequence;
        abortController?.abort();
        abortController = new AbortController();
        diagnostics.update(BAG_INFO_ID, "starting", { detail: "正在按需读取当前房间背包" });
        try {
          const nextData = await requestBackpackData(targetRoomId, fetchImpl, abortController.signal);
          if (sequence !== requestSequence || roomId !== targetRoomId) return;
          data = nextData;
          if (currentPanel) render(currentPanel);
        } catch (error) {
          if (sequence !== requestSequence || roomId !== targetRoomId) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          diagnostics.update(BAG_INFO_ID, "degraded", {
            detail: `背包只读接口不可用，保留原生背包：${error instanceof Error ? error.message : String(error)}`,
          });
        } finally {
          if (sequence === requestSequence) abortController = undefined;
        }
      };

      const sync = (): void => {
        const nextRoomId = extractBackpackRoomId(ownerWindow?.location ?? null);
        invalidateRoom(nextRoomId);
        if (!nextRoomId) {
          diagnostics.update(BAG_INFO_ID, "waiting", { detail: "当前页面不是数字直播间" });
          return;
        }
        const panel = selectors.find<HTMLElement>("backpackPanel")?.element ?? null;
        if (!panel) {
          if (currentPanel) removeInjected(currentPanel);
          currentPanel = null;
          diagnostics.update(BAG_INFO_ID, "waiting", { detail: "等待原生背包打开" });
          return;
        }
        if (currentPanel !== panel) {
          currentPanel = panel;
          if (!data) void load(nextRoomId);
        }
        render(panel);
      };

      const stopWatching = observerHub.subscribe(sync);
      const onRoute = (): void => sync();
      ownerWindow?.addEventListener("popstate", onRoute);
      ownerWindow?.addEventListener("hashchange", onRoute);
      sync();

      return () => {
        stopWatching();
        ownerWindow?.removeEventListener("popstate", onRoute);
        ownerWindow?.removeEventListener("hashchange", onRoute);
        requestSequence += 1;
        abortController?.abort();
        removeInjected(currentPanel);
        currentPanel = null;
        removeStyle();
      };
    },
  };
}

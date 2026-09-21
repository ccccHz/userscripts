import type { FeatureDefinition } from "../core/feature.ts";

export const ROOM_METRICS_ID = "room-metrics";

export const roomMetricsSelectors = {
  metricsHost: [".layout-Player-announce", ".layout-Player-rankAll"],
  nativeRank: [".layout-Player-rank"],
} as const;

export const ROOM_METRICS_CSS = `
.dwe-room-metrics {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  min-height: 28px;
  padding: 0 7px;
  /* The room can render a light chat surface; a neutral low-alpha rule stays visible there and remains subtle in dark mode. */
  border-bottom: 1px solid rgba(90, 96, 116, 0.14);
  color: rgb(153, 153, 153);
  line-height: 18px;
}

.dwe-room-metrics [data-dwe-metric="money"] {
  cursor: pointer;
}

.dwe-room-metrics [data-dwe-metric="watch-time"] {
  cursor: help;
  outline: none;
}

.dwe-room-metrics__tooltip {
  position: fixed;
  z-index: 10000;
  display: none;
  box-sizing: border-box;
  min-width: 154px;
  padding: 6px 9px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  background: rgba(35, 36, 45, 0.96);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
  color: #ddd;
  font-size: 12px;
  line-height: 18px;
  pointer-events: none;
  white-space: pre-line;
}

.dwe-room-metrics__values {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  line-height: 18px;
  white-space: nowrap;
}

.dwe-room-metrics__item {
  display: inline-flex;
  align-items: center;
  margin-right: 3px;
  line-height: 18px;
  white-space: nowrap;
}

.dwe-room-metrics__item svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.dwe-room-metrics__item span {
  margin-left: 2px;
}

.layout-Player-rank {
  top: 34px !important;
}
`;

export interface CrossOriginJsonRequest {
  (details: {
    method: string;
    url: string;
    headers: Record<string, string>;
    data: string;
    responseType: "text";
    anonymous?: boolean;
    timeout: number;
    onload: (response: {
      status?: number;
      response?: unknown;
      responseText?: string;
    }) => void;
    onerror: () => void;
    ontimeout: () => void;
  }): unknown;
}

interface AggregateData {
  "gift.all.price"?: number;
  "gift.paid.price"?: number;
}

interface RoomMetrics {
  paidGiftValue: string;
  totalGiftValue: string;
}

interface BroadcastStatus {
  showTime: number;
  isLive: boolean;
}

function setText(element: Element | null, value: string): void {
  if (element && element.textContent !== value) element.textContent = value;
}

function setAttribute(element: Element | null, name: string, value: string): void {
  if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
}

export function extractRoomId(pathname: string): string | null {
  return pathname.match(/^\/(\d+)(?:\/|$)/)?.[1] ?? null;
}

export function encodeAggregatePayload(roomId: string): string {
  return btoa(`rid=${roomId}&dt=0`).split("").reverse().join("");
}

export function parseAggregateResponse(value: unknown): RoomMetrics | null {
  if (typeof value === "string") {
    try {
      return parseAggregateResponse(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const response = value as { code?: unknown; data?: unknown };
  if (response.code !== 200 || !response.data || typeof response.data !== "object") {
    return null;
  }
  const data = response.data as AggregateData;
  const paidGiftValue = data["gift.paid.price"];
  const totalGiftValue = data["gift.all.price"];
  if (
    typeof paidGiftValue !== "number" ||
    !Number.isFinite(paidGiftValue) ||
    typeof totalGiftValue !== "number" ||
    !Number.isFinite(totalGiftValue)
  ) {
    return null;
  }
  return {
    paidGiftValue: (paidGiftValue / 100).toFixed(2),
    totalGiftValue: (totalGiftValue / 100).toFixed(2),
  };
}

export function requestAggregate(
  roomId: string,
  request: CrossOriginJsonRequest,
): Promise<RoomMetrics> {
  return new Promise((resolve, reject) => {
    request({
      method: "POST",
      url: "https://www.doseeing.com/xeee/room/aggr",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Origin: "https://www.doseeing.com",
        Referer: `https://www.doseeing.com/room/${roomId}`,
      },
      data: JSON.stringify({ m: encodeAggregatePayload(roomId) }),
      responseType: "text",
      timeout: 15_000,
      onload: ({ status, response, responseText }) => {
        const metrics = parseAggregateResponse(responseText ?? response);
        if (metrics) resolve(metrics);
        else reject(new Error(`在看直播接口返回异常状态 ${String(status ?? "unknown")}`));
      },
      onerror: () => reject(new Error("在看直播接口请求失败")),
      ontimeout: () => reject(new Error("在看直播接口请求超时")),
    });
  });
}

export function parseBroadcastStatus(value: unknown): BroadcastStatus | null {
  if (!value || typeof value !== "object") return null;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const record = data as { show_time?: unknown; show_status?: unknown };
  const showTime = Number(record.show_time);
  if (!Number.isFinite(showTime) || showTime <= 0) return null;
  return { showTime, isLive: Number(record.show_status) !== 2 };
}

export function parseTodayWatch(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { error?: unknown; data?: unknown };
  if (Number(response.error) !== 0 || !response.data || typeof response.data !== "object") {
    return null;
  }
  const seconds = Number((response.data as { todayWatch?: unknown }).todayWatch);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainingSeconds = value % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function metricsMarkup(): string {
  return `
    <span class="dwe-room-metrics__values">
      <span class="dwe-room-metrics__item" data-dwe-metric="money" title="礼物收入加载中">
        <svg viewBox="0 0 1024 1024" aria-hidden="true"><path fill="#F54330" d="M136.96 67.413h181.76L512 452.693l193.28-385.28h181.76l-245.76 445.44h163.84v84.48h-211.2l-1.28 1.28v106.24h212.48v84.48H592.64v192H431.36v-192h-211.2v-84.48h211.2v-106.24l-1.28-1.28H220.16v-84.48h162.56z"/></svg>
        <span>****</span>
      </span>
      <span class="dwe-room-metrics__item" data-dwe-metric="nobles" title="贵宾人数来自当前排行榜">
        <svg viewBox="0 0 1170 1024" aria-hidden="true"><path fill="#CCB88F" d="M270.579175 30.138897S391.031549-36.125391 427.208548 36.176998c36.125391 18.062695 114.46588 463.798407 132.528575 548.176999 18.062695 90.365084 60.226187 120.452374 84.326983 84.326983s114.46588-126.490475 174.692068-265.057152-18.062695-156.629372-42.163492-150.591271c-24.100796 6.038101-150.591271 12.024594-108.427779-42.163491 48.201593-54.188086 156.629372-150.591271 186.716661-162.615866 54.188086-36.125391 138.566677-84.326983 210.817458-6.038101 42.163492 30.138897 144.55317 150.591271 48.201593 319.245238-96.403185 174.692067-475.874609 614.389678-475.87461 614.389678s-138.566677 90.365084-192.754762 0c-54.188086-84.326983-240.956355-554.163492-246.994456-614.389678 0-60.226187-18.062695-72.302389-48.201593-60.226187-30.138897 18.062695-90.365084 102.389678-96.403185 78.288882-5.986493-24.100796-60.174579-60.277795-24.049189-114.465881 30.138897-48.201593 216.855559-216.855559 240.956355-234.918254z"/></svg>
        <span>****</span>
      </span>
    </span>
    <span data-dwe-metric="watch-time" style="white-space:nowrap" tabindex="0" aria-label="已观看时长；悬停查看本场已播信息">已观看:****</span>`;
}

export function createRoomMetricsFeature(
  crossOriginRequest: CrossOriginJsonRequest,
): FeatureDefinition {
  return {
    id: ROOM_METRICS_ID,
    start({ diagnostics, document, observerHub, selectors, styles }) {
      const pathname = document.defaultView?.location.pathname ?? "";
      const roomId = extractRoomId(pathname);
      if (!roomId) {
        diagnostics.update(ROOM_METRICS_ID, "waiting", {
          detail: "当前页面不是数字房间地址",
        });
        return;
      }

      const removeStyle = styles.add(ROOM_METRICS_ID, ROOM_METRICS_CSS);
      let element: HTMLDivElement | null = null;
      let tooltip: HTMLDivElement | null = null;
      let disposed = false;
      let broadcastText = "本场已播 ****";
      let broadcastTitle = "开播时间加载中";
      let watchText = "已观看:****";
      let watchSeconds: number | null = null;
      let watchSampledAt = 0;
      let moneyText = "****";
      let moneyTitle = "礼物收入加载中";
      let broadcastShowTime: number | null = null;
      let broadcastIsLive = false;

      const tooltipText = (): string => `${broadcastText}\n${broadcastTitle}`;

      const renderTimes = (): void => {
        const now = Date.now();
        if (broadcastShowTime !== null) {
          const seconds = broadcastIsLive ? now / 1000 - broadcastShowTime : 0;
          broadcastText = `本场已播 ${formatDuration(seconds)}`;
        }
        if (watchSeconds !== null) {
          const projectedSeconds = watchSeconds
            + (broadcastIsLive ? Math.max(0, now - watchSampledAt) / 1000 : 0);
          watchText = `已观看:${formatDuration(projectedSeconds)}`;
        }
        const watch = element?.querySelector<HTMLElement>(
          '[data-dwe-metric="watch-time"]',
        ) ?? null;
        setText(watch, watchText);
        setAttribute(watch, "aria-label", `${watchText}；${tooltipText()}`);
        if (tooltip?.dataset.open === "true") setText(tooltip, tooltipText());
      };

      const hideTooltip = (): void => {
        if (!tooltip) return;
        tooltip.style.display = "none";
        tooltip.dataset.open = "false";
      };

      const showTooltip = (watch: HTMLElement): void => {
        if (!tooltip) {
          tooltip = document.createElement("div");
          tooltip.className = "dwe-room-metrics__tooltip";
          tooltip.setAttribute("role", "tooltip");
          document.body.append(tooltip);
        }
        setText(tooltip, tooltipText());
        tooltip.style.display = "block";
        tooltip.dataset.open = "true";
        const rect = watch.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const left = Math.max(6, Math.min(rect.right - tooltipRect.width, viewportWidth - tooltipRect.width - 6));
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${rect.bottom + 4}px`;
      };

      const bindWatchTooltip = (watch: HTMLElement): void => {
        if (watch.dataset.dweTooltipBound === "true") return;
        watch.dataset.dweTooltipBound = "true";
        watch.addEventListener("mouseenter", () => showTooltip(watch));
        watch.addEventListener("mouseleave", hideTooltip);
        watch.addEventListener("focus", () => showTooltip(watch));
        watch.addEventListener("blur", hideTooltip);
      };

      const updateNobles = (): void => {
        if (!element) return;
        const text = selectors.find<HTMLElement>("nativeRank")?.element.textContent ?? "";
        const value = text.match(/贵宾\s*\(\s*([\d.万]+)\s*\)/)?.[1];
        if (value) {
          setText(
            element.querySelector('[data-dwe-metric="nobles"] span'),
            value,
          );
        }
      };

      const mount = (): void => {
        const host = selectors.find<HTMLElement>("metricsHost")?.element;
        if (!host) {
          diagnostics.update(ROOM_METRICS_ID, "waiting", {
            detail: "等待排行榜顶部统计区域挂载",
          });
          return;
        }
        element = host.querySelector<HTMLDivElement>(".dwe-room-metrics");
        if (!element) {
          element = document.createElement("div");
          element.className = "dwe-room-metrics";
          element.innerHTML = metricsMarkup();
          element.querySelector('[data-dwe-metric="money"]')?.addEventListener("click", () => {
            document.defaultView?.open(
              `https://www.doseeing.com/room/${roomId}`,
              "_blank",
              "noopener,noreferrer",
            );
          });
          host.insertBefore(element, host.firstChild);
        }
        const watch = element.querySelector<HTMLElement>('[data-dwe-metric="watch-time"]');
        renderTimes();
        if (watch) bindWatchTooltip(watch);
        const money = element.querySelector<HTMLElement>('[data-dwe-metric="money"]');
        setText(money?.querySelector("span") ?? null, moneyText);
        if (money) money.title = moneyTitle;
        updateNobles();
      };

      const refresh = async (): Promise<void> => {
        mount();

        const refreshTimes = async (): Promise<void> => {
          const [broadcastResult, watchResult] = await Promise.allSettled([
            fetch(`https://www.douyu.com/swf_api/h5room/${roomId}`, {
              credentials: "include",
            }).then((response) =>
              response.json(),
            ),
            fetch(`https://www.douyu.com/japi/interactnc/web/fsjk/getCardTaskInfo?rid=${roomId}`, {
              credentials: "include",
            }).then((response) => response.json()),
          ]);
          if (disposed) return;
          if (broadcastResult.status === "fulfilled") {
            const status = parseBroadcastStatus(broadcastResult.value);
            if (status) {
              const seconds = status.isLive
                ? Date.now() / 1000 - status.showTime
                : 0;
              broadcastShowTime = status.showTime;
              broadcastIsLive = status.isLive;
              broadcastText = `本场已播 ${formatDuration(seconds)}`;
              broadcastTitle = `开播于 ${new Date(status.showTime * 1000).toLocaleTimeString()}`;
              renderTimes();
            }
          }
          if (watchResult.status === "fulfilled") {
            const seconds = parseTodayWatch(watchResult.value);
            if (seconds !== null) {
              watchSeconds = seconds;
              watchSampledAt = Date.now();
              renderTimes();
            }
          }
        };

        void refreshTimes();
        try {
          const metrics = await requestAggregate(roomId, crossOriginRequest);
          if (disposed) return;
          moneyText = metrics.paidGiftValue;
          moneyTitle = `总礼物价值:${metrics.totalGiftValue} 鱼翅礼物:${metrics.paidGiftValue}`;
          const money = element?.querySelector<HTMLElement>('[data-dwe-metric="money"]') ?? null;
          setText(money?.querySelector("span") ?? null, moneyText);
          if (money) money.title = moneyTitle;
          updateNobles();
          diagnostics.update(ROOM_METRICS_ID, "active", {
            detail: "礼物收入与贵宾人数摘要已更新",
            selector: ".dwe-room-metrics",
          });
        } catch (error) {
          if (disposed) return;
          moneyText = "****";
          moneyTitle = "礼物收入暂不可用，将自动重试";
          const money = element?.querySelector<HTMLElement>('[data-dwe-metric="money"]') ?? null;
          setText(money?.querySelector("span") ?? null, moneyText);
          if (money) money.title = moneyTitle;
          updateNobles();
          diagnostics.update(ROOM_METRICS_ID, "waiting", {
            detail: `礼物收入暂不可用；贵宾人数继续使用页面数据：${error instanceof Error ? error.message : String(error)}`,
            selector: ".dwe-room-metrics",
          });
        }
      };

      const stopWatching = observerHub.subscribe(() => {
        mount();
        updateNobles();
      });
      mount();
      void refresh();
      const refreshTimer = document.defaultView?.setInterval(refresh, 150_000);
      const displayTimer = document.defaultView?.setInterval(() => {
        if (document.visibilityState !== "hidden") renderTimes();
      }, 1_000);
      const hideTooltipOnViewportChange = (): void => hideTooltip();
      document.defaultView?.addEventListener("resize", hideTooltipOnViewportChange);
      document.addEventListener("scroll", hideTooltipOnViewportChange, true);

      return () => {
        disposed = true;
        stopWatching();
        if (refreshTimer !== undefined) document.defaultView?.clearInterval(refreshTimer);
        if (displayTimer !== undefined) document.defaultView?.clearInterval(displayTimer);
        document.defaultView?.removeEventListener("resize", hideTooltipOnViewportChange);
        document.removeEventListener("scroll", hideTooltipOnViewportChange, true);
        tooltip?.remove();
        element?.remove();
        removeStyle();
      };
    },
  };
}

import type { RoomAudience } from "../core/room-messages.ts";
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

.dwe-room-metrics [data-dwe-metric="watch-time"] {
  cursor: help;
  outline: none;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 2px 6px;
  box-sizing: border-box;
}

.dwe-room-metrics [data-dwe-metric="online"] {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 2px 10px;
  box-sizing: border-box;
  border-radius: 6px;
  margin-right: 0;
  cursor: help;
  outline: none;
}

.dwe-room-metrics [data-dwe-metric="online"]:hover,
.dwe-room-metrics [data-dwe-metric="online"]:focus-visible,
.dwe-room-metrics [data-dwe-metric="watch-time"]:hover,
.dwe-room-metrics [data-dwe-metric="watch-time"]:focus-visible {
  background: rgba(125, 175, 255, 0.12);
}

.dwe-room-metrics [data-dwe-metric="online"] svg {
  width: 18px;
  height: 18px;
  flex-basis: 18px;
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
  pointer-events: auto;
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
      <span class="dwe-room-metrics__item" data-dwe-metric="online" tabindex="0" aria-label="在线用户：等待消息">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="#7dafff"><circle cx="9" cy="7" r="3"/><path d="M3 19.5v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2H3Z"/><circle cx="17" cy="7.5" r="2.5"/><path d="M17.5 12.5a4.5 4.5 0 0 1 4.5 4.5v2.5h-5v-2a7 7 0 0 0-1.8-4.7c.7-.2 1.5-.3 2.3-.3Z"/></svg><span>—</span>
      </span>
    </span>
    <span data-dwe-metric="watch-time" style="white-space:nowrap" tabindex="0" aria-label="已观看时长；悬停查看本场已播信息">已观看:****</span>`;
}

export function createRoomMetricsFeature(
  getAudience: () => ReturnType<RoomAudience["snapshot"]> = () => ({}),
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
      let broadcastShowTime: number | null = null;
      let broadcastIsLive = false;

      const tooltipText = (): string => `${broadcastText}\n${broadcastTitle}`;
      let activeTooltipText = tooltipText;
      let activeAnchor: HTMLElement | null = null;
      let positionFrame = 0;
      let hideTimer: number | undefined;
      const audienceText = (): string => {
        const counts = getAudience();
        const native = selectors.find<HTMLElement>("nativeRank")?.element.textContent?.match(/贵宾\s*\(\s*([\d.万]+)\s*\)/)?.[1];
        return `在线用户 ${counts.online ?? "未知（等待消息或已过期）"}\n贵宾 ${counts.nobles ?? native ?? "未知"}\n钻粉 ${counts.diamonds ?? "未知"}\n在线榜统计，尚未与移动端人数核对`;
      };
      const renderAudience = (): void => {
        const counts=getAudience();
        const online=element?.querySelector<HTMLElement>('[data-dwe-metric="online"]');
        setText(online?.querySelector("span") ?? null, counts.online === undefined ? "—" : String(counts.online));
        setAttribute(online ?? null,"aria-label",audienceText());
      };

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
        renderAudience();
        if (tooltip?.dataset.open === "true") { setText(tooltip, activeTooltipText()); scheduleTooltipPosition(); }
      };

      const hideTooltip = (): void => {
        if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
        hideTimer = undefined;
        activeAnchor = null;
        if (!tooltip) return;
        tooltip.style.display = "none";
        tooltip.dataset.open = "false";
      };

      const showTooltip = (watch: HTMLElement, content = tooltipText): void => {
        if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
        hideTimer = undefined;
        activeAnchor = watch;
        activeTooltipText = content;
        if (!tooltip) {
          tooltip = document.createElement("div");
          tooltip.className = "dwe-room-metrics__tooltip";
          tooltip.setAttribute("role", "tooltip");
          tooltip.addEventListener("mouseenter", () => {
            if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
            hideTimer = undefined;
          });
          tooltip.addEventListener("mouseleave", () => scheduleHideTooltip());
          document.body.append(tooltip);
        }
        setText(tooltip, content());
        tooltip.style.display = "block";
        tooltip.dataset.open = "true";
        positionTooltip();
      };

      const positionTooltip = (): void => {
        if (!activeAnchor || !activeAnchor.isConnected || !element?.contains(activeAnchor)) { hideTooltip(); return; }
        if (!tooltip || tooltip.dataset.open !== "true") return;
        // Reading the tooltip should not move it out from under the pointer when
        // Douyu reflows the player header or the page scrolls.
        if (tooltip.matches(":hover")) return;
        const rect = activeAnchor.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const left = Math.max(6, Math.min(rect.right - tooltipRect.width, viewportWidth - tooltipRect.width - 6));
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${rect.bottom + 4}px`;
      };

      const scheduleTooltipPosition = (): void => {
        if (!activeAnchor || positionFrame) return;
        positionFrame = document.defaultView?.requestAnimationFrame(() => { positionFrame = 0; positionTooltip(); }) ?? 0;
      };

      const scheduleHideTooltip = (): void => {
        if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
        hideTimer = document.defaultView?.setTimeout(() => {
          hideTimer = undefined;
          if (activeAnchor?.matches(":hover") || activeAnchor === document.activeElement || tooltip?.matches(":hover")) return;
          hideTooltip();
        }, 160);
      };

      const bindWatchTooltip = (watch: HTMLElement): void => {
        if (watch.dataset.dweTooltipBound === "true") return;
        watch.dataset.dweTooltipBound = "true";
        watch.addEventListener("mouseenter", () => showTooltip(watch));
        watch.addEventListener("mouseleave", scheduleHideTooltip);
        watch.addEventListener("focus", () => showTooltip(watch));
        watch.addEventListener("blur", scheduleHideTooltip);
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
        if (activeAnchor && (!element || !element.contains(activeAnchor))) hideTooltip();
        if (!element) {
          element = document.createElement("div");
          element.className = "dwe-room-metrics";
          element.innerHTML = metricsMarkup();
          host.insertBefore(element, host.firstChild);
        }
        const watch = element.querySelector<HTMLElement>('[data-dwe-metric="watch-time"]');
        renderTimes();
        if (watch) bindWatchTooltip(watch);
        const online=element.querySelector<HTMLElement>('[data-dwe-metric="online"]');
        if (online && online.dataset.dweTooltipBound !== "true") {
          online.dataset.dweTooltipBound="true";
          online.addEventListener("mouseenter",()=>showTooltip(online,audienceText));
          online.addEventListener("focus",()=>showTooltip(online,audienceText));
          online.addEventListener("mouseleave",scheduleHideTooltip); online.addEventListener("blur",scheduleHideTooltip);
        }
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
        diagnostics.update(ROOM_METRICS_ID, "active", {
          detail: "在线人数与观看时长摘要已挂载；今日礼物来源已归档",
          selector: ".dwe-room-metrics",
        });
      };

      const stopWatching = observerHub.subscribe(() => {
        mount();
      });
      mount();
      void refresh();
      const refreshTimer = document.defaultView?.setInterval(refresh, 150_000);
      const displayTimer = document.defaultView?.setInterval(() => {
        if (document.visibilityState !== "hidden") renderTimes();
      }, 1_000);
      const repositionTooltip = (event: Event): void => {
        if (!activeAnchor) return;
        const target = event.target;
        if (target === document || target === document.defaultView || target instanceof Element && target.contains(activeAnchor)) scheduleTooltipPosition();
      };
      document.defaultView?.addEventListener("resize", repositionTooltip);
      document.addEventListener("scroll", repositionTooltip, true);

      return () => {
        disposed = true;
        stopWatching();
        if (refreshTimer !== undefined) document.defaultView?.clearInterval(refreshTimer);
        if (displayTimer !== undefined) document.defaultView?.clearInterval(displayTimer);
        document.defaultView?.removeEventListener("resize", repositionTooltip);
        document.removeEventListener("scroll", repositionTooltip, true);
        if (positionFrame) document.defaultView?.cancelAnimationFrame(positionFrame);
        hideTooltip();
        tooltip?.remove();
        element?.remove();
        removeStyle();
      };
    },
  };
}

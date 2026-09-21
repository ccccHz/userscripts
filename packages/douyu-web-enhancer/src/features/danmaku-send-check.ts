import type { FeatureDefinition } from "../core/feature.ts";
import {
  createChatSendTracker,
  type PendingChatSend,
} from "../core/chat-send-tracker.ts";
import { chatInputSelectors, normalizeChatMessage } from "../core/chat-input.ts";
import {
  createAnonymousDanmakuConnection,
  type AnonymousDanmakuMessage,
  type AnonymousDanmakuStatus,
} from "../core/anonymous-danmaku.ts";
import {
  DanmakuSendObservationStore,
  type DanmakuSendObservation,
} from "./danmaku-send-observation-store.ts";
import { LEVEL_TASK_CONFIRMED_EVENT } from "./daily-automation.ts";

export * from "./danmaku-send-observation-store.ts";

export const DANMAKU_SEND_CHECK_ID = "danmaku-send-check";
export const DANMAKU_SEND_CHECK_TIMEOUT_MS = 2_000;
export const DANMAKU_SEND_CHECK_CSS = `
.dwe-send-check-host {
  position: relative !important;
}
.dwe-send-check-status {
  box-sizing: border-box;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  z-index: 20;
  padding: 5px 8px;
  color: #8a5a00;
  background: #fff7df;
  border: 1px solid #f2d28b;
  border-radius: 4px;
  font-size: 12px;
  line-height: 18px;
  pointer-events: none;
}
.dwe-send-check-line {
  text-decoration-line: line-through;
  text-decoration-style: dashed;
  text-decoration-color: #888;
}
.dwe-send-check-mark {
  margin-left: 4px;
  color: #777;
  font-size: 9px;
  cursor: help;
}
`;

export const danmakuSendCheckSelectors = {
  sendFeedbackHost: [".ChatSend", ".Barrage-toolbar"],
} as const;

/** Emits no message content: consumers only learn that a real public echo matched. */
export function emitConfirmedDanmaku(document: Document, roomId: string): void {
  const EventCtor = document.defaultView?.CustomEvent ?? globalThis.CustomEvent;
  if (!EventCtor) return;
  document.dispatchEvent(new EventCtor(LEVEL_TASK_CONFIRMED_EVENT, { detail: { roomId } }));
}

type DouyuRoomWindow = Pick<Window, "location"> & {
  /** The page-owned room object is not exposed in every userscript sandbox. */
  document?: Document;
  $ROOM?: unknown;
};

function positiveRoomId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isInteger(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  return /^[1-9]\d*$/.test(text) ? text : null;
}

/** Resolve the server room id, which may differ from the numeric room alias in the URL. */
export function resolveDouyuRoomId(
  windowObject: DouyuRoomWindow | null,
  pathname = windowObject?.location.pathname ?? null,
): string | null {
  try {
    const room = windowObject?.$ROOM;
    if (room && typeof room === "object") {
      const record = room as Record<string, unknown>;
      const resolved = positiveRoomId(record.room_id ?? record.roomId ?? record.roomID);
      if (resolved) return resolved;
    }
  } catch {
    // A page-owned $ROOM object can be a proxy; fall back to the normal numeric path.
  }
  try {
    // Current Douyu pages expose the resolved rid on the player root even when
    // the page-owned `$ROOM` global is hidden from an isolated userscript world.
    const candidates = windowObject?.document?.querySelectorAll<HTMLElement>("[data-room-id]") ?? [];
    for (const candidate of candidates) {
      const resolved = positiveRoomId(candidate.getAttribute("data-room-id"));
      if (resolved) return resolved;
    }
  } catch {
    // A partially mounted or page-owned DOM can disappear during SPA navigation.
  }
  const pathRoomId = pathname?.match(/^\/(\d+)(?:\/|$)/)?.[1];
  return positiveRoomId(pathRoomId);
}

export function createDanmakuSendCheckFeature(
  observations: DanmakuSendObservationStore,
  connectAnonymous = createAnonymousDanmakuConnection,
): FeatureDefinition {
  return {
    id: DANMAKU_SEND_CHECK_ID,
    start({ diagnostics, document, observerHub, selectors, styles }) {
      interface AttemptState {
        attempt: PendingChatSend;
        roomId: string;
        observationId: string;
        publicSeen: boolean;
        observationContinuous: boolean;
        deadlinePassed: boolean;
        domItem: Element | null;
        deadlineTimer: number;
        expiryTimer: number;
      }

      interface MarkedItem {
        content: HTMLElement;
        mark: HTMLElement;
        hadLineClass: boolean;
        title: string | null;
      }

      const removeStyle = styles.add(DANMAKU_SEND_CHECK_ID, DANMAKU_SEND_CHECK_CSS);
      const attempts = new Map<number, AttemptState>();
      const markedItems = new Map<number, MarkedItem>();
      const sessionId = globalThis.crypto?.randomUUID?.()
        ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let clearStatusTimer: number | undefined;
      let lastStatusMessage: string | null = null;
      let socketStatus: AnonymousDanmakuStatus = "connecting";
      let socketReady = false;
      let connectedRoomKey: string | null = null;
      let stopSocket: (() => void) | null = null;

      const roomScope = (): string | null =>
        document.defaultView?.location.pathname ?? null;
      const currentRoomId = (): string | null =>
        resolveDouyuRoomId(document.defaultView, roomScope());

      const reportStorageError = (error: unknown): void => {
        diagnostics.update(DANMAKU_SEND_CHECK_ID, "error", {
          detail: error instanceof Error ? error.message : String(error),
        });
      };
      void observations.ready().catch(reportStorageError);

      const showStatus = (message: string): void => {
        const host = selectors.find<HTMLElement>("sendFeedbackHost");
        const fallbackHost = host?.element
          ?? document.querySelector<HTMLElement>(".ChatSend-txt")?.parentElement;
        lastStatusMessage = message;
        if (!fallbackHost) return;
        let element = document.querySelector<HTMLElement>(".dwe-send-check-status");
        fallbackHost.classList.add("dwe-send-check-host");
        if (!element) {
          element = document.createElement("div");
          element.className = "dwe-send-check-status";
          element.setAttribute("role", "status");
          element.setAttribute("aria-live", "polite");
          fallbackHost.append(element);
        }
        if (element.textContent !== message) element.textContent = message;
        if (clearStatusTimer !== undefined) clearTimeout(clearStatusTimer);
        clearStatusTimer = window.setTimeout(() => {
          element?.remove();
          lastStatusMessage = null;
          clearStatusTimer = undefined;
        }, 10_000);
      };

      const restoreMark = (attemptId: number): boolean => {
        const marked = markedItems.get(attemptId);
        if (!marked) return false;
        if (!marked.hadLineClass) marked.content.classList.remove("dwe-send-check-line");
        if (marked.title === null) marked.content.removeAttribute("title");
        else marked.content.setAttribute("title", marked.title);
        marked.mark.remove();
        markedItems.delete(attemptId);
        return true;
      };

      const saveObservation = (
        state: AttemptState,
        evidence: DanmakuSendObservation["evidence"],
      ): void => {
        const operation = observations.addObservation(
          state.observationId,
          state.attempt,
          evidence,
        );
        void operation.catch(reportStorageError);
      };

      const markSuspected = (state: AttemptState): boolean => {
        if (state.publicSeen || !state.observationContinuous || !state.domItem) return false;
        if (markedItems.has(state.attempt.id)) return true;
        const content = state.domItem.querySelector<HTMLElement>(
          chatInputSelectors.barrageContent.join(","),
        );
        if (!content) return false;
        const mark = document.createElement("span");
        mark.className = "dwe-send-check-mark";
        mark.dataset.dweSendCheckAttempt = String(state.attempt.id);
        mark.textContent = "(可能发送失败)";
        mark.title = "匿名弹幕流在 2 秒内未观察到该内容；仍可能因网络或延迟误判";
        markedItems.set(state.attempt.id, {
          content,
          mark,
          hadLineClass: content.classList.contains("dwe-send-check-line"),
          title: content.getAttribute("title"),
        });
        content.classList.add("dwe-send-check-line");
        content.title = "匿名弹幕流未确认该条内容，可能被屏蔽或改写";
        content.insertAdjacentElement("afterend", mark);
        saveObservation(state, "suspected");
        showStatus("匿名弹幕流未观察到这条内容，已在对应弹幕行标记；仍可能因延迟误判。");
        return true;
      };

      const resolvePublicEcho = (state: AttemptState): void => {
        state.publicSeen = true;
        emitConfirmedDanmaku(document, state.roomId);
        if (!state.deadlinePassed) return;
        const restored = restoreMark(state.attempt.id);
        void observations.markConfirmedDelayed(state.observationId)
          .then((corrected) => {
            if (restored || corrected) {
              showStatus("刚才标记或未确认的弹幕已在匿名流中延迟出现，已恢复并更正记录。");
            }
          })
          .catch(reportStorageError);
      };

      const onAnonymousMessage = (message: AnonymousDanmakuMessage): void => {
        const normalized = normalizeChatMessage(message.text);
        const candidate = [...attempts.values()]
          .filter((state) =>
            !state.publicSeen &&
            state.roomId === message.roomId &&
            state.attempt.normalizedMessage === normalized &&
            state.attempt.submittedAt <= message.receivedAt,
          )
          .sort((left, right) => left.attempt.submittedAt - right.attempt.submittedAt)[0];
        if (candidate) resolvePublicEcho(candidate);
      };

      const updateDiagnostics = (): void => {
        const host = selectors.find<HTMLElement>("sendFeedbackHost");
        const hasHost = Boolean(
          host?.element ?? document.querySelector(".ChatSend-txt")?.parentElement,
        );
        const active = hasHost && socketReady;
        diagnostics.update(DANMAKU_SEND_CHECK_ID, active ? "active" : "waiting", {
          detail: !hasHost
            ? "等待弹幕发送区挂载"
            : socketReady
              ? "匿名弹幕流发送检测已启用"
              : `匿名弹幕流${socketStatus === "connecting" ? "连接中" : "不可用"}；仅报告未确认`,
          selector: host?.selector,
        });
      };

      const onSocketStatus = (status: AnonymousDanmakuStatus): void => {
        socketStatus = status;
        socketReady = status === "ready";
        if (!socketReady) {
          for (const state of attempts.values()) state.observationContinuous = false;
        }
        updateDiagnostics();
      };

      const clearAttempts = (): void => {
        for (const state of attempts.values()) {
          clearTimeout(state.deadlineTimer);
          clearTimeout(state.expiryTimer);
        }
        attempts.clear();
        for (const attemptId of [...markedItems.keys()]) restoreMark(attemptId);
      };

      const connectForCurrentRoom = (): void => {
        const roomId = currentRoomId();
        const roomKey = `${roomScope() ?? ""}:${roomId ?? ""}`;
        if (roomKey === connectedRoomKey) return;
        clearAttempts();
        stopSocket?.();
        stopSocket = null;
        connectedRoomKey = roomKey;
        socketReady = false;
        socketStatus = "connecting";
        if (!roomId) {
          socketStatus = "unsupported";
          updateDiagnostics();
          return;
        }
        stopSocket = connectAnonymous({
          roomId,
          onMessage: onAnonymousMessage,
          onStatus: onSocketStatus,
          WebSocketCtor: document.defaultView?.WebSocket,
        });
      };

      const stopTracker = createChatSendTracker({
        document,
        observerHub,
        getScope: roomScope,
        timeoutMs: DANMAKU_SEND_CHECK_TIMEOUT_MS,
        retentionMs: 30_000,
        onAttempt: (attempt) => {
          const roomId = currentRoomId();
          if (!roomId) return;
          const state: AttemptState = {
            attempt,
            roomId,
            observationId: `${sessionId}:${attempt.id}`,
            publicSeen: false,
            observationContinuous: socketReady,
            deadlinePassed: false,
            domItem: null,
            deadlineTimer: 0,
            expiryTimer: 0,
          };
          state.deadlineTimer = window.setTimeout(() => {
            state.deadlinePassed = true;
            if (state.publicSeen) return;
            if (!markSuspected(state)) {
              saveObservation(state, "unconfirmed");
              showStatus(
                state.observationContinuous
                  ? "2 秒内未确认这条弹幕；匿名流和页面都可能存在延迟。"
                  : "匿名弹幕流未覆盖完整观察窗口；这条发送只能标为未确认。",
              );
            }
          }, DANMAKU_SEND_CHECK_TIMEOUT_MS);
          state.expiryTimer = window.setTimeout(() => {
            attempts.delete(attempt.id);
          }, 30_000);
          attempts.set(attempt.id, state);
        },
        onConfirmed: (attempt, _delayed, item) => {
          const state = attempts.get(attempt.id);
          if (!state) return;
          state.domItem = item;
          if (state.deadlinePassed && !state.publicSeen) markSuspected(state);
        },
      });

      const scan = (): void => {
        connectForCurrentRoom();
        if (lastStatusMessage && !document.querySelector(".dwe-send-check-status")) {
          showStatus(lastStatusMessage);
        }
        updateDiagnostics();
      };
      const stopWatching = observerHub.subscribe(scan);
      scan();

      return () => {
        stopTracker();
        stopWatching();
        stopSocket?.();
        clearAttempts();
        if (clearStatusTimer !== undefined) clearTimeout(clearStatusTimer);
        document.querySelector(".dwe-send-check-status")?.remove();
        document.querySelectorAll(".dwe-send-check-host").forEach((host) => {
          host.classList.remove("dwe-send-check-host");
        });
        lastStatusMessage = null;
        removeStyle();
      };
    },
  };
}

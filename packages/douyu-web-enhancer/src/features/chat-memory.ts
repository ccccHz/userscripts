import type { FeatureDefinition } from "../core/feature.ts";
import {
  chatInputSelectors,
  closestChatInput,
  hasCollapsedChatInputCaret,
  isCaretAtBoundary,
  readChatInput,
  writeChatInput,
} from "../core/chat-input.ts";
import { createChatSubmissionListener } from "../core/chat-send-tracker.ts";
import { readOutgoingChatContent } from "../core/outgoing-chat-tail.ts";
import type { PageSocketHook } from "../core/page-socket-hook.ts";

export const CHAT_MEMORY_ID = "chat-memory";
export const CHAT_MEMORY_KEY = "douyu-web-enhancer:chat-memory";
export const CHAT_MEMORY_PER_ROOM_LIMIT = 200;
export const CHAT_MEMORY_ROOM_LIMIT = 50;

interface RoomHistory {
  messages: string[];
  updatedAt: number;
}

interface StoredChatMemory {
  schemaVersion: 1;
  rooms: Record<string, RoomHistory>;
}

type ValueWriter = (key: string, value: unknown) => void | Promise<void>;

export function parseChatMemory(value: unknown): StoredChatMemory {
  const empty: StoredChatMemory = { schemaVersion: 1, rooms: {} };
  if (!value || typeof value !== "object") return empty;
  const rooms = (value as { rooms?: unknown }).rooms;
  if (!rooms || typeof rooms !== "object") return empty;
  for (const [roomId, candidate] of Object.entries(rooms)) {
    if (!/^\d+$/.test(roomId) || !candidate || typeof candidate !== "object") continue;
    const record = candidate as { messages?: unknown; updatedAt?: unknown };
    if (!Array.isArray(record.messages)) continue;
    const messages = record.messages
      .filter((message): message is string => typeof message === "string")
      .map((message) => message.trim())
      .filter(Boolean)
      .slice(-CHAT_MEMORY_PER_ROOM_LIMIT);
    if (!messages.length) continue;
    empty.rooms[roomId] = {
      messages,
      updatedAt: Number.isFinite(Number(record.updatedAt))
        ? Number(record.updatedAt)
        : 0,
    };
  }
  return pruneRooms(empty);
}

function pruneRooms(memory: StoredChatMemory): StoredChatMemory {
  const retained = Object.entries(memory.rooms)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, CHAT_MEMORY_ROOM_LIMIT);
  memory.rooms = Object.fromEntries(retained);
  return memory;
}

export class ChatMemoryStore {
  readonly #write: ValueWriter;
  readonly #memory: StoredChatMemory;
  #writeQueue: Promise<void> = Promise.resolve();
  #recentUi: Array<{ roomId: string; message: string; at: number }> = [];

  constructor(value: unknown, write: ValueWriter) {
    this.#memory = parseChatMemory(value);
    this.#write = write;
  }

  messages(roomId: string): readonly string[] {
    return this.#memory.rooms[roomId]?.messages ?? [];
  }

  async add(roomId: string, message: string, updatedAt = Date.now()): Promise<void> {
    const trimmed = message.trim();
    if (!/^\d+$/.test(roomId) || !trimmed) return;
    const room = this.#memory.rooms[roomId] ?? { messages: [], updatedAt };
    room.messages.push(trimmed);
    room.messages = room.messages.slice(-CHAT_MEMORY_PER_ROOM_LIMIT);
    room.updatedAt = updatedAt;
    this.#memory.rooms[roomId] = room;
    pruneRooms(this.#memory);
    const snapshot = structuredClone(this.#memory);
    this.#writeQueue = this.#writeQueue
      .catch(() => undefined)
      .then(() => this.#write(CHAT_MEMORY_KEY, snapshot));
    await this.#writeQueue;
  }

  addFromUi(roomId: string, message: string, at = Date.now()): Promise<void> {
    this.#recentUi = this.#recentUi.filter(item => at - item.at <= 2_000).slice(-19);
    this.#recentUi.push({ roomId, message: message.trim(), at });
    return this.add(roomId, message, at);
  }

  addFromSocket(roomId: string, message: string, at = Date.now()): Promise<void> {
    this.#recentUi = this.#recentUi.filter(item => at - item.at <= 2_000);
    const index = this.#recentUi.findIndex(item => item.roomId === roomId && item.message === message.trim());
    if (index >= 0) {
      this.#recentUi.splice(index, 1);
      return Promise.resolve();
    }
    return this.add(roomId, message, at);
  }
}

export class ChatHistoryNavigator {
  #index: number | null = null;
  #draft = "";

  reset(): void {
    this.#index = null;
    this.#draft = "";
  }

  isBrowsing(): boolean {
    return this.#index !== null;
  }

  move(direction: "older" | "newer", current: string, history: readonly string[]): string | null {
    if (!history.length) return null;
    if (direction === "older") {
      if (this.#index === null) {
        this.#draft = current;
        this.#index = history.length - 1;
      } else {
        this.#index = Math.max(0, this.#index - 1);
      }
      return history[this.#index] ?? null;
    }
    if (this.#index === null) return null;
    if (this.#index < history.length - 1) {
      this.#index += 1;
      return history[this.#index] ?? null;
    }
    const draft = this.#draft;
    this.reset();
    return draft;
  }
}

export function shouldTakeOverHistoryNavigation(options: {
  isBrowsing: boolean;
  caretCollapsed: boolean;
  caretAtDirectionalBoundary: boolean;
}): boolean {
  return options.caretCollapsed &&
    (options.isBrowsing || options.caretAtDirectionalBoundary);
}

export function createChatMemoryFeature(store: ChatMemoryStore, hook?: Pick<PageSocketHook, "observeOutgoingChat">): FeatureDefinition {
  return {
    id: CHAT_MEMORY_ID,
    start({ diagnostics, document, observerHub, selectors }) {
      const navigators = new WeakMap<HTMLElement, ChatHistoryNavigator>();
      let browsingInput: HTMLElement | null = null;
      let browsingRoomId: string | null = null;
      const roomId = (): string | null =>
        document.defaultView?.location.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1] ?? null;

      const resetBrowsing = (): void => {
        if (browsingInput) navigators.get(browsingInput)?.reset();
        browsingInput = null;
        browsingRoomId = null;
      };

      const onKeyDown = (event: KeyboardEvent): void => {
        if (
          (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
          event.isComposing ||
          event.keyCode === 229 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) return;
        const target = event.target instanceof Element ? event.target : null;
        const input = closestChatInput(target);
        if (!input) return;
        const currentRoomId = roomId();
        if (!currentRoomId) return;
        if (
          browsingInput &&
          (browsingInput !== input || browsingRoomId !== currentRoomId)
        ) resetBrowsing();
        const navigator = navigators.get(input) ?? new ChatHistoryNavigator();
        navigators.set(input, navigator);
        const boundary = event.key === "ArrowUp" ? "start" : "end";
        if (!shouldTakeOverHistoryNavigation({
          isBrowsing: navigator.isBrowsing(),
          caretCollapsed: hasCollapsedChatInputCaret(input),
          caretAtDirectionalBoundary: isCaretAtBoundary(input, boundary),
        })) return;
        const value = navigator.move(
          event.key === "ArrowUp" ? "older" : "newer",
          readChatInput(input),
          store.messages(currentRoomId),
        );
        if (value === null) return;
        event.preventDefault();
        event.stopPropagation();
        writeChatInput(input, value);
        if (navigator.isBrowsing()) {
          browsingInput = input;
          browsingRoomId = currentRoomId;
        } else {
          browsingInput = null;
          browsingRoomId = null;
        }
      };

      const onInput = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        const input = closestChatInput(target);
        if (!input || !event.isTrusted) return;
        navigators.get(input)?.reset();
        if (browsingInput === input) resetBrowsing();
      };

      const onFocusIn = (event: FocusEvent): void => {
        if (!browsingInput) return;
        const target = event.target instanceof Element ? event.target : null;
        const input = closestChatInput(target);
        if (input !== browsingInput) resetBrowsing();
      };

      const stopListening = createChatSubmissionListener({
        document,
        getScope: roomId,
        onSubmitted: (submission) => {
          if (!submission.scope) return;
          void store.addFromUi(submission.scope, submission.message).catch((error: unknown) => {
            diagnostics.update(CHAT_MEMORY_ID, "error", {
              detail: error instanceof Error ? error.message : String(error),
            });
          });
        },
      });
      const stopOutgoing = hook?.observeOutgoingChat(data => {
        const message = readOutgoingChatContent(data);
        const currentRoomId = roomId();
        if (!message || !currentRoomId) return;
        void store.addFromSocket(currentRoomId, message).catch((error: unknown) => {
          diagnostics.update(CHAT_MEMORY_ID, "error", { detail: error instanceof Error ? error.message : String(error) });
        });
      });

      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("input", onInput, true);
      document.addEventListener("focusin", onFocusIn, true);
      const scan = (): void => {
        if (browsingInput && roomId() !== browsingRoomId) resetBrowsing();
        const input = selectors.find<HTMLElement>("chatInput");
        diagnostics.update(CHAT_MEMORY_ID, input ? "active" : "waiting", {
          detail: input ? "弹幕输入历史已启用" : "等待弹幕输入框挂载",
          selector: input?.selector,
        });
      };
      const stopWatching = observerHub.subscribe(scan);
      scan();

      return () => {
        stopListening();
        stopOutgoing?.();
        stopWatching();
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("input", onInput, true);
        document.removeEventListener("focusin", onFocusIn, true);
        resetBrowsing();
      };
    },
  };
}

export { chatInputSelectors };

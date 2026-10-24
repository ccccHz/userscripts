import { ROOM_MESSAGE_TYPES, roomFields } from "./room-messages.ts";
import { decodeDouyuPackets } from "./anonymous-danmaku.ts";
import { filterDouyuFrame, type ChatMessageFilter, type ActivityMessageFilter, type BlockedChatMessage } from "./douyu-message-filter.ts";
import { readDouyuUserMessages, isCompleteDouyuObservationFrame, type DouyuUserMessage } from "./douyu-user-messages.ts";

export const PAGE_SOCKET_HOOK_ID = "page-socket-hook";

const HOOK_STATE_KEY = Symbol.for("douyu-web-enhancer.page-socket-hook");
const MAX_OBSERVED_FRAME_BYTES = 1024 * 1024;
const DIAGNOSTIC_DELAY_MS = 500;

export interface PageSocketHookSnapshot {
  installed: boolean;
  capturedConnections: number;
  openConnections: number;
  closedConnections: number;
  socketErrors: number;
  receivedFrames: number;
  parsedMessages: number;
  unparsedFrames: number;
  oversizedFrames: number;
  messageTypes: {
    chatmsg: number;
    uenter: number;
    dgb: number;
    ranklist: number;
    other: number;
  };
  hookErrors: number;
  filterEnabled: boolean;
  filteredFrames: number;
  filteredMessages: number;
  filteredEntryMessages: number;
  filteredActivityMessages: number;
  filterSkippedFrames: number;
  filterSkippedUnsupportedFrames: number;
  filterSkippedIncompleteFrames: number;
  filterSkippedInvalidFrames: number;
  filterSkippedOversizedFrames: number;
  filterErrors: number;
  outgoingObservedFrames: number;
  outgoingTransformedFrames: number;
  outgoingTransformErrors: number;
}

type SocketTarget = {
  WebSocket: typeof WebSocket;
  location?: Pick<Location, "href">;
  [HOOK_STATE_KEY]?: HookState;
};

type SocketListeners = {
  open: EventListener;
  message: EventListener;
  error: EventListener;
  close: EventListener;
};

type SocketSend = { originalDescriptor: PropertyDescriptor | undefined; wrapper: WebSocket["send"] };

type HookState = {
  target: SocketTarget;
  original: typeof WebSocket;
  wrapper: typeof WebSocket;
  originalDescriptor: PropertyDescriptor | undefined;
  sockets: Map<WebSocket, SocketListeners>;
  socketSends: Map<WebSocket, SocketSend>;
  listeners: Set<() => void>;
  roomMessageListeners: Set<(messages: readonly string[]) => void>;
  userMessageListeners: Set<(messages: readonly DouyuUserMessage[]) => void>;
  outgoingChatListeners: Set<(data: unknown) => void>;
  snapshot: PageSocketHookSnapshot;
  chatFilter: ChatMessageFilter | null;
  entryFilter: ChatMessageFilter | null;
  activityFilter: ActivityMessageFilter | null;
  outgoingChatTransform: ((data: unknown) => unknown) | null;
  onFilteredActivities?: (roomIds: readonly string[], messages: readonly string[]) => void;
  onBlockedChats?: (messages: readonly BlockedChatMessage[]) => void;
  syntheticEvents: WeakSet<Event>;
  notificationTimer: ReturnType<typeof setTimeout> | undefined;
  refs: number;
  disposed: boolean;
};

export interface PageSocketHook {
  snapshot(): PageSocketHookSnapshot;
  subscribe(listener: () => void): () => void;
  observeRoomMessages(listener: (messages: readonly string[]) => void): () => void;
  observeUserMessages(listener: (messages: readonly DouyuUserMessage[]) => void): () => void;
  observeOutgoingChat(listener: (data: unknown) => void): () => void;
  setIncomingChatFilter(filter: ChatMessageFilter | null, onBlockedChats?: (messages: readonly BlockedChatMessage[]) => void, entryFilter?: ChatMessageFilter | null): void;
  setActivityFilter(filter: ActivityMessageFilter | null, onFiltered?: (roomIds: readonly string[], messages: readonly string[]) => void): void;
  setOutgoingChatTransform(transform: ((data: unknown) => unknown) | null): void;
  dispose(): void;
}

function initialSnapshot(): PageSocketHookSnapshot {
  return {
    installed: false,
    capturedConnections: 0,
    openConnections: 0,
    closedConnections: 0,
    socketErrors: 0,
    receivedFrames: 0,
    parsedMessages: 0,
    unparsedFrames: 0,
    oversizedFrames: 0,
    messageTypes: { chatmsg: 0, uenter: 0, dgb: 0, ranklist: 0, other: 0 },
    hookErrors: 0,
    filterEnabled: false,
    filteredFrames: 0,
    filteredMessages: 0,
    filteredEntryMessages: 0,
    filteredActivityMessages: 0,
    filterSkippedFrames: 0,
    filterSkippedUnsupportedFrames: 0,
    filterSkippedIncompleteFrames: 0,
    filterSkippedInvalidFrames: 0,
    filterSkippedOversizedFrames: 0,
    filterErrors: 0,
    outgoingObservedFrames: 0,
    outgoingTransformedFrames: 0,
    outgoingTransformErrors: 0,
  };
}

function snapshotOf(state: HookState): PageSocketHookSnapshot {
  return {
    ...state.snapshot,
    messageTypes: { ...state.snapshot.messageTypes },
  };
}

function notify(state: HookState): void {
  if (state.disposed) return;
  for (const listener of state.listeners) {
    try {
      listener();
    } catch {
      // A diagnostic subscriber must not affect a page-owned socket.
    }
  }
}

function scheduleNotify(state: HookState): void {
  if (state.disposed || state.notificationTimer !== undefined) return;
  state.notificationTimer = setTimeout(() => {
    state.notificationTimer = undefined;
    notify(state);
  }, DIAGNOSTIC_DELAY_MS);
}

function recordType(state: HookState, message: string): boolean {
  const type = /(?:^|\/)type@=([^/]+)\//.exec(message)?.[1];
  if (!type) return false;
  state.snapshot.parsedMessages += 1;
  if (type === "chatmsg" || type === "uenter" || type === "dgb" || type === "ranklist") {
    state.snapshot.messageTypes[type] += 1;
  } else {
    state.snapshot.messageTypes.other += 1;
  }
  return true;
}

function inspectFrame(state: HookState, data: unknown): void {
  if (state.disposed) return;
  state.snapshot.receivedFrames += 1;
  try {
    if (typeof data === "string") {
      if (data.length > MAX_OBSERVED_FRAME_BYTES) {
        state.snapshot.oversizedFrames += 1;
      } else if (!recordType(state, data)) {
        state.snapshot.unparsedFrames += 1;
      }
      return;
    }
    const byteLength = data instanceof ArrayBuffer
      ? data.byteLength
      : ArrayBuffer.isView(data) ? data.byteLength : 0;
    if (byteLength > MAX_OBSERVED_FRAME_BYTES) {
      state.snapshot.oversizedFrames += 1;
      return;
    }
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      state.snapshot.unparsedFrames += 1;
      return;
    }
    const messages = decodeDouyuPackets(data);
    if (messages.length === 0) {
      state.snapshot.unparsedFrames += 1;
      return;
    }
    for (const message of messages) {
      if (!recordType(state, message)) state.snapshot.unparsedFrames += 1;
    }
    if (state.roomMessageListeners.size && isCompleteDouyuObservationFrame(data)) {
      const observed = messages.filter(message => ROOM_MESSAGE_TYPES.has(roomFields(message).type ?? ""));
      if (observed.length) for (const listener of state.roomMessageListeners) {
        try { listener([...observed]); } catch { /* read-only observations must not affect delivery */ }
      }
    }
    if (state.userMessageListeners.size && isCompleteDouyuObservationFrame(data)) {
      const observed = readDouyuUserMessages(messages);
      if (observed.length) for (const listener of state.userMessageListeners) {
        try { listener(observed); } catch { /* observations cannot change native delivery */ }
      }
    }
  } catch {
    state.snapshot.hookErrors += 1;
  } finally {
    scheduleNotify(state);
  }
}

function isDouyuSocket(target: SocketTarget, address: unknown): boolean {
  try {
    const url = new URL(String(address), target.location?.href ?? "https://www.douyu.com/");
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return false;
    return url.hostname === "douyu.com" || url.hostname.endsWith(".douyu.com")
      || url.hostname === "douyucdn.cn" || url.hostname.endsWith(".douyucdn.cn");
  } catch {
    return false;
  }
}

function observeSocket(state: HookState, socket: WebSocket): void {
  try {
    const originalDescriptor = Object.getOwnPropertyDescriptor(socket, "send");
    const nativeSend = socket.send;
    const wrapper = function (this: WebSocket, data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      const transform = state.disposed ? null : state.outgoingChatTransform;
      let outgoing: unknown = data;
      if (transform) {
        try {
          outgoing = transform(data);
          if (outgoing !== data) state.snapshot.outgoingTransformedFrames += 1;
          state.snapshot.outgoingObservedFrames += 1;
          scheduleNotify(state);
        } catch {
          outgoing = data;
          state.snapshot.outgoingTransformErrors += 1;
          scheduleNotify(state);
        }
      }
      Reflect.apply(nativeSend, this, [outgoing]);
      // The native send has returned successfully. Observers see the original
      // submission, before optional tail rewriting, and cannot affect delivery.
      for (const listener of state.outgoingChatListeners) {
        try { listener(data); } catch { /* history observation is isolated */ }
      }
    } as WebSocket["send"];
    Object.defineProperty(socket, "send", { configurable: true, writable: true, value: wrapper });
    state.socketSends.set(socket, { originalDescriptor, wrapper });
  } catch {
    // A non-extensible native socket still works; only outbound transformation is unavailable.
    state.snapshot.hookErrors += 1;
  }
  const open: EventListener = () => {
    if (state.disposed) return;
    state.snapshot.openConnections += 1;
    notify(state);
  };
  const message: EventListener = (event) => {
    if (state.disposed) return;
    if (state.syntheticEvents.has(event)) return;
    const data = (event as MessageEvent<unknown>).data;
    if (data instanceof Blob) {
      if (data.size > MAX_OBSERVED_FRAME_BYTES) {
        state.snapshot.receivedFrames += 1;
        state.snapshot.oversizedFrames += 1;
        scheduleNotify(state);
      } else {
        void data.arrayBuffer().then((buffer) => inspectFrame(state, buffer)).catch(() => {
          if (state.disposed) return;
          state.snapshot.receivedFrames += 1;
          state.snapshot.hookErrors += 1;
          scheduleNotify(state);
        });
      }
    } else {
      inspectFrame(state, data);
    }
    const filter = state.chatFilter;
    if (!filter && !state.entryFilter && !state.activityFilter) return;
    if (!(data instanceof ArrayBuffer) || data.byteLength > MAX_OBSERVED_FRAME_BYTES) {
      state.snapshot.filterSkippedFrames += 1;
      if (!(data instanceof ArrayBuffer)) state.snapshot.filterSkippedUnsupportedFrames += 1;
      else state.snapshot.filterSkippedOversizedFrames += 1;
      scheduleNotify(state);
      return;
    }
    try {
      const activityMessages: string[] = [];
      const activityFilter = state.activityFilter ? (message: string): string | null => {
        const roomId = state.activityFilter?.(message) ?? null;
        if (roomId && /^[1-9]\d{0,11}$/.test(roomId)) activityMessages.push(message);
        return roomId;
      } : null;
      const result = filterDouyuFrame(data, filter ?? (() => false), state.entryFilter, activityFilter);
      if (result.kind === "pass") {
        if (result.reason === "invalid" || result.reason === "incomplete") {
          state.snapshot.filterSkippedFrames += 1;
          if (result.reason === "incomplete") state.snapshot.filterSkippedIncompleteFrames += 1;
          else state.snapshot.filterSkippedInvalidFrames += 1;
        }
        scheduleNotify(state);
        return;
      }
      let replacement: MessageEvent<unknown> | null = null;
      if (result.kind === "replace") {
        const original = event as MessageEvent<unknown>;
        replacement = new MessageEvent("message", {
          data: result.data,
          origin: original.origin,
          lastEventId: original.lastEventId,
        });
        state.syntheticEvents.add(replacement);
      }
      event.stopImmediatePropagation();
      state.snapshot.filteredFrames += 1;
      state.snapshot.filteredMessages += result.removedMessages;
      state.snapshot.filteredActivityMessages += result.activityRooms.length;
      state.snapshot.filteredEntryMessages += result.removedMessages - result.blockedChats.length - result.activityRooms.length;
      // Observation must not break native delivery of retained messages.
      try { state.onBlockedChats?.(result.blockedChats); } catch { /* observer failure is isolated */ }
      try { if (result.activityRooms.length) state.onFilteredActivities?.(result.activityRooms, activityMessages); } catch { /* statistics cannot affect delivery */ }
      scheduleNotify(state);
      if (replacement) socket.dispatchEvent(replacement);
    } catch {
      state.snapshot.filterErrors += 1;
      scheduleNotify(state);
      // Before stopImmediatePropagation, every failure keeps native delivery.
    }
  };
  const error: EventListener = () => {
    if (state.disposed) return;
    state.snapshot.socketErrors += 1;
    notify(state);
  };
  const close: EventListener = () => {
    if (state.disposed) return;
    state.snapshot.openConnections = Math.max(0, state.snapshot.openConnections - 1);
    state.snapshot.closedConnections += 1;
    detachSocket(state, socket);
    notify(state);
  };
  const listeners = { open, message, error, close };
  try {
    socket.addEventListener("open", open);
    socket.addEventListener("message", message);
    socket.addEventListener("error", error);
    socket.addEventListener("close", close);
    state.sockets.set(socket, listeners);
    state.snapshot.capturedConnections += 1;
    notify(state);
  } catch {
    for (const [name, listener] of Object.entries(listeners)) {
      try { socket.removeEventListener(name, listener); } catch { /* best effort */ }
    }
    state.snapshot.hookErrors += 1;
    notify(state);
  }
}

function detachSocket(state: HookState, socket: WebSocket): void {
  const send = state.socketSends.get(socket);
  if (send) {
    state.socketSends.delete(socket);
    if (socket.send === send.wrapper) try {
      if (send.originalDescriptor) Object.defineProperty(socket, "send", send.originalDescriptor);
      else Reflect.deleteProperty(socket, "send");
    } catch { state.snapshot.hookErrors += 1; }
  }
  const listeners = state.sockets.get(socket);
  if (!listeners) return;
  state.sockets.delete(socket);
  for (const [name, listener] of Object.entries(listeners)) {
    try { socket.removeEventListener(name, listener); } catch { /* best effort */ }
  }
}

function handle(state: HookState): PageSocketHook {
  let released = false;
  return {
    snapshot: () => snapshotOf(state),
    subscribe(listener) {
      if (released || state.disposed) return () => undefined;
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    observeRoomMessages(listener) {
      if (released || state.disposed) return () => undefined;
      state.roomMessageListeners.add(listener);
      return () => state.roomMessageListeners.delete(listener);
    },
    observeUserMessages(listener) {
      if (released || state.disposed) return () => undefined;
      state.userMessageListeners.add(listener);
      return () => state.userMessageListeners.delete(listener);
    },
    observeOutgoingChat(listener) {
      if (released || state.disposed) return () => undefined;
      state.outgoingChatListeners.add(listener);
      return () => state.outgoingChatListeners.delete(listener);
    },
    setIncomingChatFilter(filter, onBlockedChats, entryFilter = null) {
      if (released || state.disposed) return;
      state.chatFilter = filter;
      state.entryFilter = entryFilter;
      state.onBlockedChats = filter ? onBlockedChats : undefined;
      state.snapshot.filterEnabled = filter !== null || entryFilter !== null || state.activityFilter !== null;
      notify(state);
    },
    setActivityFilter(filter, onFiltered) {
      if (released || state.disposed) return;
      state.activityFilter = filter;
      state.onFilteredActivities = filter ? onFiltered : undefined;
      state.snapshot.filterEnabled = state.chatFilter !== null || state.entryFilter !== null || filter !== null;
      notify(state);
    },
    setOutgoingChatTransform(transform) {
      if (released || state.disposed) return;
      state.outgoingChatTransform = transform;
      notify(state);
    },
    dispose() {
      if (released) return;
      released = true;
      state.refs -= 1;
      if (state.refs > 0) return;
      state.disposed = true;
      state.chatFilter = null;
      state.entryFilter = null;
      state.activityFilter = null;
      state.outgoingChatTransform = null;
      state.onFilteredActivities = undefined;
      state.onBlockedChats = undefined;
      if (state.notificationTimer !== undefined) clearTimeout(state.notificationTimer);
      for (const socket of state.sockets.keys()) detachSocket(state, socket);
      state.listeners.clear();
      state.userMessageListeners.clear();
      state.outgoingChatListeners.clear();
      state.roomMessageListeners.clear();
      if (state.target.WebSocket === state.wrapper) {
        try {
          if (state.originalDescriptor) {
            Object.defineProperty(state.target, "WebSocket", state.originalDescriptor);
          } else {
            delete (state.target as Partial<SocketTarget>).WebSocket;
          }
        } catch {
          state.snapshot.hookErrors += 1;
        }
      }
      if (state.target[HOOK_STATE_KEY] === state) delete state.target[HOOK_STATE_KEY];
    },
  };
}

/** Install before page bootstrap; observe only page-owned Douyu sockets. */
export function installPageSocketHook(target: SocketTarget = globalThis as SocketTarget): PageSocketHook {
  const existing = target[HOOK_STATE_KEY];
  if (existing && !existing.disposed) {
    existing.refs += 1;
    return handle(existing);
  }
  const original = target.WebSocket;
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, "WebSocket");
  if (typeof original !== "function" || (originalDescriptor && (
    typeof originalDescriptor.value !== "function"
    || (!originalDescriptor.configurable && !originalDescriptor.writable)
  ))) {
    const snapshot = initialSnapshot();
    snapshot.hookErrors = 1;
    return { snapshot: () => ({ ...snapshot, messageTypes: { ...snapshot.messageTypes } }), subscribe: () => () => undefined, observeRoomMessages: () => () => undefined, observeUserMessages: () => () => undefined, observeOutgoingChat: () => () => undefined, setIncomingChatFilter: () => undefined, setActivityFilter: () => undefined, setOutgoingChatTransform: () => undefined, dispose: () => undefined };
  }
  const state: HookState = {
    target,
    original,
    wrapper: original,
    originalDescriptor,
    sockets: new Map(),
    socketSends: new Map(),
    listeners: new Set(),
    userMessageListeners: new Set(),
    outgoingChatListeners: new Set(),
    roomMessageListeners: new Set(),
    snapshot: initialSnapshot(),
    chatFilter: null,
    entryFilter: null,
    activityFilter: null,
    outgoingChatTransform: null,
    syntheticEvents: new WeakSet(),
    notificationTimer: undefined,
    refs: 1,
    disposed: false,
  };
  state.wrapper = new Proxy(original, {
    construct(constructor, args, newTarget) {
      const socket = Reflect.construct(constructor, args, newTarget) as WebSocket;
      if (isDouyuSocket(target, args[0])) observeSocket(state, socket);
      return socket;
    },
  });
  try {
    if (originalDescriptor?.configurable) {
      Object.defineProperty(target, "WebSocket", { ...originalDescriptor, value: state.wrapper });
    } else {
      target.WebSocket = state.wrapper;
    }
    target[HOOK_STATE_KEY] = state;
    state.snapshot.installed = true;
  } catch {
    state.snapshot.hookErrors += 1;
    if (target.WebSocket === state.wrapper) {
      try {
        if (originalDescriptor) Object.defineProperty(target, "WebSocket", originalDescriptor);
        else delete (target as Partial<SocketTarget>).WebSocket;
      } catch {
        state.snapshot.hookErrors += 1;
      }
    }
  }
  return handle(state);
}

/** Keep the enhancer's separate anonymous connection out of page-socket diagnostics. */
export function nativePageWebSocketConstructor(target: SocketTarget): typeof WebSocket {
  return target[HOOK_STATE_KEY]?.original ?? target.WebSocket;
}

export const ANONYMOUS_DANMAKU_URLS = [
  "wss://danmuproxy.douyu.com:8502",
  "wss://danmuproxy.douyu.com:8503",
  "wss://danmuproxy.douyu.com:8504",
  "wss://danmuproxy.douyu.com:8505",
] as const;

const HEARTBEAT_INTERVAL_MS = 40_000;
const MAX_RECONNECTS = 5;

export interface AnonymousDanmakuMessage {
  roomId: string;
  text: string;
  receivedAt: number;
}

export type AnonymousDanmakuStatus =
  | "connecting"
  | "ready"
  | "disconnected"
  | "unsupported";

interface AnonymousDanmakuOptions {
  roomId: string;
  onMessage: (message: AnonymousDanmakuMessage) => void;
  onStatus?: (status: AnonymousDanmakuStatus) => void;
  WebSocketCtor?: typeof WebSocket;
  now?: () => number;
  random?: () => number;
}

export function encodeDouyuPacket(message: string, messageType = 689): ArrayBuffer {
  const payload = new TextEncoder().encode(message);
  const packet = new ArrayBuffer(12 + payload.length + 1);
  const view = new DataView(packet);
  const length = payload.length + 9;
  view.setUint32(0, length, true);
  view.setUint32(4, length, true);
  view.setUint32(8, messageType, true);
  new Uint8Array(packet, 12, payload.length).set(payload);
  return packet;
}

export function decodeDouyuPackets(data: ArrayBuffer | ArrayBufferView): string[] {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  const messages: string[] = [];
  let offset = 0;
  while (offset + 12 <= bytes.byteLength) {
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      bytes.byteLength - offset,
    );
    const packetLength = view.getUint32(0, true) + 4;
    if (packetLength < 13 || offset + packetLength > bytes.byteLength) break;
    const payload = bytes.subarray(offset + 12, offset + packetLength - 1);
    const message = decoder.decode(payload).replace(/\0+$/, "");
    if (message) messages.push(message);
    offset += packetLength;
  }
  return messages;
}

function unescapeStt(value: string): string {
  return value.replace(/@S/g, "/").replace(/@A/g, "@");
}

export function parseDouyuStt(message: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of message.split("/")) {
    const separator = field.indexOf("@=");
    if (separator <= 0) continue;
    const key = unescapeStt(field.slice(0, separator));
    if (key !== "type" && key !== "txt") continue;
    result[key] = unescapeStt(field.slice(separator + 2));
  }
  return result;
}

export function createAnonymousDanmakuConnection({
  roomId,
  onMessage,
  onStatus,
  WebSocketCtor = globalThis.WebSocket,
  now = Date.now,
  random = Math.random,
}: AnonymousDanmakuOptions): () => void {
  if (!/^\d+$/.test(roomId) || typeof WebSocketCtor !== "function") {
    onStatus?.("unsupported");
    return () => undefined;
  }

  let socket: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectCount = 0;
  let closed = false;

  const clearHeartbeat = (): void => {
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  };

  const connect = (): void => {
    if (closed) return;
    onStatus?.("connecting");
    const index = Math.min(
      ANONYMOUS_DANMAKU_URLS.length - 1,
      Math.floor(random() * ANONYMOUS_DANMAKU_URLS.length),
    );
    const current = new WebSocketCtor(ANONYMOUS_DANMAKU_URLS[index]);
    socket = current;
    current.binaryType = "arraybuffer";
    current.onopen = () => {
      if (closed || socket !== current) return;
      current.send(encodeDouyuPacket(`type@=loginreq/roomid@=${roomId}/`));
      current.send(encodeDouyuPacket(`type@=joingroup/rid@=${roomId}/gid@=-9999/`));
      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (current.readyState === WebSocketCtor.OPEN) {
          current.send(encodeDouyuPacket("type@=mrkl/"));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };
    current.onmessage = (event: MessageEvent<unknown>) => {
      if (closed || socket !== current) return;
      const handle = (data: ArrayBuffer | ArrayBufferView): void => {
        for (const raw of decodeDouyuPackets(data)) {
          const fields = parseDouyuStt(raw);
          if (fields.type === "loginres") {
            reconnectCount = 0;
            onStatus?.("ready");
          }
          if (fields.type !== "chatmsg" || !fields.txt) continue;
          onMessage({
            roomId,
            text: fields.txt,
            receivedAt: now(),
          });
        }
      };
      if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
        handle(event.data);
      } else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then(handle).catch(() => undefined);
      }
    };
    current.onerror = () => {
      if (!closed && socket === current) current.close();
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      clearHeartbeat();
      onStatus?.("disconnected");
      if (closed || reconnectCount >= MAX_RECONNECTS) return;
      const delay = Math.min(3_000 * 1.5 ** reconnectCount, 30_000);
      reconnectCount += 1;
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();
  return () => {
    closed = true;
    clearHeartbeat();
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    const current = socket;
    socket = null;
    if (!current) return;
    current.onopen = null;
    current.onmessage = null;
    current.onerror = null;
    current.onclose = null;
    if (
      current.readyState === WebSocketCtor.OPEN ||
      current.readyState === WebSocketCtor.CONNECTING
    ) current.close();
  };
}

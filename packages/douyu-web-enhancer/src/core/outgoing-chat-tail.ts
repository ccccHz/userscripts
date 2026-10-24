export const DANMAKU_TAIL_KEY = "douyu-web-enhancer:danmaku-tail";

export interface DanmakuTailConfig {
  enabled: boolean;
  text: string;
  position: "prefix" | "suffix";
}

export const DEFAULT_DANMAKU_TAIL: DanmakuTailConfig = { enabled: false, text: "", position: "suffix" };
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const MAX_TAIL_CHARS = 50;
const MAX_CHAT_CHARS = 500;
const MAX_PACKET_BYTES = 64 * 1024;

export function normalizeDanmakuTail(value: unknown): DanmakuTailConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_DANMAKU_TAIL };
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  return {
    enabled: record.enabled === true && text.length > 0 && [...text].length <= MAX_TAIL_CHARS,
    text: [...text].slice(0, MAX_TAIL_CHARS).join(""),
    position: record.position === "prefix" ? "prefix" : "suffix",
  };
}

export function validateDanmakuTail(config: DanmakuTailConfig): string | null {
  if (config.enabled && !config.text.trim()) return "请先填写小尾巴内容";
  if ([...config.text.trim()].length > MAX_TAIL_CHARS) return `小尾巴最多 ${MAX_TAIL_CHARS} 字`;
  return null;
}

function unescapeStt(value: string): string { return value.replace(/@S/g, "/").replace(/@A/g, "@"); }
function escapeStt(value: string): string { return value.replace(/@/g, "@A").replace(/\//g, "@S"); }

/** Reads only a single complete ordinary chat submission; malformed/unknown frames are ignored. */
export function readOutgoingChatContent(data: unknown): string | null {
  if (!(data instanceof ArrayBuffer) || data.byteLength < 14 || data.byteLength > MAX_PACKET_BYTES) return null;
  try {
    const view = new DataView(data);
    if (view.getUint32(0, true) + 4 !== data.byteLength
      || view.getUint32(4, true) !== view.getUint32(0, true)
      || view.getUint32(8, true) !== 689) return null;
    const bytes = new Uint8Array(data);
    if (bytes.at(-1) !== 0) return null;
    const message = decoder.decode(bytes.subarray(12, -1));
    if (!message.endsWith("/")) return null;
    const fields = message.split("/");
    if (fields.filter(value => value === "type@=chatmessage").length !== 1) return null;
    const contents = fields.filter(value => value.startsWith("content@="));
    if (contents.length !== 1) return null;
    const content = unescapeStt(contents[0].slice(9)).trim();
    return content || null;
  } catch { return null; }
}

/** Rewrites one complete page-owned chatmessage packet. Every other input passes through unchanged. */
export function rewriteOutgoingChatTail(data: unknown, config: DanmakuTailConfig): unknown {
  if (!config.enabled || !config.text || !(data instanceof ArrayBuffer)) return data;
  if (data.byteLength < 14 || data.byteLength > MAX_PACKET_BYTES) return data;
  try {
    const header = new DataView(data);
    if (header.getUint32(0, true) + 4 !== data.byteLength
      || header.getUint32(4, true) !== header.getUint32(0, true)
      || header.getUint32(8, true) !== 689) return data;
    const bytes = new Uint8Array(data);
    if (bytes.at(-1) !== 0) return data;
    const message = decoder.decode(bytes.subarray(12, -1));
    if (!message.endsWith("/")) return data;
    const fields = message.split("/");
    if (fields.filter(field => field === "type@=chatmessage").length !== 1) return data;
    const contentIndexes = fields.flatMap((field, index) => field.startsWith("content@=") ? [index] : []);
    if (contentIndexes.length !== 1) return data;
    const index = contentIndexes[0];
    const content = unescapeStt(fields[index].slice("content@=".length));
    if (!content.trim()) return data;
    const tail = config.text.trim();
    if (config.position === "suffix" ? content.endsWith(tail) : content.startsWith(tail)) return data;
    const next = config.position === "prefix" ? tail + content : content + tail;
    if ([...next].length > MAX_CHAT_CHARS) return data;
    fields[index] = `content@=${escapeStt(next)}`;
    const payload = encoder.encode(fields.join("/"));
    if (payload.byteLength + 13 > MAX_PACKET_BYTES) return data;
    const result = new ArrayBuffer(payload.byteLength + 13);
    const view = new DataView(result);
    view.setUint32(0, payload.byteLength + 9, true);
    view.setUint32(4, payload.byteLength + 9, true);
    view.setUint32(8, 689, true);
    new Uint8Array(result, 12, payload.byteLength).set(payload);
    return result;
  } catch {
    return data;
  }
}

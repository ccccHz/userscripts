import type { BlockedChatMessage } from "./douyu-message-filter.ts";

export interface DouyuUserMessage extends BlockedChatMessage { kind: "chatmsg" | "uenter" | "dgb" }

export function isCompleteDouyuObservationFrame(data: ArrayBuffer | ArrayBufferView): boolean {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0; let packets = 0;
  while (offset < bytes.length) {
    if (++packets > 4096 || offset + 13 > bytes.length) return false;
    const header = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
    const length = header.getUint32(0, true) + 4;
    if (length < 13 || length !== header.getUint32(4, true) + 4 || offset + length > bytes.length || bytes[offset + length - 1] !== 0) return false;
    offset += length;
  }
  return packets > 0;
}

/** Only complete packets with explicit numeric identity are used for local observation. */
export function readDouyuUserMessages(messages: readonly string[]): DouyuUserMessage[] {
  const result: DouyuUserMessage[] = [];
  const field = (message: string, key: string) => new RegExp(`(?:^|/)${key}@=([^/]*)/`).exec(message)?.[1] ?? "";
  const decode = (value: string, limit: number) => value.replace(/@S/g, "/").replace(/@A/g, "@").slice(0, limit);
  for (const packet of messages) for (const message of packet.split("\0")) {
    const kind = field(message, "type");
    if (kind !== "chatmsg" && kind !== "uenter" && kind !== "dgb") continue;
    const uid = field(message, "uid"); const roomId = field(message, "rid");
    if (!/^[1-9]\d{0,19}$/.test(uid) || !/^[1-9]\d{0,11}$/.test(roomId)) continue;
    let text = kind === "chatmsg" ? decode(field(message, "txt"), 2048) : "";
    if (kind === "dgb") {
      const count = field(message, "gfcnt"); const name = decode(field(message, "gfn"), 128); const giftId = field(message, "gfid");
      if (!/^[1-9]\d{0,8}$/.test(count) || (!name && !/^\d{1,12}$/.test(giftId))) continue;
      text = `赠送 ${name || `礼物 #${giftId}`} × ${count}`;
    }
    result.push({ kind, uid, roomId, nickname: decode(field(message, "nn"), 128), text });
  }
  return result;
}

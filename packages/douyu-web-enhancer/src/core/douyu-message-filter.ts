export type ChatMessageFilter = (uid: string, roomId: string) => boolean;

export type FilteredDouyuFrame =
  | { kind: "pass"; reason: "unmatched" | "incomplete" | "invalid" }
  | { kind: "drop"; removedMessages: number }
  | { kind: "replace"; data: ArrayBuffer; removedMessages: number };

const MAX_PACKETS_PER_FRAME = 4096;
const decoder = new TextDecoder("utf-8", { fatal: true });

function field(message: string, name: string): string | null {
  return new RegExp(`(?:^|/)${name}@=([^/]*)/`).exec(message)?.[1] ?? null;
}

function packetParts(bytes: Uint8Array): Uint8Array[] | null {
  if (bytes.length < 13 || bytes[bytes.length - 1] !== 0) return null;
  const parts: Uint8Array[] = [];
  let start = 12;
  for (let index = 12; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    parts.push(bytes.subarray(start, index));
    start = index + 1;
  }
  return start === bytes.length ? parts : null;
}

function encodePacket(original: Uint8Array, parts: Uint8Array[]): Uint8Array {
  const bodyLength = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const bytes = new Uint8Array(12 + bodyLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bodyLength + 8, true);
  view.setUint32(4, bodyLength + 8, true);
  bytes.set(original.subarray(8, 12), 8);
  let offset = 12;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length + 1;
  }
  return bytes;
}

/** Filter only complete, valid frames. On uncertainty leave every original byte untouched. */
export function filterDouyuFrame(data: ArrayBuffer, shouldBlock: ChatMessageFilter): FilteredDouyuFrame {
  const bytes = new Uint8Array(data);
  const retained: Uint8Array[] = [];
  let removedMessages = 0;
  let offset = 0;
  let packets = 0;
  try {
    while (offset < bytes.length) {
      if (++packets > MAX_PACKETS_PER_FRAME) return { kind: "pass", reason: "invalid" };
      if (offset + 13 > bytes.length) return { kind: "pass", reason: "incomplete" };
      const header = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
      const length = header.getUint32(0, true) + 4;
      if (length < 13 || length !== header.getUint32(4, true) + 4) {
        return { kind: "pass", reason: "invalid" };
      }
      if (offset + length > bytes.length) return { kind: "pass", reason: "incomplete" };
      const packet = bytes.subarray(offset, offset + length);
      const parts = packetParts(packet);
      if (!parts) return { kind: "pass", reason: "invalid" };
      const kept: Uint8Array[] = [];
      for (const part of parts) {
        if (part.length === 0) { kept.push(part); continue; }
        const message = decoder.decode(part);
        const type = field(message, "type");
        const uid = type === "chatmsg" ? field(message, "uid") : null;
        const roomId = uid ? field(message, "rid") : null;
        if (uid && roomId && /^\d+$/.test(uid) && /^\d+$/.test(roomId) && shouldBlock(uid, roomId)) {
          removedMessages += 1;
        } else {
          kept.push(part);
        }
      }
      if (kept.length === parts.length) retained.push(packet);
      else if (kept.some((part) => part.length > 0)) retained.push(encodePacket(packet, kept));
      offset += length;
    }
  } catch {
    return { kind: "pass", reason: "invalid" };
  }
  if (removedMessages === 0) return { kind: "pass", reason: "unmatched" };
  if (retained.length === 0) return { kind: "drop", removedMessages };
  const totalLength = retained.reduce((sum, packet) => sum + packet.length, 0);
  const output = new Uint8Array(totalLength);
  let position = 0;
  for (const packet of retained) {
    output.set(packet, position);
    position += packet.length;
  }
  return { kind: "replace", data: output.buffer, removedMessages };
}

export const ROOM_MESSAGE_TYPES = new Set(["oun", "oul", "oni", "dfnum", "dfansrk", "newblackres", "setadminres", "superadmin_notice_user", "violation", "gbmres"]);
export function roomFields(packet: string): Record<string, string> {
  const fields: Record<string, string> = Object.create(null);
  for (const part of packet.split("/")) {
    const at = part.indexOf("@=");
    if (at > 0 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(part.slice(0, at))) fields[part.slice(0, at)] = part.slice(at + 2);
  }
  return fields;
}
export function roomText(value = "", limit = 512): string {
  return value.replace(/@S/g, "/").replace(/@A/g, "@").replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f]/g, " ").slice(0, limit);
}
export function roomNumber(value: string | undefined): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
export interface RoomEvent { roomId: string; at: number; kind: string; title: string; text: string; verified: boolean }
/** Official setadminres uses group, not newrg, to distinguish appointment/removal. */
export function parseRoomEvent(packet: string, currentRoom: string | null, at = Date.now()): RoomEvent | null {
  const f = roomFields(packet); const roomId = f.rid || currentRoom;
  if (!roomId || roomId !== currentRoom || !/^[1-9]\d{0,11}$/.test(roomId)) return null;
  const base = { roomId, at, kind: f.type!, verified: true };
  const identity = (name: string | undefined, uid: string | undefined) => roomText(name, 128) || (/^[1-9]\d{0,19}$/.test(uid || "") ? `UID ${uid}` : "用户");
  if (f.type === "newblackres" && f.ret === "0" && /^[1-9]\d{0,19}$/.test(f.did || "")) {
    const operator = f.otype === "1" ? "房管" : f.otype === "2" ? "主播" : "管理员";
    return { ...base, title: "用户被禁言", text: `${identity(f.dnic, f.did)} 被${operator} ${identity(f.snic, f.sid)} 禁言` };
  }
  if (f.type === "setadminres" && f.rescode === "0" && roomNumber(f.group) !== null && /^[1-9]\d{0,19}$/.test(f.userid || f.uid || "")) {
    const appointed = Number(f.group) > 1;
    return { ...base, title: appointed ? "任命房管" : "解除房管", text: `${identity(f.adnick, f.userid || f.uid)} ${appointed ? "被任命为房管" : "被解除房管身份"}` };
  }
  if (f.type === "gbmres" && f.ret === "0" && f.uname) return { ...base, title: "用户被封号", text: `${identity(f.uname, undefined)} 被封号` };
  if (f.type === "superadmin_notice_user" && f.content) return { ...base, verified: false, title: "超管消息", text: roomText(f.content) };
  if (f.type === "violation") return { ...base, verified: false, title: "违规事件（待核实）", text: `${identity(f.opName, f.opUid)} · 收到违规相关消息，具体处置尚未确认` };
  return null;
}

export interface AudienceValue { value: number; at: number }
export class RoomAudience {
  #room: string | null = null;
  #values: Partial<Record<"online" | "nobles" | "diamonds", AudienceValue>> = {};
  configure(room: string | null): void { if (room !== this.#room) { this.#room = room; this.#values = {}; } }
  record(packets: readonly string[], room: string | null, at = Date.now()): void {
    this.configure(room); if (!room) return;
    for (const packet of packets) {
      const f = roomFields(packet); if (f.rid && f.rid !== room) continue;
      const key = f.type === "oun" || f.type === "oul" ? "online" : f.type === "oni" ? "nobles" : f.type === "dfnum" || f.type === "dfansrk" ? "diamonds" : null;
      const value = roomNumber(key === "diamonds" ? f.dfc : f.un);
      if (key && value !== null) this.#values[key] = { value, at };
    }
  }
  snapshot(room: string | null, connected: boolean, at = Date.now()): Partial<Record<"online" | "nobles" | "diamonds", number>> {
    this.configure(room);
    if (!connected) return {};
    return Object.fromEntries(Object.entries(this.#values).filter(([, v]) => at >= v!.at && at - v!.at <= 180_000).map(([k,v]) => [k,v!.value]));
  }
}

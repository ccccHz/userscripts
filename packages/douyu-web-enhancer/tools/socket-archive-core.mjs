import { createHash } from "node:crypto";
import { classifyMessage } from "./socket-sampler-core.mjs";

const ROUTINE = new Set(["chatmsg", "uenter", "oun", "oni", "mrkl", "keeplive", "synexp"]);
const TARGET = new Set(["dgb", "spbc", "ranklist", "rankup", "comm_chatmsg"]);
const NO_RAW = new Set(["loginreq", "loginres", "joingroup", "logout"]);
// Configuration/visual IDs only. User, message and room identifiers are deliberately absent.
const VARIANTS = ["gadid", "adid", "fid", "dcsid", "ds", "ct", "diaf", "dfgm", "hl", "cdiaf"];

function fieldValues(text) {
  const values = Object.create(null);
  for (const part of text.split("/")) {
    const pos = part.indexOf("@=");
    if (pos > 0) values[part.slice(0, pos)] = part.slice(pos + 2);
  }
  return values;
}

export function describePacket(text) {
  const info = classifyMessage(text);
  const values = fieldValues(text);
  const variants = VARIANTS.filter((key) => /^\d{1,12}$/.test(values[key] ?? "") && Number(values[key]) > 0)
    .map((key) => [key, values[key]]);
  const activity = ["gadid", "adid"].some((key) => /^\d{1,12}$/.test(values[key] ?? "") && Number(values[key]) > 0);
  const decorated = ["fid", "dcsid", "ds", "diaf"].some((key) => Number(values[key]) > 0) || Boolean(values.nail);
  const category = NO_RAW.has(info.type) ? "control" : activity ? "activity-candidate"
    : info.type === "chatmsg" && decorated ? "decoration-candidate"
      : TARGET.has(info.type) ? "target" : ROUTINE.has(info.type) ? "routine" : "unknown";
  const shape = JSON.stringify([
    info.type,
    Object.entries(info.fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, shapes]) => [key, Object.keys(shapes).sort()]),
    Object.entries(info.nestedFields).sort(([a], [b]) => a.localeCompare(b)).map(([key, names]) => [key, [...names].sort()]),
    variants,
  ]);
  return { type: info.type, category, structure: createHash("sha256").update(shape).digest("hex") };
}

export function createCollection(options = {}) {
  const limits = { maxTypes: 512, maxStructures: 2048, maxSaved: 20_000,
    routinePerStructure: 10, routinePerType: 200, targetPerStructure: 100,
    targetPerType: 5000, unknownPerStructure: 10, unknownPerType: 500, ...options };
  const types = new Map();
  const structures = new Map();
  const dropped = Object.create(null);
  const reservations = new WeakMap();
  const periods = Object.fromEntries(["morning", "afternoon", "evening", "night"].map((key) =>
    [key, { received: 0, chat: 0, specialChat: 0, gifts: 0, entries: 0 }]));
  const sampleWindowMs = options.sampleWindowMs ?? null;
  let received = 0;
  let selected = 0;
  let saved = 0;
  function drop(reason) { dropped[reason] = (dropped[reason] ?? 0) + 1; }
  function windowFor(entry, id) {
    if (entry.window?.id !== id) entry.window = { id, selected: 0 };
    return entry.window;
  }
  return {
    observe(packet, at) {
      received += 1;
      const description = describePacket(packet.text);
      const timestamp = Date.parse(at);
      if (Number.isFinite(timestamp)) {
        const hour = new Date(timestamp + 8 * 3600_000).getUTCHours();
        const period = periods[hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"];
        period.received += 1;
        if (description.type === "chatmsg") period.chat += 1;
        if (description.type === "comm_chatmsg") period.specialChat += 1;
        if (description.type === "dgb") period.gifts += 1;
        if (description.type === "uenter") period.entries += 1;
      }
      let item = types.get(description.type);
      if (!item) {
        if (types.size >= limits.maxTypes) { drop("type-limit"); return null; }
        item = { count: 0, selected: 0, saved: 0, structures: 0, firstAt: at, lastAt: at };
        types.set(description.type, item);
      }
      item.count += 1;
      item.lastAt = at;
      if (description.category === "control") { drop("control-not-stored"); return null; }
      let structure = structures.get(description.structure);
      if (!structure) {
        if (structures.size >= limits.maxStructures) { drop("structure-limit"); return null; }
        structure = { selected: 0 };
        structures.set(description.structure, structure);
        item.structures += 1;
      }
      const group = description.category === "routine" ? "routine" : description.category === "unknown" ? "unknown" : "target";
      const structureLimit = description.type === "ranklist" ? limits.targetPerType : limits[`${group}PerStructure`];
      const windowId = sampleWindowMs && Number.isFinite(timestamp) ? Math.floor(timestamp / sampleWindowMs) : 0;
      const itemWindow = windowFor(item, windowId);
      const structureWindow = windowFor(structure, windowId);
      if (!options.selectAll && (structureWindow.selected >= structureLimit || itemWindow.selected >= limits[`${group}PerType`])) {
        drop("sample-limit"); return null;
      }
      if (!options.selectAll && selected >= limits.maxSaved) { drop("packet-limit"); return null; }
      selected += 1; structure.selected += 1; item.selected += 1;
      itemWindow.selected += 1; structureWindow.selected += 1;
      reservations.set(description, { itemWindow, structureWindow });
      return description;
    },
    stored(description) {
      if (!reservations.delete(description)) return;
      saved += 1; types.get(description.type).saved += 1;
    },
    release(description) {
      const reservation = reservations.get(description);
      if (!reservation || !reservations.delete(description)) return;
      selected -= 1; types.get(description.type).selected -= 1; structures.get(description.structure).selected -= 1;
      reservation.itemWindow.selected -= 1; reservation.structureWindow.selected -= 1;
    },
    drop,
    report() {
      return { received, selected, saved, structures: structures.size, dropped: { ...dropped }, sampleWindowMs,
        periods: Object.fromEntries(Object.entries(periods).map(([key, value]) => [key, { ...value }])),
        types: Object.fromEntries([...types].map(([type, { window, ...item }]) => [type, { ...item }])),
        pendingEvidence: ["activity-message-to-DOM", "floating-decoration-to-DOM", "initial-ranking-HTTP",
          "ranking-period-and-update-semantics", "moderation-and-admin-events", "page-stream-only-events"] };
    },
  };
}

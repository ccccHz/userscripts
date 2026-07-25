import { DEFAULT_REST_ROOM_ID } from "./renewal-plan.js";

export const REST_ROOM_ID_KEY = "chz_auto_fans_continue_rest_room_id";

export function normalizeRoomId(value) {
  const roomId = String(value ?? "").trim();
  return /^[1-9]\d*$/.test(roomId) ? roomId : null;
}

export function getRestRoomId(
  storage,
  fallbackRoomId = DEFAULT_REST_ROOM_ID,
) {
  try {
    return normalizeRoomId(storage?.getItem(REST_ROOM_ID_KEY)) ?? fallbackRoomId;
  } catch {
    return fallbackRoomId;
  }
}

export function setRestRoomId(storage, roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) return false;

  storage.setItem(REST_ROOM_ID_KEY, normalizedRoomId);
  return true;
}

export function resetRestRoomId(storage) {
  storage.removeItem(REST_ROOM_ID_KEY);
}

export function registerRestRoomMenu({
  storage,
  registerMenuCommand,
  prompt,
  alert,
  fallbackRoomId = DEFAULT_REST_ROOM_ID,
}) {
  if (!storage || typeof registerMenuCommand !== "function") return null;

  const currentRoomId = getRestRoomId(storage, fallbackRoomId);
  return registerMenuCommand(
    `设置剩余荧光棒房间（当前 ${currentRoomId}）`,
    () => {
      const input = prompt?.(
        `请输入剩余荧光棒默认赠送房间号；留空恢复默认 ${fallbackRoomId}`,
        getRestRoomId(storage, fallbackRoomId),
      );
      if (input === null || input === undefined) return;

      if (String(input).trim() === "") {
        resetRestRoomId(storage);
        alert?.(`已恢复默认房间 ${fallbackRoomId}，下次执行生效`);
        return;
      }

      if (!setRestRoomId(storage, input)) {
        alert?.("房间号无效，请输入非 0 开头的纯数字房间号");
        return;
      }

      alert?.(`已保存房间 ${normalizeRoomId(input)}，下次执行生效`);
    },
  );
}

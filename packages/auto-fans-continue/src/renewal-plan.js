export const DEFAULT_REST_ROOM_ID = "12306";
export const STICK_GIFT_IDS = [268, 2358];

export function selectStickGift(gifts) {
  for (const giftId of STICK_GIFT_IDS) {
    const gift = gifts.find(
      (item) => Number(item?.id) === giftId && Number(item?.count) > 0,
    );
    if (gift) return { id: giftId, count: Number(gift.count) };
  }

  return null;
}

export function createRenewalPlan({
  gift,
  fanRoomIds,
  restRoomId = DEFAULT_REST_ROOM_ID,
  sendNum = 1,
  sendRest = true,
}) {
  const giftId = Number(gift.id);
  let remaining = Math.max(0, Math.floor(Number(gift.count)));
  const countPerRoom = Math.max(1, Math.floor(Number(sendNum)));
  const perRoom = [];

  for (const roomId of fanRoomIds) {
    if (remaining < countPerRoom) break;
    perRoom.push({
      giftId,
      count: countPerRoom,
      roomId: String(roomId),
    });
    remaining -= countPerRoom;
  }

  return {
    perRoom,
    rest:
      sendRest && remaining > 0
        ? { giftId, count: remaining, roomId: String(restRoomId) }
        : null,
  };
}

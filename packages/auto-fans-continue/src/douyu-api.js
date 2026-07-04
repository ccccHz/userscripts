export function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function createBackpackUrl(roomId) {
  return `https://www.douyu.com/japi/prop/backpack/web/v5?rid=${encodeURIComponent(
    roomId,
  )}`;
}

export function createDonateBody({ giftId, count, roomId }) {
  const body = new URLSearchParams();
  body.set("propId", String(giftId));
  body.set("propCount", String(count));
  body.set("roomId", String(roomId));
  body.set("bizExt", JSON.stringify({ yzxq: {} }));
  return body.toString();
}

export async function getBagGifts(roomId) {
  const res = await fetch(createBackpackUrl(roomId), {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.json();
}

export async function sendBagGift({ giftId, count, roomId }) {
  const res = await fetch("https://www.douyu.com/japi/prop/donate/mainsite/v1", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createDonateBody({ giftId, count, roomId }),
  });
  return res.json();
}

export function extractFanRoomIds(doc) {
  return Array.from(doc.querySelectorAll(".fans-badge-list [data-fans-room]"))
    .map((node) => node.getAttribute("data-fans-room"))
    .filter(Boolean);
}

export async function getFanBadgeRoomIds() {
  const res = await fetch("https://www.douyu.com/member/cp/getFansBadgeList", {
    method: "GET",
    cache: "default",
    credentials: "include",
  });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return extractFanRoomIds(doc);
}

import { md5 } from "./md5.js";

export const DOUYU_ROOM_SOCKET_URL = "wss://wsproxy.douyu.com:6672";
export const LOGIN_COOKIE_KEYS = [
  "acf_username",
  "acf_ltkid",
  "acf_biz",
  "acf_stk",
  "acf_ct",
];

const LOGIN_VK_SECRET = "r5*^5;}2#${XF[h+;'./.Q'1;,-]f'p[";
const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeRoomId(roomId) {
  const value = String(roomId ?? "").trim();
  return /^[1-9]\d*$/.test(value) ? value : null;
}

export function parseCookieString(cookieString) {
  return String(cookieString ?? "")
    .split(";")
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;

      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key) cookies[key] = value;
      return cookies;
    }, {});
}

function escapeSttValue(value) {
  return String(value).replace(/@/g, "@A").replace(/\//g, "@S");
}

export function encodeStt(params) {
  return Object.entries(params)
    .map(([key, value]) => `${escapeSttValue(key)}@=${escapeSttValue(value)}/`)
    .join("");
}

export function encodeDouyuPacket(message, messageType = 689) {
  const payload = new TextEncoder().encode(message);
  const packet = new ArrayBuffer(12 + payload.length + 1);
  const view = new DataView(packet);
  const length = payload.length + 9;

  view.setUint32(0, length, true);
  view.setUint32(4, length, true);
  view.setUint32(8, messageType, true);
  new Uint8Array(packet, 12, payload.length).set(payload);
  view.setUint8(packet.byteLength - 1, 0);
  return packet;
}

export function decodeDouyuMessages(data) {
  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null;
  if (!bytes) return [];

  const messages = [];
  const decoder = new TextDecoder();
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
    messages.push(
      ...decoder
        .decode(payload)
        .split("\0")
        .filter((message) => message.length > 0),
    );
    offset += packetLength;
  }

  return messages;
}

function randomDeviceId(cryptoObject) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(31);
  cryptoObject.getRandomValues(bytes);
  return `b${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join(
    "",
  )}`;
}

export function buildLoginMessage({
  roomId,
  cookieString,
  now = new Date(),
  cryptoObject = globalThis.crypto,
}) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) throw new Error("无效的斗鱼房间号");
  if (!cryptoObject?.getRandomValues) throw new Error("浏览器随机数 API 不可用");

  const cookies = parseCookieString(cookieString);
  const missingCookieKeys = LOGIN_COOKIE_KEYS.filter((key) => !cookies[key]);
  if (missingCookieKeys.length > 0) {
    throw new Error(`当前登录态缺少 ${missingCookieKeys.join(", ")}`);
  }

  const timestamp = String(Math.floor(now.getTime() / 1000));
  const deviceId = randomDeviceId(cryptoObject);
  const vk = md5(`${timestamp}${LOGIN_VK_SECRET}${deviceId}`);

  return encodeStt({
    type: "loginreq",
    password: "",
    roomid: normalizedRoomId,
    username: cookies.acf_username,
    ltkid: cookies.acf_ltkid,
    biz: cookies.acf_biz,
    stk: cookies.acf_stk,
    ct: cookies.acf_ct,
    devid: deviceId,
    rt: timestamp,
    pt: "2",
    vk,
    ver: "20180222",
    aver: "219032101",
    dmbt: "chrome",
    dmbv: "150",
  });
}

export function buildEnterRoomMessage(roomId, now = new Date()) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) throw new Error("无效的斗鱼房间号");

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return encodeStt({
    type: "h5ckreq",
    rid: normalizedRoomId,
    ti: `2501${year}${month}${day}`,
  });
}

export function connectAuthenticatedRoom({
  roomId,
  cookieString = globalThis.document?.cookie,
  WebSocketCtor = globalThis.WebSocket,
  cryptoObject = globalThis.crypto,
  now = new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  socketUrl = DOUYU_ROOM_SOCKET_URL,
} = {}) {
  if (typeof WebSocketCtor !== "function") {
    return Promise.reject(new Error("浏览器 WebSocket API 不可用"));
  }

  let loginMessage;
  let enterRoomMessage;
  try {
    loginMessage = buildLoginMessage({
      roomId,
      cookieString,
      now,
      cryptoObject,
    });
    enterRoomMessage = buildEnterRoomMessage(roomId, now);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const socket = new WebSocketCtor(socketUrl);
    let settled = false;
    let loginAccepted = false;
    const timer = setTimeout(() => {
      finish(new Error("等待斗鱼房间连接响应超时"));
    }, timeoutMs);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve({ status: "connected", roomId: String(roomId) });
    }

    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      socket.send(encodeDouyuPacket(loginMessage));
    };
    socket.onmessage = (event) => {
      for (const message of decodeDouyuMessages(event.data)) {
        if (message.startsWith("type@=loginres")) {
          if (!message.includes("roomgroup@=1")) {
            finish(new Error("斗鱼房间登录鉴权失败"));
            return;
          }

          loginAccepted = true;
          socket.send(encodeDouyuPacket(enterRoomMessage));
        } else if (message.startsWith("type@=h5ckres")) {
          finish();
          return;
        }
      }
    };
    socket.onerror = () => {
      finish(new Error("斗鱼房间 WebSocket 连接失败"));
    };
    socket.onclose = () => {
      if (!settled) {
        finish(
          new Error(
            loginAccepted
              ? "斗鱼房间连接在进房完成前关闭"
              : "斗鱼房间连接在登录完成前关闭",
          ),
        );
      }
    };
  });
}

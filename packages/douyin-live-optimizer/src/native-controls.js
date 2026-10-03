import { throwIfAborted, waitFor } from "./task.js";

// Inspect only React props attached to known player controls. Never execute
// component functions, walk a global store, or patch the site's callbacks.
export function reactProps(node) {
  for (const key of Object.getOwnPropertyNames(node || {})) {
    if (key.startsWith("__reactProps$")) return node[key];
  }
  return currentFiber(node)?.memoizedProps || null;
}
function currentFiber(node) {
  const key = Object.getOwnPropertyNames(node || {}).find((key) => key.startsWith("__reactFiber$"));
  const fiber = node?.[key];
  let root = fiber;
  for (let i = 0; root?.return && i < 50; i++) root = root.return;
  return root?.stateNode?.current && root.stateNode.current !== root ? fiber?.alternate || fiber : fiber;
}
export function findControlProps(node, predicate) {
  const direct = reactProps(node);
  if (direct && predicate(direct)) return direct;
  let fiber = currentFiber(node);
  for (let depth = 0; fiber && depth < 8; depth++, fiber = fiber.return) {
    if (fiber.memoizedProps && predicate(fiber.memoizedProps)) return fiber.memoizedProps;
  }
  return null;
}
export function activateControl(node) {
  const props = reactProps(node);
  if (typeof props?.onClick === "function") {
    props.onClick({ type: "click", target: node, currentTarget: node, preventDefault() {}, stopPropagation() {} });
    return "react";
  }
  node?.click?.();
  return "menu";
}
export function giftControl(document) {
  return findControlProps(document.querySelector('[data-e2e="gift-setting"]'),
    (props) => typeof props.effectSwitchStatus === "boolean" && typeof props.onSwitch === "function");
}
export function readGiftBlocked(document) {
  const props = giftControl(document);
  return props ? !props.effectSwitchStatus : null;
}
export async function setGiftBlocked({ document, blocked, signal, sleepFn }) {
  const props = giftControl(document);
  if (!props) return null;
  throwIfAborted(signal);
  if (!props.effectSwitchStatus !== blocked) props.onSwitch(!blocked);
  const verified = Boolean(await waitFor(() => readGiftBlocked(document) === blocked, { signal, attempts: 10, sleepFn }));
  return { verified, method: "react", triggerFound: true };
}
export function webFullscreenControl(document) {
  const modern = [...(document.querySelectorAll('.douyin-player-controls-right slot > div') || [])]
    .find((node) => /(?:进入|退出)?网页全屏/.test(node.textContent));
  if (modern) return modern;
  return document.querySelector('xg-icon.xgplayer-page-full-screen, xg-icon.xgplayer-fullscreen + xg-icon');
}
export function readWebFullscreen(document) {
  const node = webFullscreenControl(document);
  if (!node) return null;
  const text = node.textContent || "";
  return text.includes("退出网页全屏") ? true : text.includes("网页全屏") ? false : null;
}
export async function setWebFullscreen({ document, enabled, signal, sleepFn }) {
  const node = await waitFor(() => webFullscreenControl(document), { signal, attempts: 30, sleepFn });
  if (!node || readWebFullscreen(document) === null) return { applied: false };
  throwIfAborted(signal);
  let method = "unchanged";
  if (readWebFullscreen(document) !== enabled) {
    // Browser/video fullscreen is a separate user gesture; never request it here.
    if (document.fullscreenElement) return { applied: false, method: "native-fullscreen" };
    const props = findControlProps(node, (props) => typeof props.on === "boolean" && typeof props.onSwitch === "function");
    // This native control's `on` means normal mode, not theater mode.
    // Read the rendered label and pass its inverse to the verified callback.
    if (props) { props.onSwitch(!enabled); method = "react"; }
    else {
      const clickable = node.querySelector('div:has(>svg), .xgplayer-icon') || node;
      method = activateControl(clickable);
    }
  }
  return { applied: Boolean(await waitFor(() => readWebFullscreen(document) === enabled, { signal, attempts: 10, sleepFn })), method };
}
export function readChatCollapsed(document) {
  const chat = document.querySelector("#chatroom");
  if (!chat) return null;
  // Only explicit native display state counts. Zero width during loading or
  // another screen mode must never overwrite the user's saved preference.
  if (chat.style?.display === "none") return true;
  return chat.getBoundingClientRect?.().width > 0 ? false : null;
}
export function chatControl(document, collapsed) {
  return document.querySelector(collapsed ? "#chatroom .chatroom_close, #chatroom .KH9DQgyz" : ".chat_room_fold");
}
export async function setChatCollapsed({ document, collapsed, signal, sleepFn }) {
  const ready = await waitFor(() => readChatCollapsed(document) !== null, { signal, attempts: 30, sleepFn });
  if (!ready) return { applied: false };
  throwIfAborted(signal);
  let method = "unchanged";
  if (readChatCollapsed(document) !== collapsed) {
    const node = chatControl(document, collapsed);
    if (!node) return { applied: false };
    method = activateControl(node);
  }
  return { applied: Boolean(await waitFor(() => readChatCollapsed(document) === collapsed, { signal, attempts: 10, sleepFn })), method };
}
export function readAudio(video) {
  return video && typeof video.muted === "boolean" && Number.isFinite(video.volume)
    ? { muted: video.muted, volume: video.volume } : null;
}
export function setAudio(video, state) {
  if (!video) return { applied: false };
  video.volume = state.volume;
  video.muted = state.muted;
  return { applied: video.volume === state.volume && video.muted === state.muted, method: "video" };
}

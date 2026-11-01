import { getCanvasDanmakuControl } from './native-controls.js';

// These are the native constructor's defaults, not a replacement renderer.
const DEFAULTS = { channelHeight: 40, gap: 100, debug: false, maxCount: 200, ab: {}, useBitmapCache: false };

function replaceRenderer({ renderer, config, window, node, mainThread, barrages = [] }) {
  const previous = renderer.danmakuManagerInMainThread;
  const prototype = window.HTMLCanvasElement?.prototype;
  const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'transferControlToOffscreen');
  const original = descriptor?.value;
  let next;
  // The official constructor explicitly supports a null offscreen result.
  // Only this synchronous construction uses the fallback; restore even on throw.
  if (mainThread && typeof original === 'function') {
    if (!descriptor.configurable) throw new Error('canvas-fallback-unavailable');
    Object.defineProperty(prototype, 'transferControlToOffscreen', { ...descriptor, value: function (...args) {
      return this.parentElement === node ? null : original.apply(this, args);
    } });
  }
  try {
    if (renderer.constructor === Object) throw new Error('unknown-native-renderer');
    next = new renderer.constructor({ container: node, config: { ...DEFAULTS, ...config }, barrages });
  } finally {
    if (mainThread && typeof original === 'function') Object.defineProperty(prototype, 'transferControlToOffscreen', descriptor);
  }
  if (mainThread && !next.danmakuManagerInMainThread?.instance) { next.destroy(); throw new Error('native-main-thread-unavailable'); }
  // Keep the original renderer object: native message/play/config callbacks
  // already reference it. Only replace its rendering resources.
  previous.emit('destroy');
  for (const cleanup of renderer.offCbs.splice(0)) { try { cleanup(); } catch { /* stale native DOM */ } }
  renderer.canvasDom = next.canvasDom;
  renderer.danmakuManagerInMainThread = next.danmakuManagerInMainThread;
  renderer.offCbs = next.offCbs;
  renderer.offCbs.unshift(() => { next._isDestroyed = true; });
}

export async function createCanvasAccess({ node, window, isCurrent = () => true, resolve = getCanvasDanmakuControl }) {
  const control = resolve(node);
  if (!control) return null;
  const { renderer } = control;
  const manager = renderer.danmakuManagerInMainThread;
  await manager.createInstancePromise;
  if (!isCurrent() || renderer._isDestroyed || !node.isConnected) return null;
  const converted = !manager.instance;
  if (converted) replaceRenderer({ ...control, window, node, mainThread: true });
  const instance = renderer.danmakuManagerInMainThread.instance;
  if (!instance?.originBarrageList || !instance.offscreenCanvas) return null;
  const messages = new Map(), unsubscribe = [];
  if (typeof control.source?.on === 'function') {
    for (const event of ['ChatMessage', 'ScreenChatMessage', 'PrivilegeScreenChatMessage']) {
      try {
        const stop = control.source.on(event, batch => {
        if (!Array.isArray(batch)) return;
        for (const message of batch) {
          const id = String(message?.msg_id || message?.payload?.common?.msg_id || '');
          const text = message?.payload?.content;
          if (!id || typeof text !== 'string' || !text.trim()) continue;
          messages.set(id, { id, text });
          if (messages.size > 200) messages.delete(messages.keys().next().value);
        }
        });
        if (typeof stop === 'function') unsubscribe.push(stop);
      } catch { /* Older versions can omit a decorated-message event. */ }
    }
  }
  let disposed = false;
  const read = target => readScreenMessage(target, messages);
  return {
    node, renderer, instance,
    get canvas() { return renderer.canvasDom; },
    read,
    bounds(target) { return nativeBarrageBounds(instance, renderer.canvasDom, target); },
    hit(x, y) { return hitTestNativeDanmaku(instance, renderer.canvasDom, x, y, read); },
    valid(target) { return !disposed && !renderer._isDestroyed && node.isConnected && nativeScreenBarrages(instance).includes(target); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of unsubscribe) { try { stop(); } catch { /* Restore rendering even if a native listener is stale. */ } }
      messages.clear();
      if (converted && node.isConnected && !renderer._isDestroyed && renderer.danmakuManagerInMainThread.instance === instance) {
        // Preserve current native configuration and queued messages on restore.
        replaceRenderer({ renderer, node, window, config: instance.config, mainThread: false,
          barrages: [...new Set([...nativeScreenBarrages(instance), ...instance.originBarrageList])].filter(b => !b.isExpired).map(b => b.options) });
      }
    },
  };
}

export function nativeScreenBarrages(instance) {
  // Admission removes visible messages from originBarrageList. Active objects
  // live in _channels and a multi-line message occurs in more than one track.
  return [...new Set((instance._channels || []).flat())];
}

export function nativeBarrageBounds(instance, canvas, target) {
  const rect = canvas?.getBoundingClientRect();
  if (!rect?.width || !rect.height || !target.bookedChannel) return null;
  const scaleX = rect.width / instance.offscreenCanvas.width, scaleY = rect.height / instance.offscreenCanvas.height;
  const left = rect.left + (instance.offscreenCanvas.width - target.deltaX) * scaleX;
  const top = rect.top + (target.bookedChannel.startIndex * instance.channelHeightDpr + 2) * scaleY;
  return {
    left: Math.max(rect.left, left), top: Math.max(rect.top, top),
    right: Math.min(rect.left + rect.width, left + target.size.widthWithDpr * scaleX),
    bottom: Math.min(rect.top + rect.height, top + target.size.heightWithDpr * scaleY),
    player: { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height },
  };
}

export function readScreenMessage(target, messages) {
  const options = target?.options;
  const received = messages?.get(String(options?.id || ''));
  if (received) return received;
  // Ordinary chat has plain white text. Gift, paid blocks and image messages
  // have different native styles/content and are not sent as ordinary text.
  if (!options?.id || !['#fff', '#ffffff', 'rgb(255, 255, 255)'].includes(options.color) || !Array.isArray(options.content) ||
      !options.content.length || options.content.some(piece => piece.type !== 'text' || typeof piece.text !== 'string')) return null;
  const text = options.content.map(piece => piece.text).join('');
  return text.trim() ? { id: String(options.id), text } : null;
}

export function hitTestNativeDanmaku(instance, canvas, x, y, read = readScreenMessage) {
  const rect = canvas?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return null;
  const px = (x - rect.left) * instance.offscreenCanvas.width / rect.width;
  const py = (y - rect.top) * instance.offscreenCanvas.height / rect.height;
  if (px < 0 || py < 0 || px > instance.offscreenCanvas.width || py > instance.offscreenCanvas.height) return null;
  for (const target of nativeScreenBarrages(instance).reverse()) {
    if (!target.isInScreen || target.isExpired || !read(target)) continue;
    const left = instance.offscreenCanvas.width - target.deltaX;
    const top = target.bookedChannel.startIndex * instance.channelHeightDpr + 2;
    const size = target.size;
    if (px >= left && px <= left + size.widthWithDpr && py >= top && py <= top + size.heightWithDpr) return target;
  }
  return null;
}

export function freezeNativeBarrage(target) {
  const previous = Object.getOwnPropertyDescriptor(target, 'speed');
  if (previous && !previous.configurable) return null;
  // Native channel collision handling holds following messages as well.
  // Other tracks and video playback keep running; no wall-clock rewrite.
  Object.defineProperty(target, 'speed', { configurable: true, value: 0 });
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (Object.getOwnPropertyDescriptor(target, 'speed')?.value !== 0) return;
    if (previous) Object.defineProperty(target, 'speed', previous);
    else delete target.speed;
  };
}

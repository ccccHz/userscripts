import { createCanvasAccess, freezeNativeBarrage } from './screen-danmaku-native.js';
import { placeScreenToolbar, inToolbarBridge } from './screen-danmaku-geometry.js';

export function createScreenDanmakuHover({ document, window, enabled, getScope, onPlusOne, notify, connect = createCanvasAccess }) {
  const host = document.createElement('div');
  host.className = 'dlo-screen-toolbar'; host.hidden = true;
  host.setAttribute('data-dlo-screen-toolbar', ''); host.setAttribute('role', 'toolbar');
  host.setAttribute('aria-label', '飘屏弹幕操作');
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '复制';
  const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+1';
  plus.title = '加一：发送相同弹幕'; plus.setAttribute('aria-label', '弹幕加一');
  host.append(plus, copy);
  let access = null, pending = null, selected = null, unfreeze = null, leaveTimer, generation = 0, destroyed = false;
  const attempts = new WeakMap();
  function mountHost() {
    const parent = document.fullscreenElement || document.body;
    if (parent && host.parentElement !== parent) parent.append(host);
  }
  function close() {
    window.clearTimeout(leaveTimer); leaveTimer = undefined; unfreeze?.(); unfreeze = null;
    selected = null; host.hidden = true;
  }
  function release() {
    generation++; pending = null; close();
    try { access?.dispose(); } catch { notify('弹幕渲染恢复未完成，请刷新页面恢复原生状态。'); }
    access?.node?.removeAttribute('data-dlo-screen-actions'); access = null;
  }
  function valid(target) {
    const current = target && access?.read(target.barrage);
    return enabled() && target?.scope === getScope() && access?.valid(target.barrage) &&
      current?.id === target.snapshot.id && current?.text === target.snapshot.text;
  }
  function move(event) {
    if (host.contains(event.target)) { window.clearTimeout(leaveTimer); leaveTimer = undefined; return; }
    if (!enabled() || !access || document.querySelector('[data-douyin-live-optimizer-panel]')?.hidden === false) return close();
    if (selected && valid(selected) && inToolbarBridge(event.clientX, event.clientY, selected.bounds, selected.toolbar)) {
      window.clearTimeout(leaveTimer); leaveTimer = undefined; return;
    }
    const target = access.hit(event.clientX, event.clientY);
    if (!target) {
      if (selected && leaveTimer === undefined) leaveTimer = window.setTimeout(() => { leaveTimer = undefined; close(); }, 180);
      return;
    }
    window.clearTimeout(leaveTimer); leaveTimer = undefined;
    if (selected?.barrage === target && valid(selected)) return;
    close();
    const restore = freezeNativeBarrage(target);
    if (!restore) return;
    unfreeze = restore;
    const bounds = access.bounds(target);
    if (!bounds) return close();
    selected = { kind: 'screen', barrage: target, snapshot: access.read(target), scope: getScope(), bounds };
    host.hidden = false;
    const size = host.getBoundingClientRect?.() || { width: 100, height: 36 };
    const player = { left: Math.max(0, bounds.player.left), top: Math.max(0, bounds.player.top),
      right: Math.min(window.innerWidth, bounds.player.right), bottom: Math.min(window.innerHeight || Infinity, bounds.player.bottom) };
    const position = placeScreenToolbar({ pointerX: event.clientX, item: bounds, player, width: size.width, height: size.height });
    host.style.left = `${Math.round(position.left)}px`; host.style.top = `${Math.round(position.top)}px`;
    selected.toolbar = { ...position, right: position.left + size.width, bottom: position.top + size.height };
  }
  plus.addEventListener('pointerdown', event => event.preventDefault());
  plus.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    const target = selected;
    if (plus.disabled || !valid(target)) return close();
    plus.disabled = true;
    try { await onPlusOne({ ...target, validate: () => valid(target) }); } finally { plus.disabled = false; }
  });
  copy.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    if (!valid(selected)) return close();
    try { await window.navigator.clipboard.writeText(selected.snapshot.text); notify('已复制飘屏弹幕。'); }
    catch { notify('复制未完成，请检查浏览器剪贴板权限。'); }
  });
  function leave(event) { if (!event.relatedTarget) close(); }
  function key(event) { if (event.key === 'Escape') close(); }
  function surfaceChanged() { close(); mountHost(); }
  document.addEventListener('pointermove', move, true);
  // The player can consume pointer events before document; mouse events are
  // a compatible path and listening at window precedes player-level handlers.
  window.addEventListener('mousemove', move, true);
  document.addEventListener('pointerout', leave, true);
  document.addEventListener('keydown', key, true);
  document.addEventListener('fullscreenchange', surfaceChanged, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  return {
    refresh() {
      if (destroyed) return;
      mountHost();
      if (!enabled() || !getScope()) { if (access || pending) release(); return; }
      if (selected && !valid(selected)) close();
      const node = document.querySelector('.CanvasDanmakuPlugin');
      if (access && (access.node !== node || access.canvas !== node?.querySelector('canvas') || access.renderer._isDestroyed)) release();
      if (access || pending || !node?.querySelector('canvas')) return;
      const count = attempts.get(node) || 0;
      if (count >= 30) return;
      attempts.set(node, count + 1);
      const ownGeneration = generation, ownScope = getScope();
      const isCurrent = () => !destroyed && enabled() && generation === ownGeneration && ownScope === getScope();
      node.setAttribute('data-dlo-screen-actions', 'preparing');
      pending = connect({ node, window, isCurrent }).then(result => {
        if (!isCurrent()) { result?.dispose(); return; }
        access = result;
        if (result) attempts.delete(node);
        node.setAttribute('data-dlo-screen-actions', result ? 'ready' : 'waiting');
      }).catch(() => { node.setAttribute('data-dlo-screen-actions', 'unavailable'); })
        .finally(() => { if (generation === ownGeneration) pending = null; });
    },
    destroy() {
      destroyed = true; release(); host.remove();
      document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerout', leave, true);
      window.removeEventListener('mousemove', move, true);
      document.removeEventListener('keydown', key, true); window.removeEventListener('blur', close);
      document.removeEventListener('fullscreenchange', surfaceChanged, true);
      window.removeEventListener('resize', close);
    },
  };
}

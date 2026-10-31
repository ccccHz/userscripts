import { findControlProps, findControlContext } from './native-controls.js';
import { observeChatRequests } from './chat-send-check.js';
import { isLiveLocation } from './runtime.js';

const ROW = '.webcast-chatroom___item';
const CONTENT = '.webcast-chatroom___content-with-emoji-text';
export const normalizeChat = (value) => String(value || '').replace(/[\u200b\ufeff]/g, '').trim();

export function readChatRow(row) {
  const rawIndex = row.closest('[data-index]')?.getAttribute('data-index');
  if (rawIndex == null) return null;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) return null;
  const props = findControlProps(row, (props) => Array.isArray(props.originalList), 16);
  const message = props?.originalList[index];
  const text = message?.payload?.content;
  if (message?.method !== 'WebcastChatMessage' || typeof text !== 'string' || !normalizeChat(text)) return null;
  if (normalizeChat(row.querySelector(CONTENT)?.textContent) !== normalizeChat(text)) return null;
  return { text, id: String(message.msg_id || message.payload?.common?.msg_id || ''), message };
}

// The current native onSend clears its editor before its first await. Preserve
// drafts by refusing to send over one; never rewrite rich editor DOM/models.
export async function sendChatOnce({ document, row, snapshot, scope, getScope }) {
  const current = row.isConnected && readChatRow(row);
  if (!current || !current.id || current.id !== snapshot.id || current.text !== snapshot.text || scope !== getScope()) return 'stale';
  const input = document.querySelector('#chatInput [contenteditable="true"]');
  if (!input) return 'unavailable';
  if (normalizeChat(input.textContent) || input.querySelector('img,[data-emoji]')) return 'draft';
  const props = findControlProps(document.querySelector('.webcast-chatroom'), (props) => typeof props.onSend === 'function', 20);
  if (!props || props.enableChat === false) return 'unavailable';
  await props.onSend(current.text); // no privilege/paid tab, exactly one ordinary send
  return scope === getScope() ? 'submitted' : 'stale';
}

export function createChatTools({ document, window, settingsStore }) {
  const style = document.createElement('style');
  style.textContent = `.webcast-chatroom___item:has(>.dlo-plus-one){position:relative}.dlo-plus-one{position:absolute;right:4px;top:2px;border:0;border-radius:4px;background:#ffffff20;color:inherit;cursor:pointer;font-size:11px;opacity:0}.webcast-chatroom___item:hover .dlo-plus-one,.dlo-plus-one:focus-visible{opacity:1}.dlo-chat-status{padding:5px 10px;font-size:12px;color:#e2b76f;line-height:1.5}.dlo-chat-mark{margin-left:5px;font-size:11px;color:#e2b76f}`;
  (document.head || document.documentElement).append(style);
  const buttons = new Map();
  const marks = new Map();
  const flagged = new Map();
  let observer, scheduled, stopRequests, stopMessages, messageSource, noticeTimer, destroyed = false, scope = '', sending = false, lastSendAt = 0;
  const receipts = new Map();
  const echoes = new Map();
  let status;
  const getScope = () => isLiveLocation(window.location) ? window.location.origin + window.location.pathname : '';
  function notify(text) {
    if (destroyed || !getScope()) return;
    const host = document.querySelector('#chatInput')?.parentElement || document.querySelector('.webcast-chatroom');
    if (!host) return;
    if (!status) { status = document.createElement('div'); status.className = 'dlo-chat-status'; status.setAttribute('role','status'); }
    status.textContent = text;
    host.append(status);
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { status?.remove(); status = null; }, 12000);
  }
  function echoLabel(payload) {
    return payload?.send_review === true ? '服务器回声带有待审核标记。' : payload?.visible_to_sender === true
      ? '服务器回声带有发送者可见标记；可能存在可见性限制。'
      : '已收到服务器回声；尚无独立观众证据，不能保证公开可见。';
  }
  function result(outcome, id) {
    notify(outcome.label);
    if (['review','restricted'].includes(outcome.kind) && typeof id === 'string') {
      flagged.set(id, outcome.kind === 'review' ? '待审核' : '可见性标记');
      if (flagged.size > 30) flagged.delete(flagged.keys().next().value);
      schedule();
    }
    if (!['accepted','review','restricted'].includes(outcome.kind) || typeof id !== 'string') return;
    if (echoes.has(id)) {
      const flags=echoes.get(id); notify(echoLabel(flags));
      if (flags.send_review === true || flags.visible_to_sender === true) {
        flagged.set(id, flags.send_review ? '待审核' : '可见性标记'); schedule();
      } else if (flags.send_review === false && flags.visible_to_sender === false) { flagged.delete(id); schedule(); }
    }
    receipts.set(id, Date.now());
    if (receipts.size > 30) receipts.delete(receipts.keys().next().value);
  }
  function subscribeMessages(enabled) {
    const next = enabled ? findControlContext(document.querySelector('[data-e2e="gift-setting"]') || document.querySelector('.webcast-chatroom'), (context) => {
      const source = context?.singletonStore?.message;
      return typeof source?.on === 'function' ? source : null;
    }) : null;
    if (next === messageSource) return;
    stopMessages?.(); stopMessages = null; messageSource = next;
    if (!next) return;
    const ownScope = getScope();
    try { stopMessages = next.on('ChatMessage', (messages) => {
      if (destroyed || ownScope !== getScope() || !settingsStore.get().chatSendCheck || !Array.isArray(messages)) return;
      for (const message of messages) {
        if (message?.method !== 'WebcastChatMessage' || message.is_mock) continue;
        const id = String(message.msg_id || message.payload?.common?.msg_id || '');
        if (!id) continue;
        const flags = { visible_to_sender: message.payload?.visible_to_sender, send_review: message.payload?.send_review };
        echoes.set(id, flags);
        if (echoes.size > 100) echoes.delete(echoes.keys().next().value);
        if (Date.now() - (receipts.get(id) || 0) < 30000) {
          notify(echoLabel(flags));
          if (flags.send_review === true || flags.visible_to_sender === true) {
            flagged.set(id, flags.send_review ? '待审核' : '可见性标记');
            if (flagged.size > 30) flagged.delete(flagged.keys().next().value);
            schedule();
          } else if (flags.send_review === false && flags.visible_to_sender === false) { flagged.delete(id); schedule(); }
        }
      }
    }); } catch { stopMessages = null; }
    if (typeof stopMessages !== 'function') { stopMessages = null; messageSource = next; }
  }
  function clear() {
    for (const button of buttons.values()) button.remove();
    buttons.clear();
    receipts.clear(); echoes.clear();
    flagged.clear();
    for (const mark of marks.values()) mark.remove();
    marks.clear();
    status?.remove(); status = null;
    window.clearTimeout(noticeTimer);
  }
  function scan() {
    if (destroyed) return;
    const next = getScope();
    if (next !== scope) { clear(); stopMessages?.(); stopMessages = null; messageSource = null; scope = next; }
    const settings = settingsStore.get();
    if (!scope) { clear(); stopRequests?.(); stopRequests = null; return; }
    subscribeMessages(settings.chatSendCheck);
    if (settings.chatSendCheck && !stopRequests) stopRequests = observeChatRequests({ window, getScope, onResult: result });
    if (!settings.chatSendCheck && stopRequests) { stopRequests(); stopRequests = null; status?.remove(); }
    for (const [row, mark] of marks) {
      if (!settings.chatSendCheck || !row.isConnected || !mark.isConnected || flagged.get(readChatRow(row)?.id) !== mark.textContent) { mark.remove(); marks.delete(row); }
    }
    if (settings.chatSendCheck) for (const row of document.querySelectorAll(ROW)) {
      const label = flagged.get(readChatRow(row)?.id);
      if (!label || marks.has(row)) continue;
      const mark = document.createElement('span'); mark.className='dlo-chat-mark'; mark.textContent=label;
      mark.title='平台回执带有审核或发送者可见字段；不是独立匿名观众的检测结果。';
      row.querySelector(CONTENT)?.parentElement?.append(mark); marks.set(row,mark);
    }
    for (const [row, button] of buttons) if (!row.isConnected || !button.isConnected || !settings.chatPlusOne) { button.remove(); buttons.delete(row); }
    if (!settings.chatPlusOne) return;
    for (const row of document.querySelectorAll(ROW)) {
      if (buttons.has(row) || !readChatRow(row)) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'dlo-plus-one'; button.textContent = '+1'; button.title = '加一：普通弹幕单次发送；有草稿时保留草稿并停止'; button.setAttribute('aria-label','弹幕加一');
      button.addEventListener('click', async (event) => {
        event.preventDefault(); event.stopPropagation();
        if (sending || Date.now() - lastSendAt < 1000 || !settingsStore.get().chatPlusOne) return;
        const snapshot = readChatRow(row);
        if (!snapshot) return notify('目标弹幕已变化，请重新选择。');
        sending = true; lastSendAt = Date.now(); button.disabled = true;
        const ownScope = getScope();
        try {
          const outcome = await sendChatOnce({ document, row, snapshot, scope: ownScope, getScope });
          if (ownScope !== getScope()) return;
          if (outcome === 'draft') notify('输入框有草稿，已保留；请处理草稿后再加一。');
          else if (outcome === 'unavailable') notify('当前无法发送，请先登录并检查禁言或输入限制。');
          else if (outcome === 'stale') notify('目标弹幕已变化，未发送。');
          // The request observer reports accepted/rejected; no automatic retry.
        } catch { if (ownScope === getScope()) notify('发送结果未确认，不会自动重试。'); }
        finally { sending = false; if (button.isConnected) button.disabled = false; }
      });
      row.append(button); buttons.set(row, button);
    }
  }
  function schedule() {
    if (scheduled !== undefined) return;
    scheduled = window.setTimeout(() => { scheduled = undefined; scan(); }, 100);
  }
  observer = new window.MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  const unsubscribe = settingsStore.subscribe(scan);
  scan();
  return { refresh: scan, destroy() { destroyed = true; observer.disconnect(); unsubscribe(); stopRequests?.(); stopMessages?.(); window.clearTimeout(scheduled); window.removeEventListener('popstate', schedule); clear(); style.remove(); } };
}

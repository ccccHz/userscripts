import { findControlProps, findControlContext } from './native-controls.js';
import { observeChatRequests } from './chat-send-check.js';
import { isLiveLocation } from './runtime.js';
import { createChatHover } from './chat-hover.js';
import { createScreenDanmakuHover } from './screen-danmaku-hover.js';

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
  return sendNativeChatText({ document, text: current.text, scope, getScope });
}
export async function sendScreenChatOnce({ document, snapshot, validate, scope, getScope }) {
  if (!snapshot?.id || !normalizeChat(snapshot.text) || !validate?.() || scope !== getScope()) return 'stale';
  return sendNativeChatText({ document, text: snapshot.text, scope, getScope });
}
async function sendNativeChatText({ document, text, scope, getScope }) {
  const input = document.querySelector('#chatInput [contenteditable="true"]');
  if (!input) return 'unavailable';
  if (normalizeChat(input.textContent) || input.querySelector('img,[data-emoji]')) return 'draft';
  const props = findControlProps(document.querySelector('.webcast-chatroom'), (props) => typeof props.onSend === 'function', 20);
  if (!props || props.enableChat === false) return 'unavailable';
  await props.onSend(text); // no privilege/paid tab, exactly one ordinary send
  return scope === getScope() ? 'submitted' : 'stale';
}

export function createChatTools({ document, window, settingsStore }) {
  const style = document.createElement('style');
  style.textContent = `.dlo-chat-toolbar{position:fixed;z-index:2147483640;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:8px;background:#242731;color:#fff;border:1px solid #616673;font:13px/20px system-ui;box-shadow:0 4px 18px #0006}.dlo-chat-toolbar[hidden]{display:none!important}.dlo-chat-toolbar button{color:#fff;background:#444956;border:0;border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit}.dlo-chat-hover-state{font-size:11px;color:#aeb6c9}.dlo-chat-status{padding:5px 10px;font-size:12px;color:#e2b76f;line-height:1.5}.dlo-chat-mark{margin-left:5px;font-size:11px;color:#e2b76f}`;
  style.textContent += `.dlo-screen-toolbar{position:fixed;z-index:2147483640;display:flex;gap:4px;padding:4px;border:1px solid #ffffff2e;border-radius:7px;background:rgba(20,20,24,.92);box-shadow:0 5px 18px #0005;backdrop-filter:blur(8px);color:#fff;font:13px/26px system-ui}.dlo-screen-toolbar[hidden]{display:none!important}.dlo-screen-toolbar button{min-width:38px;height:26px;padding:0 8px;background:transparent;border:0;border-radius:4px;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}.dlo-screen-toolbar button:hover,.dlo-screen-toolbar button:focus-visible{outline:none;background:#ffffff24}.dlo-screen-toolbar button:disabled{opacity:.5}`;
  (document.head || document.documentElement).append(style);
  const marks = new Map();
  const flagged = new Map();
  let observer, scheduled, stopRequests, stopMessages, messageSource, noticeTimer, destroyed = false, scope = '', sending = false, lastSendAt = 0;
  const receipts = new Map();
  const echoes = new Map();
  let status;
  const getScope = () => isLiveLocation(window.location) ? window.location.origin + window.location.pathname : '';
  async function onPlusOne({row,snapshot,scope:ownScope,kind,validate}) {
      if(sending || Date.now()-lastSendAt<1000) return;
      sending=true;lastSendAt=Date.now();
      try {
        const args={document,row,snapshot,scope:ownScope,getScope,validate};
        const outcome=await (kind==='screen'?sendScreenChatOnce(args):sendChatOnce(args));
        if(ownScope!==getScope()) return;
        if(outcome==='draft') notify('输入框有草稿，已保留；请处理草稿后再加一。');
        else if(outcome==='unavailable') notify('当前无法发送，请先登录并检查禁言或输入限制。');
        else if(outcome==='stale') notify('目标弹幕已变化，未发送。');
      } catch { if(ownScope===getScope()) notify('发送结果未确认，不会自动重试。'); }
      finally { sending=false; }
  }
  const enabled = () => Boolean(getScope()) && settingsStore.get().chatPlusOne;
  const hover=createChatHover({ document,window,getScope,readRow:readChatRow,enabled,notify,onPlusOne });
  const screen=createScreenDanmakuHover({ document,window,getScope,enabled,notify,onPlusOne });
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
    hover.close();
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
    hover.refresh();
    screen.refresh();
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
  return { refresh: scan, destroy() { destroyed = true; observer.disconnect(); unsubscribe(); stopRequests?.(); stopMessages?.(); window.clearTimeout(scheduled); window.removeEventListener('popstate', schedule); clear(); hover.destroy(); screen.destroy(); style.remove(); } };
}

import { getChatScrollHandle } from './native-controls.js';

export function createChatHover({ document, window, enabled, getScope, readRow, onPlusOne, notify }) {
  const host = document.createElement('div');
  host.className='dlo-chat-toolbar'; host.hidden=true; host.setAttribute('role','toolbar'); host.setAttribute('aria-label','弹幕快捷操作');
  const label=document.createElement('span'); label.className='dlo-chat-hover-state';
  const copy=document.createElement('button'); copy.type='button'; copy.textContent='复制';
  const plus=document.createElement('button'); plus.type='button'; plus.textContent='加一'; plus.setAttribute('aria-label','弹幕加一');
  host.append(label,copy,plus); (document.body || document.documentElement).append(host);
  let selected=null, lock=null, list=null, ownsLock=false, manuallyScrolled=false, leaveTimer;
  function nearBottom(node) { return node && node.scrollHeight-node.clientHeight-node.scrollTop<=24; }
  function close() {
    window.clearTimeout(leaveTimer);
    if (ownsLock && !manuallyScrolled) lock?.unlock();
    list?.removeAttribute('data-dlo-hover-paused');
    host.hidden=true; selected=null; lock=null; list=null; ownsLock=false; manuallyScrolled=false;
  }
  function position(row) {
    const rect=row.getBoundingClientRect();
    host.style.left=`${Math.max(8,Math.min(window.innerWidth-220,rect.right-210))}px`;
    host.style.top=`${Math.max(8,rect.top<44?rect.bottom+4:rect.top-38)}px`;
  }
  function enter(event) {
    if (!enabled() || document.querySelector('[data-douyin-live-optimizer-panel]')?.hidden===false) return close();
    if (host.contains(event.target)) { window.clearTimeout(leaveTimer); return; }
    const row=event.target?.closest?.('.webcast-chatroom___item');
    if (!row) return;
    const snapshot=readRow(row);
    if (!snapshot?.id) return;
    window.clearTimeout(leaveTimer);
    const chat=row.closest('.webcast-chatroom');
    const nextList=chat?.querySelector('.webcast-chatroom___list');
    if (list && nextList!==list) close();
    if (!list) {
      list=nextList;
      lock=getChatScrollHandle(chat);
      // Existing manually scrolled history stays locked when hover ends.
      if (lock && list) { ownsLock=nearBottom(list); lock.lock(); list.setAttribute('data-dlo-hover-paused',''); }
    }
    selected={row,snapshot,scope:getScope()};
    label.textContent=lock?'悬停暂停':'弹幕操作';
    host.hidden=false; position(row);
  }
  function leave(event) {
    if (host.contains(event.relatedTarget) || list?.contains(event.relatedTarget)) return;
    if (!host.hidden) leaveTimer=window.setTimeout(close,120);
  }
  function wheel(event) { if (list?.contains(event.target)) manuallyScrolled=true; }
  function key(event) { if(event.key==='Escape') close(); }
  plus.addEventListener('pointerdown',event=>event.preventDefault());
  plus.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();
    if (!selected || plus.disabled || !enabled()) return;
    const target=selected;
    plus.disabled=true;
    try { await onPlusOne(target); } finally { plus.disabled=false; }
  });
  copy.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();
    if (!selected || selected.scope!==getScope()) return close();
    try { await window.navigator.clipboard.writeText(selected.snapshot.text); notify('已复制弹幕。'); }
    catch { notify('复制未完成，请使用页面原生复制。'); }
  });
  document.addEventListener('mouseover',enter,true);
  document.addEventListener('mouseout',leave,true);
  document.addEventListener('wheel',wheel,{capture:true,passive:true});
  document.addEventListener('keydown',key,true);
  return {
    close,
    refresh() {
      if(!enabled() || selected && (selected.scope!==getScope() || !selected.row.isConnected || readRow(selected.row)?.id!==selected.snapshot.id)) close();
    },
    destroy() {
      close(); document.removeEventListener('mouseover',enter,true);document.removeEventListener('mouseout',leave,true);
      document.removeEventListener('wheel',wheel,true);document.removeEventListener('keydown',key,true);host.remove();
    },
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { NotificationCenter, notificationCenter } from "../packages/douyu-web-enhancer/src/core/notification-center.ts";
import { NotificationInbox, INBOX_KEY } from "../packages/douyu-web-enhancer/src/core/notification-inbox.ts";
import { createNotifier } from "../packages/douyu-web-enhancer/src/core/notifier.ts";
import { UserFollowReminders } from "../packages/douyu-web-enhancer/src/features/user-follow-reminders.ts";
class Element {
  children=[]; style={}; parent=null; shadowRoot=null; textContent="";
  append(...children) { for(const c of children){c.remove();c.parent=this;this.children.push(c);} }
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
  setAttribute(){} attachShadow(){return this.shadowRoot=new Element();}
}
function fixture(){const listeners=new Map(), values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};const document={hidden:false,hasFocus:()=>false,body:new Element(),createElement:()=>new Element(),defaultView:{localStorage:storage},addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k),dispatchEvent(){}};return{document,storage,values,listeners};}
const notice={title:"test",text:"message",source:"follow"};
const cards=center=>center.root.shadowRoot.children.slice(2);
test("whole container freezes existing cards, gaps, under-capacity arrivals and bounded overflow; resumes remaining lifetime",t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});const f=fixture(),center=new NotificationCenter(f.document,f.storage);
 center.show({...notice,duration:4500});t.mock.timers.tick(1000);const first=cards(center)[0];center.root.onpointerenter();
 for(let i=0;i<1000;i++)center.show(notice);
 t.mock.timers.tick(20000);assert.deepEqual(cards(center),[first]);assert.match(center.root.shadowRoot.children[1].textContent,/1000/);assert.equal(center.inbox.snapshot().length,500);
 center.root.onpointerleave();t.mock.timers.tick(3499);assert.equal(cards(center).length,1);t.mock.timers.tick(1);assert.equal(cards(center).length,0);assert.equal(f.document.body.children.length,0);center.dispose();assert.equal(f.listeners.size,0);
});
test("all families share max three; close/expiry never reads, explicit reads persist; preview excluded",t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});const f=fixture(),reminders=new UserFollowReminders(f.document,()=>{}),center=notificationCenter(f.document),notifier=createNotifier(f.document,{log(){}});
 const message={uid:"12",roomId:"52",nickname:"user",text:"hello",kind:"chatmsg"};
 notifier.info("general");reminders.record(message,"room",true);reminders.record({...message,uid:"room-event"},"room",true,"事件");notifier.success("fourth");
 assert.equal(cards(center).length,3);assert.equal(center.inbox.unread(),2);assert.equal(reminders.unread("12"),1);cards(center)[0].children[2].onclick();assert.equal(center.inbox.unread(),2);
 reminders.record(message,"room",true,"预览",true);assert.equal(center.inbox.unread(),2);
 t.mock.timers.tick(15000);assert.equal(cards(center).length,0);assert.equal(center.inbox.unread(),2);
 reminders.markRead("12");assert.equal(new NotificationInbox(f.storage,()=>{}).unread(),1);center.dispose();
});
test("hidden arrivals are real records, restored once as derived summary without replay or extra unread",t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});const f=fixture(),center=new NotificationCenter(f.document,f.storage);
 f.document.hidden=true;f.listeners.get("visibilitychange")();for(let i=0;i<8;i++)center.show(notice);assert.equal(cards(center).length,0);
 f.document.hidden=false;f.listeners.get("visibilitychange")();f.listeners.get("visibilitychange")();assert.equal(cards(center).length,1);assert.match(cards(center)[0].children[1].textContent,/8 条/);assert.equal(center.inbox.unread(),8);center.dispose();
});
test("hidden restoration while full or hovered aggregates once without moving cards",()=>{const f=fixture(),c=new NotificationCenter(f.document,f.storage);c.show(notice);const before=cards(c);c.root.onpointerenter();f.document.hidden=true;f.listeners.get("visibilitychange")();c.show(notice);f.document.hidden=false;f.listeners.get("visibilitychange")();f.listeners.get("visibilitychange")();assert.deepEqual(cards(c),before);assert.match(c.root.shadowRoot.children[1].textContent,/离开期间有 1 条/);assert.equal(c.inbox.unread(),2);c.dispose();});
test("seven day and quantity retention derive unread; failures remain page-local and never create fault records",()=>{
 let now=1000;const f=fixture(),inbox=new NotificationInbox(f.storage,()=>{},()=>now);for(let i=0;i<505;i++)inbox.add(notice);assert.equal(inbox.unread(),500);inbox.markRead(inbox.snapshot()[0].id);assert.equal(inbox.unread(),499);
 now+=7*86400000;assert.equal(inbox.unread(),0);assert.deepEqual(JSON.parse(f.values.get(INBOX_KEY)).entries,[]);
 const fail=new NotificationInbox({getItem(){throw Error();},setItem(){throw Error();}},()=>{},()=>now);fail.add(notice);assert.equal(fail.status,"error");assert.equal(fail.unread(),1);fail.markRead(fail.snapshot()[0].id);assert.equal(fail.unread(),0);assert.equal(fail.snapshot().length,1);
});
test("sync clears disabled family without deleting inbox and dispose cancels expiry",t=>{t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});const f=fixture(),r=new UserFollowReminders(f.document,()=>{}),c=r.center,m={uid:"12",roomId:"52",nickname:"user",text:"hello",kind:"chatmsg"};r.record(m,"room",true);r.record(m,"room",true,"事件");r.sync([],false);assert.equal(cards(c).length,1);assert.equal(c.inbox.unread(),2);r.clear(true);assert.equal(cards(c).length,0);r.dispose();t.mock.timers.tick(20000);assert.equal(f.document.body.children.length,0);});
test("preview overflow never inflates real overflow; fullscreen moves the same root; repeated hover preserves lifetime",t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});const f=fixture(),c=new NotificationCenter(f.document,f.storage);
 for(let i=0;i<4;i++)c.show(notice);c.show({...notice,preview:true});assert.match(c.root.shadowRoot.children[1].textContent,/还有 1 条/);assert.equal(c.inbox.unread(),4);
 const full=new Element();f.document.fullscreenElement=full;f.listeners.get("fullscreenchange")();assert.equal(full.children[0],c.root);
 t.mock.timers.tick(1000);c.root.onpointerenter();c.root.onpointerenter();t.mock.timers.tick(9000);c.root.onpointerleave();c.root.onpointerleave();t.mock.timers.tick(3499);assert.equal(cards(c).length,3);t.mock.timers.tick(1);assert.equal(cards(c).length,0);c.dispose();
});
test("mark all reads all retained types in one write and survives reload; failure stays explicit",()=>{
 const f=fixture();let writes=0;const storage={getItem:f.storage.getItem,setItem:(k,v)=>{writes++;f.storage.setItem(k,v);}};const inbox=new NotificationInbox(storage,()=>{});
 for(const source of ['general','follow','room'])inbox.add({...notice,source});const before=writes;inbox.markAllRead();assert.equal(writes,before+1);assert.equal(inbox.unread(),0);assert.equal(new NotificationInbox(storage,()=>{}).unread(),0);inbox.markAllRead();assert.equal(writes,before+1);
 const failed=new NotificationInbox({getItem:()=>null,setItem(){throw Error();}},()=>{});failed.add(notice);failed.markAllRead();assert.equal(failed.unread(),0);assert.equal(failed.status,'error');
});
test("unread preferences preserve legacy unread and only affect future records, independently of Toast",()=>{
 const f=fixture();f.values.set(INBOX_KEY,JSON.stringify([{...notice,id:'legacy',at:Date.now(),read:false,source:'general'}]));const inbox=new NotificationInbox(f.storage,()=>{});
 assert.deepEqual(inbox.preferences,{general:false,follow:true,room:true});assert.equal(inbox.unread(),1);
 inbox.add({...notice,source:'general'});assert.equal(inbox.unread(),1);inbox.setRetainUnread('general',true);inbox.add({...notice,source:'general'});assert.equal(inbox.unread(),2);
 inbox.setRetainUnread('general',false);assert.equal(inbox.unread(),2);const restored=new NotificationInbox(f.storage,()=>{});assert.equal(restored.preferences.general,false);assert.equal(restored.unread(),2);
 restored.add({...notice,source:'room'});restored.markAllRead('general');assert.equal(restored.unread(),1);assert.equal(restored.snapshot().find(e=>e.source==='room').read,false);
 restored.markManyRead(restored.snapshot().filter(e=>!e.read).map(e=>e.id));assert.equal(restored.unread(),0);
});
test("per-user behavior overrides retain all Toasts and only change future unread; reload and reset share one owner",()=>{
 const f=fixture(),r=new UserFollowReminders(f.document,()=>{}),inbox=r.center.inbox;
 const message={uid:'12',roomId:'52',nickname:'Alice',text:'hello',kind:'chatmsg'};
 r.record({...message,kind:'uenter'},'room',true);assert.equal(inbox.unread('12'),1);
 inbox.setFollowUnread('12','uenter',false);
 r.record({...message,kind:'uenter'},'room',true);r.record(message,'room',true);
 assert.equal(cards(r.center).length,3);assert.equal(inbox.unread('12'),2);assert.equal(inbox.snapshot()[1].read,true);assert.equal(inbox.snapshot()[1].kind,'uenter');assert.equal(inbox.snapshot()[1].nickname,'Alice');
 r.record({...message,uid:'13',kind:'uenter'},'room',true);assert.equal(inbox.unread('13'),1);
 const restored=new NotificationInbox(f.storage,()=>{});assert.deepEqual(restored.followOverrides,{'12':{uenter:"toast"}});restored.setFollowDefault('dgb','toast');restored.setFollowUnread('12','chatmsg',true);
 restored.add({...notice,uid:'12',kind:'chatmsg'});restored.add({...notice,uid:'12',kind:'dgb'});assert.equal(restored.snapshot()[0].read,true);assert.equal(restored.snapshot()[1].read,false);
 const before=restored.unread();restored.resetFollowUnread('12');assert.equal(restored.unread(),before);assert.deepEqual(restored.followOverrides,{});restored.setFollowDefault('uenter','pending');restored.add({...notice,uid:'12',kind:'uenter'});assert.equal(restored.snapshot()[0].read,false);
 r.dispose();
});
test("individual settings validate persisted input and keep write errors explicit without losing prior unread",()=>{
 const f=fixture();f.values.set(INBOX_KEY,JSON.stringify({entries:[],preferences:{follow:true},followOverrides:{'12':{chatmsg:"pending",uenter:"toast",dgb:'bad'},'bad':{uenter:"toast"}}}));
 const inbox=new NotificationInbox(f.storage,()=>{});assert.deepEqual(inbox.followOverrides,{'12':{chatmsg:"pending",uenter:"toast"}});inbox.setFollowUnread('12','uenter',null);assert.deepEqual(inbox.followOverrides,{'12':{chatmsg:"pending"}});assert.throws(()=>inbox.setFollowUnread('__proto__','chatmsg',false));
 const fail=new NotificationInbox({getItem:()=>null,setItem(){throw Error('disk');}},()=>{});fail.add({...notice,uid:'12',kind:'uenter'});fail.setFollowUnread('12','uenter',false);assert.equal(fail.status,'error');assert.equal(fail.unread(),1);fail.add({...notice,uid:'12',kind:'uenter'});assert.equal(fail.unread(),1);
});
test("ignored entry and system messages never create missed summaries while still rendering visible Toasts",()=>{
 const f=fixture(),c=new NotificationCenter(f.document,f.storage);c.inbox.setFollowUnread('12','uenter',false);
 const entry={...notice,uid:'12',kind:'uenter'},system={...notice,source:'general'};
 c.show(entry);assert.equal(cards(c).length,1);assert.equal(c.inbox.unread(),0);
 f.document.hidden=true;f.listeners.get('visibilitychange')();for(let i=0;i<10;i++){c.show(entry);c.show(system);}
 f.document.hidden=false;f.listeners.get('visibilitychange')();f.listeners.get('visibilitychange')();assert.equal(cards(c).length,1);assert.equal(c.root.shadowRoot.children[1].textContent,'');assert.equal(c.inbox.unread(),0);assert.equal(c.inbox.snapshot().length,21);c.dispose();
});
test("hidden and hover summaries count only retained unread including individual overrides",()=>{
 const f=fixture(),c=new NotificationCenter(f.document,f.storage);c.inbox.setFollowUnread('12','uenter',false);
 f.document.hidden=true;f.listeners.get('visibilitychange')();c.show({...notice,uid:'12',kind:'uenter'});c.show({...notice,source:'general'});c.show({...notice,uid:'12',kind:'chatmsg'});
 f.document.hidden=false;f.listeners.get('visibilitychange')();assert.match(cards(c)[0].children[1].textContent,/1 条新提醒/);assert.equal(c.inbox.unread(),1);
 c.root.onpointerenter();c.show({...notice,uid:'12',kind:'uenter'});c.show({...notice,source:'general'});assert.equal(c.root.shadowRoot.children[1].textContent,'');c.show({...notice,uid:'13',kind:'uenter'});assert.match(c.root.shadowRoot.children[1].textContent,/还有 1 条/);assert.equal(c.inbox.unread(),2);c.dispose();
});

test("focused visible arrivals are seen; away modes independently control Toast and pending",()=>{
 for(const hidden of [false,true]) for(const focused of [false,true]) for(const mode of ['off','toast','pending']) {
  const f=fixture();f.document.hidden=hidden;f.document.hasFocus=()=>focused;
  const center=new NotificationCenter(f.document,f.storage);center.inbox.setFollowUnread('12','chatmsg',mode);
  center.show({...notice,uid:'12',kind:'chatmsg'});
  assert.equal(center.inbox.snapshot().length,mode==='off'?0:1);
  assert.equal(center.inbox.unread(),mode==='pending'&&(hidden||!focused)?1:0,`${hidden}/${focused}/${mode}`);
  assert.equal(cards(center).length,!hidden&&mode!=='off'?1:0);center.dispose();
 }
});
test("legacy modes migrate once, preserve pending records and reload per-behavior defaults",()=>{
 const f=fixture();f.values.set(INBOX_KEY,JSON.stringify({entries:[{...notice,id:'old',at:Date.now(),read:false}],preferences:{follow:true},followOverrides:{'12':{uenter:false,chatmsg:true}}}));
 const inbox=new NotificationInbox(f.storage,()=>{});inbox.migrateFollowDefaults({chatmsg:true,uenter:true,dgb:false});
 assert.deepEqual(inbox.followDefaults,{chatmsg:'pending',uenter:'pending',dgb:'off'});assert.equal(inbox.followMode('12','uenter'),'toast');assert.equal(inbox.unread(),1);
 inbox.setFollowDefault('chatmsg','toast');inbox.setFollowUnread('13','dgb','pending');
 const restored=new NotificationInbox(f.storage,()=>{});restored.migrateFollowDefaults({chatmsg:true,uenter:false,dgb:true});
 assert.equal(restored.followDefaults.chatmsg,'toast');assert.equal(restored.followMode('13','dgb'),'pending');assert.equal(restored.unread(),1);
});

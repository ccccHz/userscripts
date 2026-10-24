import assert from "node:assert/strict";
import test from "node:test";
import { parseRoomEvent, RoomAudience } from "../packages/douyu-web-enhancer/src/core/room-messages.ts";
import { RoomEvents, parseRoomEventOptions } from "../packages/douyu-web-enhancer/src/features/room-events.ts";

const appointed = "type@=setadminres/rescode@=0/userid@=123/opuid@=321/group@=4/adnick@=测试用户/rid@=52/newrg@=0/";
test("admin removal follows official group branch; newrg=0 is still appointment", () => {
  assert.equal(parseRoomEvent(appointed,"52",1).title,"任命房管");
  assert.equal(parseRoomEvent(appointed.replace("group@=4","group@=1"),"52",1).title,"解除房管");
  assert.equal(parseRoomEvent(appointed.replace("rescode@=0","rescode@=208"),"52"),null);
  assert.equal(parseRoomEvent(appointed.replace("group@=4","group@=oops"),"52"),null);
  assert.equal(parseRoomEvent(appointed,"12306"),null);
});
test("moderation errors aren't successes; raw HTML is never retained", () => {
  const packet="type@=newblackres/ret@=0/rid@=52/did@=123/dnic@=<b>测试</b>/sid@=321/snic@=管理员/otype@=1/endtime@=1234/";
  const event=parseRoomEvent(packet,"52",100);
  assert.match(event.text,/房管/);assert.doesNotMatch(event.text,/<b>/);
  assert.equal(parseRoomEvent(packet.replace("ret@=0","ret@=264"),"52"),null);
  assert.equal(parseRoomEvent("type@=superadmin_notice_user/content@=请文明直播/","52").verified,false);
  assert.equal(parseRoomEvent("type@=violation/rid@=52/opUid@=123/","52").verified,false);
  assert.equal(parseRoomEvent("type@=gbmres/ret@=0/uname@=测试/rid@=52/","52").title,"用户被封号");
});
test("audience is independent per source; zero, expiry, disconnect and room change are explicit", () => {
  const a=new RoomAudience();
  assert.deepEqual(a.snapshot("52",true,0),{});
  a.record(["type@=oun/rid@=52/un@=0/","type@=oni/rid@=52/un@=12/","type@=dfnum/rid@=52/dfc@=3/"],"52",1000);
  assert.deepEqual(a.snapshot("52",true,1001),{online:0,nobles:12,diamonds:3});
  a.record(["type@=oun/rid@=12306/un@=999/","type@=oun/rid@=52/un@=NaN/"],"52",2000);
  assert.equal(a.snapshot("52",true,2000).online,0);
  assert.deepEqual(a.snapshot("52",false,2000),{});
  assert.deepEqual(a.snapshot("52",true,181001),{});
  assert.deepEqual(a.snapshot("12306",true,2000),{});
});
test("event persistence retries failed batches, dedups repeated delivery and honors switches", async () => {
  let fail=true;let stored=[];let reminders=0;
  const persistence={load:async()=>stored,append:async batch=>{if(fail)throw new Error("blocked");stored=[...batch,...stored].slice(0,200);return stored;}};
  const events=new RoomEvents(persistence,()=>{});
  await events.load();
  events.observe([appointed],"52",parseRoomEventOptions(null),()=>reminders++,100);
  assert.equal(events.entries.length,0);
  events.observe([appointed],"52",{record:true,remind:true},()=>reminders++,100);
  await events.flush();assert.equal(events.status,"error");assert.equal(events.entries.length,1);
  events.observe([appointed],"52",{record:true,remind:true},()=>reminders++,101);
  assert.equal(reminders,1);
  fail=false;await events.flush();assert.equal(events.status,"saved");assert.equal(stored.length,1);
  const restored=new RoomEvents(persistence,()=>{});await restored.load();assert.equal(restored.entries[0].text,events.entries[0].text);
  events.observe([appointed],"52",{record:false,remind:true},()=>reminders++,6000);
  assert.equal(reminders,2);assert.equal(events.entries.length,1);events.dispose();restored.dispose();
});

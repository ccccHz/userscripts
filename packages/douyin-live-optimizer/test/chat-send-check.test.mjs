import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChatResponse, isChatRequest, observeChatRequests } from '../src/chat-send-check.js';
import { readChatRow, sendChatOnce } from '../src/chat-tools.js';

test('only same-origin ordinary chat endpoint is observed', () => {
  const base = 'https://live.douyin.com/123';
  assert.ok(isChatRequest('/webcast/room/chat/?a=1', base));
  for (const url of ['https://evil.example/webcast/room/chat/', '/webcast/gift/send/', '/webcast/room/chat/history/']) assert.equal(isChatRequest(url, base), false);
});
test('acceptance never claims public visibility and unknown replies never mean blocked', () => {
  assert.equal(classifyChatResponse({status_code:0,data:{}}).kind,'accepted');
  assert.match(classifyChatResponse({status_code:0}).label,/未确认/);
  for (const data of [null, {}, {status_code:'0'}]) assert.equal(classifyChatResponse(data).kind,'unconfirmed');
  assert.equal(classifyChatResponse({status_code:403}).kind,'rejected');
  assert.equal(classifyChatResponse({status_code:0,data:{send_review:true}}).kind,'review');
  assert.equal(classifyChatResponse({status_code:0,data:{visible_to_sender:true}}).kind,'restricted');
});
test('fetch observer preserves the original promise and skips late replies from old rooms', async () => {
  let resolve, scope = '/1'; const outcomes=[];
  const promise=new Promise(r=>resolve=r); const original=()=>promise;
  const window={location:{href:'https://live.douyin.com/1'},fetch:original};
  const stop=observeChatRequests({window,getScope:()=>scope,onResult:r=>outcomes.push(r)});
  assert.equal(window.fetch('/webcast/room/chat/',{method:'POST'}),promise);
  scope='/2'; resolve({clone:()=>({json:async()=>({status_code:0})})});
  await promise; await new Promise(r=>setImmediate(r));
  assert.deepEqual(outcomes,[]); stop(); assert.equal(window.fetch,original);
});
test('failed observer JSON does not reject the original send or overwrite another wrapper', async () => {
  const response={clone(){throw Error('cannot clone')}}; const outcomes=[];
  const window={location:{href:'https://live.douyin.com/1'},fetch:()=>Promise.resolve(response)};
  const stop=observeChatRequests({window,getScope:()=>'/1',onResult:r=>outcomes.push(r)});
  assert.equal(await window.fetch('/webcast/room/chat/',{method:'POST'}),response);
  await new Promise(r=>setImmediate(r)); assert.equal(outcomes[0].kind,'unconfirmed');
  const replacement=()=>{};window.fetch=replacement;stop();assert.equal(window.fetch,replacement);
});
test('XHR observer handles a native reply and removes pending listeners on teardown', () => {
  class XHR extends EventTarget { open() {} send() {} }
  const original=XHR.prototype.send, outcomes=[];
  const window={location:{href:'https://live.douyin.com/1'},XMLHttpRequest:XHR};
  const stop=observeChatRequests({window,getScope:()=>'/1',onResult:r=>outcomes.push(r)});
  const xhr=new XHR();xhr.open('POST','/webcast/room/chat/');xhr.send();xhr.responseType='json';xhr.response={status_code:12};xhr.dispatchEvent(new Event('loadend'));
  assert.equal(outcomes[0].kind,'rejected');
  const late=new XHR();late.open('POST','/webcast/room/chat/');late.send();stop();late.response={status_code:0};late.responseType='json';late.dispatchEvent(new Event('loadend'));
  assert.equal(outcomes.length,1);assert.equal(XHR.prototype.send,original);
});

function fixture() {
  const message={method:'WebcastChatMessage',msg_id:'42',payload:{content:'你好'}};
  const row={isConnected:true,closest:()=>({getAttribute:()=> '0'}),querySelector:()=>({textContent:'你好'}),__reactProps$fixture:{originalList:[message]}};
  let sent=[];
  const input={textContent:'\u200b',querySelector:()=>null};
  const chat={__reactProps$fixture:{enableChat:true,onSend:async text=>{sent.push(text)}}};
  const document={querySelector:sel=>sel.includes('contenteditable')?input:chat};
  return {row,input,chat,document,sent,message};
}
test('plus-one accepts only a matching plain chat row and rejects recycled virtual rows', () => {
  const f=fixture();assert.equal(readChatRow(f.row).id,'42');
  f.message.payload.content='替换';assert.equal(readChatRow(f.row),null);
  f.message.payload.content='你好';f.message.method='WebcastGiftMessage';assert.equal(readChatRow(f.row),null);
});
test('plus-one performs exactly one native ordinary send and never rewrites input', async () => {
  const f=fixture();const snapshot=readChatRow(f.row);
  assert.equal(await sendChatOnce({...f,snapshot,scope:'/1',getScope:()=>'/1'}),'submitted');
  assert.deepEqual(f.sent,['你好']);assert.equal(f.input.textContent,'\u200b');
});
test('drafts, disappeared rows, changed rooms and disabled chat prevent sending', async () => {
  const f=fixture();const snapshot=readChatRow(f.row);const args={...f,snapshot,scope:'/1',getScope:()=>'/1'};
  f.input.textContent='我的草稿';assert.equal(await sendChatOnce(args),'draft');
  f.input.textContent='';f.row.isConnected=false;assert.equal(await sendChatOnce(args),'stale');
  f.row.isConnected=true;assert.equal(await sendChatOnce({...args,getScope:()=>'/2'}),'stale');
  f.chat.__reactProps$fixture.enableChat=false;assert.equal(await sendChatOnce(args),'unavailable');
  assert.deepEqual(f.sent,[]);
});

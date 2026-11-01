import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatHover } from '../src/chat-hover.js';

function fixture() {
  const events=new Map(),timers=new Map(),sent=[];let next=0,locked=0,unlocked=0,enabled=true,scope='/1';
  function element() {
    const node={children:[],attributes:new Map(),style:{},hidden:false,isConnected:true,listeners:new Map(),
      append(...children){for(const child of children){this.children.push(child);child.parentElement=this}},
      setAttribute(k,v){this.attributes.set(k,v)},removeAttribute(k){this.attributes.delete(k)},
      contains(other){for(let n=other;n;n=n.parentElement)if(n===this)return true;return false},
      addEventListener(k,fn){this.listeners.set(k,fn)},remove(){this.isConnected=false}};
    return node;
  }
  const body=element();
  const document={body,createElement:element,querySelector:()=>null,addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)};
  const window={innerWidth:1280,setTimeout:fn=>{timers.set(++next,fn);return next},clearTimeout:key=>timers.delete(key),navigator:{clipboard:{writeText:async()=>{}}}};
  const handle={lock(){locked++},unlock(){unlocked++},inputClear(){}};
  const list=element();Object.assign(list,{scrollHeight:500,clientHeight:200,scrollTop:300});
  const chat={__reactFiber$test:{ref:{current:handle}},querySelector:()=>list};
  const row=element();row.parentElement=list;row.closest=selector=>selector.includes('___item')?row:chat;row.getBoundingClientRect=()=>({right:1200,top:200,bottom:230});
  const snapshot={id:'42',text:'hello'};
  const hover=createChatHover({document,window,enabled:()=>enabled,getScope:()=>scope,readRow:()=>snapshot,onPlusOne:async selected=>sent.push(selected.snapshot.text),notify(){}});
  return {hover,events,timers,list,row,sent,host:body.children[0],locked:()=>locked,unlocked:()=>unlocked,setEnabled:v=>enabled=v,setScope:v=>scope=v};
}
test('hover locks the native chat, shows a floating toolbar and sends the frozen target once', async () => {
  const f=fixture();f.events.get('mouseover')({target:f.row});
  assert.equal(f.locked(),1);assert.equal(f.host.hidden,false);assert.equal(f.host.children[0].textContent,'悬停暂停');
  const plus=f.host.children[2];await plus.listeners.get('click')({preventDefault(){},stopPropagation(){}});
  assert.deepEqual(f.sent,['hello']);
  f.events.get('mouseout')({relatedTarget:f.host.children[1]});assert.equal(f.timers.size,0);
  f.events.get('mouseout')({relatedTarget:null});[...f.timers.values()].forEach(fn=>fn());
  assert.equal(f.unlocked(),1);assert.equal(f.host.hidden,true);f.hover.destroy();assert.equal(f.events.size,0);
});
test('hover never unlocks pre-existing manually scrolled history and disable/navigation remove the toolbar', () => {
  const f=fixture();f.list.scrollTop=20;f.events.get('mouseover')({target:f.row});f.hover.close();
  assert.equal(f.unlocked(),0);
  f.list.scrollTop=300;f.events.get('mouseover')({target:f.row});f.setScope('/2');f.hover.refresh();
  assert.equal(f.unlocked(),1);assert.equal(f.host.hidden,true);
  f.events.get('mouseover')({target:f.row});f.setEnabled(false);f.hover.refresh();assert.equal(f.host.hidden,true);f.hover.destroy();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenDanmakuHover } from '../src/screen-danmaku-hover.js';

function fixture() {
  const docEvents=new Map(),winEvents=new Map(),timers=new Map(),sent=[],copied=[];let seq=0,enabled=true,scope='/1',disposed=0;
  function element(){return {children:[],style:{},hidden:false,listeners:new Map(),append(...nodes){for(const n of nodes){this.children.push(n);n.parentElement=this}},
    setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},remove(){this.parentElement=null},
    contains(n){for(;n;n=n.parentElement)if(n===this)return true;return false},addEventListener(k,fn){this.listeners.set(k,fn)}}}
  const body=element(),canvas=element(),node=element();node.isConnected=true;node.querySelector=()=>canvas;
  const barrage=Object.assign(Object.create({get speed(){return 10}}),{id:'42'});
  const access={node,canvas,renderer:{},read:()=>({id:'42',text:'飘屏正文'}),valid:()=>true,
    bounds:()=>({left:10,top:10,right:50,bottom:30,player:{left:0,top:0,right:1280,bottom:720}}),
    hit:(x,y)=>x>=10&&x<=50&&y>=10&&y<=30?barrage:null,dispose(){disposed++}};
  const document={body,createElement:element,querySelector:s=>s==='.CanvasDanmakuPlugin'?node:null,
    addEventListener:(k,fn)=>docEvents.set(k,fn),removeEventListener:k=>docEvents.delete(k)};
  const window={innerWidth:1280,setTimeout:fn=>{timers.set(++seq,fn);return seq},clearTimeout:k=>timers.delete(k),navigator:{clipboard:{writeText:async text=>copied.push(text)}},
    addEventListener:(k,fn)=>winEvents.set(k,fn),removeEventListener:k=>winEvents.delete(k)};
  const controller=createScreenDanmakuHover({document,window,enabled:()=>enabled,getScope:()=>scope,
    onPlusOne:async target=>{if(target.validate())sent.push(target.snapshot.text)},notify(){},connect:async()=>access});
  return {controller,document,window,docEvents,winEvents,timers,body,barrage,sent,copied,disposed:()=>disposed,setEnabled:v=>enabled=v,setScope:v=>scope=v};
}
test('canvas mouse fallback freezes selected text, retains it through toolbar entry, and copies/sends the snapshot', async()=>{
  const f=fixture();f.controller.refresh();await new Promise(r=>setImmediate(r));
  const host=f.body.children[0];assert.equal(host.hidden,true);
  f.winEvents.get('mousemove')({target:{},clientX:20,clientY:20});
  assert.equal(host.hidden,false);assert.equal(f.barrage.speed,0);assert.equal(host.style.top,'38px');
  f.winEvents.get('mousemove')({target:{},clientX:500,clientY:500});assert.equal(f.timers.size,1);
  f.docEvents.get('pointermove')({target:host.children[1],clientX:20,clientY:5});assert.equal(f.barrage.speed,0);
  assert.equal(f.timers.size,0);
  const event={preventDefault(){},stopPropagation(){}};
  await host.children[1].listeners.get('click')(event);assert.deepEqual(f.copied,['飘屏正文']);
  await host.children[0].listeners.get('click')(event);assert.deepEqual(f.sent,['飘屏正文']);
  f.winEvents.get('mousemove')({target:{},clientX:500,clientY:500});assert.equal(f.timers.size,1);
  [...f.timers.values()].forEach(fn=>fn());assert.equal(f.barrage.speed,10);assert.equal(host.hidden,true);
  f.winEvents.get('blur')();assert.equal(host.hidden,true);assert.equal(f.barrage.speed,10);
  f.controller.destroy();assert.equal(f.disposed(),1);assert.equal(f.docEvents.size+f.winEvents.size,0);
});
test('room change blocks stale canvas sends and disabling releases renderer resources', async()=>{
  const f=fixture();f.controller.refresh();await new Promise(r=>setImmediate(r));
  f.winEvents.get('mousemove')({target:{},clientX:20,clientY:20});
  f.setScope('/2');const host=f.body.children[0];
  await host.children[0].listeners.get('click')({preventDefault(){},stopPropagation(){}});
  assert.deepEqual(f.sent,[]);assert.equal(f.barrage.speed,10);
  f.setEnabled(false);f.controller.refresh();assert.equal(f.disposed(),1);f.controller.destroy();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasAccess, hitTestNativeDanmaku, freezeNativeBarrage, readScreenMessage } from '../src/screen-danmaku-native.js';
import { getCanvasDanmakuControl } from '../src/native-controls.js';

function fixture() {
  const events = [], node = { isConnected: true, children: [] };
  class Canvas {
    constructor(parent) { this.parentElement = parent; parent.children.push(this); }
    transferControlToOffscreen() { return { width: 600, height: 300 }; }
    getBoundingClientRect() { return { left: 50, top: 40, width: 300, height: 150 }; }
    remove() { node.children = node.children.filter(c => c !== this); this.parentElement = null; }
  }
  let fail = false;
  class NativeRenderer {
    constructor({ config, container, barrages = [] }) {
      this.canvasDom = new Canvas(container);
      const offscreen = this.canvasDom.transferControlToOffscreen();
      if (fail) { this.canvasDom.remove(); throw new Error('construction-failed'); }
      this.danmakuManagerInMainThread = {
        instance: offscreen ? null : { config, originBarrageList: barrages, offscreenCanvas: { width: 600, height: 300 }, channelHeightDpr: 40 },
        emit: method => events.push(method), createInstancePromise: Promise.resolve(),
      };
      this.offCbs = [() => { this.canvasDom.remove(); events.push('cleanup'); }];
    }
    start() {} stop() {}
    destroy() { this._isDestroyed = true; this.danmakuManagerInMainThread.emit('destroy'); this.offCbs.forEach(fn => fn()); }
  }
  const config = { duration: 15000, fontSize: 20, opacity: .8, maxHeightRate: .5 };
  const renderer = new NativeRenderer({ config, container: node });
  return { node, renderer, window: { HTMLCanvasElement: Canvas }, config, events,
    resolve: () => ({ renderer, config }), fail: () => { fail = true; } };
}
test('native fallback keeps renderer identity, restores canvas prototype, and returns to worker on dispose', async () => {
  const f = fixture(), before = f.window.HTMLCanvasElement.prototype.transferControlToOffscreen;
  const oldCanvas = f.renderer.canvasDom;
  const access = await createCanvasAccess(f);
  assert.equal(access.renderer, f.renderer); assert.equal(f.node.children.length, 1);
  assert.notEqual(f.renderer.canvasDom, oldCanvas); assert.ok(access.instance);
  assert.equal(f.window.HTMLCanvasElement.prototype.transferControlToOffscreen, before);
  access.dispose(); access.dispose();
  assert.equal(f.renderer.danmakuManagerInMainThread.instance, null);
  assert.equal(f.node.children.length, 1); assert.equal(f.events.filter(e => e === 'destroy').length, 2);
});
test('canceled setup and failed native construction leave the original renderer and method intact', async () => {
  const f = fixture(), manager = f.renderer.danmakuManagerInMainThread;
  assert.equal(await createCanvasAccess({ ...f, isCurrent: () => false }), null);
  const before = f.window.HTMLCanvasElement.prototype.transferControlToOffscreen;
  f.fail(); await assert.rejects(createCanvasAccess(f), /construction-failed/);
  assert.equal(f.renderer.danmakuManagerInMainThread, manager);
  assert.equal(f.window.HTMLCanvasElement.prototype.transferControlToOffscreen, before);
  assert.equal(f.node.children.length, 1);
});
test('known renderer ref and memo are found without executing a component or inspecting arbitrary fields', () => {
  const f = fixture(); let calls = 0;
  f.node.__reactFiber$test = { type() { calls++; }, memoizedState: {
    memoizedState: { current: f.renderer }, next: { memoizedState: [f.config, []] },
  } };
  assert.equal(getCanvasDanmakuControl(f.node).renderer, f.renderer); assert.equal(calls, 0);
});
test('hit testing uses occupied tracks after the pending queue is emptied, scaling, and message guards', () => {
  const target = { options: { id: '42', color: '#fff', content: [{ type: 'text', text: '你好' }] },
    isInScreen: true, isExpired: false, bookedChannel: { startIndex: 1 }, deltaX: 500,
    size: { widthWithDpr: 100, heightWithDpr: 30 } };
  const instance = { originBarrageList: [], _channels: [[], [target], [target]], offscreenCanvas: { width: 600, height: 300 }, channelHeightDpr: 40 };
  const canvas = { getBoundingClientRect: () => ({ left: 50, top: 40, width: 300, height: 150 }) };
  assert.equal(hitTestNativeDanmaku(instance, canvas, 110, 65), target);
  assert.equal(hitTestNativeDanmaku(instance, canvas, 210, 65), null);
  target.isExpired = true; assert.equal(hitTestNativeDanmaku(instance, canvas, 110, 65), null);
  target.isExpired = false; target.options.color = '#ff4471'; assert.equal(readScreenMessage(target), null);
  target.options.color = '#fff'; target.options.content[0] = { type: 'image', src: 'x' }; assert.equal(readScreenMessage(target), null);
});
test('freezing pauses only native speed and restores its getter/descriptor without touching playback', () => {
  const target = Object.create({ get speed() { return 12; } });
  const restore = freezeNativeBarrage(target); assert.equal(target.speed, 0);
  restore(); restore(); assert.equal(target.speed, 12); assert.equal(Object.hasOwn(target, 'speed'), false);
  Object.defineProperty(target, 'speed', { value: 3, configurable: true });
  freezeNativeBarrage(target)(); assert.equal(target.speed, 3);
});
test('received message identity recovers plain content from decorated screen styles without copying nicknames', () => {
  const target={options:{id:'42',color:'#c9f8ff',content:[{type:'block',content:[{type:'text',text:'昵称：正文'}]}]}};
  assert.equal(readScreenMessage(target),null);
  const messages=new Map([['42',{id:'42',text:'正文'}]]);
  assert.deepEqual(readScreenMessage(target,messages),{id:'42',text:'正文'});
  target.options.id='43';assert.equal(readScreenMessage(target,messages),null);
  target.options={id:'44',color:'#ffffff',content:[{type:'text',text:'纯文字'}]};
  assert.equal(readScreenMessage(target).text,'纯文字');
});
test('optional message hooks cannot prevent restoring native worker resources', async()=>{
  const f=fixture();let calls=0;
  const source={on(){calls++;if(calls===2)throw new Error('unsupported');return ()=>{throw new Error('stale')}}};
  const access=await createCanvasAccess({...f,resolve:()=>({...f.resolve(),source})});
  assert.ok(access);access.dispose();
  assert.equal(f.renderer.danmakuManagerInMainThread.instance,null);assert.equal(f.node.children.length,1);
});

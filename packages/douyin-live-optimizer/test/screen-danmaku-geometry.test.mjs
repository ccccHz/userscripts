import test from 'node:test';
import assert from 'node:assert/strict';
import { placeScreenToolbar, inToolbarBridge } from '../src/screen-danmaku-geometry.js';

test('toolbar stays below selected text, switches above at the bottom, and avoids player edges',()=>{
  const player={left:100,top:50,right:800,bottom:500};
  const item={left:200,top:100,right:500,bottom:130};
  const below=placeScreenToolbar({pointerX:210,item,player,width:100,height:36});
  assert.equal(below.top,138);assert.ok(below.top>=item.bottom);
  const bottom={...item,top:455,bottom:485};
  const above=placeScreenToolbar({pointerX:799,item:bottom,player,width:100,height:36});
  assert.ok(above.top+36<=bottom.top);assert.equal(above.left,692);
  assert.equal(placeScreenToolbar({pointerX:0,item,player,width:100,height:36}).left,108);
});
test('the small gap to the toolbar retains hover without capturing distant pointer movement',()=>{
  const item={left:200,top:100,right:500,bottom:130}, toolbar={left:220,top:138,right:320,bottom:174};
  assert.equal(inToolbarBridge(250,134,item,toolbar),true);
  assert.equal(inToolbarBridge(100,134,item,toolbar),false);
  assert.equal(inToolbarBridge(250,190,item,toolbar),false);
});

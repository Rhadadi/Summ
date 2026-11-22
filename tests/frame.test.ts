import test from'node:test';
import assert from'node:assert/strict';
import{DEFAULT_FRAME,clampFrame,frameCrop,frameVars,focusToPoint,nudge,pointToFocus,sameFrame,shown}from'../src/frame.ts';

test('no frame means no variables, so an unframed book renders as before',()=>{
 assert.equal(frameVars(undefined),undefined);assert.equal(frameVars({}),undefined);
 assert.equal(frameVars({framePhone:{x:1,y:1,zoom:2}}),undefined);
});
test('frame variables carry the focus and zoom; phones add their own set',()=>{
 assert.deepEqual(frameVars({frame:{x:20,y:75.5,zoom:1.6}}),{'--fx':'20%','--fy':'75.5%','--fz':'1.6'});
 assert.deepEqual(frameVars({frame:{x:20,y:75.5,zoom:1.6},framePhone:{x:60,y:10,zoom:1}}),{'--fx':'20%','--fy':'75.5%','--fz':'1.6','--pfx':'60%','--pfy':'10%','--pfz':'1'});
});
test('values are clamped to 0-100 and 1-3, and junk becomes the edge',()=>{
 assert.deepEqual(clampFrame({x:-5,y:140,zoom:9}),{x:0,y:100,zoom:3});
 assert.deepEqual(clampFrame({x:NaN,y:33.333,zoom:0.2}),{x:0,y:33.3,zoom:1});
 assert.deepEqual(frameVars({frame:{x:150,y:-2,zoom:0}}),{'--fx':'100%','--fy':'0%','--fz':'1'});
 assert.deepEqual(nudge(DEFAULT_FRAME,-60,5,5),{x:0,y:45,zoom:3});
 assert.equal(sameFrame({x:1,y:2,zoom:1},{x:1,y:2,zoom:1}),true);assert.equal(sameFrame(null,undefined),true);assert.equal(sameFrame({x:1,y:2,zoom:1},null),false);
});
test('a wide picture in a square box is letterboxed top and bottom',()=>{
 const r=shown({w:400,h:400},{w:2000,h:1000});
 assert.deepEqual(r,{x:0,y:100,w:400,h:200});
});
test('pointer to focus accounts for letterboxing',()=>{
 const box={w:400,h:400},nat={w:2000,h:1000};
 assert.deepEqual(pointToFocus(200,200,box,nat),{x:50,y:50});
 assert.deepEqual(pointToFocus(100,150,box,nat),{x:25,y:25});   // 150 is halfway up the 100..300 picture band
 assert.deepEqual(pointToFocus(-30,10,box,nat),{x:0,y:0});        // a bar counts as the nearest edge
 assert.deepEqual(pointToFocus(999,999,box,nat),{x:100,y:100});
 const tall=shown({w:400,h:400},{w:1000,h:2000});assert.deepEqual(tall,{x:100,y:0,w:200,h:400});
 assert.deepEqual(pointToFocus(150,100,box,{w:1000,h:2000}),{x:25,y:25});
});
test('focus to point is the inverse of pointer to focus',()=>{
 const box={w:520,h:300},nat={w:1800,h:1200};
 for(const f of[{x:0,y:0},{x:37.5,y:80},{x:100,y:100}]){const p=focusToPoint(f,box,nat),back=pointToFocus(p.x,p.y,box,nat);assert.ok(Math.abs(back.x-f.x)<.11&&Math.abs(back.y-f.y)<.11,JSON.stringify([f,back]));}
});
test('the measured crop follows the focus and the zoom',()=>{
 const nat={w:2000,h:1000},box={w:200,h:100};   // same shape: the cover crop is the whole picture
 assert.deepEqual(frameCrop(nat,box,{x:50,y:50,zoom:1}),{sx:0,sy:0,sw:2000,sh:1000});
 const z=frameCrop(nat,box,{x:50,y:50,zoom:2});assert.deepEqual(z,{sx:500,sy:250,sw:1000,sh:500});    // the centre half
 const corner=frameCrop(nat,box,{x:0,y:0,zoom:2});assert.deepEqual(corner,{sx:0,sy:0,sw:1000,sh:500});  // zooming around the top-left corner
 const br=frameCrop(nat,box,{x:100,y:100,zoom:2});assert.deepEqual(br,{sx:1000,sy:500,sw:1000,sh:500});
 // a tall frame over a wide picture crops the sides; focus 0 keeps the left edge
 const tall=frameCrop(nat,{w:100,h:200},{x:0,y:40,zoom:1});assert.equal(tall.sx,0);assert.equal(tall.sw,500);assert.equal(tall.sh,1000);
});

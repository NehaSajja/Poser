import test from 'node:test';
import assert from 'node:assert/strict';
import {createPenInput,NCODE_SCALE} from '../src/smartpen/ink.js';
function fixture() {
  const events=[];let canvas='page:one',pointing=false,readonly=false,cancelled=0;
  const editor={getCurrentPageId:()=>canvas,getInstanceState:()=>({isReadonly:readonly}),
    inputs:{getIsPointing:()=>pointing},getViewportPageBounds:()=>({center:{x:100,y:200}}),
    pageToScreen:p=>({x:p.x*2+20,y:p.y*2+40}),dispatch:e=>events.push(e),
    setCurrentTool:()=>{},focus:()=>{},cancel:()=>cancelled++};
  const input=createPenInput(editor);
  return {input,events,setCanvas:v=>canvas=v,setPointing:v=>pointing=v,setReadonly:v=>readonly=v,cancelled:()=>cancelled};
}
const dot=(dotType,x=10,y=10,extra={})=>({dotType,x,y,f:512,pageInfo:{section:3,owner:1,book:2,page:1},...extra});
test('physical coordinates preserve scale across zoom and normalize pressure',()=>{
  const {input,events}=fixture();input.setMaxForce(1024);
  input.dot(dot(0));input.dot(dot(1,20,15));input.dot(dot(2));
  assert.deepEqual(events.map(e=>e.name),['pointer_down','pointer_move','pointer_up']);
  assert.deepEqual(events[0].point,{x:220,y:440,z:.5});
  assert.equal(events[1].point.x,220+10*NCODE_SCALE*2);
  assert.equal(events[1].point.y,440+5*NCODE_SCALE*2);
  assert.equal(events[1].isPen,true);assert.equal(events[1].isPenDirect,false);
});
test('UP without coordinates ends at the final valid point',()=>{
  const {input,events}=fixture();input.dot(dot(0));input.dot(dot(1,12,14));input.dot({dotType:2});
  assert.deepEqual(events[2].point,events[1].point);
});
test('page changes never connect two sheets with a stray line',()=>{
  const {input,events}=fixture();input.dot(dot(0));input.dot(dot(1,200,200,{pageInfo:{page:2}}));
  assert.deepEqual(events.map(e=>e.name),['pointer_down','pointer_up']);
  input.dot(dot(0,200,200,{pageInfo:{page:2}}));input.finish();
  assert.deepEqual(events[2].point,events[0].point);
});
test('hover, invalid coordinates and orphan MOVE do not draw',()=>{
  const {input,events}=fixture();input.dot(dot(3));input.dot(dot(0,NaN,20));input.dot(dot(1));
  assert.equal(events.length,0);input.finish();
});
test('mouse gestures and readonly canvases are not taken over',()=>{
  const f=fixture();f.setPointing(true);f.input.dot(dot(0));f.setPointing(false);f.setReadonly(true);f.input.dot(dot(0));
  assert.equal(f.events.length,0);f.input.finish();
});
test('switching tldraw pages cancels the old gesture without drawing on the new page',()=>{
  const f=fixture();f.input.dot(dot(0));f.setCanvas('page:two');f.input.dot(dot(1));
  assert.equal(f.cancelled(),1);assert.equal(f.events.length,1);f.input.finish();
});
test('disconnect finishes active ink once; pressure clamps to the valid range',()=>{
  const {input,events}=fixture();input.setMaxForce(1024);input.dot(dot(0,10,10,{f:5000}));input.finish();input.finish();
  assert.equal(events.length,2);assert.equal(events[0].point.z,1);
});

test('M1+ contact placeholders wait through page info for the first real coordinate',()=>{
  const {input,events}=fixture();
  input.dot(dot(0,-1,-1,{pageInfo:{section:-1,owner:-1,book:-1,page:-1}}));
  input.dot(dot(4,-1,-1));
  assert.equal(events.length,0);
  input.dot(dot(1,16.11,20.07));input.dot(dot(1,16.12,20.36));input.dot(dot(2));
  assert.deepEqual(events.map(e=>e.name),['pointer_down','pointer_move','pointer_up']);
  assert.deepEqual(events[0].point,{x:220,y:440,z:.5});
  input.dot(dot(0,-1,-1));input.dot(dot(4,-1,-1));input.dot(dot(1,22,20));input.finish();
  assert.ok(Math.abs(events[3].point.x-(220+(22-16.11)*NCODE_SCALE*2))<1e-9);
});

test('contact without coordinates cannot leave a stroke pending after UP or disconnect',()=>{
  for(const end of [input=>input.dot({dotType:2}),input=>input.finish()]) {
    const {input,events}=fixture();input.dot(dot(0,-1,-1));end(input);input.dot(dot(1));
    assert.equal(events.length,0);input.finish();
  }
});

test('all seven captured hardware strokes start at their real positions and preserve spacing',async()=>{
  const {readFile}=await import('node:fs/promises');
  const captured=JSON.parse(await readFile(new URL('./fixtures/m1-plus-strokes.json',import.meta.url)));
  const {input,events}=fixture();
  const first=captured.find(d=>d.dotType===1);
  let expectDown=false, coordinateCount=0;
  const expected=[];
  for(const d of captured) {
    if(d.dotType===0) expectDown=true;
    if(d.dotType===1) {
      coordinateCount++;
      expected.push({name:expectDown?'pointer_down':'pointer_move',
        x:220+(d.x-first.x)*NCODE_SCALE*2,y:440+(d.y-first.y)*NCODE_SCALE*2});
      expectDown=false;
    }
    input.dot(d);
  }
  input.finish();
  const positions=events.filter(e=>e.name!=='pointer_up');
  assert.equal(coordinateCount,412);
  assert.equal(events.filter(e=>e.name==='pointer_down').length,7);
  assert.equal(events.filter(e=>e.name==='pointer_up').length,7);
  assert.equal(positions.length,412);
  positions.forEach((event,i)=>{
    assert.equal(event.name,expected[i].name);
    assert.ok(Math.abs(event.point.x-expected[i].x)<1e-9);
    assert.ok(Math.abs(event.point.y-expected[i].y)<1e-9);
  });
});

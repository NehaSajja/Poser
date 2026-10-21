import test from 'node:test';
import assert from 'node:assert/strict';
import { matchNearbyEdges, nudgeKeepingGaps, SNAP_DISTANCE } from '../src/tldraw/snapping.js';
import { stabilizePoint, attachPenStabilizer } from '../src/tldraw/pen.js';

test('stacked components match close left and right edges without changing their gap', () => {
  const neighbor = {x:100,y:100,w:300,h:160};
  const box = {x:108,y:284,w:276,h:160};
  assert.deepEqual(matchNearbyEdges(box,[neighbor],SNAP_DISTANCE), {x:100,y:284,w:300,h:160});
  assert.deepEqual(neighbor,{x:100,y:100,w:300,h:160});
  assert.deepEqual(matchNearbyEdges({...box,w:380},[neighbor],SNAP_DISTANCE),{...box,w:380});
});

test('a row can match heights, and snap tolerance stays measured in screen pixels', () => {
  const neighbor = {x:100,y:100,w:200,h:160};
  assert.deepEqual(matchNearbyEdges({x:330,y:108,w:200,h:148},[neighbor],24),{x:330,y:100,w:200,h:160});
  const box = {x:114,y:284,w:184,h:160};
  assert.equal(matchNearbyEdges(box,[neighbor],24 / 2).x,114);
  assert.equal(matchNearbyEdges(box,[neighbor],24).x,100);
});

test('native alignment may align a column but cannot collapse its positive gap', () => {
  const neighbor = {x:100,y:100,w:300,h:160};
  const box = {x:108,y:280,w:300,h:160};
  assert.deepEqual(nudgeKeepingGaps(box,{x:-8,y:-20},[neighbor]),{x:100,y:280,w:300,h:160});
});

test('pen stabilization suppresses tiny shakes with bounded distance, not timed lag', () => {
  let point = {x:0,y:0};
  for (const jitter of [{x:1,y:1},{x:-1,y:1},{x:0,y:-2}]) point = stabilizePoint(point,jitter);
  assert.deepEqual(point,{x:0,y:0});
  assert.deepEqual(stabilizePoint(point,{x:100,y:0}),{x:97,y:0});
  assert.deepEqual(stabilizePoint(point,{x:0,y:10}),{x:0,y:7});
  const corner = stabilizePoint({x:97,y:0},{x:100,y:30});
  assert.ok(Math.abs(Math.hypot(100-corner.x,30-corner.y)-3)<1e-9);
});

test('stabilization applies only to the active freehand pointer and preserves pressure', () => {
  let handler, tool='draw', panning=false;
  const editor = {on:(_name,fn)=>handler=fn,off:()=>{},getCurrentToolId:()=>tool,inputs:{getIsPanning:()=>panning}};
  const stop = attachPenStabilizer(editor);
  const event = (name,x,y,extras={}) => ({type:'pointer',name,button:0,pointerId:1,point:{x,y,z:.7},...extras});
  handler(event('pointer_down',0,0));
  const move = event('pointer_move',20,0); handler(move);
  assert.deepEqual(move.point,{x:17,y:0,z:.7});
  const otherPointer = event('pointer_move',30,0,{pointerId:2}); handler(otherPointer);
  assert.equal(otherPointer.point.x,30);
  const straight = event('pointer_move',40,0,{shiftKey:true}); handler(straight);
  assert.equal(straight.point.x,40);
  handler(event('pointer_up',40,0));
  const hover = event('pointer_move',50,0); handler(hover); assert.equal(hover.point.x,50);
  for (tool of ['geo','line','select','eraser']) {
    handler(event('pointer_down',0,0));
    const untouched=event('pointer_move',20,0); handler(untouched); assert.equal(untouched.point.x,20);
  }
  tool='draw'; panning=true;
  handler(event('pointer_down',0,0));
  const pan=event('pointer_move',20,0); handler(pan); assert.equal(pan.point.x,20);
  stop();
});

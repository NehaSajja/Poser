import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the actual event handler + queue. Only SDK rendering and the image
// encoder are replaced, so tests need neither a browser nor an API request.
const mocks = {
  tldraw: `export { Box } from ${JSON.stringify(new URL('../node_modules/@tldraw/editor/dist-esm/lib/primitives/Box.mjs', import.meta.url).pathname)};
    export { Vec } from ${JSON.stringify(new URL('../node_modules/@tldraw/editor/dist-esm/lib/primitives/Vec.mjs', import.meta.url).pathname)};
    let id=0; export const b64Vecs={decodePoints:JSON.parse}; export const createShapeId=()=>\`shape:test\${++id}\`;`,
  '../sketch': 'export const strokeImage=()=>"data:image/png;base64,test";',
  './SketchControlShape': 'export const CONTROL_TYPE="sketch-control";',
};
const bundle = await build({
  entryPoints: [new URL('../src/tldraw/recognition.js', import.meta.url).pathname],
  bundle:true, platform:'node', format:'esm', write:false,
  plugins:[{name:'rendering-stubs',setup(b){
    b.onResolve({filter:/^(tldraw|\.\.\/sketch|\.\/SketchControlShape)$/},args=>({path:args.path,namespace:'stub'}));
    b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:mocks[args.path],loader:'js',resolveDir:new URL('..',import.meta.url).pathname}));
  }}],
});
const { attachRecognition } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(t, points = [{x:100,y:100},{x:300,y:100},{x:300,y:160},{x:100,y:160},{x:100,y:100}], frame = null) {
  t.mock.timers.enable({apis:['setTimeout']});
  const handlers={},shapes=new Map(),created=[],requests=[];
  if (frame) shapes.set(frame.id,frame);
  let tool='draw',selectedIds=[];
  t.mock.method(globalThis,'fetch',(_url,{signal})=>new Promise(resolve=>requests.push({signal,resolve})));
  const editor={
    on:(name,fn)=>{handlers[name]=fn;},off:()=>{},getCurrentToolId:()=>tool,
    getCurrentPageShapes:()=>[...shapes.values()],getShape:id=>shapes.get(id),
    getCurrentPageId:()=> 'page:test',
    findShapeAncestor:shape=>shapes.get(shape.parentId),
    getDocumentSettings:()=>({gridSize:4}),
    user:{getIsSnapMode:()=>true},
    getSelectedShapeIds:()=>selectedIds,setSelectedShapes:ids=>{selectedIds=ids;},
    snaps:{shapeBounds:{snapTranslateShapes:()=>({nudge:{x:0,y:0}})},clearIndicators:()=>{}},
    getShapePageTransform:shape=>{
      const parent=shapes.get(shape.parentId), x=shape.x+(parent?.x||0), y=shape.y+(parent?.y||0);
      return {x,y,applyToPoint:p=>({x:p.x+x,y:p.y+y})};
    },
    screenToPage:p=>p,getZoomLevel:()=>1,inputs:{getCurrentPagePoint:()=>({x:150,y:120})},
    markHistoryStoppingPoint:()=>{},run:fn=>fn(),deleteShapes:ids=>ids.forEach(id=>shapes.delete(id)),
    createShape:shape=>{created.push(shape);shapes.set(shape.id,shape);},
    reparentShapes:(ids,parentId)=>ids.forEach(id=>{
      const shape=shapes.get(id),parent=shapes.get(parentId);
      shapes.set(id,{...shape,parentId,x:shape.x-parent.x,y:shape.y-parent.y});
    }),
  };
  const controller=attachRecognition(editor,{onPending:()=>{},onError:message=>assert.fail(message)});
  t.after(()=>controller.dispose());
  const event=(name,x=900,y=900)=>({type:'pointer',name,button:0,point:{x,y}});
  const down=(nextTool='select',x=900,y=900)=>{tool=nextTool;handlers['before-event'](event('pointer_down',x,y));};
  const up=()=>handlers.event(event('pointer_up'));
  down('draw');
  shapes.set('ink',{id:'ink',type:'draw',parentId:frame?.id??'page:test',x:0,y:0,props:{isComplete:true,isClosed:true,scaleX:1,scaleY:1,
    segments:[{path:JSON.stringify(points)}]}});
  up();t.mock.timers.tick(120);
  const answer=async()=>{requests[0].resolve({ok:true,json:async()=>({kind:'container',probabilities:[{value:'container',probability:.95}]})});await settle();};
  return {down,up,answer,shapes,created,requests,controller,editor};
}

for (const tool of ['select','eraser']) test(`an unrelated ${tool} gesture waits without cancelling recognition`,async t=>{
  const h=harness(t);h.down(tool);
  assert.equal(h.requests[0].signal.aborted,false);
  await h.answer();assert.equal(h.created.length,0);
  h.up();assert.equal(h.created.length,1);
});

test('recognition keeps frame parenting and original page-space ink',async t=>{
  const frame={id:'frame',type:'frame',parentId:'page:test',x:400,y:200,props:{w:800,h:500}};
  const h=harness(t,undefined,frame);
  await h.answer();
  const shape=h.shapes.get(h.created[0].id);
  assert.equal(shape.parentId,frame.id);
  assert.deepEqual([shape.x,shape.y],[100,100]);
  assert.deepEqual(h.editor.getShapePageTransform(shape).applyToPoint({
    x:shape.props.ink[0][0].x*shape.props.w,y:shape.props.ink[0][0].y*shape.props.h,
  }),{x:500,y:300});
});

test('framed recognition preserves its source bounds and never snaps to page targets',async t=>{
  const points=[{x:23.5,y:17.5},{x:98.5,y:17.5},{x:98.5,y:64.5},{x:23.5,y:64.5},{x:23.5,y:17.5}];
  const frame={id:'frame',type:'frame',parentId:'page:test',x:411,y:201,props:{w:800,h:500}};
  const h=harness(t,points,frame);
  h.editor.snaps.shapeBounds.snapTranslateShapes=()=>assert.fail('frame borders must not attract recognized ink');
  await h.answer();
  const shape=h.shapes.get(h.created[0].id);
  assert.deepEqual([shape.x,shape.y,shape.props.w,shape.props.h],[23.5,17.5,75,47]);
});

test('matching dimensions does not borrow a component from another frame',async t=>{
  const h=harness(t);
  const frame={id:'frame',type:'frame',parentId:'page:test',x:0,y:0,props:{w:800,h:500}};
  const neighbor={id:'neighbor',type:'sketch-control',parentId:frame.id,x:100,y:220,props:{w:220,h:60}};
  h.shapes.set(frame.id,frame);h.shapes.set(neighbor.id,neighbor);
  h.editor.getShapePageBounds=shape=>({x:shape.x,y:shape.y,w:shape.props.w,h:shape.props.h});
  await h.answer();
  assert.equal(h.created[0].props.w,200);
});

for (const change of ['move','delete']) test(`${change} of candidate ink prevents an old answer from being applied`,async t=>{
  const h=harness(t);h.down(change==='move'?'select':'eraser');
  if(change==='move')h.shapes.set('ink',{...h.shapes.get('ink'),x:20});else h.shapes.delete('ink');
  await h.answer();h.up();assert.equal(h.created.length,0);
});

test('drawing through a pending candidate still cancels its outdated request',t=>{
  const h=harness(t);h.down('draw',150,120);assert.equal(h.requests[0].signal.aborted,true);
});

test('explicit undo/clear cancellation still prevents recognition from restoring ink',async t=>{
  const h=harness(t);h.controller.cancel();await h.answer();
  assert.equal(h.requests[0].signal.aborted,true);assert.equal(h.created.length,0);
});

test('recognition snaps the new component while preserving freehand evidence and neighboring shapes',async t=>{
  const points=[{x:103,y:101},{x:304,y:102},{x:303,y:144},{x:104,y:143},{x:103,y:101}];
  const h=harness(t,points);
  const neighbor={id:'neighbor',type:'geo',x:417,y:233,props:{w:99,h:51}};
  h.shapes.set(neighbor.id,neighbor);
  const originalInk=h.shapes.get('ink').props.segments[0].path;
  assert.deepEqual(JSON.parse(originalInk),points);
  await h.answer();
  const shape=h.created[0];
  assert.deepEqual([shape.x,shape.y,shape.props.w,shape.props.h],[104,100,200,44]);
  assert.deepEqual(shape.props.ink[0].map(p=>({x:shape.x+p.x*shape.props.w,y:shape.y+p.y*shape.props.h})),points);
  assert.equal(h.shapes.get(neighbor.id),neighbor);
});

test('recognition applies native alignment after removing source ink and restores selection',async t=>{
  const points=[{x:103,y:101},{x:304,y:102},{x:303,y:144},{x:104,y:143},{x:103,y:101}];
  const h=harness(t,points);
  const neighbor={id:'neighbor',type:'geo',x:100,y:220,props:{w:200,h:44}};
  h.shapes.set(neighbor.id,neighbor);
  h.editor.setSelectedShapes([neighbor.id]);
  let calls=0;
  h.editor.snaps.shapeBounds.snapTranslateShapes=({initialSelectionPageBounds,initialSelectionSnapPoints,dragDelta})=>{
    calls++;
    assert.equal(h.shapes.has('ink'),false);
    assert.deepEqual(h.editor.getSelectedShapeIds(),[]);
    assert.equal(initialSelectionPageBounds.x,104);
    assert.equal(initialSelectionSnapPoints.length,5);
    assert.deepEqual([dragDelta.x,dragDelta.y],[0,0]);
    return {nudge:{x:-4,y:0}};
  };
  await h.answer();
  const shape=h.created[0];
  assert.equal(calls,1);
  assert.deepEqual([shape.x,shape.y,shape.props.w,shape.props.h],[100,100,200,44]);
  assert.deepEqual(shape.props.ink[0].map(p=>({x:shape.x+p.x*shape.props.w,y:shape.y+p.y*shape.props.h})),points);
  assert.deepEqual(h.editor.getSelectedShapeIds(),[neighbor.id]);
  assert.equal(h.shapes.get(neighbor.id),neighbor);
});

test('matching a nearby component width preserves every original sketch point',async t=>{
  const points=[{x:103,y:101},{x:304,y:102},{x:303,y:144},{x:104,y:143},{x:103,y:101}];
  const h=harness(t,points);
  const neighbor={id:'neighbor',type:'sketch-control',x:100,y:220,props:{w:220,h:44}};
  h.shapes.set(neighbor.id,neighbor);
  h.editor.getShapePageBounds=shape=>({x:shape.x,y:shape.y,w:shape.props.w,h:shape.props.h});
  await h.answer();
  const shape=h.created[0];
  assert.deepEqual([shape.x,shape.y,shape.props.w,shape.props.h],[100,100,220,44]);
  for (const [i,p] of shape.props.ink[0].entries()) {
    assert.ok(Math.abs(shape.x+p.x*shape.props.w-points[i].x)<1e-9);
    assert.ok(Math.abs(shape.y+p.y*shape.props.h-points[i].y)<1e-9);
  }
  assert.equal(h.shapes.get(neighbor.id),neighbor);
});

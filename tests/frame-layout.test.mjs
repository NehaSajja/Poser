import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Mat } from '../node_modules/@tldraw/editor/dist-esm/lib/primitives/Mat.mjs';
import { layoutFrame as planFrame } from '../src/tldraw/frameLayout.js';
const layoutFrame = (...args) => planFrame(...args).boxes;

const frame = { w: 800, h: 500 };
const card = (id, x, y, w, h, kind = 'container') => ({ id, kind, box: { x, y, w, h } });

test('the reported pair keeps an inset and becomes equal cards with a clean gap', () => {
  const items = [card('a',22,17,75,47),card('b',110,18,60,46)];
  const before = structuredClone(items);
  const layout = layoutFrame(items, frame);
  assert.deepEqual(layout.get('a'), { x:24,y:24,w:68,h:48 });
  assert.deepEqual(layout.get('b'), { x:108,y:24,w:68,h:48 });
  assert.deepEqual(items, before);
});

test('rows and columns share one size and gap', () => {
  const row = layoutFrame([card('a',24,24,80,48),card('b',120,26,75,46),card('c',216,23,78,50)],frame);
  assert.deepEqual(row.get('c'),{x:208,y:24,w:76,h:48});
  const column = layoutFrame([card('a',24,24,180,100),card('b',29,144,158,92)],frame);
  assert.deepEqual(column.get('b'),{x:28,y:144,w:168,h:96});
});

test('three uneven sketched boxes become equal, evenly spaced siblings regardless of drawing order', () => {
  // Approximate proportions of the reported three-card row, including its
  // smaller last box and uneven gaps. Former pairwise matching expanded the
  // first two and ran out of room for the third.
  const items = [card('a',48,52,232,68),card('b',304,58,208,64),card('c',524,60,204,60)];
  const before = structuredClone(items);
  const expected = layoutFrame(items,frame);
  const boxes = items.map(item => expected.get(item.id));
  assert.equal(new Set(boxes.map(b=>b.w)).size,1);
  assert.equal(new Set(boxes.map(b=>b.h)).size,1);
  assert.equal(new Set(boxes.map(b=>b.y)).size,1);
  assert.equal(boxes[1].x-boxes[0].x-boxes[0].w,boxes[2].x-boxes[1].x-boxes[1].w);
  assert.ok(boxes[0].x>=24 && boxes[2].x+boxes[2].w<=776);
  for (const order of [[2,1,0],[1,0,2],[1,2,0]]) {
    const actual=layoutFrame(order.map(i=>items[i]),frame);
    for (const item of items) assert.deepEqual(actual.get(item.id),expected.get(item.id));
  }
  assert.deepEqual(items,before);
});

test('deliberately different sizes, distant items and nested controls stay distinct', () => {
  const layout = layoutFrame([card('a',24,24,80,48),card('large',120,24,200,48),card('far',600,400,72,44),card('inner',130,35,40,20)],frame);
  assert.equal(layout.get('large').w,200);
  assert.deepEqual(layout.get('far'),{x:600,y:400,w:72,h:44});
  assert.deepEqual(layout.get('inner'),{x:132,y:36,w:40,h:20});
});

test('a rough row with slight overlaps produces one flex layout with equal cells', () => {
  const items=[card('a',30,50,160,80),card('b',170,65,140,72),card('c',338,44,190,92)];
  const {boxes,groups}=planFrame(items,frame);
  assert.equal(groups.length,1);
  assert.equal(groups[0].axis,'x');
  assert.deepEqual(groups[0].ids,['a','b','c']);
  const cells=items.map(item=>boxes.get(item.id));
  assert.equal(new Set(cells.map(b=>b.w)).size,1);
  assert.equal(new Set(cells.map(b=>b.h)).size,1);
  assert.equal(new Set(cells.map(b=>b.y)).size,1);
  assert.equal(groups[0].box.w,cells[0].w*3+groups[0].gap*2);
  assert.ok(groups[0].gap>=8);
});

test('matching cannot push a card outside its frame or close a positive gap', () => {
  const layout = layoutFrame([card('a',24,24,80,48),card('b',110,24,60,46)],{w:200,h:200});
  const a=layout.get('a'),b=layout.get('b');
  assert.ok(b.x > a.x+a.w);
  assert.ok(b.x+b.w <=176);
  assert.equal(a.w,b.w); // Fit the row as a whole instead of leaving one box small.
});

test('control heights use shadcn sizes, and spacing measures their rendered bounds', () => {
  const layout = layoutFrame([card('a',24,24,240,90,'input'),card('b',25,130,230,75,'button')],frame);
  assert.deepEqual(layout.get('a'),{x:24,y:24,w:236,h:40});
  assert.deepEqual(layout.get('b'),{x:24,y:80,w:236,h:40});
});

const bundle = await build({
  stdin:{contents:'export { getPreviewShapes } from "./previewLayout"; export { inferLineAnnotations } from "./previewAnnotations";',
    resolveDir:new URL('../src/tldraw',import.meta.url).pathname},bundle:true,platform:'node',format:'esm',write:false,
  plugins:[{name:'shape-type',setup(b){
    b.onResolve({filter:/^(tldraw|\.\/SketchControlShape)$/},args=>({path:args.path,namespace:'stub'}));
    b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='tldraw'
      ? `export { Mat } from ${JSON.stringify(new URL('../node_modules/@tldraw/editor/dist-esm/lib/primitives/Mat.mjs',import.meta.url).pathname)}; export const b64Vecs={decodePoints:JSON.parse};`
      : 'export const CONTROL_TYPE="sketch-control";',loader:'js',resolveDir:new URL('..',import.meta.url).pathname}));
  }}],
});
const { getPreviewShapes, inferLineAnnotations } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function previewFixture() {
  const frame={id:'frame',type:'frame',x:100,y:200,rotation:0,props:{w:800,h:500}};
  // Old snapshots stored x/y on the border but kept the true offset in ink.
  const shape={id:'a',type:'sketch-control',parentId:'frame',x:0,y:0,rotation:0,props:{kind:'container',w:76,h:48,
    ink:[[[22,17],[97,17],[97,64],[22,64],[22,17]].map(([x,y])=>({x:x/76,y:y/48}))]}};
  const shapes=[frame,shape];
  const transform=s=>s.type==='frame' ? new Mat(1,0,0,1,0,0).translate(s.x,s.y).rotate(s.rotation)
    : transform(shapes.find(f=>f.id===s.parentId)).translate(s.x,s.y).rotate(s.rotation);
  const editor={
    getCurrentPageShapesSorted:()=>shapes,isShapeHidden:()=>false,getShapePageTransform:transform,
    findShapeAncestor:s=>shapes.find(f=>f.id===s.parentId),getDocumentSettings:()=>({gridSize:4}),
    getShapeClipPath:()=>undefined,
    getShapeGeometry:s=>({vertices:s.props.points}),
    getShapeMask:s=>s.parentId ? [{x:0,y:0},{x:800,y:0},{x:800,y:500},{x:0,y:500}].map(p=>transform(shapes.find(f=>f.id===s.parentId)).applyToPoint(p)):undefined,
  };
  return {editor,frame,shape,shapes,transform};
}

test('existing border-snapped drawings recover from ink without modifying saved shapes', () => {
  const h=previewFixture(),before=structuredClone(h.shapes);
  const item=getPreviewShapes(h.editor).find(i=>i.shape.id==='a');
  const point=item.matrix.applyToPoint({x:0,y:0});
  assert.deepEqual([point.x,point.y],[124,224]);
  assert.deepEqual([item.props.w,item.props.h],[76,48]);
  assert.match(item.clipPath,/^-?polygon\(-24px -24px/);
  assert.deepEqual(h.shapes,before);
});

test('frame translation, rotation and zoom preserve the same local grid', () => {
  const h=previewFixture();
  h.frame.x=311.5;h.frame.y=-78.75;h.frame.rotation=Math.PI/6;
  for (const zoom of [.25,1,4]) {
    h.editor.getZoomLevel=()=>zoom;
    const item=getPreviewShapes(h.editor).find(i=>i.shape.id==='a');
    const local=h.transform(h.frame).invert().multiply(item.matrix).applyToPoint({x:0,y:0});
    assert.ok(Math.abs(local.x-24)<1e-8 && Math.abs(local.y-24)<1e-8);
    assert.deepEqual([item.props.w,item.props.h],[76,48]);
  }
});

test('components in another frame do not affect sizing or alignment', () => {
  const h=previewFixture();
  h.shapes.push({...h.frame,id:'other',x:1100},{...h.shape,id:'b',parentId:'other',x:100,y:100,props:{kind:'container',w:64,h:40,ink:[]}});
  const items=getPreviewShapes(h.editor);
  const b=items.find(i=>i.shape.id==='b');
  const point=b.matrix.applyToPoint({x:0,y:0});
  assert.deepEqual([point.x,point.y],[1200,300]);
  assert.deepEqual([b.props.w,b.props.h],[64,40]);
});

test('native and freehand lines become text above rectangle, input and button in either order', () => {
  for (const kind of ['container','input','button']) for (const type of ['line','draw']) {
    const h=previewFixture();
    Object.assign(h.shape,{x:24,y:80,props:{kind,w:180,h:80,ink:[]}});
    const points=[{x:0,y:0},{x:50,y:2},{x:100,y:0}];
    const line={id:'label',type,parentId:'frame',x:28,y:56,rotation:0,props:{points,isComplete:true,isClosed:false,scaleX:1,scaleY:1,segments:[{path:JSON.stringify(points)}]}};
    h.shapes.splice(1,1,line);
    assert.equal(getPreviewShapes(h.editor).find(i=>i.shape.id==='label').props.kind,'separator');
    h.shapes.push(h.shape);
    let preview=getPreviewShapes(h.editor);
    assert.equal(preview.find(i=>i.shape.id==='a').label,'label');
    assert.equal(preview.some(i=>i.props.kind==='separator'),false);
    h.shape.x=400;
    preview=getPreviewShapes(h.editor);
    assert.equal(preview.find(i=>i.shape.id==='a').label,undefined);
    assert.equal(preview.find(i=>i.shape.id==='label').props.kind,'separator');
    h.shape.x=24;
    assert.equal(getPreviewShapes(h.editor).find(i=>i.shape.id==='a').label,'label');
    h.shapes.splice(h.shapes.indexOf(line),1);
    assert.equal(getPreviewShapes(h.editor).find(i=>i.shape.id==='a').label,undefined);
  }
});

test('line annotations respect frame scope and do not consume internal marks or partial outlines', () => {
  const line={id:'line',scope:'one',horizontal:true,box:{x:24,y:50,w:100,h:2}};
  const control={id:'control',scope:'one',kind:'input',box:{x:24,y:80,w:180,h:80}};
  assert.equal(inferLineAnnotations([line],[{...control,scope:'two'}])[0].kind,'separator');
  assert.deepEqual(inferLineAnnotations([{...line,box:{...line.box,y:100}}],[control]),[]);
  const edge={id:'edge',scope:'one',horizontal:false,box:{x:24,y:50,w:2,h:80}};
  assert.deepEqual(inferLineAnnotations([line,edge],[]),[]);
  assert.equal(inferLineAnnotations([{...line,box:{...line.box,w:400}}],[control])[0].kind,'separator');
  assert.equal(inferLineAnnotations([line],[control])[0].targetId,'control');
});

test('labels reserve space inside frames and between flex column items', () => {
  const a={...card('a',24,24,180,80,'input'),label:true};
  const b={...card('b',26,120,175,76,'input'),label:true};
  const {boxes,groups}=planFrame([a,b],frame);
  assert.ok(boxes.get('a').y-28>=24);
  assert.ok(boxes.get('b').y-28>=boxes.get('a').y+boxes.get('a').h+8);
  assert.equal(groups[0].axis,'y');
  const row=planFrame([a,{...b,box:{x:224,y:28,w:175,h:76}}],frame).boxes;
  assert.ok(row.get('a').y-28>=24);
  assert.equal(row.get('a').y,row.get('b').y);
});

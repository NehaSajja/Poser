import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeInkShape, nativeInk, needsRecognition, isBareNativeRectangle } from '../src/tldraw/nativeInk.js';
import { inkBounds, proposeInkGroup } from '../src/tldraw/grouping.js';
import { isHorizontalLine } from '../src/tldraw/horizontalLine.js';

const points = pairs => pairs.map(([x, y]) => ({ x, y }));
function native(id, type, vertices, geo) {
  const box = inkBounds([vertices]);
  const shape = { type, props: { geo, w:box.w, h:box.h } };
  const local = vertices.map(p => ({x:p.x-box.x, y:p.y-box.y}));
  const strokes = nativeInk({ getShapeGeometry: () => ({ vertices:local }) }, shape)
    .map(stroke => stroke.map(p => ({x:p.x+box.x, y:p.y+box.y})));
  return { id, shape, strokes, box: inkBounds(strokes), closed: type === 'geo' };
}
const rectangle = () => native('box', 'geo', points([[100,100],[400,100],[400,200],[100,200]]), 'rectangle');
const caret = () => native('caret', 'line', points([[120,125],[120,175]]));

test('native rectangles combine with native or freehand carets in either creation order', () => {
  for (const type of ['line', 'draw']) {
    const box = rectangle(), mark = caret();
    mark.shape.type = type;
    for (const last of [box, mark]) {
      const group = proposeInkGroup([last.id], [box, mark], [], 8);
      assert.equal(needsRecognition(group), true);
      assert.equal(isBareNativeRectangle(group), false);
      assert.equal(group.strokes.length, 2);
      assert.deepEqual(group.box, { x:100, y:100, w:300, h:100 });
      assert.deepEqual(group.strokes[0][0], group.strokes[0].at(-1));
      assert.notDeepEqual(group.strokes[1][0], group.strokes[1].at(-1));
    }
  }
});

test('native circles can be switch thumbs or radio interiors', () => {
  const ring = (id, x, y, radius) => native(id, 'geo', Array.from({length:48}, (_, i) => ({
    x:x+radius*Math.cos(i*Math.PI/24), y:y+radius*Math.sin(i*Math.PI/24),
  })), 'ellipse');
  for (const [outline, mark] of [
    [rectangle(), ring('thumb', 350, 150, 35)],
    [ring('ring', 150, 150, 45), ring('dot', 150, 150, 8)],
  ]) {
    const group = proposeInkGroup([mark.id], [outline, mark], [], 8);
    assert.equal(group.key, outline.id);
    assert.equal(group.strokes.length, 2);
    assert.equal(needsRecognition(group), true);
  }
});

test('bare native rectangles convert directly while lines and circles wait for more ink', () => {
  assert.equal(needsRecognition(null), false);
  const box = rectangle(), group = proposeInkGroup([box.id], [box], [], 8);
  assert.equal(isBareNativeRectangle(group), true);
  assert.equal(needsRecognition(group), true);
  const line = caret();
  assert.equal(isNativeInkShape(line.shape), true);
  assert.equal(needsRecognition(proposeInkGroup([line.id], [line], [], 8)), false);
  const circle = {...box,shape:{type:'geo',props:{geo:'ellipse'}}};
  assert.equal(needsRecognition(proposeInkGroup([circle.id], [circle], [], 8)), false);
  assert.equal(isBareNativeRectangle({...group,control:box}), false);
  const draw = caret(); draw.shape.type = 'draw';
  assert.equal(needsRecognition(proposeInkGroup([draw.id], [draw], [], 8)), true);
  assert.equal(isNativeInkShape({type:'geo',props:{geo:'star'}}), false);
});

test('small native ellipses keep a smooth outline when enlarged for vision', () => {
  const [stroke] = nativeInk({}, {type:'geo',props:{geo:'ellipse',w:8,h:12}});
  assert.deepEqual(inkBounds([stroke]), {x:0,y:0,w:8,h:12});
  for (const p of stroke) assert.ok(Math.abs(((p.x-4)/4)**2 + ((p.y-6)/6)**2 - 1) < 1e-10);
  const longest = Math.max(...stroke.slice(1).map((p,i)=>Math.hypot(p.x-stroke[i].x,p.y-stroke[i].y)));
  assert.ok(longest < 1);
});

test('horizontal line gestures are local, while arrows and multi-stroke boxes still reach recognition', () => {
  for (const stroke of [points([[10,20],[110,20]]),points([[110,20],[60,24],[10,20]])]) {
    assert.equal(isHorizontalLine([stroke]),true);
    const mark=native('mark','line',stroke);mark.shape.type='draw';
    assert.equal(needsRecognition(proposeInkGroup(['mark'],[mark],[],8)),false);
  }
  assert.equal(isHorizontalLine([points([[10,20],[110,20],[90,0],[110,20],[90,40]])]),false);
  assert.equal(isHorizontalLine([points([[10,20],[10,100]])]),false);
  const label=native('label','line',points([[100,94],[200,94]]));
  const box=rectangle();
  assert.equal(isBareNativeRectangle(proposeInkGroup([box.id],[label,box],[],8)),true);
  const control={...box,shape:{type:'sketch-control'}};
  assert.equal(proposeInkGroup([label.id],[label],[control],8).control,null);
  const top=native('top','line',points([[100,100],[400,100]]));
  const side=native('side','line',points([[400,100],[400,200]]));
  assert.equal(needsRecognition(proposeInkGroup(['side'],[top,side],[],8)),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { inkBounds, proposeInkGroup } from '../src/tldraw/grouping.js';
import { RecognitionQueue } from '../src/tldraw/RecognitionQueue.js';

const drawing = (id, points, closed = false) => ({ id, strokes: [points], box: inkBounds([points]), closed });
const rectangle = (id, scale = 1) => drawing(id, [[100,100],[300,100],[300,164],[100,164],[100,100]].map(([x,y]) => ({x:x*scale,y:y*scale})), true);
const caret = (id, scale = 1) => drawing(id, [{x:104*scale,y:112*scale},{x:104*scale,y:150*scale}]);

test('a border-adjacent caret joins the same enclosure at any drawing scale', () => {
  for (const scale of [.5, 1, 4]) {
    const box = rectangle('box', scale), mark = caret('caret', scale);
    const group = proposeInkGroup(['caret'], [box, mark], [], 8);
    assert.deepEqual(group.members.map(m => m.id), ['box', 'caret']);
    assert.equal(group.strokes.length, 2);
  }
});

test('caret-before-box and adding ink to an accepted control preserve all evidence', () => {
  const box = rectangle('box'), mark = caret('caret');
  assert.equal(proposeInkGroup(['box'], [mark, box], [], 8).strokes.length, 2);
  const group = proposeInkGroup(['caret'], [mark], [box], 8);
  assert.equal(group.control.id, 'box');
  assert.equal(group.strokes.length, 2);
  assert.deepEqual(group.members.map(m => m.id), ['caret']);
});

test('a closed child rectangle does not consume its parent or a distant sibling', () => {
  const parent = drawing('parent', [{x:50,y:50},{x:600,y:50},{x:600,y:500},{x:50,y:500},{x:50,y:50}], true);
  const child = rectangle('child'), sibling = rectangle('sibling');
  sibling.box = {...sibling.box, x: 900};
  const group = proposeInkGroup(['child'], [child, sibling], [parent], 8);
  assert.equal(group.control, null);
  assert.deepEqual(group.members.map(m => m.id), ['child']);
  const mark = caret('caret');
  const pendingChild = proposeInkGroup(['caret'], [child, mark], [parent], 8);
  assert.equal(pendingChild.control, null);
  assert.deepEqual(pendingChild.members.map(m => m.id), ['child', 'caret']);
});

test('four separate touching edges can form one candidate', () => {
  const corners = rectangle('box').strokes[0];
  const edges = corners.slice(1).map((point,i) => drawing(String(i), [corners[i], point]));
  assert.equal(proposeInkGroup(['3'], edges, [], 8).members.length, 4);
});

test('closed radio dots and switch thumbs join their outline in either order and at different scales', () => {
  const circle = (id, x, y, r, scale) => drawing(id, Array.from({length: 49}, (_, i) => ({
    x: (x + r * Math.cos(i * Math.PI / 24)) * scale,
    y: (y + r * Math.sin(i * Math.PI / 24)) * scale,
  })), true);
  for (const scale of [.5, 1, 4]) {
    for (const [outline, mark] of [
      [rectangle('track', scale), circle('thumb', 268, 132, 24, scale)],
      [circle('radio', 150, 150, 45, scale), circle('dot', 150, 150, 8, scale)],
    ]) {
      for (const last of [outline, mark]) {
        const group = proposeInkGroup([last.id], [outline, mark], [], 8);
        assert.equal(group.strokes.length, 2);
        assert.equal(group.key, outline.id);
      }
      assert.equal(proposeInkGroup([mark.id], [mark], [outline], 8).control.id, outline.id);
    }
  }
});

test('a closed select triangle and a single-point radio dot remain part of the enclosure', () => {
  const outline = rectangle('outline');
  for (const mark of [
    drawing('triangle', [{x:260,y:120},{x:280,y:120},{x:270,y:140},{x:260,y:120}], true),
    drawing('dot', [{x:150,y:132}], true),
  ]) assert.equal(proposeInkGroup([mark.id], [outline, mark], [], 8).strokes.length, 2);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
function harness(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = [], applied = [], errors = [];
  let canApply = true;
  const queue = new RecognitionQueue({
    evaluate: (group, signal) => new Promise(resolve => pending.push({ group, signal, resolve })),
    isCurrent: group => !group.stale, apply: group => applied.push(group.key),
    canApply: () => canApply, onPending: () => {}, onError: message => errors.push(message),
  });
  const schedule = (key, revision = 1) => queue.schedule({ key, members: [{ id: key }], revision });
  return { queue, pending, applied, errors, schedule, pause: () => {canApply=false;}, resume: () => {canApply=true;queue.flush();} };
}

test('an unrelated drawing does not invalidate the first answer', async t => {
  const h = harness(t);
  h.schedule('a'); t.mock.timers.tick(250);
  h.schedule('b'); t.mock.timers.tick(250);
  h.pending[0].resolve({}); await settle();
  assert.deepEqual(h.applied, ['a']);
  assert.equal(h.pending[0].signal.aborted, false);
  h.queue.invalidate();
});

test('a newer revision rejects an old answer even if the provider ignores cancellation', async t => {
  const h = harness(t);
  h.schedule('a'); t.mock.timers.tick(250);
  h.schedule('a', 2); t.mock.timers.tick(250);
  h.pending[0].resolve({}); await settle();
  assert.equal(h.pending[0].signal.aborted, true);
  assert.deepEqual(h.applied, []);
  h.pending[1].resolve({}); await settle();
  assert.deepEqual(h.applied, ['a']);
});

test('answers wait for an active gesture to finish without being discarded', async t => {
  const h = harness(t);
  h.schedule('a'); t.mock.timers.tick(250); h.pause();
  h.pending[0].resolve({}); await settle();
  assert.deepEqual(h.applied, []);
  h.resume();
  assert.deepEqual(h.applied, ['a']);
});

test('undo or clear prevents a delayed response from resurrecting deleted ink', async t => {
  const h = harness(t);
  h.schedule('a'); t.mock.timers.tick(250);
  h.queue.invalidate(); h.pending[0].resolve({}); await settle();
  assert.deepEqual(h.applied, []);
});

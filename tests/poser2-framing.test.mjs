import test from 'node:test';
import assert from 'node:assert/strict';
import { previewFrame } from '../src/poser2/previewFrame.js';

const box = (x0, y0, x1, y1) => ({ min: { x: x0, y: y0 }, max: { x: x1, y: y1 } });

test('a wide ground footprint gets transparent space on both sides without shrinking the model', () => {
  const mesh = box(-.4, -.5, .4, .5);
  const floor = box(-1.2, -.7, 1.4, -.3);
  const frame = previewFrame(mesh, floor, 500);
  assert.ok(frame.left < floor.min.x && frame.right > floor.max.x);
  assert.ok(frame.bottom < floor.min.y && frame.top > floor.max.y);
  assert.ok(parseFloat(frame.style.width) > 200);
  assert.ok(parseFloat(frame.style.left) < 0);
  assert.equal(frame.side, 1.02);
  assert.ok(Math.abs(frame.width / (frame.right - frame.left) - 500 / frame.side) < 1e-9);
  assert.ok(Math.abs(frame.height / (frame.top - frame.bottom) - 500 / frame.side) < 1e-9);
  assert.equal(frame.body.width / frame.body.height, .8);
  assert.ok(Math.abs(frame.body.height * frame.side - 1) < 1e-9);
});

test('silhouette dimensions stay independent of shadow padding and bitmap resolution', () => {
  for (const mesh of [box(-2, -.2, 2, .2), box(-.2, -2, .2, 2), box(-1, -1, 1, 1)]) {
    const small = previewFrame(mesh, box(-.1, -.1, .1, .1), 256);
    const padded = previewFrame(mesh, box(-8, -8, 8, 8), 1024);
    assert.deepEqual(small.body, padded.body);
    assert.ok(Math.abs(small.body.width / small.body.height
      - (mesh.max.x - mesh.min.x) / (mesh.max.y - mesh.min.y)) < 1e-9);
  }
});

test('a shadow extending above and below the body cannot be clipped by a fixed bottom allowance', () => {
  const frame = previewFrame(box(-1, -.25, 1, .25), box(-.8, -1.6, .8, 1.3), 491);
  assert.ok(frame.top > 1.3 && frame.bottom < -1.6);
  assert.ok(parseFloat(frame.style.top) < 0);
  assert.equal(frame.width / 491 * 100, parseFloat(frame.style.width));
});

test('a contained floor preserves the original centered model frame', () => {
  const frame = previewFrame(box(-.5, -.5, .5, .5), box(-.2, -.4, .2, -.3), 400);
  assert.equal(frame.width, 400);
  assert.equal(frame.height, 400);
  assert.equal(frame.style.left, '0%');
  assert.equal(frame.style.top, '0%');
});

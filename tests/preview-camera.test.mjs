import test from 'node:test';
import assert from 'node:assert/strict';
import { panPreview, zoomPreview } from '../src/tldraw/previewCamera.js';
import { frameHeadingBounds, frameHeadingPlacement } from '../src/tldraw/frameHeading.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
const worldAt = (camera, point) => ({ x: point.x / camera.z - camera.x, y: point.y / camera.z - camera.y });

test('preview drag stays one-to-one in screen pixels at every zoom, without moving the source camera', () => {
  for (const z of [.1, .5, 1, 4, 8]) {
    const source = { x: -38, y: 72, z };
    const moved = panPreview(source, 127, -63);
    near((moved.x - source.x) * z, 127);
    near((moved.y - source.y) * z, -63);
    assert.deepEqual(source, { x: -38, y: 72, z });
  }
});

test('zoom preserves the exact world point beneath the pointer, including zoom limits', () => {
  const source = { x: 310, y: -190, z: .75 }, pointer = { x: 417, y: 239 };
  const before = worldAt(source, pointer);
  for (const target of [.001, .1, .5, 1, 4, 8, 100]) {
    const zoomed = zoomPreview(source, pointer, target), after = worldAt(zoomed, pointer);
    near(after.x, before.x); near(after.y, before.y);
    assert.ok(zoomed.z >= .1 && zoomed.z <= 8);
  }
});

test('pinch translation and zoom preserve the gesture midpoint', () => {
  const source = { x: -10, y: 18, z: 1.2 }, from = { x: 100, y: 200 }, to = { x: 140, y: 185 };
  const next = panPreview(zoomPreview(source, from, 2.4), to.x - from.x, to.y - from.y);
  assert.deepEqual(worldAt(next, to), worldAt(source, from));
});

test('frame label hit bounds align with the frame edge and keep a 24px height and 4px gap', () => {
  for (const z of [.1, .25, 1, 4]) {
    const box = frameHeadingBounds({ w: 200, h: 300 }, 0, z, 213);
    near(box.x, 0); near(box.width * z, 213); near(box.height * z, 24);
    near(-(box.y + box.height) * z, 4);
  }
});

test('rotated frame labels choose the matching upright edge, including negative and wrapped rotations', () => {
  for (const turns of [-4, 0, 4]) {
    for (let side = 0; side < 4; side++) {
      const placement = frameHeadingPlacement({ w: 200, h: 300 }, (side + turns) * Math.PI / 2, .5);
      assert.equal(placement.side, side);
      const box = frameHeadingBounds({ w: 200, h: 300 }, side, .5, 60);
      near(side % 2 ? box.width : box.height, 48);
    }
  }
});

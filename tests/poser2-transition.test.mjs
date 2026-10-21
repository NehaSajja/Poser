import test from 'node:test';
import assert from 'node:assert/strict';
import { poseViewFit } from '../src/poser2/viewTransition.js';

test('the initial camera reproduces the displayed body size and position', () => {
  const body = { width: 2, height: 4 }, panel = { width: 600, height: 800 };
  const origin = { left: 180, top: 220, width: 150, height: 300 };
  const fit = poseViewFit(body, panel, origin);
  assert.equal(fit.initialScale * body.width, origin.width);
  assert.equal(fit.initialScale * body.height, origin.height);
  assert.equal(panel.width / 2 + fit.offsetX * fit.initialScale, origin.left + origin.width / 2);
  assert.equal(panel.height / 2 + fit.offsetY * fit.initialScale, origin.top + origin.height / 2);
});

test('the focused camera enlarges upright poses while leaving room around the body', () => {
  const fit = poseViewFit({ width: 2, height: 4 }, { width: 600, height: 800 },
    { left: 200, top: 200, width: 200, height: 400 });
  assert.ok(fit.focusedScale > fit.initialScale * 1.2);
  assert.equal(fit.focusedScale * 4, 800 * .68);
  assert.ok(fit.focusedScale * 2 < 600 * .78);
});

test('a wide pose retains breathing room on a narrow panel', () => {
  const fit = poseViewFit({ width: 8, height: 1 }, { width: 360, height: 650 },
    { left: 24, top: 305.5, width: 312, height: 39 });
  assert.equal(fit.focusedScale * 8, 360 * .78);
  assert.ok(fit.focusedScale < 650 * .68);
});

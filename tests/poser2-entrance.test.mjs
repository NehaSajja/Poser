import test from 'node:test';
import assert from 'node:assert/strict';
import { startPoseEntrance } from '../src/poser2/poseEntrance.js';

function setup(t, options = {}) {
  let clock = 1000, id = 0, finished = 0;
  const callbacks = new Map(), active = [];
  const originalRAF = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = key => callbacks.delete(key);
  t.after(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCancel;
  });
  t.mock.method(performance, 'now', () => clock);
  const element = { clientWidth: 600, scrollLeft: 0, style: {
    scrollSnapType: 'x mandatory', removeProperty(name) { delete this[name]; },
  } };
  const offsets = Array.from({ length: 12 }, (_, i) => i * 240);
  const entrance = startPoseEntrance({ element, offsets, target: 8,
    onActive: index => active.push(index), onFinish: () => finished++, ...options });
  return { element, active, entrance, callbacks, finished: () => finished,
    step(elapsed) {
      clock = 1000 + elapsed;
      const pending = [...callbacks.values()]; callbacks.clear();
      pending.forEach(callback => callback(clock));
    },
  };
}

test('figures stay hidden while the floor arrives, then pass poses and center the first choice', t => {
  const view = setup(t, { delay: 320 });
  view.step(200);
  assert.equal(view.element.style.visibility, 'hidden');
  assert.equal(view.active.length, 0);
  view.step(320);
  assert.equal(view.element.style.visibility, 'visible');
  assert.equal(view.element.style.transform, 'translateX(600px)');
  for (let elapsed = 340; elapsed <= 1040; elapsed += 20) view.step(elapsed);
  assert.deepEqual(view.active.slice(0, 4), [5, 6, 7, 8]);
  assert.equal(view.element.scrollLeft, 1920);
  assert.equal(view.element.style.scrollSnapType, 'x mandatory');
  assert.equal(view.element.style.transform, undefined);
  assert.equal(view.finished(), 1);
  assert.equal(view.callbacks.size, 0);
});

test('interaction finishes immediately and leaves native scrolling available', t => {
  const view = setup(t);
  view.step(100);
  view.entrance.finish();
  assert.equal(view.element.scrollLeft, 1920);
  assert.equal(view.element.style.visibility, undefined);
  assert.equal(view.element.style.scrollSnapType, 'x mandatory');
  view.step(1000);
  assert.equal(view.finished(), 1);
  assert.equal(view.callbacks.size, 0);
});

test('replaced results cancel their old animation without changing the new selection', t => {
  const view = setup(t);
  view.step(100);
  view.entrance.cancel();
  view.element.scrollLeft = 300;
  view.step(1000);
  assert.equal(view.element.scrollLeft, 300);
  assert.equal(view.finished(), 0);
  assert.equal(view.element.style.transform, undefined);
  assert.equal(view.callbacks.size, 0);
});

test('reduced motion skips both the wait and carousel travel', t => {
  const view = setup(t, { delay: 320, reducedMotion: true });
  view.step(0);
  assert.equal(view.element.scrollLeft, 1920);
  assert.equal(view.finished(), 1);
  assert.equal(view.element.style.transform, undefined);
  assert.equal(view.callbacks.size, 0);
});

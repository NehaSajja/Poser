import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPoseEdit, createPoseHistory, readPoseEdit, writePoseEdit } from '../src/poser2/poseHistory.js';
import { createJointDrag } from '../src/poser2/jointDrag.js';

const pose = angle => [[Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)]];

test('undo and redo restore whole committed poses, and new edits discard the redo branch', () => {
  const history = createPoseHistory(pose(0));
  history.commit(pose(.2)); history.commit(pose(.6));
  assert.deepEqual(history.undo(), pose(.2));
  assert.deepEqual(history.undo(), pose(0));
  assert.equal(history.canUndo, false); assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(), pose(.2));
  assert.deepEqual(history.redo(), pose(.6));
  assert.equal(history.canRedo, false);
  history.undo(); history.commit(pose(.4));
  assert.equal(history.redo(), null);
  assert.deepEqual(history.current, pose(.4));
});

test('no-op clicks retain redo and snapshots cannot mutate the committed pose', () => {
  const history = createPoseHistory(pose(0)), next = pose(.3);
  history.commit(next); next[0][0] = 100;
  assert.deepEqual(history.current, pose(.3));
  history.undo(); history.commit(pose(0));
  assert.equal(history.canRedo, true);
  const read = history.current; read[0][0] = 100;
  assert.deepEqual(history.current, pose(0));
});

test('saved edits reload only for the same source model and valid normalized rotations', () => {
  const map = new Map(), storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  writePoseEdit(storage, '1010-authored', 'source-one', pose(.4));
  assert.deepEqual(readPoseEdit(storage, '1010-authored', 'source-one', 1), pose(.4));
  assert.equal(readPoseEdit(storage, '1010-authored', 'source-two', 1), null);
  assert.equal(readPoseEdit(storage, '1010-authored', 'source-one', 2), null);
  writePoseEdit(storage, '1010-authored', 'source-one', [[1, 1, 1, 1]]);
  assert.equal(readPoseEdit(storage, '1010-authored', 'source-one', 1), null);
  assert.doesNotThrow(() => writePoseEdit(null, 'a', 'b', pose(0)));
});

test('discarding an edit prevents it from reloading and leaves other poses intact', () => {
  const map = new Map(), storage = {
    getItem: key => map.get(key), setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
  };
  writePoseEdit(storage, 'first', 'source', pose(.4));
  writePoseEdit(storage, 'second', 'source', pose(.6));
  clearPoseEdit(storage, 'first');
  assert.equal(readPoseEdit(storage, 'first', 'source', 1), null);
  assert.deepEqual(readPoseEdit(storage, 'second', 'source', 1), pose(.6));
  assert.doesNotThrow(() => clearPoseEdit(null, 'first'));
});

class Surface extends EventTarget {
  captured = null;
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture(id) {
    this.captured = null;
    this.dispatchEvent(pointer('lostpointercapture', { pointerId: id }));
  }
}
function pointer(type, props = {}) {
  return Object.assign(new Event(type, { cancelable: true }),
    { pointerId: 1, button: 0, buttons: 1, pointerType: 'mouse', clientX: 0, ...props });
}
function fixture() {
  const surface = new Surface(), focusWindow = new EventTarget(), history = createPoseHistory(pose(0));
  let current = pose(0), ends = 0;
  const drag = createJointDrag({ surface, focusWindow,
    begin: () => ({ before: current }),
    move: (_active, event) => { current = pose(event.clientX / 100); },
    end: (active, reason) => { ends++; if (reason === 'escape') current = active.before; else history.commit(current); },
  });
  drag.start(pointer('pointerdown'), {});
  surface.dispatchEvent(pointer('pointermove', { clientX: 40 }));
  return { surface, focusWindow, history, drag, get current() { return current; }, get ends() { return ends; } };
}

test('pointerup applies its final coordinates and capture-loss cannot roll the edit back', () => {
  const f = fixture();
  f.surface.dispatchEvent(pointer('pointerup', { clientX: 70, buttons: 0 }));
  f.surface.dispatchEvent(pointer('lostpointercapture'));
  assert.deepEqual(f.current, pose(.7)); assert.deepEqual(f.history.current, pose(.7)); assert.equal(f.ends, 1);
  f.drag.dispose();
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'blur', 'hide', 'dispose']) {
  test(`${interruption} retains the last valid drag and creates one undoable edit`, () => {
    const f = fixture();
    if (interruption === 'blur') f.focusWindow.dispatchEvent(new Event('blur'));
    else if (interruption === 'hide') f.drag.finish('hide');
    else if (interruption === 'dispose') f.drag.dispose();
    else f.surface.dispatchEvent(pointer(interruption));
    assert.deepEqual(f.history.current, pose(.4)); assert.equal(f.ends, 1);
    assert.deepEqual(f.history.undo(), pose(0)); assert.deepEqual(f.history.redo(), pose(.4));
    f.drag.dispose();
  });
}

test('Escape explicitly cancels and a second pointer cannot end the active drag', () => {
  const f = fixture();
  f.surface.dispatchEvent(pointer('pointercancel', { pointerId: 2 }));
  assert.equal(f.ends, 0);
  f.drag.finish('escape');
  assert.deepEqual(f.current, pose(0)); assert.equal(f.history.canUndo, false);
  f.drag.dispose();
});

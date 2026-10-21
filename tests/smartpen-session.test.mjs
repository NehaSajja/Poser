import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmartpenSession, initialPenState } from '../src/smartpen/session.js';

function fixture() {
  const calls = [], events = [], states = [];
  const editor = {
    getCurrentPageId: () => 'page:one', getInstanceState: () => ({ isReadonly: false }),
    inputs: { getIsPointing: () => false }, getViewportPageBounds: () => ({ center: { x: 100, y: 100 } }),
    pageToScreen: p => p, dispatch: e => events.push(e), setCurrentTool() {}, focus() {}, cancel() {},
  };
  const session = createSmartpenSession(editor, state => states.push(state), (callbacks, signal) =>
    new Promise((resolve, reject) => calls.push({ ...callbacks, signal, resolve, reject })));
  return { session, calls, events, get state() { return states.at(-1) ?? initialPenState; } };
}
const dot = dotType => ({ dotType, x: 10, y: 10, f: 256, pageInfo: { page: 1 } });

test('computer input is default and never requests a connection', async () => {
  const f = fixture();
  await f.session.connect();
  assert.equal(f.state.mode, 'computer'); assert.equal(f.calls.length, 0);
  f.session.dispose();
});

test('ready pen input normalizes pressure, and switching to computer finishes ink and disconnects', async () => {
  const f = fixture(); f.session.setMode('smartpen');
  const pending = f.session.connect(), c = f.calls[0];
  c.onDot(dot(0)); assert.equal(f.events.length, 0);
  c.onMessage('settings', { MaxForce: 1024, Battery: 80 });
  c.onMessage('ready');
  let disconnected = 0;
  c.resolve({ disconnect() { disconnected++; c.onClose(); } }); await pending;
  c.onDot(dot(0)); assert.equal(f.events[0].point.z, .25);
  f.session.setMode('computer');
  c.onDot(dot(1));
  assert.deepEqual(f.events.map(e => e.name), ['pointer_down', 'pointer_up']);
  assert.equal(disconnected, 1); assert.equal(c.signal.aborted, true);
  assert.equal(f.state.mode, 'computer'); assert.equal(f.state.status, 'disconnected');
  f.session.dispose();
});

test('cancelling a chooser prevents late resolution or failure from replacing a new connection', async () => {
  const f = fixture(); f.session.setMode('smartpen');
  const first = f.session.connect(), stale = f.calls[0];
  f.session.disconnect(); const second = f.session.connect(), current = f.calls[1];
  stale.onMessage('ready'); stale.onClose();
  stale.reject(new Error('stale failure')); await first;
  assert.equal(f.state.status, 'choosing'); assert.equal(f.state.error, '');
  current.onMessage('ready'); current.resolve({ disconnect() {} }); await second;
  assert.equal(f.state.status, 'ready'); f.session.dispose();
});

test('late chooser selection after returning to computer is immediately disconnected', async () => {
  const f = fixture(); f.session.setMode('smartpen');
  const pending = f.session.connect(); f.session.setMode('computer');
  let disconnected = 0;
  f.calls[0].resolve({ disconnect() { disconnected++; } }); await pending;
  assert.equal(disconnected, 1); assert.equal(f.state.mode, 'computer'); f.session.dispose();
});

test('connection errors survive transport close, cancellation remains quiet, and disposal ends ink', async () => {
  const f = fixture(); f.session.setMode('smartpen');
  const first = f.session.connect(), c = f.calls[0];
  c.onMessage('error', 'Unlock your pen.'); c.onClose(); c.resolve({ disconnect() {} }); await first;
  assert.equal(f.state.error, 'Unlock your pen.');
  const second = f.session.connect(); f.calls[1].reject(Object.assign(new Error(), { name: 'NotFoundError' })); await second;
  assert.equal(f.state.error, '');
  const third = f.session.connect(), ready = f.calls[2];
  ready.onMessage('ready'); ready.resolve({ disconnect() {} }); await third;
  ready.onDot(dot(0)); f.session.dispose(); ready.onDot(dot(1));
  assert.deepEqual(f.events.map(e => e.name), ['pointer_down', 'pointer_up']);
});

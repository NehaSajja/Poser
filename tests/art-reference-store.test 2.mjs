import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceStore } from '../src/poser/references/store.js';
import { referencePosition } from '../src/poser/references/layout.js';

test('prefetch requests four distinct poses at once and selection shares the in-flight work', async () => {
  const calls = [], resolvers = [];
  const store = createReferenceStore(query => { calls.push(query.key); return new Promise(resolve => resolvers.push(resolve)); });
  const data = { results: [1,2,3,4,5].map(id => ({ key: `${id}-authored` })) };
  const entries = store.prefetch(data);
  assert.equal(calls.length, 4);
  assert.equal(store.ensure({ key: '2-authored' }), entries[1]);
  store.prefetch(data); assert.equal(calls.length, 4);
  resolvers.forEach((resolve, i) => resolve([{ id: i }])); await Promise.all(entries.map(entry => entry.promise));
  assert.equal(store.get('2-authored').state.status, 'ready');
  assert.deepEqual(store.get('2-authored').state.images, [{ id: 1 }]);
});
test('finishing an old query cannot overwrite another pose and failed queries can retry', async () => {
  let finish;
  const store = createReferenceStore(query => query.key === 'old' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([{ id: 'new' }]));
  const old = store.ensure({ key: 'old' }), newer = store.ensure({ key: 'new' });
  await newer.promise; finish([{ id: 'old' }]); await old.promise;
  assert.deepEqual(store.get('new').state.images, [{ id: 'new' }]);
  let calls = 0;
  const failing = createReferenceStore(async () => { if (!calls++) throw new Error('temporary'); return []; });
  await failing.ensure({ key: 'retry' }).promise;
  assert.equal(failing.get('retry').state.status, 'error');
  await failing.ensure({ key: 'retry' }, true).promise;
  assert.equal(failing.get('retry').state.status, 'ready');
});
test('the staggered layout has no intersecting artwork cards', () => {
  const boxes = Array.from({ length: 30 }, (_, i) => referencePosition(i));
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const x = boxes[a], y = boxes[b];
    assert.ok(x.x + 224 <= y.x || y.x + 224 <= x.x || x.y + 300 <= y.y || y.y + 300 <= x.y);
  }
});

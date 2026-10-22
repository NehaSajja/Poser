import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceStore } from '../src/poser/references/store.js';
import { createReferenceLayout, visibleReferenceTiles } from '../src/poser/references/layout.js';
import { topReferencePose } from '../src/poser/references/client.js';

test('selection starts only the chosen pose and opening References reuses its job and result', async () => {
  const calls = [];
  let finish;
  const store = createReferenceStore(query => {
    calls.push(query.key);
    return new Promise(resolve => { finish = resolve; });
  });
  const query = topReferencePose({ results: [{ key: '602-authored' }] });
  const selected = store.ensure(query);
  assert.deepEqual(calls, ['602-authored']);
  assert.equal(selected.listeners.size, 0); // References has not opened yet.
  assert.equal(store.ensure(query), selected);
  finish([{ id: 'artwork' }]); await selected.promise;
  assert.equal(store.ensure(query), selected);
  assert.deepEqual(store.get(query.key).state.images, [{ id: 'artwork' }]);
  assert.equal(store.ensure(null), null);
  assert.equal(calls.length, 1);
});

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
test('repeated cards never overlap, including tall titles and negative tile seams', () => {
  for (const count of [1, 2, 4, 30]) {
    const heights = Array.from({ length: count }, (_, i) => i % 4 === 0 ? 470 : 280 + i * 7);
    const layout = createReferenceLayout(heights);
    for (const camera of [{ x: 0, y: 0, z: 1 }, { x: 9523, y: -48213, z: .45 }, { x: -1000000, y: 1000000, z: .1 }]) {
      const tiles = visibleReferenceTiles(layout, camera, { width: 900, height: 700 });
      assert.ok(tiles.length > 0);
      assert.equal(new Set(tiles.map(tile => tile.key)).size, tiles.length);
      assert.ok(tiles.every(tile => tile.index >= 0 && tile.index < count && tile.height === heights[tile.index]));
      for (let a = 0; a < tiles.length; a++) for (let b = a + 1; b < tiles.length; b++) {
        const x = tiles[a], y = tiles[b];
        assert.ok(x.x + layout.width <= y.x || y.x + layout.width <= x.x || x.y + x.height <= y.y || y.y + y.height <= x.y);
      }
    }
  }
});
test('tiling covers each viewport column without depending on distance from the origin', () => {
  const layout = createReferenceLayout([280, 400, 320, 290]);
  const viewport = { width: 1200, height: 900 };
  for (const x of [-1000000, -840, 0, 840, 1000000]) {
    const tiles = visibleReferenceTiles(layout, { x, y: x, z: 1 }, viewport, 0);
    assert.ok(tiles.length < 40);
    for (let screenX = 0; screenX < viewport.width; screenX += 280) {
      assert.ok(tiles.some(tile => Math.abs(tile.x + x - screenX) < 280));
    }
    assert.ok(tiles.some(tile => tile.y + x < 100));
    assert.ok(tiles.some(tile => tile.y + x + tile.height > viewport.height - 100));
  }
  assert.deepEqual(visibleReferenceTiles(createReferenceLayout([]), { x: 0, y: 0, z: 1 }, viewport), []);
});

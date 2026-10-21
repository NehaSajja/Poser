import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DATA_ROOT, loadRetrievalIndex } from '../server/pose-retrieval/search.mjs';
import { getRig, MODEL_FILES, LIBRARY_ROOT } from '../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../server/pose-retrieval/preview.mjs';

test('bundled pose files match their checksums', async () => {
  const root = new URL('../data/', import.meta.url);
  const lines = (await readFile(new URL('SHA256SUMS.txt', root), 'utf8')).trim().split('\n');
  for (const line of lines) {
    const [hash, name] = line.split('  ');
    const actual = createHash('sha256').update(await readFile(new URL(name, root))).digest('hex');
    assert.equal(actual, hash, name);
  }
});

test('a clone contains every indexed preview, scene, and supported rig', async () => {
  const index = await loadRetrievalIndex();
  assert.equal(index.sceneCount, 1361);
  for (const row of index.rows) {
    await access(`${DATA_ROOT}gallery/${row.key}.png`);
    await access(`${LIBRARY_ROOT}/decoded-scenes/${row.pose.file}`);
  }
  for (const model of Object.keys(MODEL_FILES)) {
    assert.ok(getRig(model).bones.size > 0, `${model} FBX parses`);
  }
  for (const id of ['1321', '1010', '201', '2933']) {
    const row = index.rows.find(row => row.id === id && row.view === 'authored');
    assert.ok(row, `Pose ${id} is indexed`);
    const preview = await loadRetrievalPreview(row);
    assert.ok(preview.model.bones.length > 0, `Pose ${id} can be reconstructed`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { restoreMetAssets } from '../scripts/met-assets.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'met-setup-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bundle = join(root, 'data/met-art');
  await mkdir(bundle, { recursive: true });
  const hash = value => createHash('sha256').update(value).digest('hex');
  const parts = ['part1', 'part2'];
  const files = [];
  for (const [index, part] of parts.entries()) {
    const content = `model${index}`;
    await writeFile(join(bundle, part), content);
    files.push({ path: part, bytes: content.length, sha256: hash(content) });
  }
  await writeFile(join(bundle, 'manifest.json'), JSON.stringify({ files, model: { parts, sha256: hash('model0model1') } }));
  return { root, bundle };
}
const silent = { log() {} };

test('fresh setup assembles ordered parts, reruns safely, and repairs damaged local weights', async t => {
  const { root } = await fixture(t);
  const path = await restoreMetAssets(root, silent);
  assert.equal(await readFile(path, 'utf8'), 'model0model1');
  assert.equal(await restoreMetAssets(root, silent), path);
  await writeFile(path, 'broken');
  await restoreMetAssets(root, silent);
  assert.equal(await readFile(path, 'utf8'), 'model0model1');
  assert.deepEqual(await readdir(join(root, '.local/met-art')), ['mobileclip-s1.safetensors']);
});

test('corrupt Git assets fail verification without replacing a working local model', async t => {
  const { root, bundle } = await fixture(t);
  const path = await restoreMetAssets(root, silent);
  await writeFile(join(bundle, 'part2'), 'corrupt');
  await assert.rejects(restoreMetAssets(root, silent), /checksum mismatch/);
  assert.equal(await readFile(path, 'utf8'), 'model0model1');
});

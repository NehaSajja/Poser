import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function restoreMetAssets(root, { log = console.log } = {}) {
  const bundle = join(root, 'data/met-art');
  const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
  log('Checking bundled Met index and model parts…');
  for (const file of manifest.files) {
    if (await sha256(join(bundle, file.path)) !== file.sha256) {
      throw new Error(`Met asset checksum mismatch: ${file.path}. Restore this file from Git and rerun setup.`);
    }
  }
  const destination = join(root, '.local/met-art/mobileclip-s1.safetensors');
  try { if (await sha256(destination) === manifest.model.sha256) return destination; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(join(root, '.local/met-art'), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    for (const [index, part] of manifest.model.parts.entries()) {
      await writeFile(temporary, await readFile(join(bundle, part)), { flag: index ? 'a' : 'w' });
    }
    if (await sha256(temporary) !== manifest.model.sha256) throw new Error('Assembled MobileCLIP checksum mismatch.');
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  log('MobileCLIP weights assembled and verified.');
  return destination;
}

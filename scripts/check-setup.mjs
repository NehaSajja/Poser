import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['.env.local', '.env']) {
  try { process.loadEnvFile(join(root, name)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
try {
  const bundle = join(root, 'data/met-art');
  const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'));
  for (const file of manifest.files) {
    if (statSync(join(bundle, file.path)).size !== file.bytes) throw new Error(`Incomplete Git asset: ${file.path}`);
  }
  if (statSync(join(root, '.local/met-art/mobileclip-s1.safetensors')).size !== manifest.model.bytes) throw new Error('Model needs assembly.');
  if (!process.env.MET_PYTHON && !existsSync(join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'))) {
    throw new Error('Python environment is missing.');
  }
} catch {
  console.error('Reference search needs setup. Run npm run setup once after cloning or pulling the asset bundle, then retry.');
  process.exitCode = 1;
}

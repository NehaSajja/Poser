import { spawnSync } from 'node:child_process';
import { constants, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { restoreMetAssets } from './met-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed. ${result.error?.message || 'See the output above.'}`);
}
function findPython() {
  const argument = process.argv.indexOf('--python');
  const specified = argument >= 0 ? process.argv[argument + 1] : process.env.MET_PYTHON;
  if (argument >= 0 && !specified) throw new Error('Use --python /path/to/python3.');
  const candidates = specified ? [[specified]] : [['python3'], ['python3.13'], ['python3.12'], ['python3.11'], ['python'], ...(process.platform === 'win32' ? [['py', '-3']] : [])];
  for (const [command, ...args] of candidates) {
    const result = spawnSync(command, [...args, '-c', 'import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,13) else 1)']);
    if (!result.error && result.status === 0) return [command, args];
  }
  throw new Error('Python 3.11–3.13 is required. Install Python, then rerun npm run setup (or pass -- --python /path/to/python).');
}

try {
  await restoreMetAssets(root);
  if (!existsSync(runtime)) {
    const [python, args] = findPython();
    console.log('Creating project Python environment…');
    run(python, [...args, '-m', 'venv', '.venv']);
  }
  console.log('Installing reference-search dependencies…');
  run(runtime, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  if (process.platform !== 'darwin') {
    run(runtime, ['-m', 'pip', 'install', 'torch==2.9.0', 'torchvision==0.24.0', '--index-url', 'https://download.pytorch.org/whl/cpu']);
  }
  run(runtime, ['-m', 'pip', 'install', '-r', 'tools/met-art/requirements.txt']);
  run(runtime, ['tools/met-art/verify_setup.py']);
  try { copyFileSync(join(root, '.env.example'), join(root, '.env.local'), constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  console.log('\nReady. Add GEMINI_API_KEY to .env.local, then run npm run dev. Add OPENAI_API_KEY to use Wireframe recognition.');
} catch (error) {
  console.error(`\nSetup failed: ${error.message}`);
  process.exitCode = 1;
}

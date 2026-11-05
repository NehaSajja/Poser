import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

// Explicitly enabled in development or the MHR deployment. Python remains loopback-only.
export async function startMhrExperiment(root) {
  const ready = async () => {
    try { const r = await fetch('http://127.0.0.1:4354/api/flow-meta', { signal: AbortSignal.timeout(500) }); return r.ok && (await r.json()).protocol === 1; }
    catch { return false; }
  };
  if (await ready()) return () => {};
  const required = process.env.MHR_ENABLED === 'true';
  const python = process.env.MHR_PYTHON || resolve(root, '.local/mhr-env/bin/python');
  try { await access(python); await access(process.env.MHR_MODEL_PATH || resolve(root, '.local/mhr/assets/mhr_model.pt')); }
  catch { if (required) throw new Error('MHR runtime or weights are missing.'); console.warn('MHR is not installed. Run npm run setup:mhr; original bodies remain available.'); return () => {}; }
  const child = spawn(python, ['server/experiments/mhr_server.py'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  let failed = false;
  child.once('error', () => { failed = true; }); child.once('exit', () => { failed = true; });
  // Consume Flask output without logging request bodies or credentials.
  child.stderr.on('data', () => {});
  for (let i = 0; i < (required ? 480 : 80) && !failed; i++) {
    if (await ready()) { console.log('MHR corrections ready on localhost.'); return () => child.kill('SIGTERM'); }
    await new Promise(resolve => setTimeout(resolve, 125));
  }
  child.kill('SIGTERM');
  if (required) throw new Error('MHR failed to start.');
  console.warn('MHR could not start on port 4354. Original bodies remain available.');
  return () => {};
}

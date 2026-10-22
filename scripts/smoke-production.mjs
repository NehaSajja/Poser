// Uses no real API credentials and sets both paid-call allowances to zero.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const runtime = await mkdtemp(join(tmpdir(), 'poser-production-'));
const port = Number(process.env.SMOKE_PORT || 4347);
const base = `http://127.0.0.1:${port}`;
let cached;
if (process.env.MET_SMOKE_CACHE) {
  cached = JSON.parse(await readFile(process.env.MET_SMOKE_CACHE, 'utf8'));
  await mkdir(join(runtime, 'met-art/results'), { recursive: true });
  await copyFile(process.env.MET_SMOKE_CACHE, join(runtime, 'met-art/results', basename(process.env.MET_SMOKE_CACHE)));
}
const child = spawn(process.execPath, ['server/index.mjs'], { cwd: resolve(import.meta.dirname, '..'),
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: 'https://poser.example',
    POSER_DATA_DIR: runtime, MET_PORT: String(port + 1), GEMINI_API_KEY: 'test-disabled', OPENAI_API_KEY: '', FAL_KEY: '',
    DAILY_NODE_API_CALLS: '0', DAILY_REFERENCE_API_CALLS: '0', REQUESTS_PER_MINUTE: '12' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
async function request(path, options = {}) {
  return new Promise((accept, reject) => {
    const req = http.request(base + path, { method: options.method || 'GET', headers: { Host: 'poser.example', ...options.headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => accept(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
    });
    req.on('error', reject); req.end(options.body);
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try { if ((await fetch(base + '/healthz')).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, 'Server started');
  assert.match(await (await request('/')).text(), /<html/);
  assert.equal((await request('/api/pose-retrieval/status')).status, 200);
  assert.equal((await request('/api/pose-retrieval/previews/1321-authored.json')).status, 200);
  assert.equal((await request('/api/pose-library/assets/human.fbx')).status, 200);
  assert.equal((await request('/api/pose-retrieval/status', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/pose-retrieval/status', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await request('/api/poser/generate', { method: 'POST' })).status, 404);
  const sketch = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const limited = await request('/api/pose-retrieval/search', { method: 'POST', body: JSON.stringify({ sketch }) });
  assert.equal(limited.status, 429); assert.match((await limited.json()).error, /allowance/);
  if (cached) {
    const response = await request('/api/art-references/search', { method: 'POST', body: JSON.stringify({pose: String(cached.pose.id), view:cached.view}) });
    assert.equal(response.status, 200);
    const job = await response.json(); assert.ok(job.id);
    const result = await (await request(`/api/art-references/jobs/${job.id}`)).json();
    assert.equal(result.status, 'done'); assert.ok(result.images.length > 0);
    console.log(`Historical reference cache served: ${result.images.length} images; no paid calls.`);
  }
  console.log('Production smoke passed: page, pose index, preview, model, origin checks, legacy endpoint block, paid-call allowance.');
} finally {
  const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve(); child.kill('SIGTERM'); await exited;
  await rm(runtime, { recursive: true, force: true });
}

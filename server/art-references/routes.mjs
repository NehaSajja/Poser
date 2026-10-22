import { allowedOrigins, isAllowedRequest } from '../access.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Reuse the playground's warm index and caches. Start it on demand when the
// application is launched on its own, without loading Python into Vite.
export function createReferenceService(root) {
  const base = `http://127.0.0.1:${process.env.MET_PORT || 4318}`;
  let starting, child;
  process.once('exit', () => child?.kill());
  async function ready() {
    try { if ((await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    if (!starting) starting = (async () => {
      const installed = resolve(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      const python = process.env.MET_PYTHON || installed;
      if (!existsSync(python) && !process.env.MET_PYTHON) throw new Error('Run npm run setup to install reference search.');
      child = spawn(python, ['-u', 'tools/met-art/server.py'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
      let failure;
      child.once('error', error => { failure = error; });
      for (let attempt = 0; attempt < 40; attempt++) {
        await delay(250);
        if (failure || child.exitCode !== null) throw new Error('Reference service could not start.');
        try { if ((await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
      }
      child.kill();
      throw new Error('Reference service could not start.');
    })().finally(() => { starting = null; });
    return starting;
  }
  const request = async (path, options) => { await ready(); return fetch(base + path, { ...options, signal: AbortSignal.timeout(15000) }); };
  request.close = () => child?.kill();
  return request;
}

export function artReferenceRoutes({ port, json, request, origins = allowedOrigins(port) }) {
  return async (req, res, path) => {
    if (!path.startsWith('/api/art-references/')) return false;
    if (!isAllowedRequest(req, origins)) {
      json(res, 403, { error: 'Invalid origin.' }); return true;
    }
    try {
      let response;
      const job = /^\/api\/art-references\/jobs\/([a-f0-9]{32})$/.exec(path);
      if (req.method === 'GET' && job) response = await request(`/api/job/${job[1]}`);
      else if (req.method === 'POST' && path === '/api/art-references/search') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) { json(res, 413, { error: 'Request too large.' }); return true; }
        }
        let input;
        try { input = JSON.parse(body); } catch { json(res, 400, { error: 'Invalid query.' }); return true; }
        if (!/^\d+$/.test(String(input?.pose)) || !['authored', 'front'].includes(input?.view)) {
          json(res, 400, { error: 'Invalid pose.' }); return true;
        }
        response = await request('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pose: String(input.pose), view: input.view, mode: 'hybrid' }) });
      } else { json(res, 404, { error: 'Not found.' }); return true; }
      const body = await response.json();
      if (body.status === 'done') {
        if (body.result.warning) {
        const billingBlocked = /\b402\b|Payment Required/i.test(body.result.warning);
        json(res, 200, { status: 'error', error: billingBlocked
          ? 'Gemini returned Payment Required (402). Check the Gemini project billing or credits to enable historical comparisons.'
          : /overall demo allowance/.test(body.result.warning) ? 'The demo’s reference-search allowance has been reached. Ask the owner to extend it.' : /demo allowance/.test(body.result.warning) ? 'Today’s reference-search allowance has been reached. Please try again tomorrow.' : 'References could not load. Try again.' });
      }
        else json(res, 200, { status: 'done', images: body.result.results.filter(row => row.poseScore >= 40).slice(0, 30)
          .map(row => ({ id: row.objectID, title: row.title, src: row.primaryImageSmall || row.primaryImage,
            fullSrc: row.primaryImage || row.primaryImageSmall, score: row.poseScore,
            artist: row.artistDisplayName || '', date: row.objectDate || '', medium: row.medium || '',
            credit: row.creditLine || '', source: row.objectURL || `https://www.metmuseum.org/art/collection/search/${row.objectID}` })) });
      } else json(res, response.status, body);
    } catch { json(res, 503, { error: 'References are unavailable. Try again.' }); }
    return true;
  };
}

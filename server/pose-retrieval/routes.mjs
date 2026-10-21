import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateSketch } from '../poser/pipeline.mjs';
import { DATA_ROOT, loadRetrievalIndex, retrievePoses } from './search.mjs';
import { loadRetrievalPreview } from './preview.mjs';

export function poseRetrievalRoutes({ port, json, key, search = retrievePoses, loadIndex = loadRetrievalIndex, loadPreview = loadRetrievalPreview }) {
  const cache = new Map(); let inFlight = 0;
  const previews = new Map();
  return async (req, res, path) => {
    if (!path.startsWith('/api/pose-retrieval/')) return false;
    const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    if (!origins.some(o => new URL(o).host === req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !origins.includes(req.headers.origin))) {
      json(res, 403, { error: 'Invalid origin.' }); return true;
    }
    const controller = new AbortController(); let counted = false;
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect); req.on('aborted', disconnect);
    try {
      if (req.method === 'GET' && path === '/api/pose-retrieval/status') {
        const index = await loadIndex(); json(res, 200, { configured: Boolean(key), scenes: index.sceneCount }); return true;
      }
      const thumbnail = /^\/api\/pose-retrieval\/thumbnails\/(\d+-(?:authored|front))\.png$/.exec(path);
      const preview = /^\/api\/pose-retrieval\/previews\/(\d+-(?:authored|front))\.json$/.exec(path);
      if (req.method === 'GET' && preview) {
        const index = await loadIndex();
        const row = index.rows.find(item => item.key === preview[1]);
        if (!row) { json(res, 404, { error: 'Pose not found.' }); return true; }
        if (!previews.has(row.key)) {
          previews.set(row.key, loadPreview(row).catch(error => { previews.delete(row.key); throw error; }));
          while (previews.size > 64) previews.delete(previews.keys().next().value);
        }
        json(res, 200, await previews.get(row.key)); return true;
      }
      if (req.method === 'GET' && thumbnail) {
        const index = await loadIndex();
        if (!index.keys.has(thumbnail[1])) { json(res, 404, { error: 'Pose not found.' }); return true; }
        const bytes = await readFile(`${DATA_ROOT}gallery/${thumbnail[1]}.png`);
        if (controller.signal.aborted) return true;
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes); return true;
      }
      if (req.method !== 'POST' || path !== '/api/pose-retrieval/search') { json(res, 404, { error: 'Not found.' }); return true; }
      if (!key) { json(res, 503, { error: 'Add GEMINI_API_KEY to .env.local and restart.' }); return true; }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4_100_000) { json(res, 413, { error: 'Sketch is too large.' }); return true; } }
      let input; try { input = JSON.parse(body); } catch { json(res, 400, { error: 'Invalid JSON.' }); return true; }
      if (!validateSketch(input?.sketch) || input.method !== undefined) { json(res, 400, { error: 'Invalid sketch.' }); return true; }
      const hash = createHash('sha256').update(input.sketch).digest('hex');
      if (cache.has(hash)) { json(res, 200, { ...cache.get(hash), cached: true }); return true; }
      if (inFlight >= 4) { json(res, 429, { error: 'Search is busy. Try again shortly.' }); return true; }
      inFlight++; counted = true;
      const result = await search(input, { key, signal: controller.signal });
      if (!controller.signal.aborted) {
        cache.set(hash, result); while (cache.size > 32) cache.delete(cache.keys().next().value);
        json(res, 200, { ...result, cached: false });
      }
    } catch (error) {
      if (!controller.signal.aborted) json(res, error.status || 502, { error: error.status ? error.message : 'Search could not finish. Your drawing is preserved.' });
    } finally { if (counted) inFlight--; res.off('close', disconnect); req.off('aborted', disconnect); }
    return true;
  };
}

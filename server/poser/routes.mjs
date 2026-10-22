import { allowedOrigins, isAllowedRequest } from '../access.mjs';
import { readFile } from 'node:fs/promises';
import { isJobId } from './jobs.mjs';
import { validateSketch } from './pipeline.mjs';

export function poserRoutes(jobs, port, json, origins = allowedOrigins(port)) {
  return async (req, res, path) => {
    if (!path.startsWith('/api/poser/')) return false;
    if (!isAllowedRequest(req, origins)) {
      json(res, 403, { error: 'Invalid origin.' }); return true;
    }
    try {
      if (path === '/api/poser/generate' && req.method === 'POST') {
        if (!jobs.configured) { json(res, 503, { error: 'Add GEMINI_API_KEY and FAL_KEY to .env.local, then restart the server.' }); return true; }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4_100_000) { json(res, 413, { error: 'Sketch is too large.' }); return true; }
        }
        let input;
        try { input = JSON.parse(body); } catch { json(res, 400, { error: 'Invalid sketch.' }); return true; }
        if (!isJobId(input.id) || !validateSketch(input.sketch)) { json(res, 400, { error: 'Invalid sketch.' }); return true; }
        json(res, 202, await jobs.start(input.id, input.sketch));
      } else if (req.method === 'GET' && /^\/api\/poser\/(jobs|models)\//.test(path)) {
        const [, , , type, id] = path.split('/');
        if (!isJobId(id) || path.split('/').length !== 5) { json(res, 404, { error: 'Generation not found.' }); return true; }
        if (type === 'jobs') {
          const job = jobs.get(id);
          json(res, job ? 200 : 404, job || { error: 'Generation not found.' });
        } else {
          const file = jobs.modelPath(id);
          if (!file) { json(res, 404, { error: 'Model not found.' }); return true; }
          const bytes = await readFile(file);
          res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
          res.end(bytes);
        }
      } else json(res, 404, { error: 'Not found.' });
    } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Generation could not be started. Your sketch is preserved.' }); }
    return true;
  };
}

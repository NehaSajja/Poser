import { readFile } from 'node:fs/promises';
import { getAssetPath } from './skeleton.mjs';

// Only the rig assets are shared with the current carousel. The old detector,
// fitting, joint-correction, and rig-edit HTTP endpoints have been removed.
export function poseAssetRoutes({ port, json, readAsset = model => readFile(getAssetPath(model)) }) {
  return async (req, res, path) => {
    if (!path.startsWith('/api/pose-library/')) return false;
    const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    if (!origins.some(origin => new URL(origin).host === req.headers.host)
      || req.headers['sec-fetch-site'] === 'cross-site'
      || (req.headers.origin && !origins.includes(req.headers.origin))) {
      json(res, 403, { error: 'Invalid origin.' }); return true;
    }
    const asset = /^\/api\/pose-library\/assets\/(female|male|human)\.fbx$/.exec(path);
    if (req.method !== 'GET' || !asset) { json(res, 404, { error: 'Not found.' }); return true; }
    try {
      const bytes = await readAsset(asset[1]);
      if (!res.destroyed) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length,
          'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        res.end(bytes);
      }
    } catch { if (!res.destroyed) json(res, 503, { error: 'Pose model unavailable.' }); }
    return true;
  };
}

import { isAllowedRequest } from '../access.mjs';

// The browser uses the same origin as Poser; Python stays private on loopback.
// Limit expensive work by concurrency, not per-minute counts (sliders are continuous).
export function createMhrProxy({ enabled, origins, json, allowBench = false, fetcher = fetch, maxPending = 8, ready = Promise.resolve(), remote = false }) {
  let pending = 0;
  return async (req, res, path) => {
    if (!path.startsWith('/mhr-experiment/')) return false;
    if (!enabled) { json(res, 404, { error: 'Not found.' }); return true; }
    if (!isAllowedRequest(req, origins)) { json(res, 403, { error: 'Invalid origin.' }); return true; }
    const endpoint = path.slice('/mhr-experiment'.length);
    const endpoints = { '/api/flow-meta': 'GET', '/api/topology': 'GET', '/api/flow': 'POST', ...(allowBench ? {'/api/meta':'GET','/api/evaluate':'POST','/api/shape':'POST'} : {}) };
    const method = endpoints[endpoint];
    if (!method) { json(res, 404, { error: 'Not found.' }); return true; }
    if (req.method !== method) { json(res, 405, { error: `Use ${method}.` }); return true; }
    if (pending >= maxPending) { res.setHeader('Retry-After', '2'); json(res, 503, { error: 'Body controls are busy. Try again shortly.' }); return true; }
    pending++;
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    req.on('aborted', disconnect); res.on('close', disconnect);
    try {
      let body;
      if (method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32768) { json(res, 413, { error: 'Body request is too large.' }); return true; }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      await ready;
      if (controller.signal.aborted) return true;
      const base = remote ? 'https://poser-demo.fly.dev/mhr-experiment' : 'http://127.0.0.1:4354';
      const upstream = await fetcher(`${base}${endpoint}`, {
        method, body, headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
      });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (!res.destroyed && !res.writableEnded) {
        res.statusCode = upstream.status;
        for (const name of ['content-type', 'x-mhr-ms', 'x-mhr-fit']) {
          const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
        }
        res.setHeader('Cache-Control', 'no-store'); res.end(bytes);
      }
    } catch {
      json(res, 503, { error: 'Body controls are temporarily unavailable. Please try again.' });
    } finally {
      pending--; req.off('aborted', disconnect); res.off('close', disconnect);
    }
    return true;
  };
}

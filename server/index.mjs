import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePayload } from './decisions.mjs';
import { recognize } from './recognize.mjs';
import { createPoseJobs } from './poser/jobs.mjs';
import { poserRoutes } from './poser/routes.mjs';
import { poseAssetRoutes } from './pose-library/routes.mjs';
import { poseRetrievalRoutes } from './pose-retrieval/routes.mjs';
import { artReferenceRoutes, createReferenceService } from './art-references/routes.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const filename of ['.env.local', '.env']) {
  try { process.loadEnvFile(resolve(root, filename)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const provider = process.env.DECISIONS_PROVIDER || 'openai';
if (!['openai','openrouter'].includes(provider)) throw new Error('DECISIONS_PROVIDER must be openai or openrouter.');
const key = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY;
const port = Number(process.env.PORT || 4317);
const vite = process.env.NODE_ENV !== 'production' ? await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'spa' }) : null;
const json = (res, status, data) => { if(res.destroyed||res.writableEnded)return; res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)); };
const poseJobs = await createPoseJobs({ directory: resolve(root, '.local/poser'), reference: await readFile(resolve(root, 'server/poser/body-reference.png')), geminiKey: process.env.GEMINI_API_KEY, falKey: process.env.FAL_KEY });
const handlePoser = poserRoutes(poseJobs, port, json);
const handlePoseAssets = poseAssetRoutes({ port, json });
const handlePoseRetrieval = poseRetrievalRoutes({port,json,key:process.env.GEMINI_API_KEY});
const handleArtReferences = artReferenceRoutes({ port, json, request: createReferenceService(root) });
let inFlight = 0;
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && /^\/pose-compare\/?$/.test(path)) {
    res.writeHead(307, { Location: '/?medium=poser2' }); res.end(); return;
  }
  if (await handlePoseRetrieval(req, res, path)) return;
  if (await handleArtReferences(req, res, path)) return;
  if (await handlePoseAssets(req, res, path)) return;
  if (await handlePoser(req, res, path)) return;
  if (path === '/api/status') return json(res, 200, { configured: Boolean(key), provider, model: process.env.DECISIONS_MODEL || (provider === 'openai' ? 'gpt-6-luna' : 'typesafe/jev-1.14') });
  if (path === '/api/recognize') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
    if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Invalid origin.' });
    if (!key) return json(res, 503, { error: 'Add your API key to .env.local, then restart the server.' });
    if (inFlight >= 3) return json(res, 429, { error: 'Recognition is busy. Try again.' });
    inFlight++;
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    req.on('aborted', disconnect);
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1800000) { json(res, 413, { error: 'Sketch is too large.' }); return; } }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON.' }); }
      if (!validatePayload(input)) return json(res, 400, { error: 'Invalid sketch image.' });
      const result=await recognize(input,{provider,model:process.env.DECISIONS_MODEL,evaluate:async request=>{
        const upstream=await fetch(provider==='openai'?'https://api.openai.com/v1/decisions':'https://openrouter.ai/api/alpha/decisions',{
          method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
          body:JSON.stringify(request),signal:AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if(!upstream.ok){const error=new Error('Provider error');error.status=upstream.status;throw error;}
        return upstream.json();
      }});
      json(res, 200, result);
    } catch (error) {
      const messages={401:'API key was rejected. Check .env.local.',403:'This key cannot access the Decisions API.',429:'API limit reached. Try again shortly.'};
      json(res, 502, { error: messages[error.status] || (error.name === 'TimeoutError' ? 'Recognition timed out. Your sketch is preserved.' : 'Recognition failed. Your sketch is preserved.') }); }
    finally { inFlight--; res.off('close', disconnect); req.off('aborted', disconnect); }
    return;
  }
  if (path.startsWith('/api/')) return json(res, 404, {error:'Not found.'});
  if (vite) return vite.middlewares(req, res);
  try {
    const file = ['/', '/tldraw', '/tldraw/'].includes(path) ? 'index.html' : path.slice(1);
    const full = resolve(root, 'dist', file);
    if (!full.startsWith(resolve(root, 'dist') + '/')) return json(res, 403, {error:'Forbidden.'});
    const bytes = await readFile(full);
    res.writeHead(200, { 'Content-Type': { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2' }[extname(full)] || 'application/octet-stream' }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Sketch: http://127.0.0.1:${port} · ${key ? provider : 'local shape recognition'}`));

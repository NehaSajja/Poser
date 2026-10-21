import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { rankLibraryPoses, retrievePoses } from '../server/pose-retrieval/search.mjs';
import { poseRetrievalRoutes } from '../server/pose-retrieval/routes.mjs';
import { createRetrievalSession } from '../src/poser/retrievalSession.js';

const sketch = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const row = (id, view, values, model = 'female') => ({ id, key: `${id}-${view}`, view, values, pose: { name: id, model } });
const index = { rows: [row('1', 'front', [1,0]), row('1', 'authored', [0,1]), row('2', 'front', [.8,.6], 'male')], sceneCount: 2, dimensions: 2, model: 'embedding-test', captionModel: 'caption-test', prompt: 'Describe the pose.' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('retrieval selects the best view, includes both models, and limits to six distinct poses', () => {
  const result = rankLibraryPoses(index, [0,4]);
  assert.deepEqual(result.map(r => [r.id,r.view,r.model]), [['1','authored','female'],['2','front','male']]);
  assert.equal(result[0].thumbnail, '/api/pose-retrieval/thumbnails/1-authored.png');
  const larger = { ...index, rows: [...index.rows, ...Array.from({length: 8}, (_, i) => row(String(i+3), 'front', [1,0]))] };
  assert.equal(rankLibraryPoses(larger, [0,1]).length, 6);
  assert.throws(() => rankLibraryPoses(index, [NaN,0]));
});

test('search captions the sketch then jointly embeds that description and the same sketch', async () => {
  const calls = [];
  const result = await retrievePoses({ sketch }, { key: 'private', loadIndex: async () => index, fetcher: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({url,body});
    return { ok: true, json: async () => url.endsWith('generateContent') ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ readable: true, description: 'Arms overhead.' }) }] } }] } : { embedding: { values: [0,1] } } };
  } });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith('caption-test:generateContent'));
  assert.equal(calls[0].body.contents[0].parts[0].inlineData.data, sketch.slice(22));
  assert.deepEqual(calls[1].body.content.parts, [{ text: 'Arms overhead.' }, { inlineData: { mimeType: 'image/png', data: sketch.slice(22) } }]);
  assert.equal(result.description, 'Arms overhead.');
  assert.equal(result.results[0].id, '1');
});

test('unreadable drawings do not proceed to embedding or return arbitrary poses', async () => {
  let calls = 0;
  await assert.rejects(retrievePoses({ sketch }, { key: 'private', loadIndex: async () => index, fetcher: async () => {
    calls++;
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ readable: false, description: '' }) }] } }] }) };
  } }), { status: 422 });
  assert.equal(calls, 1);
});

test('each search makes one capture and one request', async () => {
  let captures = 0, requests = 0; const seen = [];
  const session = createRetrievalSession({ capture: async () => { captures++; return sketch; }, request: async payload => {
    requests++; assert.deepEqual(payload, { sketch }); return { id: 'match' };
  }, onStart() {}, onResult: r => seen.push(r.id), onError: () => assert.fail() });
  await session.run(); assert.equal(captures, 1); assert.equal(requests, 1); assert.deepEqual(seen, ['match']);
});

test('editing, clearing, or leaving the medium cancels a request and ignores its late success', async () => {
  const pending = deferred(), seen = []; let signal;
  const session = createRetrievalSession({ capture: async () => sketch, request: (_p,s) => { signal = s; return pending.promise; }, onStart() {}, onResult: r => seen.push(r), onError: () => assert.fail() });
  const running = session.run(); await flush(); session.cancel();
  assert.ok(signal.aborted); pending.resolve({ id: 'stale' }); await running; assert.deepEqual(seen, []);
});

test('cancel during image capture never sends an obsolete query', async () => {
  const capture = deferred(); let requests = 0;
  const session = createRetrievalSession({ capture: () => capture.promise, request: async () => { requests++; }, onStart() {}, onResult() {}, onError() {} });
  const running = session.run(); session.cancel(); capture.resolve(sketch); await running; assert.equal(requests, 0);
});

test('an old request finishing cannot supersede or stop cancellation of the current request', async () => {
  const first = deferred(), second = deferred(), seen = [], signals = [];
  const session = createRetrievalSession({ capture: async () => sketch, request: (_p,s) => { signals.push(s); return signals.length === 1 ? first.promise : second.promise; }, onStart() {}, onResult: r => seen.push(r.id), onError: () => assert.fail() });
  const a = session.run(); await flush(); const b = session.run(); await flush();
  first.resolve({id: 'old'}); await a;
  assert.equal(session.cancel(), true); assert.equal(signals[1].aborted, true);
  second.resolve({id: 'new'}); await b; assert.deepEqual(seen, []);
});

test('endpoint validates inputs, caches the single search path, and rejects other origins', async t => {
  let route, calls = 0;
  const server = http.createServer((req,res) => route(req,res,new URL(req.url,'http://localhost').pathname));
  await new Promise(r => server.listen(0,'127.0.0.1',r)); t.after(() => new Promise(r => server.close(r)));
  const port = server.address().port;
  route = poseRetrievalRoutes({ port, key: 'private', json: (res,status,body) => { res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body)); }, search: async input => { calls++; assert.deepEqual(input, { sketch }); return { results: [] }; }, loadIndex: async () => index });
  const request = (body, headers={}) => fetch(`http://127.0.0.1:${port}/api/pose-retrieval/search`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await request({sketch,method:'image'})).status, 400);
  assert.equal((await request({sketch:'not-png'})).status, 400);
  assert.equal((await request({sketch},{Origin:'https://example.com'})).status, 403);
  assert.equal((await request({sketch})).status, 200);
  assert.equal((await (await request({sketch})).json()).cached, true);
  assert.equal(calls, 1);
});

test('3D previews only load indexed poses and share cached pose descriptions', async t => {
  let route, loads = 0;
  const server = http.createServer((req, res) => route(req, res, new URL(req.url, 'http://localhost').pathname));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  route = poseRetrievalRoutes({ port, key: '', loadIndex: async () => index,
    json: (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); },
    loadPreview: async row => { loads++; return { model: row.pose.model, view: row.view }; },
  });
  const get = (key, headers) => fetch(`http://127.0.0.1:${port}/api/pose-retrieval/previews/${key}.json`, { headers });
  assert.deepEqual(await (await get('1-authored')).json(), { model: 'female', view: 'authored' });
  assert.equal((await get('1-authored')).status, 200);
  assert.equal(loads, 1);
  assert.equal((await get('999-front')).status, 404);
  assert.equal((await get('1-other')).status, 404);
  assert.equal((await get('1-front', { Origin: 'https://example.com' })).status, 403);
  assert.equal(loads, 1);
});

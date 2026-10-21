import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { artReferenceRoutes } from '../server/art-references/routes.mjs';
import { topReferencePose, requestReferences } from '../src/poser/references/client.js';

const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
async function route({ method = 'POST', path = '/api/art-references/search', body, headers = {}, request }) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.method = method; req.headers = { host: '127.0.0.1:4317', ...headers };
  let output;
  const handler = artReferenceRoutes({ port: 4317, json: (_, status, data) => { output = { status, data }; }, request });
  await handler(req, {}, path); return output;
}
test('reference query retains the highest-ranked pose camera, not a fallback render', () => {
  assert.deepEqual(topReferencePose({ results: [{ key: '1321-front' }, { key: '1010-authored' }] }), { pose: '1321', view: 'front', key: '1321-front' });
  assert.equal(topReferencePose(null), null);
  assert.equal(topReferencePose({ results: [{ key: '../../secret' }] }), null);
});
test('proxy forwards a validated pose with hybrid retrieval', async () => {
  const out = await route({ body: { pose: '1321', view: 'front', mode: 'image' }, request: async (path, options) => {
    assert.equal(path, '/api/search');
    assert.deepEqual(JSON.parse(options.body), { pose: '1321', view: 'front', mode: 'hybrid' });
    return response({ id: 'a'.repeat(32) });
  } });
  assert.equal(out.status, 200);
});
test('proxy denies foreign origins and invalid queries without invoking the worker', async () => {
  const request = () => assert.fail('worker should not be called');
  assert.equal((await route({ headers: { origin: 'https://foreign.test' }, request })).status, 403);
  assert.equal((await route({ body: { pose: '../../', view: 'front' }, request })).status, 400);
});
test('completed jobs expose at most 30 passing image references', async () => {
  const out = await route({ method: 'GET', path: '/api/art-references/jobs/' + 'a'.repeat(32), request: async () => response({ status: 'done', result: {
    results: Array.from({ length: 35 }, (_, id) => ({ objectID: id, title: `Art ${id}`, poseScore: id ? 70 : 20, primaryImageSmall: 'https://images.metmuseum.org/art.jpg' })),
  } }) });
  assert.equal(out.data.images.length, 30); assert.equal(out.data.images[0].id, 1);
  assert.equal(out.data.images[0].score, 70);
  assert.equal(out.data.images[0].source, 'https://www.metmuseum.org/art/collection/search/1');
  assert.equal(out.data.images[0].artist, '');
});
test('comparison failures surface as errors rather than empty successful canvases', async () => {
  const out = await route({ method: 'GET', path: '/api/art-references/jobs/' + 'a'.repeat(32), request: async () => response({ status: 'done', result: { warning: 'API unavailable' } }) });
  assert.equal(out.data.status, 'error');
});
test('client sends the chosen pose and resolves its completed job', async () => {
  const calls = [];
  const result = await requestReferences({ pose: '1010', view: 'authored' }, new AbortController().signal, async (path, options) => {
    calls.push([path, options]);
    return response(calls.length === 1 ? { id: '123' } : { status: 'done', images: [{ id: 1 }] });
  });
  assert.deepEqual(JSON.parse(calls[0][1].body), { pose: '1010', view: 'authored' });
  assert.equal(calls[1][0], '/api/art-references/jobs/123'); assert.deepEqual(result, [{ id: 1 }]);
});

test('billing rejection is actionable and never displayed as a successful empty result', async () => {
  const out = await route({ method: 'GET', path: '/api/art-references/jobs/' + 'a'.repeat(32), request: async () => response({ status: 'done', result: { warning: 'Visual comparison unavailable: 402 Client Error: Payment Required for url: ' } }) });
  assert.equal(out.data.status, 'error');
  assert.match(out.data.error, /Payment Required \(402\)/);
  assert.match(out.data.error, /billing or credits/);
  assert.equal(out.data.images, undefined);
});

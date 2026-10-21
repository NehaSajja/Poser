import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { finalImage, generatePose, MODELS, modelUrl, queueUrl, validateSketch } from '../server/poser/pipeline.mjs';
import { createPoseJobs } from '../server/poser/jobs.mjs';
import { poserRoutes } from '../server/poser/routes.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=';
const sketch = `data:image/png;base64,${png}`;
const gemini = parts => ({ candidates: [{ finishReason: 'STOP', content: { parts } }] });

test('Poser accepts bounded PNG sketches and rejects files or URLs', () => {
  assert.ok(validateSketch(sketch));
  assert.equal(validateSketch('https://example.com/sketch.png'), false);
  assert.equal(validateSketch('data:image/png;base64,aGVsbG8='), false);
  const huge = Buffer.from(png, 'base64'); huge.writeUInt32BE(99999, 16);
  assert.equal(validateSketch(`data:image/png;base64,${huge.toString('base64')}`), false);
});

test('only a completed final Gemini image can reach reconstruction', () => {
  const final = { mimeType: 'image/png', data: png };
  assert.deepEqual(finalImage(gemini([{ thought: true, inlineData: { mimeType: 'image/png', data: 'thought' } }, { inlineData: final }])), final);
  assert.throws(() => finalImage(gemini([{ thought: true, inlineData: final }])));
  assert.throws(() => finalImage({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ inlineData: final }] } }] }));
});

test('provider URLs cannot redirect keys or fetch arbitrary model hosts', () => {
  assert.equal(queueUrl('https://queue.fal.run/example'), 'https://queue.fal.run/example');
  for (const url of ['https://evil.test/queue.fal.run', 'https://user@queue.fal.run/x', 'http://queue.fal.run/x']) assert.throws(() => queueUrl(url));
  assert.equal(modelUrl('https://v3.fal.media/pose.glb'), 'https://v3.fal.media/pose.glb');
  for (const url of ['http://localhost/model.glb', 'https://fal.media.evil.test/model.glb', 'https://fal.media:9999/model.glb']) assert.throws(() => modelUrl(url));
});

test('default recipe interprets tldraw PNG, generates mannequin, then queues and downloads GLB once', async () => {
  const model = Buffer.alloc(24); model.write('glTF'); model.writeUInt32LE(2, 4);
  const calls = [], stages = [];
  const replies = [gemini([{ text: 'Arm raised screen-left.' }]), gemini([{ inlineData: { mimeType: 'image/png', data: png } }]),
    { request_id: 'req-1', status_url: 'https://queue.fal.run/request/status', response_url: 'https://queue.fal.run/request' },
    { status: 'IN_PROGRESS' }, { status: 'COMPLETED' }, { model_glb: { url: 'https://v3.fal.media/model.glb' }, metadata: { num_people: 1 } }, model];
  const result = await generatePose(sketch, { geminiKey: 'test-gemini', falKey: 'test-fal', reference: Buffer.from(png, 'base64'), sleep: async () => {},
    onStage: async (stage) => stages.push(stage), fetcher: async (url, options) => {
      calls.push({ url, ...options }); const reply = replies.shift();
      return new Response(Buffer.isBuffer(reply) ? reply : JSON.stringify(reply));
    } });
  assert.deepEqual(result, model);
  assert.match(calls[0].url, new RegExp(MODELS.pose));
  assert.match(calls[1].url, new RegExp(MODELS.image));
  assert.equal(calls[2].url, `https://queue.fal.run/${MODELS.body}`);
  assert.equal(JSON.parse(calls[2].body).image_url, sketch);
  assert.equal(JSON.parse(calls[2].body).include_3d_keypoints, false);
  assert.equal(calls[2].headers['X-Fal-No-Retry'], '1');
  assert.equal(calls[6].headers, undefined);
  assert.ok(calls.every(call => call.redirect === 'error'));
  assert.deepEqual(stages, ['interpreting','rendering','reconstructing','reconstructing','loading']);
});

test('jobs deduplicate submission and preserve the completed model across restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sketch-poser-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let release, count = 0;
  const options = { directory, reference: Buffer.from(png, 'base64'), geminiKey: 'test', falKey: 'test', generate: async () => { count++; return new Promise(resolve => { release = resolve; }); } };
  const jobs = await createPoseJobs(options), id = randomUUID();
  await jobs.start(id, sketch);
  await jobs.start(id, sketch);
  await assert.rejects(jobs.start(randomUUID(), sketch), { status: 409 });
  assert.equal(count, 1);
  release(Buffer.from('test model'));
  for (let i = 0; i < 100 && jobs.get(id).status !== 'complete'; i++) await delay(5);
  assert.equal(jobs.get(id).status, 'complete');
  assert.equal((await readFile(jobs.modelPath(id))).toString(), 'test model');
  // Wait for the final atomic job record before simulating a new server.
  for (let i = 0; i < 100; i++) { if (JSON.parse(await readFile(join(directory, `${id}.json`))).status === 'complete') break; await delay(5); }
  const restored = await createPoseJobs(options);
  assert.equal(restored.get(id).status, 'complete');
  await restored.start(id, sketch);
  assert.equal(count, 1);
});

test('interrupted jobs never automatically resubmit paid work on restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sketch-poser-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const id = randomUUID();
  await writeFile(join(directory, `${id}.json`), JSON.stringify({ id, status: 'reconstructing', requestId: 'already-submitted' }));
  const jobs = await createPoseJobs({ directory, generate: () => assert.fail('must not resubmit') });
  assert.equal(jobs.get(id).status, 'failed');
  assert.match(jobs.get(id).error, /restart/);
});

test('Poser endpoints reject cross-origin submissions and resolve model/job paths correctly', async () => {
  const id = randomUUID(), results = [];
  const route = poserRoutes({ get: value => ({ id: value, status: 'queued' }) }, 4317, (_, code, data) => results.push({ code, data }));
  await route({ method: 'POST', headers: { host: '127.0.0.1:4317', origin: 'https://other.test' } }, {}, '/api/poser/generate');
  assert.equal(results.pop().code, 403);
  await route({ method: 'GET', headers: { host: '127.0.0.1:4317' } }, {}, `/api/poser/jobs/${id}`);
  assert.deepEqual(results.pop(), { code: 200, data: { id, status: 'queued' } });
});

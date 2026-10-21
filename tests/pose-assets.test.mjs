import test from 'node:test';
import assert from 'node:assert/strict';
import { poseAssetRoutes } from '../server/pose-library/routes.mjs';

test('retained asset route serves only known rigs and rejects cross-origin access', async () => {
  let status, body, reads = 0;
  const route = poseAssetRoutes({ port: 4317, json: (_res, code, data) => { status = code; body = data; },
    readAsset: async model => { reads++; return Buffer.from(model); } });
  const request = { method: 'GET', headers: { host: '127.0.0.1:4317' } };
  const response = { writeHead: code => { status = code; }, end: bytes => { body = bytes; } };
  await route(request, response, '/api/pose-library/assets/female.fbx');
  assert.equal(status, 200); assert.equal(body.toString(), 'female');
  await route(request, response, '/api/pose-library/assets/human.fbx');
  assert.equal(status, 200); assert.equal(body.toString(), 'human');
  await route(request, response, '/api/pose-library/status'); assert.equal(status, 404);
  await route(request, response, '/api/pose-library/assets/unknown.fbx'); assert.equal(status, 404);
  await route({ ...request, headers: { ...request.headers, origin: 'https://other.test' } }, response, '/api/pose-library/assets/male.fbx');
  assert.equal(status, 403); assert.equal(reads, 2);
  assert.equal(await route(request, response, '/api/pose-search'), false);
});

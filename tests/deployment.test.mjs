import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowedOrigins, isAllowedRequest } from '../server/access.mjs';
import { createDailyQuota, createVisitorLimiter, clientAddress } from '../server/usage.mjs';
import { retrievePoses } from '../server/pose-retrieval/search.mjs';

test('public origin permits the configured host and rejects forged hosts and cross-site requests', () => {
  const origins = allowedOrigins(8080, { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://poser.example', RAILWAY_PUBLIC_DOMAIN: 'poser.up.railway.app' });
  const req = headers => ({ headers });
  assert.ok(isAllowedRequest(req({host:'poser.example',origin:'https://poser.example'}),origins));
  assert.ok(isAllowedRequest(req({host:'poser.up.railway.app'}),origins));
  assert.equal(isAllowedRequest(req({host:'evil.example',origin:'https://poser.example'}),origins),false);
  assert.equal(isAllowedRequest(req({host:'poser.example',origin:'https://evil.example'}),origins),false);
  assert.equal(isAllowedRequest(req({host:'poser.example','sec-fetch-site':'cross-site'}),origins),false);
  assert.equal(isAllowedRequest(req({host:'localhost:8080'}),origins),false);
  assert.deepEqual(allowedOrigins(8080,{NODE_ENV:'production'}),[]);
  assert.throws(()=>allowedOrigins(8080,{PUBLIC_ORIGIN:'https://poser.example/path'}));
});
test('concurrent quota reservations stop at limit, survive restart, and reset next UTC day', async () => {
  const dir=mkdtempSync(join(tmpdir(),'poser-usage-')); const file=join(dir,'usage.json');
  let day='2026-10-21';const now=()=>new Date(`${day}T12:00:00Z`);
  try {
    const reserve=createDailyQuota({file,limit:3,now});
    const results=await Promise.allSettled(Array.from({length:10},async()=>reserve()));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
    const restarted=createDailyQuota({file,limit:3,now});
    assert.throws(restarted,{status:429});
    day='2026-10-22';restarted();
    assert.throws(createDailyQuota({file,limit:0,now}),{status:429});
    writeFileSync(file,'broken');assert.throws(()=>createDailyQuota({file,limit:3,now}));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('visitor limits reset after window; proxy headers only trusted explicitly', () => {
  let time=0;const allow=createVisitorLimiter({limit:2,now:()=>time,windowMs:1000,maxVisitors:2});
  assert.ok(allow('a'));assert.ok(allow('a'));assert.equal(allow('a'),false);assert.ok(allow('b'));assert.equal(allow('c'),false);
  time=1001;assert.ok(allow('a'));
  const req={headers:{'x-real-ip':'192.0.2.1'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(clientAddress(req),'127.0.0.1');assert.equal(clientAddress(req,true),'192.0.2.1');
});
test('exhausted allowance blocks the provider before any network call', async () => {
  await assert.rejects(retrievePoses({sketch:'data:image/png;base64,abc'}, {
    key:'test',loadIndex:async()=>({captionModel:'test'}),
    beforeProviderCall:()=>{throw Object.assign(new Error('limit'),{status:429});},
    fetcher:()=>assert.fail('Provider must not be called'),
  }),{status:429});
});


test('Fly domain and proxy address are trusted only when explicitly configured', () => {
  const origins = allowedOrigins(8080, { NODE_ENV:'production', FLY_APP_NAME:'poser-class-demo' });
  assert.deepEqual(origins, ['https://poser-class-demo.fly.dev']);
  assert.ok(isAllowedRequest({headers:{host:'poser-class-demo.fly.dev',origin:'https://poser-class-demo.fly.dev'}}, origins));
  const req={headers:{'fly-client-ip':'192.0.2.2','x-real-ip':'192.0.2.3'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(clientAddress(req,'fly'),'192.0.2.2');
  assert.equal(clientAddress(req),'127.0.0.1');
  req.headers['fly-client-ip']='invalid';assert.equal(clientAddress(req,'fly'),'127.0.0.1');
});

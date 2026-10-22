import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReferenceService } from '../server/art-references/routes.mjs';

test('a busy owned Python service is reused after a request timeout', async () => {
  const root=mkdtempSync(join(tmpdir(),'poser-service-'));
  mkdirSync(join(root,'.venv/bin'),{recursive:true});writeFileSync(join(root,'.venv/bin/python'),'');
  let starts=0,probes=0,calls=0;
  const child=new EventEmitter();child.exitCode=null;child.killed=false;child.kill=()=>{child.killed=true;};
  const request=createReferenceService(root,{
    spawnProcess:()=>{starts++;return child;},wait:async()=>{},
    fetcher:async url=>{
      if(url.endsWith('/api/status')) {probes++;if(probes!==2)throw new Error('Slow probe');return {ok:true};}
      calls++;if(calls===2)throw new Error('Slow response');return {ok:true};
    },
  });
  try {
    await request('/api/search');
    await assert.rejects(request('/api/job/test'),/Slow response/);
    await request('/api/job/test');
    assert.equal(starts,1);assert.equal(probes,2);assert.equal(calls,3);
  } finally {request.close();rmSync(root,{recursive:true,force:true});}
});

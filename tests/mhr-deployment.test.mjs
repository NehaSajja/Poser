import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createMhrProxy } from '../server/experiments/mhr-proxy.mjs';

const json=(res,status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
function response(){const res=new EventEmitter();res.headers={};res.setHeader=(k,v)=>res.headers[k]=v;res.end=body=>{res.body=body;res.writableEnded=true;};return res;}
function request(method='GET',body='',origin='https://poser-demo.fly.dev'){
 const req=Readable.from(body?[Buffer.from(body)]:[]);req.method=method;req.headers={host:'poser-demo.fly.dev',origin};return req;
}
const options={enabled:true,origins:['https://poser-demo.fly.dev'],json};
test('MHR proxy rejects foreign origins, unsupported methods, large bodies and bench routes before reaching Python',async()=>{
 const proxy=createMhrProxy({...options,fetcher:()=>assert.fail('No upstream request allowed')});
 for(const [path,req,status] of [
  ['/api/flow',request('POST','{}','https://elsewhere.example'),403],
  ['/api/flow',request(),405],['/api/shape',request('POST','{}'),404],
  ['/api/flow',request('POST','x'.repeat(32769)),413],
 ]){const res=response();assert.equal(await proxy(req,res,'/mhr-experiment'+path),true);assert.equal(res.statusCode,status);}
});
test('MHR proxy preserves body, binary surface and timing without forwarding browser credentials',async()=>{
 const payload=Buffer.from([0,1,2,255]);let seen;
 const proxy=createMhrProxy({...options,fetcher:async(url,init)=>{seen={url,init};return new Response(payload,{headers:{'Content-Type':'application/octet-stream','X-MHR-MS':'18'}});}});
 const res=response();await proxy(request('POST','{"params":[]}'),res,'/mhr-experiment/api/flow');
 assert.equal(seen.url,'http://127.0.0.1:4354/api/flow');assert.equal(seen.init.body.toString(),'{"params":[]}');
 assert.deepEqual(Object.keys(seen.init.headers),['Content-Type']);assert.deepEqual(res.body,payload);assert.equal(res.headers['x-mhr-ms'],'18');
});
test('MHR has a bounded work queue and recovers capacity after upstream failure',async()=>{
 let reject;let calls=0;
 const proxy=createMhrProxy({...options,maxPending:1,fetcher:()=>{calls++;return new Promise((_,r)=>reject=r);}});
 const first=response();const pending=proxy(request(),first,'/mhr-experiment/api/flow-meta');
 const busy=response();await proxy(request(),busy,'/mhr-experiment/api/flow-meta');assert.equal(busy.statusCode,503);assert.equal(calls,1);
 reject(new Error('service stopped'));await pending;assert.equal(first.statusCode,503);
 const recovered=response();const next=proxy(request(),recovered,'/mhr-experiment/api/flow-meta');assert.equal(calls,2);reject(new Error('still stopped'));await next;
});
test('MHR rollback flag disables routes; local comparison endpoints are opt-in',async()=>{
 const disabled=createMhrProxy({...options,enabled:false});const res=response();await disabled(request(),res,'/mhr-experiment/api/topology');assert.equal(res.statusCode,404);
 const dev=createMhrProxy({...options,allowBench:true,fetcher:async()=>new Response('{}')});const bench=response();await dev(request(),bench,'/mhr-experiment/api/meta');assert.equal(bench.statusCode,200);
});

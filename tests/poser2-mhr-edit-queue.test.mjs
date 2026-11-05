import test from 'node:test';
import assert from 'node:assert/strict';
import {createMhrEditQueue} from '../src/poser2/mhrEditQueue.js';
const tick=()=>new Promise(r=>setImmediate(r));
function harness(hybrid=true){
 let frame,commits=0,renders=0;const calls=[],applied=[],errors=[];
 const native={evaluate:body=>new Promise((resolve,reject)=>calls.push({body,resolve,reject})),apply:p=>applied.push(p)};
 if(hybrid){native.preview=body=>{applied.push('preview:'+body.params[0]);return body;};native.settle=async(p,render)=>{applied.push(p);render();};}
 const q=createMhrEditQueue({native,raf:cb=>{frame=cb;return 1;},caf:()=>{frame=null;},render:()=>renders++,committed:()=>commits++,error:e=>errors.push(e.message),pauseMs:10000});
 return {q,calls,applied,errors,frame:()=>{const f=frame;frame=null;f?.();},get commits(){return commits;},get renders(){return renders;}};
}
test('browser keeps previewing during network wait; stale correction cannot overwrite newer input; one final commit',async()=>{
 const h=harness();h.q.begin();h.q.queue({params:[1]});h.frame();assert.deepEqual(h.applied,['preview:1']);assert.equal(h.calls.length,0);
 h.q.commit();assert.equal(h.calls.length,1);
 h.q.queue({params:[2]});h.frame();h.q.commit();assert.deepEqual(h.applied,['preview:1','preview:2']);
 h.calls[0].resolve('old');await tick();assert.equal(h.calls.length,2);assert.ok(!h.applied.includes('old'));
 h.calls[1].resolve('corrected:2');await h.q.finish();assert.equal(h.calls.length,2);assert.equal(h.commits,1);assert.equal(h.applied.at(-1),'corrected:2');h.q.dispose();
});
test('server-only comparison renders intermediate responses during a continuous drag',async()=>{
 const h=harness(false);h.q.begin();h.q.queue({params:[1]});h.q.queue({params:[2]});h.q.commit();
 h.calls[0].resolve('first');await tick();assert.deepEqual(h.applied,['first']);assert.equal(h.calls.length,2);
 h.calls[1].resolve('last');await h.q.finish();assert.deepEqual(h.applied,['first','last']);assert.equal(h.commits,1);h.q.dispose();
});
test('cancel and dispose ignore in-flight corrections and do not create history',async()=>{
 const h=harness();h.q.queue({params:[1]});h.q.commit();h.q.cancel();h.calls[0].resolve('cancelled');await tick();assert.ok(!h.applied.includes('cancelled'));assert.equal(h.commits,0);
 h.q.queue({params:[2]});h.q.commit();h.q.dispose();h.calls[1].resolve('disposed');await tick();assert.ok(!h.applied.includes('disposed'));assert.equal(h.commits,0);
});
test('failed correction leaves the responsive preview, reports failure and recovers on the next gesture',async()=>{
 const h=harness();h.q.queue({params:[1]});h.q.commit();h.calls[0].reject(new Error('offline'));await tick();assert.deepEqual(h.errors,['offline']);assert.equal(h.commits,0);
 h.q.begin();h.q.queue({params:[2]});h.q.commit();h.calls[1].resolve('recovered');await h.q.finish();assert.equal(h.applied.at(-1),'recovered');assert.equal(h.commits,1);h.q.dispose();
});

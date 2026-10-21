import test from 'node:test';
import assert from 'node:assert/strict';
import {DecisionClient} from '../src/decisionClient.js';
const element={id:'a',revision:1,w:200,h:60,strokes:[[]],outline:true};
test('reuses in-flight and completed decisions; a new revision gets new evidence',async()=>{
 let calls=0,finish;
 const client=new DecisionClient(()=>{calls++;return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({kind:'button'})});});},()=> 'image');
 const first=client.request(element,[]),again=client.request(element,[]);assert.equal(calls,1);finish();assert.deepEqual(await first,await again);
 await client.request(element,[]);assert.equal(calls,1);
 const next=client.request({...element,revision:2},[]);assert.equal(calls,2);finish();await next;
});
test('clear aborts pending work, and errors do not poison future attempts',async()=>{
 let calls=0;
 const client=new DecisionClient((_url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));},()=> 'image');
 const pending=client.request(element,[]);client.clear();await assert.rejects(pending,{name:'AbortError'});assert.equal(client.requests.size,0);assert.equal(calls,1);
});

test('browser fetch is invoked without a class-instance receiver',async()=>{const client=new DecisionClient(function(){assert.equal(this,undefined);return Promise.resolve({ok:true,json:async()=>({kind:'unknown'})});},()=> 'image');await client.request(element,[]);});

test('changed context invalidates a cached decision and all candidate images are sent',async()=>{
 let calls=0,body;
 const client=new DecisionClient((_url,options)=>{calls++;body=JSON.parse(options.body);return Promise.resolve({ok:true,json:async()=>({kind:'unknown'})});},()=> 'crop',()=> 'scene');
 const candidates=[{members:[{id:'a',revision:1}],element,strokes:[[]]}];
 await client.request(element,[],candidates,[]);
 assert.equal(body.sceneImage,'scene');assert.equal(body.candidates[0].image,'crop');
 await client.request(element,[{kind:'input',x:0,y:0,w:200,h:60}],candidates,[]);
 assert.equal(calls,2);
});

test('a new neighboring stroke invalidates the scene image cache even at the same bounds',async()=>{
 let calls=0;
 const client=new DecisionClient(()=>{calls++;return Promise.resolve({ok:true,json:async()=>({kind:'unknown'})});},()=> 'crop');
 await client.request(element,[],undefined,[{...element,id:'neighbor',revision:1}]);
 await client.request(element,[],undefined,[{...element,id:'neighbor',revision:2}]);
 assert.equal(calls,2);
});

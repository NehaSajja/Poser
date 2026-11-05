import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MeshStandardMaterial,Vector3} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {captureRig,applyLibraryPose} from '../src/poser/libraryPose.js';
import {prepareModelRig,snapshotModelRig} from '../src/poser2/modelRig.js';
import {createMhrRig} from '../src/poser2/mhrRig.js';
import {loadSavedBody} from '../src/poser2/mhrSavedBodies.js';
import {BODY_PRESETS} from '../src/poser2/bodyShape.js';
import {getAssetPath} from '../server/pose-library/skeleton.mjs';
import {loadRetrievalPreview} from '../server/pose-retrieval/preview.mjs';
import {createMhrBodyAssets} from '../server/experiments/mhr-body-assets.mjs';
const base='public/experiments/mhr-bodies';
const manifest=JSON.parse(fs.readFileSync(`${base}/manifest.json`));
const available=fs.existsSync(`${base}/${manifest.revision}/meta.json`);
function bytes(id){return gunzipSync(fs.readFileSync(`${base}/${manifest.revision}/${manifest.bodies[id].file}.gz`));}
globalThis.ProgressEvent??=class{constructor(type,data){Object.assign(this,data);}};

test('all library bodies have valid checksums, matching parameters, and the unchanged default shape',{skip:!available},()=>{
 const fits=JSON.parse(fs.readFileSync('public/experiments/mhr-library-fits.json'));
 assert.equal(manifest.count,fits.count);assert.deepEqual(Object.keys(manifest.bodies).sort(),fits.ids.map(String).sort());assert.deepEqual(manifest.shape,BODY_PRESETS.feminine);
 for(const id of fits.ids){const b=bytes(id);assert.equal(b.length,manifest.packetBytes);assert.equal(createHash('sha256').update(b).digest('hex'),manifest.bodies[id].sha256);
 const p=new Float32Array(b.buffer,b.byteOffset,b.length/4);assert.ok(p.every(Number.isFinite));const fit=JSON.parse(fs.readFileSync(`public/experiments/mhr-library/${id}.json`));assert.ok(fit.params.every((v,i)=>Math.abs(v-p[p.length-204+i])<1e-5),id);}
});
test('saved body uses real browser rig without MHR; local edits and subsequent correction preserve the existing path',{skip:!available},async()=>{
 const original=globalThis.fetch,requests=[];let allowCorrection=false;
 globalThis.fetch=async(url,options)=>{
  if(url.startsWith('/mhr-experiment/')){requests.push({url,body:JSON.parse(options?.body||'{}')});if(!allowCorrection)throw Error('MHR intentionally unavailable');return new Response(bytes('2013'));}
  const path='public'+url;return new Response((/\d+-[a-f0-9]{16}\.bin$/).test(url)?gunzipSync(fs.readFileSync(path+'.gz')):fs.readFileSync(path));
 };
 const material=new MeshStandardMaterial();let body;
 try{
 const pose=JSON.parse(fs.readFileSync('data/cloud-retrieval/catalog.json')).find(p=>p.id==='2013');
 const preview=await loadRetrievalPreview({pose,view:'authored'}),b=fs.readFileSync(getAssetPath(pose.model));
 const source=prepareModelRig(captureRig(new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')),pose.model);applyLibraryPose(source,preview.model);
 body=await createMhrRig(material,{browserNative:true,savedBodies:true});await body.mhr.fit(snapshotModelRig(source),undefined,'2013-authored');assert.equal(body.mhr.fitSource,'saved-body');assert.equal(requests.length,0);
 const initial=body.mhr.capture();let mesh;body.root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});assert.ok(mesh);const v=new Vector3();let max=0;
 for(let i=0;i<manifest.vertexCount;i++){mesh.getVertexPosition(i,v);max=Math.max(max,v.distanceTo(new Vector3().fromArray(initial,i*3)));}assert.ok(max<3e-5);
 const params=body.mhr.params.slice();params[27]+=.1;body.mhr.preview({params});assert.notDeepEqual(body.mhr.capture(),initial);assert.equal(requests.length,0);body.mhr.apply(initial);
 allowCorrection=true;await body.mhr.evaluate({params,shape:BODY_PRESETS.masculine});assert.deepEqual(requests.at(-1).body.shape,BODY_PRESETS.masculine);assert.ok(requests.at(-1).body.params.every((v,i)=>v===params[i]));
 source.joints.get('Head').rotation.x+=.2;await body.mhr.fit(snapshotModelRig(source),undefined,'2013-front');assert.equal(body.mhr.fitSource,'optimizer');assert.ok(requests.at(-1).body.source);
 const fit=JSON.parse(fs.readFileSync('public/experiments/mhr-library/2013.json'));
 assert.equal(await loadSavedBody('2013-authored',{...fit,fingerprint:'stale'},BODY_PRESETS.feminine),null);
 assert.equal(await loadSavedBody('2013-authored',fit,BODY_PRESETS.masculine),null);
 }finally{body?.mhr.dispose();material.dispose();globalThis.fetch=original;}
});
test('asset route serves compressed or decoded bodies, immutable caching, HEAD and safe paths',{skip:!available},async()=>{
 const handler=createMhrBodyAssets(base),path=`/experiments/mhr-bodies/${manifest.revision}/${manifest.bodies['2013'].file}`;
 async function get(path,headers={},method='GET'){const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};assert.equal(await handler({method,headers},res,path),true);return res;}
 const zipped=await get(path,{'accept-encoding':'gzip'});assert.equal(zipped.status,200);assert.equal(zipped.headers['Content-Encoding'],'gzip');assert.deepEqual(gunzipSync(zipped.body),bytes('2013'));
 const raw=await get(path);assert.deepEqual(raw.body,bytes('2013'));assert.match(raw.headers['Cache-Control'],/immutable/);
 assert.equal((await get(path,{'if-none-match':raw.headers.ETag})).status,304);assert.equal((await get(path,{},'HEAD')).body,undefined);
 assert.equal((await get('/experiments/mhr-bodies/../../.env')).status,404);assert.equal((await get(path,{},'POST')).status,404);
 assert.equal((await get('/experiments/mhr-bodies/manifest.json')).headers['Cache-Control'],'no-cache');
});

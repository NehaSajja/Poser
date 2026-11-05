import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MeshStandardMaterial} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {captureRig,applyLibraryPose} from '../src/poser/libraryPose.js';
import {prepareModelRig,snapshotModelRig} from '../src/poser2/modelRig.js';
import {createMhrRig} from '../src/poser2/mhrRig.js';
import {getAssetPath} from '../server/pose-library/skeleton.mjs';
import {loadRetrievalPreview} from '../server/pose-retrieval/preview.mjs';
globalThis.ProgressEvent??=class{constructor(type,data){Object.assign(this,data);}};
test('carousel source reuses its saved fit, while an edited body requests a fresh fit',{skip:!fs.existsSync('.local/mhr-flow-meta.json')||!fs.existsSync('public/experiments/mhr-library/2013.json')},async()=>{
 const pose=JSON.parse(fs.readFileSync('data/cloud-retrieval/catalog.json')).find(p=>p.id==='2013');
 const preview=await loadRetrievalPreview({pose,view:'authored'}),b=fs.readFileSync(getAssetPath(pose.model));
 const rig=prepareModelRig(captureRig(new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')),pose.model);applyLibraryPose(rig,preview.model);
 const original=globalThis.fetch,bodies=[];
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('flow-meta'))return new Response(fs.readFileSync('.local/mhr-flow-meta.json'));
  if(url.endsWith('topology'))return new Response(fs.readFileSync('.local/mhr-flow-topology.bin'));
  if(url.includes('/mhr-library/'))return new Response(fs.readFileSync('public'+url));
  bodies.push(JSON.parse(options.body));return new Response(fs.readFileSync('.local/mhr-browser-fixtures/2013-0.bin'));
 };
 const material=new MeshStandardMaterial();
 try{
  const body=await createMhrRig(material,{browserNative:false});await body.mhr.fit(snapshotModelRig(rig),undefined,'2013-authored');
  assert.equal(body.mhr.fitSource,'saved-library');assert.ok(Array.isArray(bodies.at(-1).params));assert.equal(bodies.at(-1).source,undefined);
  rig.joints.get('Head').rotation.x+=.2;await body.mhr.fit(snapshotModelRig(rig),undefined,'2013-front');
  assert.equal(body.mhr.fitSource,'optimizer');assert.ok(bodies.at(-1).source);body.mhr.dispose();
 }finally{globalThis.fetch=original;material.dispose();}
});

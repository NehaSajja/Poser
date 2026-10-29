import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {MeshStandardMaterial,Vector3} from 'three';
import {createMhrHistory,createMhrRig,sourceTargets} from '../src/poser2/mhrRig.js';
import {snapshotModelRig,prepareModelRig,transferPose} from '../src/poser2/modelRig.js';
import {captureRig} from '../src/poser/libraryPose.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
globalThis.ProgressEvent??=class{constructor(type,data){Object.assign(this,data)}};

test('native parameter history uses numeric differences, isolates copies, and discards redo after a new edit',()=>{
 const zero=Array(204).fill(0),history=createMhrHistory(zero),pose=[...zero];pose[29]=.2;
 assert.equal(history.commit(pose),true);pose[29]=100;assert.equal(history.current[29],.2);
 assert.equal(history.commit(history.current),false);assert.deepEqual(history.undo(),zero);assert.equal(history.redo()[29],.2);
 history.undo();const other=[...zero];other[27]=.3;history.commit(other);assert.equal(history.canRedo,false);
});

test('real MHR packet places proxy joints with the mesh and survives cross-body transfer',async t=>{
 let meta,topology,packet;
 try{[meta,topology,packet]=await Promise.all([fs.readFile('.local/mhr-flow-meta.json','utf8').then(JSON.parse),fs.readFile('.local/mhr-flow-topology.bin'),fs.readFile('.local/mhr-flow-pose.bin')]);}
 catch{return t.skip('Run npm run test:mhr-flow to generate the actual native-model fixtures.');}
 const original=globalThis.fetch;const bodies=[];
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('flow-meta'))return new Response(JSON.stringify(meta));
  if(url.endsWith('topology'))return new Response(topology);
  bodies.push(JSON.parse(options.body));return new Response(packet,{headers:{'X-MHR-Fit':'3.2'}});
 };
 const material=new MeshStandardMaterial();
 try{
  const native=await createMhrRig(material);
  const floats=new Float32Array(packet.buffer.slice(packet.byteOffset,packet.byteOffset+packet.byteLength));native.mhr.apply(floats);
  const n=meta.vertexCount*3;
  for(const [role,name] of Object.entries(meta.mapping)){
   const i=meta.jointNames.indexOf(name);const expected=new Vector3().fromArray(floats,n+i*8);
   assert.ok(native.joints.get(role).getWorldPosition(new Vector3()).distanceTo(expected)<1e-6,role);
  }
  const snapshot=snapshotModelRig(native);assert.deepEqual(snapshot.mhrPose.params,native.mhr.params);
  const buffer=await fs.readFile('public/models/mpfb-neutral.fbx');
  const other=prepareModelRig(captureRig(new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'')),'mpfb');
  transferPose(snapshot,other);
  for(const bone of other.joints.values())assert.ok(bone.getWorldPosition(new Vector3()).toArray().every(Number.isFinite));
  const target=sourceTargets(other);await native.mhr.fit(other);
  assert.ok(native.joints.get('Hips').getWorldPosition(new Vector3()).distanceTo(target.hips)<1e-5);
  assert.ok(bodies.at(-1).source.positions.Head.every(Number.isFinite));
  await native.mhr.fit(snapshot);assert.ok(bodies.at(-1).params.every((v,i)=>Math.abs(v-snapshot.mhrPose.params[i])<1e-7));
  native.mhr.dispose();
 }finally{globalThis.fetch=original;material.dispose();}
});

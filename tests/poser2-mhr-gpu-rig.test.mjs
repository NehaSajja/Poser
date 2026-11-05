import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MeshStandardMaterial,Vector3} from 'three';
import {createMhrRig} from '../src/poser2/mhrRig.js';
const cases=fs.existsSync('.local/mhr-browser-fixtures/cases.json')?JSON.parse(fs.readFileSync('.local/mhr-browser-fixtures/cases.json')):[];
const original=globalThis.fetch;
globalThis.fetch=async url=>new Response(fs.readFileSync(url.endsWith('flow-meta')?'.local/mhr-flow-meta.json':url.endsWith('topology')?'.local/mhr-flow-topology.bin':'public/experiments/mhr-browser-rig.json'));
function packet(item){const b=fs.readFileSync(`.local/mhr-browser-fixtures/${item.name}.bin`),p=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));p.bodyShape=item.shape;return p;}
test('real SkinnedMesh matches corrected surfaces before/after local edits, shape changes and root transforms',{skip:!cases.length},async()=>{
 const rig=await createMhrRig(new MeshStandardMaterial(),{browserNative:true}),v=new Vector3();let mesh;rig.root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});assert.ok(mesh);
 for(const item of cases){const p=packet(item);rig.mhr.apply(p);rig.root.position.set(.2,.1,-.3);rig.root.scale.setScalar(.8);rig.root.rotation.y=.3;rig.root.updateMatrixWorld(true);
  let max=0;for(let i=0;i<18439;i++){mesh.getVertexPosition(i,v);max=Math.max(max,v.distanceTo(new Vector3().fromArray(p,i*3)));}assert.ok(max<3e-5,`${item.name} GPU rig error ${max}`);
  const params=item.params.slice();params[27]+=.1;const result=rig.mhr.preview({params});assert.equal(result.params[27],params[27]);
  const captured=rig.mhr.capture();assert.ok(captured.every(Number.isFinite));assert.equal(captured.length,p.length);assert.ok(Math.abs(captured.at(-177)-params[27])<1e-6);
  // Escape/reset returns exactly to authoritative MHR, without cumulative drift.
  rig.mhr.apply(p);rig.root.updateMatrixWorld(true);mesh.getVertexPosition(1000,v);assert.ok(v.distanceTo(new Vector3().fromArray(p,3000))<3e-5);
 }
 rig.mhr.dispose();globalThis.fetch=original;
});

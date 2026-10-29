import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig, snapshotModelRig, copyModelPose, transferPose } from '../src/poser2/modelRig.js';
import { getAssetPath } from '../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../server/pose-retrieval/preview.mjs';
import { torsoChain, captureTorso, aimTorso, editablePoseBones, TORSO_MAX_SWING } from '../src/poser2/torsoControl.js';
import { createPoseHistory } from '../src/poser2/poseHistory.js';
globalThis.ProgressEvent ??= class { constructor(type,data) {Object.assign(this,data);} };
const position = b => b.getWorldPosition(new Vector3());
const load = async id => { const bytes=await fs.readFile(id === 'mpfb' ? new URL('../public/models/mpfb-neutral.fbx', import.meta.url) : getAssetPath(id)); return prepareModelRig(captureRig(new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')),id); };
const close = (a,b) => assert.ok(a.distanceTo(b)<1e-5,`${a.toArray()} != ${b.toArray()}`);
function goal(ref,angle=.3) {
  const axis=new Vector3(1,.2,.3).cross(ref.direction).normalize();
  return ref.pivot.clone().add(ref.direction.clone().applyAxisAngle(axis,angle));
}
function check(rig) {
  updateRigMatrices(rig);
  const chain=torsoChain(rig);assert.ok(chain);
  const ref=captureTorso(chain), target=goal(ref);
  const fixed=['Hips','LeftUpLeg','RightUpLeg','LeftFoot','RightFoot'];
  const before=new Map(fixed.map(role=>[role,position(rig.joints.get(role))]));
  const descendants=['LeftHand','RightHand','Head'];
  const carried=new Map(descendants.map(role=>[role,position(rig.joints.get(role))]));
  const locals=new Map([...rig.bones].map(([name,{object:b}])=>[name,{p:b.position.clone(),s:b.scale.clone(),q:b.quaternion.clone()}]));
  aimTorso(chain,target,ref);updateRigMatrices(rig);
  close(position(chain.tip).sub(ref.pivot).normalize(),target.clone().sub(ref.pivot).normalize());
  for(const [role,p] of before)close(position(rig.joints.get(role)),p);
  const swing=chain.root.quaternion.clone().multiply(ref.localRotation.clone().invert());
  for(const [role,p] of carried)close(position(rig.joints.get(role)),p.clone().applyMatrix4(ref.parentInverse)
    .sub(ref.localPivot).applyQuaternion(swing).add(ref.localPivot).applyMatrix4(ref.parentMatrix));
  for(const [name,{object:b}] of rig.bones) {
    close(b.position,locals.get(name).p);close(b.scale,locals.get(name).s);
    if(b!==chain.root)assert.ok(b.quaternion.angleTo(locals.get(name).q)<1e-6);
  }
  const expected=chain.root.quaternion.clone();
  for(let i=0;i<100;i++)aimTorso(chain,goal(ref,Math.sin(i)*.9),ref);
  aimTorso(chain,target,ref);assert.ok(expected.angleTo(chain.root.quaternion)<1e-6);
  for(const target of [ref.pivot,ref.pivot.clone().sub(ref.direction),new Vector3(NaN,0,0)]) {
    aimTorso(chain,target,ref);assert.ok(chain.root.quaternion.toArray().every(Number.isFinite));
    assert.ok(chain.root.quaternion.angleTo(ref.localRotation)<=TORSO_MAX_SWING+1e-6);
  }
}
for(const id of ['female','male','human','mpfb'])test(`${id}: torso carries arms/head, fixes pelvis/feet, preserves lengths and is path-independent`,async()=>{
  const rig=await load(id);rig.root.rotation.set(.4,-.8,.2);rig.root.scale.multiplyScalar(1.7);rig.joints.get('Spine').rotateX(-.6);check(rig);
});
test('authored standing, folded, seated, crouched, lying and raised-arm poses remain stable',async()=>{
  const catalog=JSON.parse(await fs.readFile(new URL('../data/cloud-retrieval/catalog.json',import.meta.url),'utf8'));
  for(const id of ['1176','1351','2013','1010','2273','2933']) {
    const pose=catalog.find(p=>String(p.id)===id),preview=await loadRetrievalPreview({pose,view:'authored'});
    const rig=await load(pose.model);applyLibraryPose(rig,preview.model);check(rig);
  }
});
test('undo/redo and body switching retain the torso rotation',async()=>{
  const rig=await load('female'),human=await load('human'),chain=torsoChain(rig),bones=editablePoseBones(rig);
  assert.ok(bones.includes(chain.root));
  const snapshot=()=>bones.map(b=>b.quaternion.toArray());
  const apply=state=>{bones.forEach((b,i)=>b.quaternion.fromArray(state[i]));updateRigMatrices(rig);};
  const initial=snapshot(),history=createPoseHistory(initial),ref=captureTorso(chain);
  aimTorso(chain,goal(ref),ref);const edited=snapshot();history.commit(edited);
  apply(history.undo());assert.deepEqual(snapshot(),initial);
  apply(history.redo());assert.deepEqual(snapshot(),edited);
  const saved=snapshotModelRig(rig);transferPose(saved,human);transferPose(human,rig);
  assert.ok(rig.joints.get('Spine').getWorldQuaternion(new Quaternion()).angleTo(saved.joints.get('Spine').getWorldQuaternion(new Quaternion()))<1e-6);
  copyModelPose(saved,rig);assert.deepEqual(snapshot(),edited);
});

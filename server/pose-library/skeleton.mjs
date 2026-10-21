import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { Object3D, Vector3 } from 'three';

export const LIBRARY_ROOT = process.env.POSE_LIBRARY_ROOT || fileURLToPath(new URL('../../data/posemyart-library-final/', import.meta.url));
export const MODEL_FILES = { female: '60-x_bot_fixed_OP_Y_IK.fbx', male: '59-y_bot_fixed_OP_Y_IK.fbx', human: '68-realistic_muscular_fit_male_OP_Y_IK.fbx' };
export const JOINT_BONES = ['Head','Neck','Hips','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot'].map(n => `mixamorig${n}`);
export const canonicalName = name => name.replaceAll(':','');
const rigs = new Map();
export function getAssetPath(model) {
  if (!Object.hasOwn(MODEL_FILES, model)) throw new Error('Unknown bot model');
  return path.join(LIBRARY_ROOT, 'models', MODEL_FILES[model]);
}
export function serializeTransform(object) {
  return {position:object.position.toArray(), quaternion:object.quaternion.toArray(), scale:object.scale.toArray()};
}
export function applyTransform(object, data) {
  if (data.position) Array.isArray(data.position) ? object.position.fromArray(data.position) : object.position.set(data.position.x,data.position.y,data.position.z);
  if (data.quaternion) object.quaternion.fromArray(data.quaternion);
  else if(data.rotation) object.rotation.set(data.rotation.x,data.rotation.y,data.rotation.z);
  if(data.scale) Array.isArray(data.scale) ? object.scale.fromArray(data.scale) : object.scale.set(data.scale.x,data.scale.y,data.scale.z);
}
export function getRig(model) {
  if(rigs.has(model)) return rigs.get(model);
  const bytes=fs.readFileSync(getAssetPath(model));
  const root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(canonicalName(o.name),o);});
  for(const name of JOINT_BONES) if(!bones.has(name))throw new Error(`Missing joint ${name}`);
  const rest=new Map([...bones].map(([name,b])=>[name,serializeTransform(b)]));
  const rig={root,bones,rest,model};rigs.set(model,rig);return rig;
}
export function loadScenePose(rig, scene, model) {
  for(const [name,bone] of rig.bones)applyTransform(bone,rig.rest.get(name));
  for(const [name,transform] of Object.entries(model.bones?.[0]||{})) {
    const bone=rig.bones.get(canonicalName(name));if(bone)applyTransform(bone,transform);
  }
  rig.root.removeFromParent();rig.root.position.set(0,0,0);rig.root.quaternion.identity();rig.root.scale.set(1,1,1);applyTransform(rig.root,model);
  const objects=Object.values(scene.sceneObjects);let top=rig.root,child=model;const visited=new Set();
  while(child.groupSceneID != null&&!visited.has(child.groupSceneID)) {
    visited.add(child.groupSceneID);const parent=objects.find(o=>o.isGroup&&String(o.sceneID)===String(child.groupSceneID));if(!parent)break;
    const group=new Object3D();applyTransform(group,parent);group.add(top);top=group;child=parent;
  }
  top.updateMatrixWorld(true);
  // Flatten only the external scene groups. Internal FBX armature/mesh hierarchy stays intact.
  const world=rig.root.matrixWorld.clone();rig.root.removeFromParent();world.decompose(rig.root.position,rig.root.quaternion,rig.root.scale);rig.root.updateMatrixWorld(true);
}
export function jointPositions(rig) {
  rig.root.updateMatrixWorld(true);
  const positions=JOINT_BONES.map((name,index)=>{
    const bone=rig.bones.get(name);
    // Sketch heads indicate the skull centre, not the neck/head bone pivot.
    return index===0 ? bone.localToWorld(new Vector3(0,10,0)).toArray() : bone.getWorldPosition(new Vector3()).toArray();
  });
  // Use shoulder/hip pair midpoints for the camera fallback landmarks.
  positions[1]=positions[3].map((value,axis)=>(value+positions[4][axis])/2);
  positions[2]=positions[9].map((value,axis)=>(value+positions[10][axis])/2);
  return positions;
}
export function serializePose(rig) {
  return {assetUrl:`/api/pose-library/assets/${rig.model}.fbx`, root:serializeTransform(rig.root), bones:[...rig.bones.values()].map(b=>({name:b.name,...serializeTransform(b)}))};
}

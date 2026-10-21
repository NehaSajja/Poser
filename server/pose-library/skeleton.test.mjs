import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone, Object3D, Vector3} from 'three';
import {JOINT_BONES, jointPositions, serializeTransform} from './skeleton.mjs';

test('camera fallback landmarks preserve physical bones',()=>{
  const root=new Object3D(),bones=new Map();
  root.position.set(12,-8,4);root.rotation.set(.2,-.5,.8);root.scale.setScalar(1.7);
  JOINT_BONES.forEach((name,index)=>{
    const bone=new Bone();bone.name=name;bone.position.set(index*3,index%4,index*-2);
    root.add(bone);bones.set(name,bone);
  });
  const before=[...bones.values()].map(serializeTransform);
  root.updateMatrixWorld(true);
  const physical=JOINT_BONES.map(name=>bones.get(name).getWorldPosition(new Vector3()));
  const points=jointPositions({root,bones});
  const shoulderCenter=physical[3].clone().add(physical[4]).multiplyScalar(.5);
  const hipCenter=physical[9].clone().add(physical[10]).multiplyScalar(.5);
  assert.ok(shoulderCenter.distanceTo(physical[1])>1,'Fixture must distinguish neck pivot from shoulder midpoint');
  assert.ok(hipCenter.distanceTo(physical[2])>1,'Fixture must distinguish hips pivot from hip midpoint');
  assert.ok(new Vector3().fromArray(points[1]).distanceTo(shoulderCenter)<1e-12);
  assert.ok(new Vector3().fromArray(points[2]).distanceTo(hipCenter)<1e-12);
  for(let i=3;i<15;i++)assert.deepEqual(points[i],physical[i].toArray());
  assert.deepEqual([...bones.values()].map(serializeTransform),before);
});

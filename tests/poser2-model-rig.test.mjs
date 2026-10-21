import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Vector3, Quaternion } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig, transferPose, snapshotModelRig, copyModelPose } from '../src/poser2/modelRig.js';
import { getAssetPath } from '../server/pose-library/skeleton.mjs';

globalThis.ProgressEvent ??= class { constructor(type, data) { this.type = type; Object.assign(this, data); } };
const bytes = async path => { const b = await fs.readFile(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const loadBot = async id => prepareModelRig(captureRig(new FBXLoader().parse(await bytes(getAssetPath(id)), '')), id);
const loadHuman = () => loadBot('human');
const position = bone => bone.getWorldPosition(new Vector3());
const rotation = bone => bone.getWorldQuaternion(new Quaternion());

test('the local Human is skinned and has every editable limb joint', async () => {
  const human = await loadHuman();
  let count = 0;
  human.root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    count++;
    assert.ok(o.geometry.attributes.skinWeight);
    assert.ok(o.skeleton.bones.length > 20);
  });
  assert.ok(count > 0);
  for (const side of ['Left', 'Right']) for (const part of ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot']) {
    assert.ok(human.joints.has(side + part), side + part);
  }
});

test('pose transfer preserves target bone lengths and follows the posed limb directions', async () => {
  const source = await loadBot('male'), target = await loadHuman();
  source.joints.get('LeftArm').rotateZ(.7);
  source.joints.get('LeftForeArm').rotateY(-.8);
  source.joints.get('RightUpLeg').rotateX(.5);
  source.joints.get('RightLeg').rotateX(-1.1);
  updateRigMatrices(source);
  const before = new Map([...target.bones].map(([key, entry]) => [key, entry.object.position.clone()]));
  transferPose(source, target);
  for (const [key, entry] of target.bones) assert.ok(entry.object.position.distanceTo(before.get(key)) < 1e-8);
  for (const [a,b] of [['LeftArm','LeftForeArm'],['LeftForeArm','LeftHand'],['RightUpLeg','RightLeg'],['RightLeg','RightFoot']]) {
    const from = position(source.joints.get(b)).sub(position(source.joints.get(a))).normalize();
    const to = position(target.joints.get(b)).sub(position(target.joints.get(a))).normalize();
    assert.ok(from.dot(to) > .999, `${a} direction: ${from.dot(to)}`);
  }
  assert.ok(position(source.joints.get('Hips')).distanceTo(position(target.joints.get('Hips'))) < 1e-6);
});

test('switching through Human and back preserves the edited bot pose', async () => {
  const source = await loadBot('female'), human = await loadHuman(), target = await loadBot('female');
  source.joints.get('LeftArm').rotateX(.6); source.joints.get('LeftForeArm').rotateZ(.9);
  source.root.rotateY(.45); updateRigMatrices(source);
  const before = new Map([...source.joints].map(([role, bone]) => [role, rotation(bone)]));
  transferPose(source, human); transferPose(human, target);
  for (const [role, q] of before) assert.ok(1 - Math.abs(q.dot(rotation(target.joints.get(role)))) < 1e-6, role);
});

test('body switches retain an independent authored pose and can restore it exactly', async () => {
  const source = await loadBot('female');
  source.joints.get('LeftForeArm').rotateX(.5);
  const authored = snapshotModelRig(source);
  const original = source.joints.get('LeftForeArm').quaternion.toArray();
  source.joints.get('LeftForeArm').rotateY(.8);
  assert.deepEqual(authored.joints.get('LeftForeArm').quaternion.toArray(), original);
  copyModelPose(authored, source);
  assert.deepEqual(source.joints.get('LeftForeArm').quaternion.toArray(), original);
  for (const [role, rest] of source.restJoints) assert.equal(authored.restJoints.get(role), rest);
  assert.notEqual(authored.joints.get('LeftForeArm'), source.joints.get('LeftForeArm'));
});

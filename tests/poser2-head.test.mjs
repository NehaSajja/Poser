import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig, snapshotModelRig, transferPose } from '../src/poser2/modelRig.js';
import { getAssetPath } from '../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../server/pose-retrieval/preview.mjs';
import { headControl, captureHead, rotateHead, headHandlePosition, HEAD_MAX_TURN, HEAD_MAX_NOD } from '../src/poser2/headControl.js';
import { torsoChain, captureTorso, aimTorso, editablePoseBones } from '../src/poser2/torsoControl.js';
import { createPoseHistory, readPoseEdit, writePoseEdit } from '../src/poser2/poseHistory.js';

globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, data); } };
async function load(id) {
  const bytes = await fs.readFile(getAssetPath(id));
  return prepareModelRig(captureRig(new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')), id);
}
const world = bone => bone.getWorldPosition(new Vector3());
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-5);

for (const id of ['female', 'male', 'human']) test(`${id}: nod and turn keep the body fixed without changing bone lengths`, async () => {
  const rig = await load(id), control = headControl(rig);
  assert.ok(control);
  const ref = captureHead(control);
  const facing = () => new Vector3(0, 0, 1).applyQuaternion(rig.restJoints.get('Head').rotation.clone().invert())
    .applyQuaternion(control.root.getWorldQuaternion(new Quaternion()));
  rotateHead(control, 50, 0, ref);
  assert.ok(facing().x > .2, 'horizontal drag should turn, not roll');
  rotateHead(control, 0, 40, ref);
  assert.ok(facing().y > .2, 'upward drag should lift the face');
  rotateHead(control, 0, -40, ref);
  assert.ok(facing().y < -.2, 'downward drag should lower the face');

  rig.root.rotation.set(.4, -.8, .2); rig.root.scale.set(1.1, .9, 1.4);
  updateRigMatrices(rig);
  const fixed = ['Hips', 'Spine', 'Neck', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'];
  const before = fixed.map(role => world(rig.joints.get(role)));
  const locals = [...rig.bones.values()].map(({ object }) => ({ object, p: object.position.clone(), s: object.scale.clone(), q: object.quaternion.clone() }));
  const gesture = captureHead(control);
  const originalHandle = headHandlePosition(control);
  rotateHead(control, 70, 35, gesture);
  assert.ok(headHandlePosition(control).distanceTo(originalHandle) > .01);
  fixed.forEach((role, i) => close(world(rig.joints.get(role)), before[i]));
  for (const { object, p, s, q } of locals) {
    close(object.position, p); close(object.scale, s);
    if (object !== control.root) assert.ok(object.quaternion.angleTo(q) < 1e-6);
  }
  const expected = control.root.quaternion.clone();
  for (let i = 0; i < 100; i++) rotateHead(control, Math.sin(i) * 250, Math.cos(i) * 250, gesture);
  rotateHead(control, 70, 35, gesture);
  assert.ok(control.root.quaternion.angleTo(expected) < 1e-6, 'drag path must not accumulate rotation');
  rotateHead(control, Infinity, NaN, gesture);
  assert.ok(control.root.quaternion.angleTo(gesture.rotation) < 1e-6);
  rotateHead(control, 1e6, 0, gesture);
  assert.ok(control.root.quaternion.angleTo(gesture.rotation) <= HEAD_MAX_TURN + 1e-6);
  rotateHead(control, 0, 1e6, gesture);
  assert.ok(control.root.quaternion.angleTo(gesture.rotation) <= HEAD_MAX_NOD + 1e-6);
});

test('head remains independent in authored folds, crouches and prone poses, and follows subsequent torso edits', async () => {
  const catalog = JSON.parse(await fs.readFile(new URL('../data/cloud-retrieval/catalog.json', import.meta.url), 'utf8'));
  for (const id of ['1176', '1351', '2013', '1010', '2273', '2933']) {
    const pose = catalog.find(p => String(p.id) === id);
    const preview = await loadRetrievalPreview({ pose, view: 'authored' });
    const rig = await load(pose.model); applyLibraryPose(rig, preview.model);
    const head = headControl(rig), torso = torsoChain(rig);
    const chest = torso.root.quaternion.clone(), hand = world(rig.joints.get('LeftHand'));
    rotateHead(head, 60, 30, captureHead(head));
    assert.ok(head.root.quaternion.toArray().every(Number.isFinite));
    close(hand, world(rig.joints.get('LeftHand')));
    assert.ok(chest.angleTo(torso.root.quaternion) < 1e-6);
    const headRotation = head.root.quaternion.clone(), handle = headHandlePosition(head);
    const reference = captureTorso(torso);
    const target = reference.pivot.clone().add(reference.direction.clone().applyAxisAngle(new Vector3(0, 0, 1), .2));
    aimTorso(torso, target, reference);
    assert.ok(headRotation.angleTo(head.root.quaternion) < 1e-6);
    assert.ok(handle.distanceTo(headHandlePosition(head)) > .001);
  }
});

test('combined head/torso edits survive undo, redo, persistence and body transfer', async () => {
  const rig = await load('female'), head = headControl(rig), torso = torsoChain(rig);
  const bones = editablePoseBones(rig), snapshot = () => bones.map(b => b.quaternion.toArray());
  const apply = state => { bones.forEach((b, i) => b.quaternion.fromArray(state[i])); updateRigMatrices(rig); };
  assert.ok(bones.includes(head.root));
  const history = createPoseHistory(snapshot()), ref = captureTorso(torso);
  aimTorso(torso, ref.pivot.clone().add(ref.direction.clone().applyAxisAngle(new Vector3(1, 0, 0), .2)), ref);
  const torsoOnly = snapshot(); history.commit(torsoOnly);
  rotateHead(head, 55, 25, captureHead(head));
  const both = snapshot(); history.commit(both);
  apply(history.undo()); assert.deepEqual(snapshot(), torsoOnly);
  apply(history.redo()); assert.deepEqual(snapshot(), both);
  const storage = new Map(); storage.getItem = key => storage.get(key); storage.setItem = (key, value) => storage.set(key, value);
  writePoseEdit(storage, 'test', 'v2', both);
  assert.deepEqual(readPoseEdit(storage, 'test', 'v2', bones.length), both);
  const authored = snapshotModelRig(rig), target = await load('human');
  transferPose(authored, target); transferPose(target, rig);
  // The source FBX contains slightly nonuniform bone scales; round-trip world
  // decomposition has a small numerical error (tolerance under .006 degrees).
  assert.ok(head.root.getWorldQuaternion(new Quaternion()).angleTo(authored.joints.get('Head').getWorldQuaternion(new Quaternion())) < 1e-4);
});

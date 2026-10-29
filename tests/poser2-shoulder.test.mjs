import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig, snapshotModelRig, transferPose, copyModelPose } from '../src/poser2/modelRig.js';
import { getAssetPath } from '../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../server/pose-retrieval/preview.mjs';
import { shoulderControls, captureShoulder, raiseShoulder, SHOULDER_MAX_LIFT, SHOULDER_MIN_LIFT } from '../src/poser2/shoulderControl.js';
import { torsoChain, captureTorso, aimTorso, editablePoseBones } from '../src/poser2/torsoControl.js';
import { headControl, captureHead, rotateHead } from '../src/poser2/headControl.js';
import { createPoseHistory } from '../src/poser2/poseHistory.js';

globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, data); } };
async function load(id) {
  const bytes = await fs.readFile(getAssetPath(id));
  return prepareModelRig(captureRig(new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')), id);
}
const world = bone => bone.getWorldPosition(new Vector3());
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-5, `${a.toArray()} != ${b.toArray()}`);

function checkShoulders(rig) {
  const controls = shoulderControls(rig);
  assert.equal(controls.length, 2);
  for (const control of controls) {
    const other = control.side === 'Left' ? 'Right' : 'Left';
    const fixed = ['Hips', 'Spine', 'Head', `${other}Arm`, `${other}Hand`, 'LeftFoot', 'RightFoot'];
    const before = fixed.map(role => world(rig.joints.get(role)));
    const reference = captureShoulder(control);
    const locals = [...rig.bones.values()].map(({ object }) => ({ object, p: object.position.clone(), s: object.scale.clone(), q: object.quaternion.clone() }));
    const matrix = control.root.parent.matrixWorld.clone(), inverse = matrix.clone().invert();
    const hand = rig.joints.get(`${control.side}Hand`), previousHand = world(hand);
    raiseShoulder(control, 30, reference);
    const raised = captureShoulder(control);
    if (reference.elevation < SHOULDER_MAX_LIFT) assert.ok(raised.elevation > reference.elevation);
    fixed.forEach((role, i) => close(world(rig.joints.get(role)), before[i]));
    const swing = control.root.quaternion.clone().multiply(reference.rotation.clone().invert());
    const expectedHand = previousHand.clone().applyMatrix4(inverse).sub(control.root.position)
      .applyQuaternion(swing).add(control.root.position).applyMatrix4(matrix);
    close(world(hand), expectedHand);
    for (const { object, p, s, q } of locals) {
      close(object.position, p); close(object.scale, s);
      if (object !== control.root) assert.ok(object.quaternion.angleTo(q) < 1e-6);
    }
    const result = control.root.quaternion.clone();
    for (let i = 0; i < 80; i++) raiseShoulder(control, Math.sin(i) * 300, reference);
    raiseShoulder(control, 30, reference);
    assert.ok(result.angleTo(control.root.quaternion) < 1e-6);
    raiseShoulder(control, -30, reference);
    if (reference.elevation > SHOULDER_MIN_LIFT) assert.ok(captureShoulder(control).elevation < reference.elevation);
    raiseShoulder(control, NaN, reference);
    assert.ok(reference.rotation.angleTo(control.root.quaternion) < 1e-6);
    // A fresh drag at a limit must not creep past it.
    for (let i = 0; i < 10; i++) raiseShoulder(control, 1e5, captureShoulder(control));
    assert.ok(captureShoulder(control).elevation <= Math.max(SHOULDER_MAX_LIFT, reference.elevation) + 1e-6);
    for (let i = 0; i < 10; i++) raiseShoulder(control, -1e5, captureShoulder(control));
    assert.ok(captureShoulder(control).elevation >= Math.min(SHOULDER_MIN_LIFT, reference.elevation) - 1e-6);
    control.root.quaternion.copy(reference.rotation); updateRigMatrices(rig);
  }
}

for (const id of ['female', 'male', 'human']) test(`${id}: shoulders move independently, carry their arms and retain bounded motion`, async () => {
  const rig = await load(id);
  rig.root.rotation.set(.4, -.8, .2); rig.root.scale.set(1.1, .9, 1.4);
  updateRigMatrices(rig); checkShoulders(rig);
});

test('shoulders work in authored folded, seated, crouched, prone and raised-arm poses', async () => {
  const catalog = JSON.parse(await fs.readFile(new URL('../data/cloud-retrieval/catalog.json', import.meta.url), 'utf8'));
  for (const id of ['1176', '1351', '2013', '1010', '2273', '2933']) {
    const pose = catalog.find(p => String(p.id) === id), preview = await loadRetrievalPreview({ pose, view: 'authored' });
    const rig = await load(pose.model); applyLibraryPose(rig, preview.model); checkShoulders(rig);
  }
});

test('combined upper-body edits survive undo, redo and body switching', async () => {
  const rig = await load('female'), torso = torsoChain(rig), head = headControl(rig), shoulders = shoulderControls(rig);
  const bones = editablePoseBones(rig), snapshot = () => bones.map(b => b.quaternion.toArray());
  assert.deepEqual(bones.slice(-2), shoulders.map(s => s.root));
  const history = createPoseHistory(snapshot()), ref = captureTorso(torso);
  aimTorso(torso, ref.pivot.clone().add(ref.direction.clone().applyAxisAngle(new Vector3(1, 0, 0), .2)), ref);
  rotateHead(head, 40, 20, captureHead(head));
  const before = snapshot(); history.commit(before);
  raiseShoulder(shoulders[0], 40, captureShoulder(shoulders[0]));
  raiseShoulder(shoulders[1], -30, captureShoulder(shoulders[1]));
  const edited = snapshot(); history.commit(edited);
  assert.deepEqual(history.undo(), before); assert.deepEqual(history.redo(), edited);
  const saved = snapshotModelRig(rig), target = await load('human');
  transferPose(saved, target); transferPose(target, rig);
  for (const control of shoulders) assert.ok(control.root.getWorldQuaternion(new Quaternion())
    .angleTo(saved.joints.get(`${control.side}Shoulder`).getWorldQuaternion(new Quaternion())) < 1e-3);
  copyModelPose(saved, rig); assert.deepEqual(snapshot(), edited);
  const rotations = shoulders.map(c => c.root.quaternion.clone());
  const torsoRef = captureTorso(torso);
  aimTorso(torso, torsoRef.pivot.clone().add(torsoRef.direction.clone().applyAxisAngle(new Vector3(0, 0, 1), .2)), torsoRef);
  shoulders.forEach((c, i) => assert.ok(rotations[i].angleTo(c.root.quaternion) < 1e-6));
});

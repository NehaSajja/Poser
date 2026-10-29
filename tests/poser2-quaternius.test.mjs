import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Vector3, Quaternion } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig, transferPose, snapshotModelRig, copyModelPose } from '../src/poser2/modelRig.js';
import { retargetPose } from '../src/poser2/contactRetarget.js';
import { torsoChain, captureTorso, aimTorso, editablePoseBones } from '../src/poser2/torsoControl.js';
import { headControl, captureHead, rotateHead } from '../src/poser2/headControl.js';
import { shoulderControls, captureShoulder, raiseShoulder } from '../src/poser2/shoulderControl.js';
import { createPoseHistory } from '../src/poser2/poseHistory.js';
import { getAssetPath } from '../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../server/pose-retrieval/preview.mjs';

globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, data); } };
async function load(id) {
  const bytes = await fs.readFile(id === 'quaternius' ? new URL('../public/models/quaternius-male.fbx', import.meta.url) : getAssetPath(id));
  return prepareModelRig(captureRig(new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')), id);
}
const position = bone => bone.getWorldPosition(new Vector3());
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-5);
function checkSurface(rig) {
  updateRigMatrices(rig);
  let vertices = 0;
  rig.root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      const point = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
      assert.ok(point.toArray().every(Number.isFinite));
      // Reject unbound/exploding vertices as well as invalid transforms.
      assert.ok(point.distanceTo(position(rig.joints.get('Hips'))) < rig.stature * rig.root.scale.x * 2);
      const weights = mesh.geometry.attributes.skinWeight;
      assert.ok(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-5);
      vertices++;
    }
  });
  assert.ok(vertices > 1000);
}

test('Quaternius preserves pose directions and all upper-body edits across seven authored poses', async t => {
  const catalog = JSON.parse(await fs.readFile(new URL('../data/cloud-retrieval/catalog.json', import.meta.url), 'utf8'));
  const target = await load('quaternius');
  assert.equal(target.joints.size, 52);
  const offsets = [...target.bones.values()].map(({ object }) => object.position.clone());
  for (const id of ['1176', '1351', '2013', '201', '1010', '2273', '2933']) {
    const pose = catalog.find(p => String(p.id) === id), source = await load(pose.model);
    const preview = await loadRetrievalPreview({ pose, view: 'authored' });
    applyLibraryPose(source, preview.model);
    const sourceBefore = [...source.bones.values()].map(({ object }) => object.quaternion.toArray());
    transferPose(source, target);
    // Authored PMA poses include nonuniform scales; allow up to five degrees
    // when transferring orientation onto fixed, unstretched body proportions.
    for (const side of ['Left', 'Right']) for (const [a, b] of [['Arm','ForeArm'],['ForeArm','Hand'],['UpLeg','Leg'],['Leg','Foot']]) {
      const direction = rig => position(rig.joints.get(side + b)).sub(position(rig.joints.get(side + a))).normalize();
      assert.ok(direction(source).dot(direction(target)) > Math.cos(5 * Math.PI / 180), `${id}: ${side}${a} direction ${direction(source).dot(direction(target))}`);
    }
    const report = retargetPose(source, target);
    assert.deepEqual([...source.bones.values()].map(({ object }) => object.quaternion.toArray()), sourceBefore);
    assert.ok(report.after.every(Number.isFinite));
    // Contact fit is measured, not treated as proof of visual quality. This
    // broader-shouldered body can miss source contacts; report the discrepancy.
    assert.ok(report.height > 0);
    t.diagnostic(`${id}: maximum contact error ${(Math.max(...report.after, 0) / report.height * 100).toFixed(2)}% of stature`);
    checkSurface(target);
    const bones = editablePoseBones(target), snapshot = () => bones.map(b => b.quaternion.toArray());
    const apply = state => { bones.forEach((b, i) => b.quaternion.fromArray(state[i])); updateRigMatrices(target); };
    const initial = snapshot(), history = createPoseHistory(initial);
    const torso = torsoChain(target), ref = captureTorso(torso);
    const feet = ['LeftFoot', 'RightFoot'].map(role => position(target.joints.get(role)));
    const hand = position(target.joints.get('LeftHand'));
    aimTorso(torso, ref.pivot.clone().add(ref.direction.clone().applyAxisAngle(new Vector3(0, 0, 1), .2)), ref);
    feet.forEach((p, i) => close(p, position(target.joints.get(['LeftFoot', 'RightFoot'][i]))));
    assert.ok(position(target.joints.get('LeftHand')).distanceTo(hand) > .001);
    const head = headControl(target), headRef = captureHead(head), chest = torso.root.quaternion.clone();
    rotateHead(head, 40, 25, headRef);
    assert.ok(head.root.quaternion.angleTo(headRef.rotation) > .1);
    assert.ok(chest.angleTo(torso.root.quaternion) < 1e-6);
    for (const control of shoulderControls(target)) {
      const other = control.side === 'Left' ? 'Right' : 'Left';
      const otherHand = position(target.joints.get(other + 'Hand'));
      const ownHand = position(target.joints.get(control.side + 'Hand'));
      const shoulderRef = captureShoulder(control);
      raiseShoulder(control, shoulderRef.elevation > 0 ? -25 : 25, shoulderRef);
      close(otherHand, position(target.joints.get(other + 'Hand')));
      assert.ok(ownHand.distanceTo(position(target.joints.get(control.side + 'Hand'))) > .001);
    }
    checkSurface(target);
    const edited = snapshot(); history.commit(edited);
    apply(history.undo()); assert.deepEqual(snapshot(), initial);
    apply(history.redo()); assert.deepEqual(snapshot(), edited);
    const saved = snapshotModelRig(target);
    transferPose(saved, source); transferPose(source, target);
    for (const role of ['Spine', 'Head', 'LeftShoulder', 'RightShoulder']) {
      assert.ok(target.joints.get(role).getWorldQuaternion(new Quaternion()).angleTo(saved.joints.get(role).getWorldQuaternion(new Quaternion())) < .002, `${id}: ${role} roundtrip`);
    }
    copyModelPose(saved, target); assert.deepEqual(snapshot(), edited);
    [...target.bones.values()].forEach(({ object }, i) => close(object.position, offsets[i]));
  }
});

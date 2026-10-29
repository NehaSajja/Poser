import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig } from '../src/poser2/modelRig.js';
import { retargetPose } from '../src/poser2/contactRetarget.js';
import { getAssetPath } from '../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../server/pose-retrieval/preview.mjs';
import { skinTransforms, blendDualQuaternion, deformGeometry } from '../src/poser2/experiments/skinning.js';
import { torsoChain, captureTorso, aimTorso } from '../src/poser2/torsoControl.js';
import { headControl, captureHead, rotateHead } from '../src/poser2/headControl.js';
import { shoulderControls, captureShoulder, raiseShoulder } from '../src/poser2/shoulderControl.js';

globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, data); } };
async function load(id) {
  const bytes = await fs.readFile(id === 'mpfb' ? new URL('../public/models/mpfb-neutral.fbx', import.meta.url) : getAssetPath(id));
  return prepareModelRig(captureRig(new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')), id);
}
const transformed = (q, p = new Vector3()) => {
  const d = new Quaternion(p.x, p.y, p.z, 0).multiply(q);
  d.set(d.x / 2, d.y / 2, d.z / 2, d.w / 2);
  return { real: q, dual: d, matrix: new Matrix4().compose(p, q, new Vector3(1, 1, 1)) };
};
const blend = (items, weights) => {
  const q = new Quaternion(), p = new Vector3();
  blendDualQuaternion(items, [0, 1, 0, 0], weights, q, p);
  return { q, p };
};

test('DQS preserves rigid transforms and quaternion sign equivalence', () => {
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.4), p = new Vector3(2, -3, 4);
  const a = transformed(q, p), b = transformed(new Quaternion(-q.x, -q.y, -q.z, -q.w), p);
  const result = blend([a, b], [.4, .6, 0, 0]);
  assert.ok(result.q.angleTo(q) < 1e-7); assert.ok(result.p.distanceTo(p) < 1e-7);
  const one = blend([a], [1, 0, 0, 0]);
  assert.ok(one.p.distanceTo(p) < 1e-7);
});

test('DQS retains radius in a twist where linear blending collapses it', () => {
  const a = transformed(new Quaternion()), b = transformed(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
  const vertex = new Vector3(1, 0, 0);
  const linear = vertex.clone().applyMatrix4(a.matrix).multiplyScalar(.5).addScaledVector(vertex.clone().applyMatrix4(b.matrix), .5);
  const { q, p } = blend([a, b], [.5, .5, 0, 0]);
  const dual = vertex.clone().applyQuaternion(q).add(p);
  assert.ok(linear.length() < 1e-6); assert.ok(Math.abs(dual.length() - 1) < 1e-6);
});

test('MakeHuman rest geometry agrees and unsupported nonrigid bones are rejected', async () => {
  const rig = await load('mpfb');
  rig.root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry.clone(); deformGeometry(mesh, geometry, 'dual');
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const a = new Vector3().fromBufferAttribute(geometry.attributes.position, i);
      const b = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
      assert.ok(a.distanceTo(b) < 1e-4);
    }
    geometry.dispose();
  });
  rig.joints.get('LeftArm').scale.x *= 1.2; updateRigMatrices(rig);
  rig.root.traverse(mesh => { if (mesh.isSkinnedMesh) assert.throws(() => skinTransforms(mesh), /scale or shear/); });
});

test('six benchmark poses and combined upper-body edits use identical transforms with valid surfaces', async t => {
  const catalog = JSON.parse(await fs.readFile(new URL('../data/cloud-retrieval/catalog.json', import.meta.url), 'utf8'));
  const target = await load('mpfb');
  for (const id of ['2013','1351','201','1010','1176','2933']) {
    const pose = catalog.find(p => String(p.id) === id); assert.ok(pose, id);
    const source = await load(pose.model), preview = await loadRetrievalPreview({ pose, view: 'authored' });
    applyLibraryPose(source, preview.model); retargetPose(source, target);
    for (const edited of [false, true]) {
      if (edited) {
        const torso = torsoChain(target), ref = captureTorso(torso);
        aimTorso(torso, ref.pivot.clone().add(ref.direction.clone().applyAxisAngle(new Vector3(1, 0, 0), .3)), ref);
        const head = headControl(target); rotateHead(head, 55, -35, captureHead(head));
        shoulderControls(target).forEach((c, i) => raiseShoulder(c, i ? -30 : 30, captureShoulder(c)));
      }
      updateRigMatrices(target);
      const before = [...target.bones.values()].map(({object}) => object.quaternion.toArray());
      let maxChange = 0;
      target.root.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        const transforms = skinTransforms(mesh), linear = mesh.geometry.clone(), dual = mesh.geometry.clone();
        deformGeometry(mesh, linear, 'linear', transforms); deformGeometry(mesh, dual, 'dual', transforms);
        for (let i = 0; i < linear.attributes.position.count; i++) {
          const a = new Vector3().fromBufferAttribute(linear.attributes.position, i);
          const b = new Vector3().fromBufferAttribute(dual.attributes.position, i);
          assert.ok(a.distanceTo(mesh.getVertexPosition(i, new Vector3())) < 1e-4, `${id}: baseline differs from Three.js`);
          assert.ok(b.toArray().every(Number.isFinite));
          assert.ok(b.length() < 100, `${id}: exploding mesh`);
          const normal = new Vector3().fromBufferAttribute(dual.attributes.normal, i);
          assert.ok(Math.abs(normal.length() - 1) < 1e-5);
          maxChange = Math.max(maxChange, a.distanceTo(b));
        }
        linear.dispose(); dual.dispose();
      });
      assert.deepEqual([...target.bones.values()].map(({object}) => object.quaternion.toArray()), before);
      t.diagnostic(`${id}${edited ? ' edited' : ''}: maximum surface change ${maxChange.toFixed(3)} mesh units`);
    }
  }
});

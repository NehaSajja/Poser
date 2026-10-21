import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group, Quaternion, Vector3 } from 'three';
import { aimLimb, captureLimb, solveLimb } from '../src/poser2/twoBoneIK.js';

function limb({ transformed = false, straight = false } = {}) {
  const parent = new Group(), root = new Bone(), mid = new Bone(), tip = new Bone();
  parent.add(root); root.add(mid); mid.add(tip);
  mid.position.set(0, 2, 0); tip.position.set(0, 1.7, 0);
  if (!straight) mid.rotation.z = .7;
  if (transformed) { parent.rotation.set(.4, -.7, .2); parent.scale.setScalar(3); parent.position.set(2, 8, -4); }
  parent.updateMatrixWorld(true);
  return { parent, root, mid, tip };
}
const position = bone => bone.getWorldPosition(new Vector3());
const close = (a, b, tolerance = 1e-6) => assert.ok(a.distanceTo(b) < tolerance, `${a.toArray()} != ${b.toArray()}`);

for (const transformed of [false, true]) test(`reachable target preserves lengths and local hand/foot orientation (transformed=${transformed})`, () => {
  const chain = limb({ transformed }), reference = captureLimb(chain);
  const offsets = [chain.mid.position.clone(), chain.tip.position.clone()];
  const target = reference.a.clone().add(new Vector3(1, 1.5, .8).multiplyScalar(transformed ? 3 : 1));
  for (let i = 0; i < 40; i++) solveLimb(chain, target, reference);
  close(position(chain.tip), target);
  assert.ok(Math.abs(position(chain.root).distanceTo(position(chain.mid)) - reference.upper) < 1e-6);
  assert.ok(Math.abs(position(chain.mid).distanceTo(position(chain.tip)) - reference.lower) < 1e-6);
  close(chain.mid.position, offsets[0]); close(chain.tip.position, offsets[1]);
  assert.ok(chain.tip.quaternion.angleTo(reference.rotations[2]) < 1e-6);
});

test('dragging a bend hint changes the elbow plane without moving the wrist', () => {
  const chain = limb(), reference = captureLimb(chain);
  const hint = reference.a.clone().add(new Vector3(0, 0, 3));
  solveLimb(chain, reference.c, reference, hint);
  close(position(chain.tip), reference.c);
  assert.ok(position(chain.mid).z > .3);
});

test('unreachable and coincident targets clamp without stretching or NaN', () => {
  const chain = limb(), reference = captureLimb(chain);
  for (const target of [new Vector3(1e5, 1e5, 1e5), reference.a]) {
    solveLimb(chain, target, reference);
    assert.ok([chain.root, chain.mid, chain.tip].every(bone => bone.quaternion.toArray().every(Number.isFinite)));
    assert.ok(Math.abs(position(chain.root).distanceTo(position(chain.mid)) - reference.upper) < 1e-6);
    assert.ok(Math.abs(position(chain.mid).distanceTo(position(chain.tip)) - reference.lower) < 1e-6);
  }
});

test('straight limbs acquire a stable bend and retain it during repeated solving', () => {
  const chain = limb({ straight: true }), reference = captureLimb(chain), target = new Vector3(.1, 2.7, 0);
  solveLimb(chain, target, reference); const elbow = position(chain.mid);
  for (let i = 0; i < 100; i++) solveLimb(chain, target, reference);
  close(position(chain.mid), elbow); close(position(chain.tip), target);
});

test('elbow dragging carries the wrist instead of silently pinning it', () => {
  const chain = limb({ transformed: true }), reference = captureLimb(chain);
  const target = reference.b.clone().add(new Vector3(2, 1, 1));
  aimLimb(chain, target, reference);
  const expected = target.clone().sub(reference.a).normalize().multiplyScalar(reference.upper).add(reference.a);
  close(position(chain.mid), expected);
  assert.ok(position(chain.tip).distanceTo(reference.c) > .2);
  assert.ok(chain.mid.quaternion.angleTo(reference.rotations[1]) < 1e-6);
  assert.ok(chain.tip.quaternion.angleTo(reference.rotations[2]) < 1e-6);
});

test('taking a long route during a drag produces the same final pose as dragging there directly', () => {
  for (const solve of [aimLimb, solveLimb]) {
    const chain = limb(), reference = captureLimb(chain), end = new Vector3(1.2, 2, -.5);
    solve(chain, end, reference);
    const expected = [chain.root, chain.mid, chain.tip].map(b => b.quaternion.clone());
    for (let i = 0; i < 100; i++) solve(chain, new Vector3(Math.sin(i) * 2, 1 + Math.cos(i), Math.sin(i * .5)), reference);
    solve(chain, end, reference);
    [chain.root, chain.mid, chain.tip].forEach((b, i) => assert.ok(b.quaternion.angleTo(expected[i]) < 1e-6));
  }
});

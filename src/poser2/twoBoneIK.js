import { Quaternion, Vector3 } from 'three';

const position = bone => bone.getWorldPosition(new Vector3());
const rotation = bone => bone.getWorldQuaternion(new Quaternion());

// Solve in world space, then convert rotations back through each bone's parent.
// Bone offsets/scales never change, including when a target is out of reach.
export function captureLimb(chain) {
  const a = position(chain.root), b = position(chain.mid), c = position(chain.tip);
  const direction = c.clone().sub(a).normalize();
  if (direction.lengthSq() < .5) direction.copy(b).sub(a).normalize();
  const bend = b.clone().sub(a).addScaledVector(direction, -b.clone().sub(a).dot(direction));
  if (bend.lengthSq() < 1e-10) {
    // Straight limbs have no defined bend plane. Use their local frame, not a
    // camera axis, so orbiting cannot change the solution.
    bend.set(0, 0, 1).applyQuaternion(rotation(chain.root));
    bend.addScaledVector(direction, -bend.dot(direction));
    if (bend.lengthSq() < 1e-10) {
      bend.set(1, 0, 0).applyQuaternion(rotation(chain.root));
      bend.addScaledVector(direction, -bend.dot(direction));
    }
  }
  return { a, b, c, direction, bend: bend.normalize(), upper: a.distanceTo(b), lower: b.distanceTo(c),
    rotations: [chain.root, chain.mid, chain.tip].map(bone => bone.quaternion.clone()) };
}

function setWorldRotation(bone, world) {
  bone.quaternion.copy(rotation(bone.parent).invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}

function restoreLimb(chain, reference) {
  [chain.root, chain.mid, chain.tip].forEach((bone, i) => bone.quaternion.copy(reference.rotations[i]));
  chain.root.updateMatrixWorld(true);
}

function aim(bone, child, desired) {
  const pivot = position(bone);
  const from = position(child).sub(pivot);
  const to = desired.clone().sub(pivot);
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
  setWorldRotation(bone, new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(rotation(bone)));
}

// Mid-joint dragging is direct manipulation: rotate the upper limb, letting
// the lower limb and endpoint follow with their existing local rotations.
export function aimLimb(chain, target, reference) {
  restoreLimb(chain, reference);
  aim(chain.root, chain.mid, target);
}

export function solveLimb(chain, target, reference, hint) {
  restoreLimb(chain, reference);
  const { a, upper, lower } = reference;
  if (Math.min(upper, lower) < 1e-8) return;
  const direction = target.clone().sub(a);
  const epsilon = (upper + lower) * 1e-5;
  const distance = Math.max(Math.abs(upper - lower) + epsilon,
    Math.min(upper + lower - epsilon, direction.length()));
  if (direction.lengthSq() < epsilon * epsilon) direction.copy(reference.direction);
  else direction.normalize();
  const transported = reference.bend.clone().applyQuaternion(
    new Quaternion().setFromUnitVectors(reference.direction, direction));
  const bend = hint ? hint.clone().sub(a) : transported.clone();
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < epsilon * epsilon) bend.copy(transported);
  bend.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const elbow = a.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const end = a.clone().addScaledVector(direction, distance);
  aim(chain.root, chain.mid, elbow);
  aim(chain.mid, chain.tip, end);
  // Keep the endpoint's local rotation, so hands/feet follow the limb naturally.
}

export function limbChains(rig) {
  const bone = name => rig.joints?.get(name) ?? rig.bones.get(`mixamorig${name}`.toLowerCase())?.object;
  return ['Left', 'Right'].flatMap(side => [
    { id: `${side.toLowerCase()}-arm`, labels: [`${side} elbow`, `${side} wrist`],
      root: bone(`${side}Arm`), mid: bone(`${side}ForeArm`), tip: bone(`${side}Hand`) },
    { id: `${side.toLowerCase()}-leg`, labels: [`${side} knee`, `${side} ankle`],
      root: bone(`${side}UpLeg`), mid: bone(`${side}Leg`), tip: bone(`${side}Foot`) },
  ]).filter(chain => chain.root && chain.mid && chain.tip);
}

import { Quaternion, Vector3 } from 'three';

export const SHOULDER_CONTROLS_ENABLED = import.meta.env?.VITE_SHOULDER_CONTROLS !== 'false';
export const SHOULDER_MIN_LIFT = -Math.PI / 9;
export const SHOULDER_MAX_LIFT = Math.PI * 7 / 36;
const RADIANS_PER_PIXEL = Math.PI / 540;

export function shoulderControls(rig) {
  return ['Left', 'Right'].flatMap(side => {
    const root = rig.joints?.get(`${side}Shoulder`), tip = rig.joints?.get(`${side}Arm`);
    const rest = rig.restJoints?.get(`${side}Shoulder`), armRest = rig.restJoints?.get(`${side}Arm`);
    const entry = [...rig.bones.values()].find(item => item.object === root);
    if (!root || !tip || !rest || !armRest || !entry) return [];
    let parent = tip.parent;
    while (parent && parent !== root) parent = parent.parent;
    if (!parent) return [];
    const parentInverse = rest.rotation.clone().multiply(entry.quaternion.clone().invert()).invert();
    const outward = armRest.position.clone().sub(rest.position).normalize();
    // A mirrored hinge for each clavicle, in the torso's rest frame. This lifts
    // toward the neck even when the torso is bent, rotated or lying down.
    const lift = new Vector3(0, 1, 0).addScaledVector(outward, -outward.y).normalize();
    outward.applyQuaternion(parentInverse); lift.applyQuaternion(parentInverse);
    return [{ root, tip, side, outward, lift, axis: outward.clone().cross(lift).normalize() }];
  });
}

export function captureShoulder(control) {
  control.root.updateWorldMatrix(true, true);
  const inverse = control.root.parent.matrixWorld.clone().invert();
  const direction = control.tip.getWorldPosition(new Vector3()).applyMatrix4(inverse)
    .sub(control.root.position).normalize();
  return {
    rotation: control.root.quaternion.clone(),
    elevation: Math.atan2(direction.dot(control.lift), direction.dot(control.outward)),
  };
}

// Positive travel raises the shoulder relative to the torso. Preserve all local
// arm rotations: elbows, wrists and hands travel with the shoulder hierarchy.
export function raiseShoulder(control, travel, reference) {
  control.root.quaternion.copy(reference.rotation);
  if (Number.isFinite(travel)) {
    // Preserve authored poses already outside the range without allowing further
    // travel outward. Repeated gestures cannot creep beyond the same limits.
    const min = Math.min(SHOULDER_MIN_LIFT, reference.elevation);
    const max = Math.max(SHOULDER_MAX_LIFT, reference.elevation);
    const elevation = Math.max(min, Math.min(max, reference.elevation + travel * RADIANS_PER_PIXEL));
    const swing = new Quaternion().setFromAxisAngle(control.axis, elevation - reference.elevation);
    control.root.quaternion.premultiply(swing).normalize();
  }
  control.root.updateMatrixWorld(true);
}

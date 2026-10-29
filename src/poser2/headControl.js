import { Quaternion, Vector3 } from 'three';

export const HEAD_CONTROLS_ENABLED = import.meta.env?.VITE_HEAD_CONTROLS !== 'false';
export const HEAD_MAX_TURN = Math.PI * 5 / 12;
export const HEAD_MAX_NOD = Math.PI / 3;
export const HEAD_DRAG_RADIANS_PER_PIXEL = Math.PI / 360;

export function headControl(rig) {
  const root = rig.joints?.get('Head'), rest = rig.restJoints?.get('Head');
  const neck = rig.restJoints?.get('Neck');
  if (!root || !rest || !neck) return null;
  const entry = [...rig.bones.values()].find(item => item.object === root);
  if (!entry) return null;
  const inverseRest = rest.rotation.clone().invert();
  const right = new Vector3(1, 0, 0).applyQuaternion(inverseRest).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(inverseRest).normalize();
  const forward = new Vector3(0, 0, 1).applyQuaternion(inverseRest).normalize();
  const top = root.children.find(child => /headtop/i.test(child.name));
  const length = top?.position.length() || neck.position.distanceTo(rest.position) / Math.max(rest.scale.y, 1e-8) * 2;
  return {
    root, right,
    // Yaw around the neutral neck-up axis, nod around the head's own right axis.
    // This avoids turning sideways becoming an ear-to-shoulder roll after nodding.
    up: up.clone().applyQuaternion(entry.quaternion).normalize(),
    offset: up.multiplyScalar(length * .55)
      .addScaledVector(forward, length * .3),
  };
}

export function headHandlePosition(control, result = new Vector3()) {
  control.root.updateWorldMatrix(true, false);
  return result.copy(control.offset).applyMatrix4(control.root.matrixWorld);
}

export function captureHead(control) {
  return { rotation: control.root.quaternion.clone() };
}

// x is rightward pointer travel, y is upward travel, both in CSS pixels.
// Limits bound a single gesture, not the full anatomical range of an authored pose.
export function rotateHead(control, x, y, reference) {
  control.root.quaternion.copy(reference.rotation);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const turn = Math.max(-HEAD_MAX_TURN, Math.min(HEAD_MAX_TURN, x * HEAD_DRAG_RADIANS_PER_PIXEL));
    const nod = Math.max(-HEAD_MAX_NOD, Math.min(HEAD_MAX_NOD, y * HEAD_DRAG_RADIANS_PER_PIXEL));
    const yaw = new Quaternion().setFromAxisAngle(control.up, turn);
    const pitch = new Quaternion().setFromAxisAngle(control.right, -nod);
    control.root.quaternion.premultiply(yaw).multiply(pitch).normalize();
  }
  control.root.updateMatrixWorld(true);
}

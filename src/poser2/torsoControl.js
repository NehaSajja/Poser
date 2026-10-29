import { Quaternion, Vector3 } from 'three';
import { limbChains } from './twoBoneIK.js';
import { headControl } from './headControl.js';
import { shoulderControls } from './shoulderControl.js';

// Local experiment: VITE_TORSO_CONTROLS=false restores the original handles.
export const TORSO_CONTROLS_ENABLED = import.meta.env?.VITE_TORSO_CONTROLS !== 'false';
export const TORSO_MAX_SWING = Math.PI / 3;

export function torsoChain(rig) {
  const root = rig.joints?.get('Spine'), tip = rig.joints?.get('Spine2');
  if (!root || !tip) return null;
  let parent = tip.parent;
  while (parent && parent !== root) parent = parent.parent;
  return parent === root ? { root, tip } : null;
}

// A shared ordering keeps dragging, undo and body switching in agreement.
export function editablePoseBones(rig) {
  const torso = torsoChain(rig);
  const head = headControl(rig);
  return [...new Set([
    ...limbChains(rig).flatMap(chain => [chain.root, chain.mid, chain.tip]),
    ...(torso ? [torso.root] : []),
    ...(head ? [head.root] : []),
    ...shoulderControls(rig).map(control => control.root),
  ])];
}

export function captureTorso(chain) {
  chain.root.updateWorldMatrix(true, true);
  const pivot = chain.root.getWorldPosition(new Vector3());
  const parentMatrix = chain.root.parent.matrixWorld.clone();
  const parentInverse = parentMatrix.clone().invert();
  const localPivot = pivot.clone().applyMatrix4(parentInverse);
  return {
    pivot,
    direction: chain.tip.getWorldPosition(new Vector3()).sub(pivot),
    localRotation: chain.root.quaternion.clone(),
    parentMatrix, parentInverse, localPivot,
    localDirection: chain.tip.getWorldPosition(new Vector3()).applyMatrix4(parentInverse).sub(localPivot),
  };
}

export function aimTorso(chain, target, reference) {
  // Always solve from pointer-down: long drags must not accumulate twist.
  chain.root.quaternion.copy(reference.localRotation);
  // Use the parent's full transform, not only its quaternion: authored poses
  // can contain nonuniform scales, which otherwise make the chest miss the cursor.
  const direction = target.clone().applyMatrix4(reference.parentInverse).sub(reference.localPivot);
  const epsilon = Math.max(reference.localDirection.length() * 1e-4, 1e-8);
  if (direction.toArray().every(Number.isFinite) && direction.length() > epsilon && reference.localDirection.length() > epsilon) {
    const swing = new Quaternion().setFromUnitVectors(reference.localDirection.clone().normalize(), direction.normalize());
    const angle = new Quaternion().angleTo(swing);
    // Gesture guard, not a claim of anatomical limits; orbit for another view.
    if (angle > TORSO_MAX_SWING) swing.slerp(new Quaternion(), 1 - TORSO_MAX_SWING / angle);
    chain.root.quaternion.copy(swing.multiply(reference.localRotation)).normalize();
  }
  // Descendant arms, shoulders and head follow. Pelvis, legs and offsets stay fixed.
  chain.root.updateMatrixWorld(true);
}

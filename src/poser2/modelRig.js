import { Quaternion, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { captureRig, updateRigMatrices } from '../poser/libraryPose.js';

const jointRoles = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
for (const side of ['Left', 'Right']) {
  for (const part of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase']) jointRoles.push(`${side}${part}`);
  for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) {
    jointRoles.push(`${side}Hand${finger}${i}`);
  }
}
const nextJoint = { Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' };
for (const side of ['Left', 'Right']) {
  Object.assign(nextJoint, { [`${side}Shoulder`]: `${side}Arm`, [`${side}Arm`]: `${side}ForeArm`,
    [`${side}ForeArm`]: `${side}Hand`, [`${side}Hand`]: `${side}HandMiddle1`,
    [`${side}UpLeg`]: `${side}Leg`, [`${side}Leg`]: `${side}Foot`, [`${side}Foot`]: `${side}ToeBase` });
  for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i < 3; i++) {
    nextJoint[`${side}Hand${finger}${i}`] = `${side}Hand${finger}${i + 1}`;
  }
}
const normalized = name => name.replaceAll(':', '').replaceAll('_', '').toLowerCase();
const worldPosition = bone => bone.getWorldPosition(new Vector3());
const worldRotation = bone => bone.getWorldQuaternion(new Quaternion());

export function prepareModelRig(rig, id) {
  rig.modelId = id;
  rig.joints = new Map();
  for (const role of jointRoles) {
    const entry = rig.bones.get(normalized(`mixamorig${role}`));
    if (entry) rig.joints.set(role, entry.object);
  }
  updateRigMatrices(rig);
  rig.restJoints = new Map([...rig.joints].map(([role, bone]) => [role, {
    position: worldPosition(bone), rotation: worldRotation(bone), scale: bone.getWorldScale(new Vector3()),
  }]));
  rig.stature = ['LeftUpLeg', 'LeftLeg', 'LeftFoot'].slice(1).reduce((sum, name, i) =>
    sum + rig.restJoints.get(name).position.distanceTo(rig.restJoints.get(['LeftUpLeg', 'LeftLeg'][i]).position), 0)
    + rig.restJoints.get('Head').position.distanceTo(rig.restJoints.get('Hips').position);
  return rig;
}

// Transfer world-space joint orientation, correcting each bone's rest direction.
// Target offsets are never copied from the source: each body keeps its lengths.
export function transferPose(source, target) {
  updateRigMatrices(source);
  const sourcePose = new Map([...source.joints].map(([role, bone]) => [role, worldRotation(bone)]));
  const hips = worldPosition(source.joints.get('Hips'));
  const sourceScale = source.joints.get('Hips').getWorldScale(new Vector3()).x / source.restJoints.get('Hips').scale.x;
  target.root.position.copy(target.position); target.root.quaternion.copy(target.quaternion);
  target.root.scale.copy(target.scale).multiplyScalar(sourceScale * source.stature / target.stature);
  for (const entry of target.bones.values()) {
    entry.object.position.copy(entry.position); entry.object.quaternion.copy(entry.quaternion); entry.object.scale.copy(entry.scale);
  }
  updateRigMatrices(target);
  // Traverse the real hierarchy so parents are applied before descendants,
  // including rigs with extra spine/twist bones between mapped joints.
  const roles = new Map([...target.joints].map(([role, bone]) => [bone, role]));
  target.root.traverse(bone => {
    const role = roles.get(bone), posed = sourcePose.get(role);
    if (!posed) return;
    const sourceRest = source.restJoints.get(role), targetRest = target.restJoints.get(role);
    const correction = new Quaternion();
    const child = nextJoint[role];
    if (child && source.restJoints.has(child) && target.restJoints.has(child)) {
      const from = target.restJoints.get(child).position.clone().sub(targetRest.position).normalize();
      const to = source.restJoints.get(child).position.clone().sub(sourceRest.position).normalize();
      correction.setFromUnitVectors(from, to);
    }
    const world = posed.clone().multiply(sourceRest.rotation.clone().invert()).multiply(correction).multiply(targetRest.rotation);
    bone.quaternion.copy(worldRotation(bone.parent).invert().multiply(world)).normalize();
    bone.updateMatrixWorld(true);
  });
  target.root.position.add(hips.sub(worldPosition(target.joints.get('Hips'))));
  updateRigMatrices(target);
}

// Retarget from a stable authored/edited pose, never from the result of the last
// body switch. Geometry is shared; skeletons and transforms are independent.
export function snapshotModelRig(source) {
  const snapshot = captureRig(clone(source.root));
  for (const [name, entry] of snapshot.bones) {
    const rest = source.bones.get(name);
    entry.position.copy(rest.position); entry.quaternion.copy(rest.quaternion); entry.scale.copy(rest.scale);
  }
  snapshot.position.copy(source.position); snapshot.quaternion.copy(source.quaternion); snapshot.scale.copy(source.scale);
  snapshot.modelId = source.modelId; snapshot.stature = source.stature; snapshot.restJoints = source.restJoints;
  snapshot.joints = new Map([...source.joints].map(([role, bone]) => [role, snapshot.bones.get(normalized(bone.name)).object]));
  updateRigMatrices(snapshot);
  return snapshot;
}

export function copyModelPose(source, target) {
  if (source.modelId !== target.modelId) throw new Error('Pose snapshots require the same body.');
  target.root.position.copy(source.root.position); target.root.quaternion.copy(source.root.quaternion); target.root.scale.copy(source.root.scale);
  for (const [name, entry] of target.bones) {
    const bone = source.bones.get(name).object;
    entry.object.position.copy(bone.position); entry.object.quaternion.copy(bone.quaternion); entry.object.scale.copy(bone.scale);
  }
  updateRigMatrices(target);
}

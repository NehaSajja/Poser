const normalizedName = name => name.replaceAll(':', '').replaceAll('_', '').toLowerCase();

export function captureRig(root) {
  const bones = new Map();
  root.traverse(object => {
    if (!object.isBone) return;
    bones.set(normalizedName(object.name), { object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
  });
  return { root, bones, position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone() };
}

function applyTransform(object, transform) {
  if (transform?.position) object.position.fromArray(transform.position);
  if (transform?.quaternion) object.quaternion.fromArray(transform.quaternion).normalize();
  if (transform?.scale) object.scale.fromArray(transform.scale);
}

export function applyLibraryPose(rig, model) {
  rig.root.position.copy(rig.position); rig.root.quaternion.copy(rig.quaternion); rig.root.scale.copy(rig.scale);
  for (const { object, position, quaternion, scale } of rig.bones.values()) {
    object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale);
  }
  applyTransform(rig.root, model.root);
  let applied = 0;
  for (const transform of model.bones || []) {
    const bone = rig.bones.get(normalizedName(transform.name));
    if (!bone) continue;
    applyTransform(bone.object, transform); applied++;
  }
  rig.root.updateMatrixWorld(true);
  rig.root.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });
  if (!applied) throw new Error('The pose does not match the selected bot rig.');
  return applied;
}

export function updateRigMatrices(rig) {
  rig.root.updateMatrixWorld(true);
  rig.root.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });
}

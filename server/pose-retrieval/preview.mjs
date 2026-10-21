import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Vector3 } from 'three';
import { LIBRARY_ROOT, getRig, loadScenePose, serializePose } from '../pose-library/skeleton.mjs';
import { cameraForRig } from '../pose-library/camera.mjs';

// These are the same library poses and view directions used by the thumbnails.
export async function loadRetrievalPreview(row) {
  const scene = JSON.parse(await readFile(join(LIBRARY_ROOT, 'decoded-scenes', row.pose.file), 'utf8'));
  const model = Object.values(scene.sceneObjects).find(item => item.isModel && !item.isHidden && !item.isDeleted);
  const rig = getRig(row.pose.model);
  loadScenePose(rig, scene, model);
  let right = new Vector3(1, 0, 0), up = new Vector3(0, 1, 0);
  if (row.view === 'authored') {
    const { position, target } = scene.orbitControls;
    const out = new Vector3(position.x - target.x, position.y - target.y, position.z - target.z).normalize();
    right = new Vector3(0, 1, 0).cross(out).normalize();
    up = out.clone().cross(right).normalize();
  }
  return { model: serializePose(rig), camera: cameraForRig(rig, { right: right.toArray(), up: up.toArray() }) };
}

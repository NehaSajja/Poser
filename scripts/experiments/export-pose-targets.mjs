import fs from 'node:fs/promises';
import { Vector3, Quaternion } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose } from '../../src/poser/libraryPose.js';
import { prepareModelRig } from '../../src/poser2/modelRig.js';
import { getAssetPath } from '../../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../../server/pose-retrieval/preview.mjs';
globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, data); } };
const catalog = JSON.parse(await fs.readFile('data/cloud-retrieval/catalog.json','utf8'));
const result = [];
for (const id of ['2013','1351','201','1010','1176','2933']) {
 const pose = catalog.find(p => String(p.id) === id), preview = await loadRetrievalPreview({pose,view:'authored'});
 const bytes = await fs.readFile(getAssetPath(pose.model));
 const rig = prepareModelRig(captureRig(new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')),pose.model);
 applyLibraryPose(rig,preview.model);
 const hips = rig.joints.get('Hips').getWorldPosition(new Vector3());
 const height = rig.stature * rig.joints.get('Hips').getWorldScale(new Vector3()).x / rig.restJoints.get('Hips').scale.x;
 const positions = Object.fromEntries([...rig.joints].map(([name,b]) => [name,b.getWorldPosition(new Vector3()).sub(hips).divideScalar(height).toArray()]));
 const orientations = Object.fromEntries([...rig.joints].map(([name,b]) => [name,b.getWorldQuaternion(new Quaternion()).multiply(rig.restJoints.get(name).rotation.clone().invert()).toArray()]));
 result.push({id,name:pose.name,positions,orientations,camera:preview.camera});
}
await fs.writeFile('.local/mhr-pose-targets.json',JSON.stringify(result,null,2));

import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig, transferPose } from '../src/poser2/modelRig.js';
import { retargetPose } from '../src/poser2/contactRetarget.js';

const cases = [['1010','Squatting'],['1011','Deep squat'],['853','Yoga'],['1176','Standing'],['1321','Crossed arms'],['1351','Seated fold'],['201','Kneeling seated'],['2013','Seated'],['1338','Kneeling stretch'],['1451','Kneeling'],['1343','Lying raised leg'],['2273','Lying stomach'],['2599','Crouching'],['2933','Hand on head']];
const selector = document.querySelector('#pose'), angle = document.querySelector('#angle');
for (const [id, label] of cases) selector.add(new Option(`${id} · ${label}`, id));
const load = async id => prepareModelRig(captureRig(await new FBXLoader().loadAsync(`/api/pose-library/assets/${id}.fbx`)), id);
const human = await load('human'), bots = { male: await load('male'), female: await load('female') };
const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(420, 480); renderer.setPixelRatio(1.5);
const scene = new T.Scene(), material = new T.MeshStandardMaterial({ color: '#b8b8b8', roughness: .85 });
for (const rig of [human, ...Object.values(bots)]) rig.root.traverse(o => { if (o.isMesh) { o.material = material; o.frustumCulled = false; } });
scene.add(new T.HemisphereLight(0xffffff, 0x888888, 1));
const light = new T.DirectionalLight(0xffffff, 3); scene.add(light, light.target);
let current;
function shot(rig, id, view) {
  scene.add(rig.root);
  const box = new T.Box3().setFromObject(rig.root, true), center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3()).length();
  const camera = new T.PerspectiveCamera(30, 420 / 480, .1, 10000);
  const direction = angle.value === 'authored' ? new T.Vector3(...view.position).sub(new T.Vector3(...view.target)).normalize()
    : new T.Vector3(...({ front: [0, .1, 1], side: [1, .1, 0], back: [0, .1, -1] }[angle.value])).normalize();
  camera.position.copy(center).addScaledVector(direction, size * 2.1); camera.lookAt(center);
  light.position.copy(center).add(new T.Vector3(size, size, size)); light.target.position.copy(center);
  renderer.render(scene, camera); document.getElementById(id).src = renderer.domElement.toDataURL(); scene.remove(rig.root);
}
async function review() {
  const key = selector.value;
  current = key;
  document.querySelector('#stats').textContent = 'Checking contacts…';
  const preview = await (await fetch(`/api/pose-retrieval/previews/${key}-authored.json`)).json();
  if (current !== key) return;
  const source = bots[preview.model.assetUrl.includes('female') ? 'female' : 'male'];
  applyLibraryPose(source, preview.model); shot(source, 'source', preview.camera);
  transferPose(source, human);
  human.root.position.y += new T.Box3().setFromObject(source.root, true).min.y - new T.Box3().setFromObject(human.root, true).min.y;
  updateRigMatrices(human); shot(human, 'baseline', preview.camera);
  const report = retargetPose(source, human); shot(human, 'result', preview.camera);
  document.querySelector('#stats').textContent = report.contacts.map((contact, i) =>
    `${contact.role} → ${contact.bodyRole || 'floor'}: ${(100 * report.before[i] / report.height).toFixed(2)}% → ${(100 * report.after[i] / report.height).toFixed(2)}% contact error`).join('\n');
}
selector.onchange = angle.onchange = review;
for (const [id, direction] of [['previous', -1], ['next', 1]]) document.getElementById(id).onclick = () => {
  selector.selectedIndex = (selector.selectedIndex + direction + cases.length) % cases.length; review();
};
await review();

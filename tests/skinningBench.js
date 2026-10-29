import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyLibraryPose, captureRig, updateRigMatrices } from '../src/poser/libraryPose.js';
import { prepareModelRig, snapshotModelRig, copyModelPose } from '../src/poser2/modelRig.js';
import { retargetPoseAsync } from '../src/poser2/contactRetarget.js';
import { torsoChain, captureTorso, aimTorso } from '../src/poser2/torsoControl.js';
import { headControl, captureHead, rotateHead } from '../src/poser2/headControl.js';
import { shoulderControls, captureShoulder, raiseShoulder } from '../src/poser2/shoulderControl.js';
import { deformGeometry, skinTransforms } from '../src/poser2/experiments/skinning.js';

export function createSkinningBench(hosts, onTiming, onError = console.error) {
  let disposed = false, version = 0, controller, rig, authored, pending, raf = 0, syncing = false;
  let surfaces = [], home;
  const material = new THREE.MeshStandardMaterial({ color: '#b8b8b8', roughness: .85, metalness: 0 });
  const views = hosts.map(host => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    const ambient = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: .16, depthWrite: false }));
    floor.receiveShadow = true;
    scene.add(ambient, light, light.target, floor);
    return { host, renderer, scene, camera, controls, light, floor };
  });
  const draw = () => { if (!disposed) views.forEach(v => v.renderer.render(v.scene, v.camera)); };
  views.forEach(view => view.controls.addEventListener('change', () => {
    if (syncing || disposed) return;
    syncing = true;
    views.forEach(other => {
      if (other === view) return;
      other.camera.position.copy(view.camera.position); other.camera.quaternion.copy(view.camera.quaternion);
      other.controls.target.copy(view.controls.target); other.controls.update();
    });
    syncing = false; draw();
  }));
  const resize = new ResizeObserver(() => {
    views.forEach(v => {
      const { width, height } = v.host.getBoundingClientRect();
      v.renderer.setSize(width, height); v.camera.aspect = width / Math.max(1, height); v.camera.updateProjectionMatrix();
    }); draw();
  });
  hosts.forEach(host => resize.observe(host));
  function clearSurfaces() {
    surfaces.forEach(({ outputs }) => outputs.forEach((mesh, i) => { views[i].scene.remove(mesh); mesh.geometry.dispose(); }));
    surfaces = [];
  }
  function disposeRig(value) {
    if (!value) return;
    const materials = new Set(), geometries = new Set(), skeletons = new Set();
    value.root.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
      if (o.skeleton) skeletons.add(o.skeleton);
    });
    materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); skeletons.forEach(s => s.dispose());
  }
  function resetCamera() {
    if (!home) return;
    syncing = true;
    views.forEach(v => {
      v.camera.position.copy(home.position); v.controls.target.copy(home.target);
      v.camera.near = home.span / 1000; v.camera.far = home.span * 100;
      v.camera.updateProjectionMatrix(); v.controls.update();
    }); syncing = false; draw();
  }
  function updateSurface() {
    const start = performance.now(); updateRigMatrices(rig);
    for (const { source, outputs } of surfaces) {
      const transforms = skinTransforms(source);
      outputs.forEach((mesh, i) => {
        deformGeometry(source, mesh.geometry, i === 0 ? 'linear' : 'dual', transforms);
        mesh.matrix.copy(source.matrixWorld); mesh.matrixWorldNeedsUpdate = true;
      });
    }
    onTiming(performance.now() - start); draw();
  }
  function applyEdits(values) {
    if (!rig || !authored) return;
    copyModelPose(authored, rig);
    const torso = torsoChain(rig), ref = captureTorso(torso);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.restJoints.get('Spine').rotation.clone().invert())
      .applyQuaternion(torso.root.getWorldQuaternion(new THREE.Quaternion())).normalize();
    aimTorso(torso, ref.pivot.clone().add(ref.direction.clone().applyAxisAngle(right, THREE.MathUtils.degToRad(values.torso))), ref);
    const head = headControl(rig);
    rotateHead(head, values.turn * 2, values.nod * 2, captureHead(head));
    for (const control of shoulderControls(rig)) raiseShoulder(control,
      values[control.side === 'Left' ? 'left' : 'right'] * 3, captureShoulder(control));
    updateSurface();
  }
  function edit(values) {
    pending = values;
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      try { applyEdits(pending); } catch (error) { onError(error); }
    });
  }
  async function load(id) {
    const ownVersion = ++version;
    controller?.abort(); controller = new AbortController(); const signal = controller.signal;
    cancelAnimationFrame(raf); raf = 0; pending = null;
    const current = () => !disposed && ownVersion === version;
    const fetchChecked = async url => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Comparison asset unavailable (${response.status}).`);
      return response;
    };
    const preview = await (await fetchChecked(`/api/pose-retrieval/previews/${id}-authored.json`)).json();
    const buffers = await Promise.all([preview.model.assetUrl, '/models/mpfb-neutral.fbx'].map(async url => (await fetchChecked(url)).arrayBuffer()));
    signal.throwIfAborted();
    const sourceId = preview.model.assetUrl.includes('female') ? 'female' : 'male';
    const source = prepareModelRig(captureRig(new FBXLoader().parse(buffers[0], '')), sourceId);
    const next = prepareModelRig(captureRig(new FBXLoader().parse(buffers[1], '')), 'mpfb');
    try {
      applyLibraryPose(source, preview.model);
      const report = await retargetPoseAsync(source, next, current);
      if (!report || !current()) { disposeRig(next); return; }
      // Fit once with the unchanged app solver, then use identical bone matrices
      // in both panels. Neither side gets a separate pose/contact optimization.
      next.root.traverse(o => { if (o.isSkinnedMesh) skinTransforms(o); });
      clearSurfaces(); disposeRig(rig); rig = next; authored = snapshotModelRig(rig);
      rig.root.traverse(source => {
        if (!source.isSkinnedMesh) return;
        const outputs = views.map(view => {
          const geometry = source.geometry.clone();
          geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
          const mesh = new THREE.Mesh(geometry, material);
          mesh.matrixAutoUpdate = false; mesh.castShadow = mesh.receiveShadow = true;
          view.scene.add(mesh); return mesh;
        });
        surfaces.push({ source, outputs });
      });
      updateSurface();
      const bounds = new THREE.Box3();
      surfaces.forEach(({ outputs }) => outputs.forEach(m => bounds.expandByObject(m, true)));
      const size = bounds.getSize(new THREE.Vector3()), target = bounds.getCenter(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z);
      const aspect = Math.min(...views.map(v => v.camera.aspect));
      const distance = Math.max(size.y, size.x / aspect, size.z) / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2))) * 1.35;
      home = { target, span, position: target.clone().add(new THREE.Vector3(.18, .1, 1).normalize().multiplyScalar(distance)) };
      views.forEach(v => {
        v.floor.position.set(target.x, bounds.min.y - span * .002, target.z); v.floor.scale.setScalar(span * 20);
        v.light.position.copy(target).add(new THREE.Vector3(-2, 3, 4).multiplyScalar(span)); v.light.target.position.copy(target);
        Object.assign(v.light.shadow.camera, { left: -span * 1.5, right: span * 1.5, top: span * 1.5, bottom: -span * 1.5, near: span * .01, far: span * 15 });
        v.light.shadow.camera.updateProjectionMatrix(); v.light.shadow.normalBias = span * .001;
      });
      resetCamera();
    } catch (error) { if (next !== rig) disposeRig(next); throw error; }
    finally { disposeRig(source); }
  }
  return { load, edit, resetCamera, dispose() {
    disposed = true; version++; controller?.abort(); cancelAnimationFrame(raf); resize.disconnect();
    clearSurfaces(); disposeRig(rig); material.dispose();
    views.forEach(v => { v.controls.dispose(); v.floor.geometry.dispose(); v.floor.material.dispose(); v.light.shadow.dispose(); v.renderer.dispose(); v.renderer.domElement.remove(); });
  } };
}

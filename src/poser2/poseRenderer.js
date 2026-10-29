import * as THREE from 'three';
import { MODEL_OPTIONS, MHR_FLOW_ENABLED } from './models';
import { createMhrRig, createMhrHistory } from './mhrRig';
import { prepareModelRig, snapshotModelRig, copyModelPose } from './modelRig';
import { retargetPoseAsync } from './contactRetarget';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mountPoseView } from './interactiveView';
import { applyLibraryPose, captureRig, updateRigMatrices } from '../poser/libraryPose';
import { createContactShadow } from './contactShadow';
import { previewFrame } from './previewFrame';
import { editablePoseBones } from './torsoControl';
import { shoulderControls } from './shoulderControl';
import { clearPoseEdit, createPoseHistory, readPoseEdit, writePoseEdit } from './poseHistory';

// One WebGL context; each body is parsed once and shared by the previews/viewer.
// CSS animates the resulting transparent canvases; there is no idle render loop.
export function createPoseRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 100000);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x888888, 2.5);
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  const contact = createContactShadow(renderer);
  scene.add(ambient, light, light.target, contact.plane);
  const bakeContact = (bounds, side) => contact.bake(scene, bounds, side);
  const material = new THREE.MeshStandardMaterial({ color: '#d3d3d3', roughness: .78, metalness: 0 });
  const humanMaterial = new THREE.MeshStandardMaterial({ color: '#b8b8b8', roughness: .85, metalness: 0 });
  const setBodyLighting = id => {
    const anatomical = MODEL_OPTIONS.find(option => option.id === id)?.anatomical;
    ambient.intensity = anatomical ? 1 : 2.5;
    light.intensity = anatomical ? 3 : 2;
  };
  const nativePreviews = new Map(), nativeRigs = new Set();
  const rigs = new Map(), previews = new Map(), views = new Map(), sessions = new Map();
  let storage;
  try { storage = window.localStorage; } catch { /* Local editing works without storage. */ }
  const editedBones = editablePoseBones;
  const getSession = (item, rig, preview) => {
    const baseSource = JSON.stringify(preview.model);
    const source = baseSource + '|upper-body-v3';
    let session = sessions.get(item.key);
    if (session?.source === source) return session;
    const bones = editedBones(rig);
    const history = createPoseHistory(bones.map(bone => bone.quaternion.toArray()));
    let saved = readPoseEdit(storage, item.key, source, bones.length);
    // New controls are appended, so retain edits from either earlier checkpoint.
    const previousCounts = [[2, bones.length - shoulderControls(rig).length], [1, bones.indexOf(rig.joints.get('Head'))]];
    for (const [version, count] of previousCounts) {
      if (saved || count < 0) continue;
      const previous = readPoseEdit(storage, item.key, `${baseSource}|upper-body-v${version}`, count);
      if (previous) saved = [...previous, ...bones.slice(count).map(bone => bone.quaternion.toArray())];
    }
    if (saved) history.commit(saved);
    session = { source, history }; sessions.set(item.key, session);
    while (sessions.size > 32) sessions.delete(sessions.keys().next().value);
    return session;
  };
  const restoreEdits = (item, rig, preview) => {
    const session = getSession(item, rig, preview), saved = session.history.current;
    editedBones(rig).forEach((bone, i) => bone.quaternion.fromArray(saved[i]));
    updateRigMatrices(rig);
    return session;
  };
  const lifetime = new AbortController();
  let disposed = false, interactive = false;

  function loadRig(url) {
    const model = MODEL_OPTIONS.find(option => option.url === url);
    if (!model) throw new Error('Unknown pose model.');
    if (!rigs.has(url)) {
      rigs.set(url, fetch(url, { signal: lifetime.signal }).then(async response => {
        if (!response.ok) throw new Error('Model unavailable.');
        const bytes = await response.arrayBuffer();
        if (disposed) throw new Error('Renderer disposed.');
        const root = new FBXLoader().parse(bytes, '');
        const originalMaterials = new Set();
        root.traverse(object => {
          if (!object.isMesh) return;
          for (const original of Array.isArray(object.material) ? object.material : [object.material]) {
            if (original) originalMaterials.add(original);
          }
          object.material = model.anatomical ? humanMaterial : material;
          object.frustumCulled = false;
          object.castShadow = true;
          object.receiveShadow = true;
        });
        for (const original of originalMaterials) {
          for (const value of Object.values(original)) if (value?.isTexture) value.dispose();
          original.dispose();
        }
        return prepareModelRig(captureRig(root), model.id);
      }).catch(error => { rigs.delete(url); throw error; }));
    }
    return rigs.get(url);
  }

  async function prepare(item, signal) {
    if (!/^\d+-(authored|front)$/.test(item.key)) throw new Error('Unknown pose.');
    let preview = previews.get(item.key);
    if (!preview) {
      const response = await fetch(`/api/pose-retrieval/previews/${item.key}.json`, { signal });
      if (!response.ok) throw new Error('Pose unavailable.');
      preview = await response.json();
      previews.set(item.key, preview);
      while (previews.size > 24) previews.delete(previews.keys().next().value);
    }
    const rig = await loadRig(preview.model.assetUrl);
    signal.throwIfAborted();
    if (disposed) throw new Error('Renderer disposed.');
    return { preview, rig };
  }

  async function render(item, canvas, size, signal) {
    if (interactive) throw new Error('Interactive view owns the renderer.');
    let { preview, rig } = await prepare(item, signal);
    if (interactive) throw new Error('Interactive view owns the renderer.');
    camera.zoom = 1;
    applyLibraryPose(rig, preview.model);
    restoreEdits(item, rig, preview);
    let modelWarning = '';
    if (MHR_FLOW_ENABLED) {
      // Capture before the await: other carousel items share the source FBX rig.
      const source = snapshotModelRig(rig);
      const cacheKey = item.key + JSON.stringify(getSession(item, rig, preview).history.current);
      try {
        if (!nativePreviews.has(cacheKey)) nativePreviews.set(cacheKey, (async () => {
          const native = await createMhrRig(humanMaterial); nativeRigs.add(native);
          native.mhr.cacheKey = cacheKey;
          try { await native.mhr.fit(source, lifetime.signal); }
          catch (error) { native.mhr.dispose(); nativeRigs.delete(native); throw error; }
          native.mhr.baseline = { packet: native.mhr.capture(), position: native.root.position.clone(), quaternion: native.root.quaternion.clone(), scale: native.root.scale.clone() };
          return native;
        })().catch(error => { nativePreviews.delete(cacheKey); throw error; }));
        rig = await nativePreviews.get(cacheKey);
        signal.throwIfAborted();
        if (interactive || disposed) throw new Error('Interactive view owns the renderer.');
        resetNative(rig);
      } catch (error) {
        signal.throwIfAborted();
        if (interactive || disposed) throw error;
        modelWarning = 'MHR is unavailable. Showing the original body; restart the experimental server to use MHR.';
        // The shared FBX may have changed while MHR was loading.
        applyLibraryPose(rig, preview.model); restoreEdits(item, rig, preview);
      }
    }
    setBodyLighting(rig.modelId);
    scene.add(rig.root);
    const bounds = new THREE.Box3().setFromObject(rig.root, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3()).length();
    const view = preview.camera;
    const direction = new THREE.Vector3(...view.position).sub(new THREE.Vector3(...view.target));
    const horizontal = Math.hypot(direction.x, direction.z);
    // A modest downward view reveals the actual floor. Model and shadow now
    // share one camera and one projection, including their contact points.
    if (horizontal > .001) direction.y = Math.max(direction.y, horizontal * Math.tan(14 * Math.PI / 180));
    direction.normalize();
    camera.position.copy(center).addScaledVector(direction, extent * 4);
    camera.up.set(0, 1, 0);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    // Fit the posed mesh itself after changing elevation, keeping its size at
    // half the viewport and reserving the extra canvas space for the floor.
    const projected = new THREE.Box3();
    const point = new THREE.Vector3();
    rig.root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        projected.expandByPoint(point);
      }
    });
    const side = Math.max(projected.max.x - projected.min.x, projected.max.y - projected.min.y) * 1.02;
    const floor = bakeContact(bounds, side).applyMatrix4(camera.matrixWorldInverse);
    const frame = previewFrame(projected, floor, size);
    Object.assign(camera, { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom });
    camera.updateProjectionMatrix();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const towardCamera = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    const lightPosition = center.clone().addScaledVector(right, -side * .55)
      .addScaledVector(towardCamera, side * .7);
    lightPosition.y = bounds.max.y + side;
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
    Object.assign(light.shadow.camera, { left: -side, right: side, top: side, bottom: -side,
      near: side * .01, far: side * 6 });
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias = -.0001;
    light.shadow.normalBias = side * .0015;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const visualCenter = center.clone().addScaledVector(right, (projected.min.x + projected.max.x) / 2)
      .addScaledVector(up, (projected.min.y + projected.max.y) / 2);
    views.set(item.key, { preview, rig, bounds, side, center, visualCenter, footprint: frame.body,
      cameraPosition: camera.position.clone(), lightPosition });
    while (views.size > 24) {
      const key = views.keys().next().value, expired = views.get(key); views.delete(key);
      if (expired.rig.mhr) {
        nativePreviews.delete(expired.rig.mhr.cacheKey);
        nativeRigs.delete(expired.rig); expired.rig.mhr.dispose();
      }
    }
    renderer.setSize(frame.width, frame.height, false);
    canvas.width = frame.width; canvas.height = frame.height;
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = frame.width; shadowCanvas.height = frame.height;
    try {
      // Keep body and floor in separate cached images. All carousel shadows
      // can then sit below every body, regardless of the selected slide.
      contact.plane.visible = false;
      light.position.copy(lightPosition);
      renderer.render(scene, camera);
      canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
      rig.root.visible = false;
      contact.plane.visible = true;
      renderer.shadowMap.enabled = false;
      renderer.render(scene, camera);
      shadowCanvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
    } finally {
      renderer.shadowMap.enabled = true;
      rig.root.visible = true;
      scene.remove(rig.root);
    }
    return { shadowCanvas, modelWarning, style: frame.style, body: frame.body, side,
      aspectRatio: (projected.max.x - projected.min.x) / (projected.max.y - projected.min.y) };
  }

  function resetNative(rig) {
    const base = rig.mhr.baseline;
    rig.mhr.apply(base.packet); rig.root.position.copy(base.position); rig.root.quaternion.copy(base.quaternion); rig.root.scale.copy(base.scale); updateRigMatrices(rig);
  }

  function mount(item, container, origin, onControlsChange, { animate } = {}) {
    const view = views.get(item.key);
    if (!view || disposed || interactive) throw new Error('Pose preview is unavailable.');
    interactive = true;
    try {
      if (view.rig.mhr) resetNative(view.rig);
      else applyLibraryPose(view.rig, view.preview.model);
      const session = view.rig.mhr ? { source: 'mhr-native-v1', history: createMhrHistory(view.rig.mhr.state) } : restoreEdits(item, view.rig, view.preview);
      let activeRig = view.rig, activeHistory = session.history;
      let authored = snapshotModelRig(view.rig), revision = 0;
      const solvedAt = new Map([[view.rig, revision]]);
      const histories = new Map([[view.rig, session.history]]);
      let ended = false, switchVersion = 0;
      scene.add(view.rig.root);
      camera.position.copy(view.cameraPosition);
      camera.up.set(0, 1, 0);
      camera.lookAt(view.center);
      camera.updateMatrixWorld(true);
      light.position.copy(view.lightPosition);
      light.target.position.copy(view.center);
      light.target.updateMatrixWorld();
      const side = view.side;
      Object.assign(light.shadow.camera, { left: -side, right: side, top: side, bottom: -side,
        near: side * .01, far: side * 6 });
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.normalBias = side * .0015;
      bakeContact(view.bounds, side);
      let shadowDirty = false;
      const onPoseEdit = () => { shadowDirty = true; };
      let discarded = false;
      const onPoseCommit = () => {
        if (discarded) return;
        authored = snapshotModelRig(activeRig); revision++;
        solvedAt.set(activeRig, revision);
        // History from another body belongs to a different torso/root solve.
        // Keep this body's undo stack; rebuilt bodies get a matching baseline.
        histories.clear(); histories.set(activeRig, activeHistory);
        if (!discarded && activeRig === view.rig && !activeRig.mhr) writePoseEdit(storage, item.key, session.source, activeHistory.current);
      };
      const onClose = () => {
        discarded = true; ended = true; switchVersion++;
        setBodyLighting(view.rig.modelId);
        if (activeRig !== view.rig) {
          scene.remove(activeRig.root); scene.add(view.rig.root); activeRig = view.rig;
        }
        sessions.delete(item.key);
        clearPoseEdit(storage, item.key);
        if (view.rig.mhr) resetNative(view.rig);
        else applyLibraryPose(view.rig, view.preview.model);
        light.position.copy(view.lightPosition);
        onPoseEdit();
      };
      const updateShadow = () => {
        if (!shadowDirty) return;
        shadowDirty = false;
        const bounds = new THREE.Box3().setFromObject(activeRig.root, true);
        // Keep the floor stationary while a limb lifts off it.
        bounds.min.y = Math.min(bounds.min.y, view.bounds.min.y);
        bakeContact(bounds, side);
      };
      const mounted = mountPoseView({ renderer, scene, camera, light, container, view, origin,
        onPoseEdit, onPoseCommit, onClose, updateShadow, history: session.history, onControlsChange, animate });
      return { ...mounted,
        get modelId() { return activeRig.modelId; },
        get bodyShape() { return activeRig.mhr ? {...activeRig.mhr.shape} : null; },
        async setModel(id) {
          const option = MODEL_OPTIONS.find(model => model.id === id);
          if (!option) throw new Error('Unknown model.');
          const version = ++switchVersion;
          const next = option.native ? (view.rig.mhr ? view.rig : await createMhrRig(humanMaterial)) : await loadRig(option.url);
          if (next.mhr) nativeRigs.add(next);
          if (ended || disposed || version !== switchVersion) return false;
          if (next === activeRig) return true;
          // Finish an in-progress joint gesture before taking its current pose.
          await mounted.finishPoseEdit();
          if (ended || disposed || version !== switchVersion) return false;
          const poseRevision = revision;
          if (solvedAt.get(next) !== revision) {
            if (next.mhr) {
              await next.mhr.fit(authored, lifetime.signal);
              if (ended || disposed || version !== switchVersion || revision !== poseRevision) return false;
            }
            else if (next.modelId === authored.modelId) copyModelPose(authored, next);
            else {
              const report = await retargetPoseAsync(authored, next, () => !ended && !disposed && version === switchVersion && revision === poseRevision);
              if (!report) return false;
            }
            solvedAt.set(next, revision);
          }
          const pose = next.mhr ? next.mhr.state : editedBones(next).map(bone => bone.quaternion.toArray());
          activeHistory = histories.get(next);
          if (activeHistory) activeHistory.commit(pose);
          else { activeHistory = next.mhr ? createMhrHistory(pose) : createPoseHistory(pose); histories.set(next, activeHistory); }
          scene.remove(activeRig.root); activeRig = next; scene.add(activeRig.root);
          setBodyLighting(id);
          onPoseEdit();
          mounted.replaceRig(activeRig, activeHistory);
          return true;
        },
        dispose() {
        ended = true; switchVersion++;
        scene.remove(activeRig.root);
        setBodyLighting(view.rig.modelId);
        mounted.dispose();
        scene.remove(view.rig.root);
        interactive = false;
      } };
    } catch (error) {
      scene.remove(view.rig.root);
      interactive = false;
      throw error;
    }
  }

  function dispose() {
    disposed = true;
    lifetime.abort();
    for (const pending of rigs.values()) pending.then(rig => {
      const geometries = new Set(), skeletons = new Set();
      rig.root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.skeleton) skeletons.add(object.skeleton);
      });
      geometries.forEach(geometry => geometry.dispose());
      skeletons.forEach(skeleton => skeleton.dispose());
    }).catch(() => {});
    nativeRigs.forEach(rig => rig.mhr.dispose()); nativeRigs.clear(); nativePreviews.clear();
    rigs.clear(); previews.clear(); views.clear(); sessions.clear(); scene.clear(); material.dispose(); humanMaterial.dispose();
    contact.dispose(); light.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }

  return { render, mount, dispose };
}

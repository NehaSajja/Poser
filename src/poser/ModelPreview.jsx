import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function disposeModel(root) {
  root.traverse(object => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

export default function ModelPreview({ url, onError }) {
  const host = useRef(null);
  useEffect(() => {
    const container = host.current;
    const abort = new AbortController();
    let disposed = false, frame = 0, model, renderer;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { onError('The 3D preview needs WebGL enabled in this browser.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', '3D pose. Drag to orbit, scroll to zoom.');
    renderer.domElement.setAttribute('role', 'img');
    container.appendChild(renderer.domElement);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.minDistance = 1.5;
    orbit.maxDistance = 20;
    // Fixed neutral illumination, with no lighting UI or editing controls.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8b8b8b, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-3, 5, 6); scene.add(light);
    const render = () => {
      frame = 0;
      orbit.update();
      renderer.render(scene, camera);
    };
    const invalidate = () => { if (!disposed && !frame) frame = requestAnimationFrame(render); };
    orbit.addEventListener('change', invalidate);
    let fitted = false;
    function fit() {
      const distance = 1.6 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 1 / camera.aspect);
      camera.position.set(0, .15, distance); orbit.target.set(0, 0, 0); orbit.update(); fitted = true;
    }
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height; camera.updateProjectionMatrix();
      if (!fitted) fit();
      invalidate();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(resource => {
      if (resource.startsWith('blob:') || resource.startsWith('data:')) return resource;
      throw new Error('External model assets are not supported.');
    });
    async function load() {
      try {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error('Model unavailable');
        const gltf = await new GLTFLoader(manager).parseAsync(await response.arrayBuffer(), '');
        if (disposed) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        model.traverse(object => {
          if (!object.isMesh) return;
          if (!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) if (material.isMeshStandardMaterial) {
            material.metalness = 0; material.roughness = .8;
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(longest) || longest <= 0) throw new Error('Empty model');
        const scale = 2.6 / longest;
        model.scale.multiplyScalar(scale); model.position.sub(center.multiplyScalar(scale));
        scene.add(model); fit(); invalidate();
      } catch {
        if (!disposed) onError('The 3D model could not be displayed. Generate again to retry.');
      }
    }
    load();
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); observer.disconnect(); orbit.dispose();
      if (model) disposeModel(model);
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [url, onError]);
  return <div className="poser-model" ref={host}/>;
}

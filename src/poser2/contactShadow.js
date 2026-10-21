import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

// Depth-based contact shadows, following the official Three.js example:
// https://threejs.org/examples/webgl_shadow_contact.html
// Baked once per pose; only geometry close to the floor contributes.
export function createContactShadow(renderer) {
  const target = new THREE.WebGLRenderTarget(512, 512);
  const temporary = new THREE.WebGLRenderTarget(512, 512);
  target.texture.generateMipmaps = temporary.texture.generateMipmaps = false;
  const camera = new THREE.OrthographicCamera();
  const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depth.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.0 ) );',
    );
  };
  const horizontal = new THREE.ShaderMaterial(HorizontalBlurShader);
  const vertical = new THREE.ShaderMaterial(VerticalBlurShader);
  const quad = new FullScreenQuad(horizontal);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, opacity: .48,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));

  function bake(scene, bounds, side) {
    // Include a clear margin wider than both blur kernels around the geometry.
    const margin = side * .18;
    const width = bounds.max.x - bounds.min.x + margin * 2;
    const height = bounds.max.z - bounds.min.z + margin * 2;
    plane.position.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y - side * .0001,
      (bounds.min.z + bounds.max.z) / 2);
    plane.scale.set(width, 1, height);
    plane.updateMatrixWorld(true);
    camera.position.copy(plane.position);
    camera.up.set(0, 0, 1);
    camera.lookAt(plane.position.clone().add(new THREE.Vector3(0, 1, 0)));
    Object.assign(camera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2,
      near: 0, far: Math.max(side * .12, (bounds.max.y - bounds.min.y) * .5) });
    camera.updateProjectionMatrix();
    const previousOverride = scene.overrideMaterial;
    const previousTarget = renderer.getRenderTarget();
    const previousShadows = renderer.shadowMap.enabled;
    plane.visible = false;
    renderer.shadowMap.enabled = false;
    try {
      scene.overrideMaterial = depth;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      scene.overrideMaterial = previousOverride;
      for (const amount of [.004, .0016]) {
        quad.material = horizontal;
        horizontal.uniforms.tDiffuse.value = target.texture;
        horizontal.uniforms.h.value = side * amount / width;
        renderer.setRenderTarget(temporary);
        quad.render(renderer);
        quad.material = vertical;
        vertical.uniforms.tDiffuse.value = temporary.texture;
        vertical.uniforms.v.value = side * amount / height;
        renderer.setRenderTarget(target);
        quad.render(renderer);
      }
    } finally {
      scene.overrideMaterial = previousOverride;
      renderer.setRenderTarget(previousTarget);
      renderer.shadowMap.enabled = previousShadows;
      plane.visible = true;
    }
    return new THREE.Box3().setFromObject(plane);
  }

  function dispose() {
    target.dispose(); temporary.dispose(); depth.dispose(); horizontal.dispose(); vertical.dispose();
    plane.geometry.dispose(); plane.material.dispose(); quad.dispose();
  }
  return { plane, bake, dispose };
}

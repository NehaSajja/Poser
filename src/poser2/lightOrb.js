import { Color, Group, Mesh, ShaderMaterial, SphereGeometry } from 'three';

// The main camera sees editing helpers; the floor's contact-shadow camera does not.
export const LIGHT_ORB_LAYER = 1;

const vertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export function createLightOrb(radius) {
  const object = new Group();
  object.name = 'Light orb';
  const geometry = new SphereGeometry(radius, 48, 32);
  const coreMaterial = new ShaderMaterial({
    uniforms: {
      shade: { value: new Color('#f5bc60') },
      light: { value: new Color('#fff0c8') },
    },
    vertexShader,
    fragmentShader: /* glsl */`
      uniform vec3 shade;
      uniform vec3 light;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 viewDirection = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        float facing = max(dot(n, viewDirection), 0.0);
        float illumination = dot(n, normalize(vec3(-0.45, 0.65, 0.75))) * 0.5 + 0.5;
        vec3 color = mix(shade, light, smoothstep(0.0, 0.95, illumination));
        float highlight = pow(max(dot(n, normalize(vec3(-0.3, 0.5, 0.9))), 0.0), 10.0);
        color = mix(color, vec3(1.0), highlight * 0.2);
        // Fade across the whole sphere, rather than only the last few edge pixels.
        gl_FragColor = vec4(color, pow(facing, 1.5) * 0.94);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
  });
  const glowMaterial = new ShaderMaterial({
    uniforms: { color: { value: new Color('#ffc46d') }, strength: { value: .42 } },
    vertexShader,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform float strength;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 viewDirection = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        float facing = max(dot(normalize(vNormal), viewDirection), 0.0);
        float radiusSquared = 1.0 - facing * facing;
        float glow = exp(-3.5 * radiusSquared) * smoothstep(0.0, 0.7, facing);
        gl_FragColor = vec4(color, glow * strength);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
  });
  const core = new Mesh(geometry, coreMaterial);
  const glow = new Mesh(geometry, glowMaterial);
  core.name = 'Light orb core'; glow.name = 'Light orb glow';
  core.layers.set(LIGHT_ORB_LAYER); glow.layers.set(LIGHT_ORB_LAYER);
  glow.scale.setScalar(3.8);
  glow.raycast = () => {}; // Only the solid core is a drag target.
  core.renderOrder = 2; glow.renderOrder = 1;
  object.add(core, glow);
  return {
    object, core,
    setActive(active) { glowMaterial.uniforms.strength.value = active ? .52 : .42; },
    dispose() {
      object.removeFromParent();
      geometry.dispose(); coreMaterial.dispose(); glowMaterial.dispose();
    },
  };
}

export function pickLightOrb(raycaster, orb, scene) {
  if (!orb.object.visible) return false;
  scene.updateMatrixWorld(true);
  const hit = raycaster.intersectObject(orb.core, false)[0];
  if (!hit) return false;
  const blockers = [];
  scene.traverseVisible(object => {
    if (object.isMesh && object.castShadow) blockers.push(object);
  });
  // Respect the same model occlusion as the renderer when beginning a drag.
  return !raycaster.intersectObjects(blockers, false).some(blocker => blocker.distance < hit.distance);
}

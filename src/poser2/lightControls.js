import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { createJointDrag } from './jointDrag';
import { createLightOrb, LIGHT_ORB_LAYER, pickLightOrb } from './lightOrb';

// The orb marks the light's direction near the model. The directional light stays
// at its original distance so moving the orb preserves the shadow-camera bounds.
export function createLightControls({ scene, light, camera, container, canvas, orbit, view, invalidate }) {
  const center = view.center.clone();
  const distance = light.position.distanceTo(center);
  const orb = createLightOrb(view.side * .032);
  const position = orb.object.position.copy(light.position).sub(center).normalize()
    .multiplyScalar(view.side * .65).add(center);
  orb.object.visible = false;
  scene.add(orb.object);
  const hadOrbLayer = camera.layers.isEnabled(LIGHT_ORB_LAYER);
  camera.layers.enable(LIGHT_ORB_LAYER);

  // Keyboard access only; all visible geometry and pointer picking live in 3D.
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'poser2-light-keyboard'; button.hidden = true;
  button.setAttribute('aria-label', 'Light position');
  button.setAttribute('aria-description', 'Drag the orb to move the light. Arrow keys move it; Shift moves further. Orbit the model to adjust depth.');
  container.append(button);
  const ray = new Raycaster(), plane = new Plane(), point = new Vector3(), pointer = new Vector2();
  ray.layers.enable(LIGHT_ORB_LAYER);
  const originalCursor = canvas.style.cursor;
  let enabled = false, hovered = false;
  const refresh = () => {
    const active = enabled && (hovered || drag.active || document.activeElement === button);
    orb.setActive(active);
    canvas.style.cursor = enabled && drag.active ? 'grabbing' : hovered ? 'grab' : originalCursor;
    invalidate();
  };
  const apply = () => {
    const direction = position.clone().sub(center);
    if (direction.lengthSq() > view.side ** 2 * .0025) {
      light.position.copy(center).addScaledVector(direction.normalize(), distance);
    }
    invalidate();
  };
  const setRay = event => {
    const box = container.getBoundingClientRect();
    pointer.set((event.clientX - box.left) / box.width * 2 - 1,
      1 - (event.clientY - box.top) / box.height * 2);
    camera.updateMatrixWorld(); ray.setFromCamera(pointer, camera);
  };
  const hitPlane = event => { setRay(event); return ray.ray.intersectPlane(plane, point); };
  const drag = createJointDrag({ surface: container,
    begin(event) {
      if (!enabled) return null;
      button.focus({ preventScroll: true });
      orbit.enableDamping = false; orbit.update(); orbit.enableDamping = true;
      camera.updateMatrixWorld();
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), position);
      const intersection = hitPlane(event);
      if (!intersection) return null;
      const orbitEnabled = orbit.enabled;
      orbit.enabled = false;
      return { before: position.clone(), lightBefore: light.position.clone(), offset: position.clone().sub(intersection), orbitEnabled };
    },
    move(active, event) {
      const intersection = hitPlane(event);
      if (intersection) { position.copy(intersection).add(active.offset); apply(); }
    },
    end(active, reason) {
      orbit.enabled = active.orbitEnabled;
      if (reason === 'escape') {
        position.copy(active.before); light.position.copy(active.lightBefore);
      }
      refresh();
    },
  });
  const pointerDown = event => {
    if (!enabled || event.target !== canvas || event.button !== 0) return;
    setRay(event);
    if (pickLightOrb(ray, orb, scene)) { drag.start(event); refresh(); }
  };
  const pointerMove = event => {
    if (!enabled || drag.active) return;
    setRay(event);
    const next = event.target === canvas && event.buttons === 0 && pickLightOrb(ray, orb, scene);
    if (next !== hovered) { hovered = next; refresh(); }
  };
  const pointerLeave = () => { hovered = false; refresh(); };
  container.addEventListener('pointerdown', pointerDown, true);
  container.addEventListener('pointermove', pointerMove);
  container.addEventListener('pointerleave', pointerLeave);
  button.addEventListener('focus', refresh); button.addEventListener('blur', refresh);
  button.addEventListener('keydown', event => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (!enabled || !directions[event.key] || drag.active) return;
    event.preventDefault(); event.stopPropagation();
    const [x, y] = directions[event.key];
    const step = (camera.top - camera.bottom) / camera.zoom / container.clientHeight * (event.shiftKey ? 16 : 4);
    position.add(new Vector3(x * step, y * step, 0).applyQuaternion(camera.quaternion)); apply();
  });
  const escape = event => {
    if (event.key === 'Escape' && drag.active) {
      event.preventDefault(); event.stopPropagation(); drag.finish('escape');
    }
  };
  container.addEventListener('keydown', escape);
  return {
    setEnabled(value) {
      if (!value) drag.finish('hide');
      enabled = value; hovered = false;
      if (!value && document.activeElement === button) canvas.focus({ preventScroll: true });
      orb.object.visible = value; button.hidden = !value;
      refresh();
    },
    dispose() {
      drag.dispose();
      container.removeEventListener('pointerdown', pointerDown, true);
      container.removeEventListener('pointermove', pointerMove);
      container.removeEventListener('pointerleave', pointerLeave);
      container.removeEventListener('keydown', escape);
      button.removeEventListener('focus', refresh); button.removeEventListener('blur', refresh);
      canvas.style.cursor = originalCursor;
      button.remove(); orb.dispose();
      if (!hadOrbLayer) camera.layers.disable(LIGHT_ORB_LAYER);
    },
  };
}

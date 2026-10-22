import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { poseTransitionDuration, poseViewFit } from './viewTransition';
import { createJointControls } from './jointControls';
import { createLightControls } from './lightControls';

export function mountPoseView({ renderer, scene, camera, light, container, view, origin, onPoseEdit, onPoseCommit, onClose, updateShadow, history, onControlsChange, animate = true }) {
  const body = { width: view.side * view.footprint.width, height: view.side * view.footprint.height };
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const offset = view.cameraPosition.clone().sub(view.center);
  const fit = () => poseViewFit(body, container.getBoundingClientRect(), origin());
  const initial = fit();
  const baseScale = initial.initialScale;
  const originTarget = sizing => view.visualCenter.clone()
    .addScaledVector(right, -sizing.offsetX).addScaledVector(up, sizing.offsetY);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.copy(originTarget(initial));
  camera.position.copy(orbit.target).add(offset);
  camera.zoom = 1;
  orbit.minZoom = .25;
  orbit.maxZoom = 8;
  orbit.maxPolarAngle = Math.PI / 2 - .01;
  orbit.enabled = false;
  orbit.update();
  let frame = 0, animation = 0, transitioning = false, closed = false, closing = false, entered = false, adjusted = false;
  let joints, lightControls, rigging = false, lighting = false;
  const paint = () => { updateShadow(); joints?.update(); renderer.render(scene, camera); };
  const invalidate = () => {
    if (closed || animation || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; orbit.update(); paint(); });
  };
  joints = createJointControls({ rig: view.rig, camera, container, orbit, invalidate, onEdit: onPoseEdit, onCommit: onPoseCommit, history, onControlsChange });
  lightControls = createLightControls({ scene, light, camera, container, canvas: renderer.domElement, orbit, view, invalidate });
  orbit.addEventListener('change', invalidate);
  orbit.listenToKeyEvents(renderer.domElement);
  const focus = event => {
    // A new drag can take over immediately, even during the camera move.
    if (event && transitioning && !closing) {
      cancelAnimationFrame(animation); animation = 0; transitioning = false;
      invalidate();
      entered = true; orbit.enabled = true; orbit.enableDamping = true; joints.setEnabled(rigging); lightControls.setEnabled(lighting);
    }
    renderer.domElement.focus({ preventScroll: true });
  };
  orbit.addEventListener('start', () => { adjusted = true; });
  renderer.domElement.addEventListener('pointerdown', focus, true);
  renderer.domElement.setAttribute('aria-label', '3D pose. Drag to orbit, Shift-drag or right-drag to pan, scroll to zoom.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.tabIndex = 0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    Object.assign(camera, { left: -width / baseScale / 2, right: width / baseScale / 2,
      top: height / baseScale / 2, bottom: -height / baseScale / 2 });
    if (entered && !adjusted && !closing) camera.zoom = fit().focusedScale / baseScale;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    // setSize clears the WebGL drawing buffer. ResizeObserver runs after RAF,
    // so deferring this paint exposes an empty canvas during the panel animation.
    // Repaint synchronously, including while the camera transition owns the RAF.
    paint();
  };
  // Paint the exact thumbnail camera before exposing the canvas. No blank frame.
  resize();
  container.appendChild(renderer.domElement);
  focus();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  function transition(target, position, zoom, done, shouldAnimate = true) {
    cancelAnimationFrame(animation);
    cancelAnimationFrame(frame); frame = 0;
    transitioning = true;
    orbit.enabled = false;
    orbit.enableDamping = false;
    const fromTarget = orbit.target.clone(), fromZoom = camera.zoom;
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(fromTarget));
    const to = new THREE.Spherical().setFromVector3(position.clone().sub(target));
    // Travel around the pose when returning from an orbited view, never through it.
    const angle = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    const started = performance.now();
    const duration = poseTransitionDuration(shouldAnimate, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const tick = now => {
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      const t = 1 - (1 - progress) ** 3;
      if (transitioning) {
        orbit.target.lerpVectors(fromTarget, target, t);
        camera.position.setFromSphericalCoords(from.radius + (to.radius - from.radius) * t,
          from.phi + (to.phi - from.phi) * t, from.theta + angle * t).add(orbit.target);
        camera.zoom = fromZoom + (zoom - fromZoom) * t;
      }
      camera.updateProjectionMatrix();
      orbit.update();
      paint();
      if (progress < 1) animation = requestAnimationFrame(tick);
      else {
        animation = 0; transitioning = false;
        orbit.enabled = true; orbit.enableDamping = true;
        done?.();
        // Hand any remaining orbit momentum back to the event-driven renderer.
        invalidate();
      }
    };
    if (duration) animation = requestAnimationFrame(tick);
    else tick(started);
  }
  transition(view.visualCenter, view.visualCenter.clone().add(offset), initial.focusedScale / baseScale,
    () => { entered = true; joints.setEnabled(rigging); lightControls.setEnabled(lighting); }, animate);

  return {
    setLighting(value) {
      lighting = value;
      lightControls.setEnabled(value && entered && !closing);
    },
    setRigging(value) {
      rigging = value;
      joints.setEnabled(value && entered && !closing);
      invalidate();
    },
    undo: () => joints.undo(),
    redo: () => joints.redo(),
    finishPoseEdit: () => joints.finish(),
    replaceRig(rig, nextHistory) {
      joints.dispose();
      joints = createJointControls({ rig, camera, container, orbit, invalidate, onEdit: onPoseEdit,
        onCommit: onPoseCommit, history: nextHistory, onControlsChange });
      joints.setEnabled(rigging && entered && !closing);
      invalidate();
    },
    close(done, shouldAnimate = true) {
      if (closing || closed) return;
      joints.setEnabled(false);
      lightControls.setEnabled(false);
      closing = true;
      // Finish any active gesture before discarding its edits and returning to the carousel.
      onClose();
      const sizing = fit(), target = originTarget(sizing);
      transition(target, target.clone().add(offset), sizing.initialScale / baseScale, done, shouldAnimate);
    },
    dispose() {
      lightControls.dispose();
      joints.dispose();
      closed = true;
      cancelAnimationFrame(frame); cancelAnimationFrame(animation);
      observer.disconnect(); orbit.dispose();
      renderer.domElement.removeEventListener('pointerdown', focus, true);
      renderer.domElement.remove();
      camera.zoom = 1;
      renderer.setPixelRatio(1);
    },
  };
}

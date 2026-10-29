import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { aimLimb, captureLimb, limbChains, solveLimb } from './twoBoneIK';
import { createJointDrag } from './jointDrag';
import { updateRigMatrices } from '../poser/libraryPose';
import { aimTorso, captureTorso, editablePoseBones, torsoChain, TORSO_CONTROLS_ENABLED } from './torsoControl';

export function createJointControls({ rig, camera, container, orbit, invalidate, onEdit, onCommit, history, onControlsChange }) {
  const chains = limbChains(rig);
  const bones = editablePoseBones(rig);
  const torso = TORSO_CONTROLS_ENABLED && torsoChain(rig);
  const anchor = handle => handle.kind === 'torso' ? handle.chain.tip : handle.chain[handle.kind];
  const capture = handle => handle.kind === 'torso' ? captureTorso(handle.chain) : captureLimb(handle.chain);
  const snapshot = () => bones.map(bone => bone.quaternion.toArray());
  const refreshActions = () => onControlsChange?.({ canUndo: history.canUndo, canRedo: history.canRedo });
  const repaint = () => { updateRigMatrices(rig); onEdit(); invalidate(); };
  const apply = state => {
    if (!state) return;
    bones.forEach((bone, i) => bone.quaternion.fromArray(state[i]));
    repaint();
  };
  const commit = () => { history.commit(snapshot()); onCommit(); refreshActions(); };
  const overlay = document.createElement('div');
  overlay.className = 'poser2-joints';
  overlay.setAttribute('role', 'group'); overlay.setAttribute('aria-label', 'Pose joints');
  overlay.inert = true; container.append(overlay);
  const ray = new Raycaster(), plane = new Plane(), point = new Vector3();
  let enabled = false;
  const hit = event => {
    const box = container.getBoundingClientRect();
    ray.setFromCamera(new Vector2((event.clientX - box.left) / box.width * 2 - 1,
      1 - (event.clientY - box.top) / box.height * 2), camera);
    return ray.ray.intersectPlane(plane, point);
  };
  const moveJoint = (handle, target, reference) => {
    if (handle.kind === 'torso') aimTorso(handle.chain, target, reference);
    else if (handle.kind === 'mid') aimLimb(handle.chain, target, reference);
    else solveLimb(handle.chain, target, reference);
    repaint();
  };
  const drag = createJointDrag({
    surface: container,
    begin(event, handle) {
      if (!enabled) return null;
      const { button } = handle;
      button.focus({ preventScroll: true });
      orbit.enableDamping = false; orbit.update(); orbit.enableDamping = true;
      camera.updateMatrixWorld();
      const start = anchor(handle).getWorldPosition(new Vector3());
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), start);
      const intersection = hit(event);
      if (!intersection) return null;
      const orbitEnabled = orbit.enabled;
      orbit.enabled = false; button.dataset.dragging = 'true';
      return { ...handle, before: snapshot(), reference: capture(handle), offset: start.sub(intersection), orbitEnabled };
    },
    move(active, event) {
      const intersection = hit(event);
      if (intersection) moveJoint(active, intersection.clone().add(active.offset), active.reference);
    },
    end(active, reason) {
      active.button.removeAttribute('data-dragging'); orbit.enabled = active.orbitEnabled;
      if (reason === 'escape') { apply(active.before); refreshActions(); }
      else commit();
    },
  });
  const specifications = chains.flatMap(chain => ['mid', 'tip'].map((kind, index) => ({ chain, kind, label: chain.labels[index] })));
  if (torso) specifications.push({ chain: torso, kind: 'torso', label: 'Torso tilt' });
  const handles = specifications.map(({ chain, kind, label }) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'poser2-joint';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.joint = kind;
    button.setAttribute('aria-description', kind === 'torso'
      ? 'Drag to tilt the upper body; arms and head follow. Orbit for a different direction. Arrow keys tilt; Shift moves further.'
      : 'Drag to pose. Arrow keys move this joint; Shift moves further.');
    const handle = { chain, kind, button };
    button.addEventListener('pointerdown', event => drag.start(event, handle));
    button.addEventListener('keydown', event => {
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (!enabled || !directions[event.key] || drag.active) return;
      event.preventDefault(); event.stopPropagation();
      const reference = capture(handle), [x, y] = directions[event.key];
      const step = (camera.top - camera.bottom) / camera.zoom / container.clientHeight * (event.shiftKey ? 16 : 4);
      const target = anchor(handle).getWorldPosition(new Vector3())
        .add(new Vector3(x * step, y * step, 0).applyQuaternion(camera.quaternion));
      moveJoint(handle, target, reference); commit();
    });
    overlay.append(button); return handle;
  });
  const undo = () => { drag.finish('commit'); apply(history.undo()); onCommit(); refreshActions(); };
  const redo = () => { drag.finish('commit'); apply(history.redo()); onCommit(); refreshActions(); };
  const onKeyDown = event => {
    if (event.key === 'Escape' && drag.active) { event.preventDefault(); event.stopPropagation(); drag.finish('escape'); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.stopPropagation();
      if (event.shiftKey) redo(); else undo();
    }
  };
  container.addEventListener('keydown', onKeyDown); refreshActions();
  return {
    undo, redo,
    finish: () => drag.finish('commit'),
    setEnabled(value) {
      if (!value) drag.finish('hide');
      enabled = value; overlay.inert = !value; overlay.dataset.visible = String(value);
    },
    update() {
      camera.updateMatrixWorld();
      const { width, height } = container.getBoundingClientRect();
      for (const handle of handles) {
        const { button } = handle;
        anchor(handle).getWorldPosition(point).project(camera);
        button.style.visibility = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1 ? 'hidden' : 'visible';
        button.style.left = `${(point.x + 1) * width / 2}px`; button.style.top = `${(1 - point.y) * height / 2}px`;
        button.style.zIndex = String(2 + Math.round((1 - point.z) * 100));
      }
    },
    dispose() { drag.dispose(); overlay.remove(); container.removeEventListener('keydown', onKeyDown); },
  };
}

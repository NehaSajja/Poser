const copy = pose => pose.map(quaternion => [...quaternion]);
export const samePose = (a, b) => a.length === b.length && a.every((q, i) =>
  1 - Math.abs(q.reduce((sum, value, j) => sum + value * b[i][j], 0)) < 1e-10);

// A committed pose, never the transient dragged mesh, owns undo/redo state.
export function createPoseHistory(initial) {
  let current = copy(initial);
  const past = [], future = [];
  return {
    get current() { return copy(current); },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    commit(next) {
      if (samePose(current, next)) return false;
      past.push(current);
      if (past.length > 100) past.shift();
      current = copy(next); future.length = 0;
      return true;
    },
    undo() {
      if (!past.length) return null;
      future.push(current); current = past.pop();
      return copy(current);
    },
    redo() {
      if (!future.length) return null;
      past.push(current); current = future.pop();
      return copy(current);
    },
  };
}

// Best-effort local persistence, keyed by both the pose and its source rig.
// A changed source model must not inherit rotations from an older asset.
export function readPoseEdit(storage, key, source, count) {
  try {
    const saved = JSON.parse(storage.getItem(`poser2-edit:${key}`));
    if (saved?.source !== source || saved.rotations?.length !== count) return null;
    if (!saved.rotations.every(q => Array.isArray(q) && q.length === 4 && q.every(Number.isFinite)
      && Math.abs(Math.hypot(...q) - 1) < 1e-4)) return null;
    return saved.rotations;
  } catch { return null; }
}
export function writePoseEdit(storage, key, source, rotations) {
  try { storage.setItem(`poser2-edit:${key}`, JSON.stringify({ source, rotations })); } catch { /* Private mode / full storage: retain the live edit. */ }
}
export function clearPoseEdit(storage, key) {
  try { storage.removeItem(`poser2-edit:${key}`); } catch { /* Local editing works without storage. */ }
}

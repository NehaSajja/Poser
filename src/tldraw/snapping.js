export const SNAP_DISTANCE = 24; // Screen pixels, independent of canvas zoom.
export const TOOL_SNAP_DISTANCE = 8; // Native pointer tools keep tldraw's lighter magnetic feel.

const touches = (a, b) => a.x <= b.x + b.w && a.x + a.w >= b.x &&
  a.y <= b.y + b.h && a.y + a.h >= b.y;

// A magnetic guide must not remove a gap the designer actually drew.
const keepsGaps = (before, after, neighbors) => neighbors.every(other =>
  touches(before, other) || !touches(after, other));

export function matchNearbyEdges(source, neighbors, distance) {
  const box = { ...source };
  for (const [axis, size, cross, crossSize] of [['x', 'w', 'y', 'h'], ['y', 'h', 'x', 'w']]) {
    const candidates = neighbors.map(other => ({
      other,
      error: Math.max(Math.abs(box[axis] - other[axis]), Math.abs(box[axis] + box[size] - other[axis] - other[size])),
      gap: Math.max(0, other[cross] - box[cross] - box[crossSize], box[cross] - other[cross] - other[crossSize]),
    })).filter(candidate => candidate.error <= distance)
      .sort((a, b) => a.gap - b.gap || a.error - b.error);
    for (const { other } of candidates) {
      const next = { ...box, [axis]: other[axis], [size]: other[size] };
      if (!keepsGaps(source, next, neighbors)) continue;
      Object.assign(box, next);
      break;
    }
  }
  return box;
}

export function nudgeKeepingGaps(source, nudge, neighbors) {
  const box = { ...source };
  for (const axis of ['x', 'y']) {
    const next = { ...box, [axis]: box[axis] + nudge[axis] };
    if (keepsGaps(source, next, neighbors)) Object.assign(box, next);
  }
  return box;
}

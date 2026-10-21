// Geometry proposes an ink group; it never removes a component from the API's choices.
export function inkBounds(strokes) {
  const points = strokes.flat();
  if (!points.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function containsBox(outer, inner, padding = 0) {
  return inner.x >= outer.x - padding && inner.y >= outer.y - padding &&
    inner.x + inner.w <= outer.x + outer.w + padding && inner.y + inner.h <= outer.y + outer.h + padding;
}

const area = item => item.box.w * item.box.h;
const inside = (outer, inner) => containsBox(outer, inner, Math.min(outer.w, outer.h) * .08);
const touches = (a, b, padding) => a.x <= b.x + b.w + padding && a.x + a.w >= b.x - padding &&
  a.y <= b.y + b.h + padding && a.y + a.h >= b.y - padding;

// Only a nesting hint: closed glyphs (radio dots, switch thumbs, triangles) can
// belong to an enclosure. Four-corner outlines can instead start child controls.
function hasBoxCorners(drawing) {
  const { x, y, w, h } = drawing.box;
  if (!w || !h) return false;
  const tolerance = Math.min(w, h) * .12;
  const points = drawing.strokes.flat();
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    .every(([cx, cy]) => points.some(p => Math.hypot(p.x - cx, p.y - cy) <= tolerance));
}

export function proposeInkGroup(newIds, drawings, controls, joinDistance) {
  const fresh = drawings.filter(d => newIds.includes(d.id));
  if (!fresh.length) return null;
  const freshBox = inkBounds(fresh.flatMap(d => d.strokes));
  const horizontal = isHorizontalLine(fresh.flatMap(d => d.strokes));
  const freshEnclosure = fresh.find(d => d.closed);
  const enclosing = [...controls, ...drawings.filter(d => d.closed && !fresh.includes(d))]
    .filter(item => inside(item.box, freshBox) && area(item) > freshBox.w * freshBox.h &&
      !(horizontal && freshBox.y + freshBox.h < item.box.y))
    .sort((a, b) => area(a) - area(b))[0];
  const target = freshEnclosure && hasBoxCorners(freshEnclosure) ? freshEnclosure : enclosing || freshEnclosure;
  const control = controls.includes(target) ? target : null;
  const enclosure = control ? null : target;
  let members;
  if (control || enclosure) {
    const outer = control || enclosure;
    members = drawings.filter(d => fresh.includes(d) || d === enclosure ||
      ((!d.closed || !hasBoxCorners(d)) && inside(outer.box, d.box) &&
        !(isHorizontalLine(d.strokes) && d.box.y + d.box.h < outer.box.y)));
  } else {
    // Join touching partial edges so a box can be drawn in multiple pen gestures.
    members = [...fresh];
    for (let i = 0; i < members.length; i++) {
      for (const drawing of drawings) {
        if (!members.includes(drawing) && !drawing.closed && touches(members[i].box, drawing.box, joinDistance)) members.push(drawing);
      }
    }
  }
  const strokes = [...(control?.strokes || []), ...members.flatMap(d => d.strokes)];
  const box = control?.box || inkBounds(strokes);
  if (!box || Math.max(box.w, box.h) < joinDistance || strokes.length > 80) return null;
  return { key: control?.id || enclosure?.id || members.map(d => d.id).sort()[0], control, members, strokes, box };
}
import { isHorizontalLine } from './horizontalLine.js';


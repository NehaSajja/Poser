import { RECOGNITION_VERSION } from './recognition.js';
export const KINDS = ['button', 'container', 'input', 'checkbox', 'switch', 'radio', 'select'];
export const PREVIEW_KINDS = [...KINDS, 'text', 'separator'];
export const COMPONENT_NAMES = {button:'Button',container:'Rectangle',input:'Input',checkbox:'Checkbox',switch:'Switch',radio:'Radio',select:'Select',text:'Label',separator:'Separator'};
export const ELEMENT_KINDS = [...KINDS, 'unknown'];
export function migrateElements(elements) {
 return elements.map(el=>{
  if(ELEMENT_KINDS.includes(el.kind))return {...el,unresolved:Boolean(el.unresolved||(el.showInk&&el.decision?.recognitionVersion!==RECOGNITION_VERSION))};
  const hasInk=el.strokes?.length>0;
  return {...el,kind:hasInk?'unknown':'container',outline:!hasInk,showInk:hasInk,unresolved:false,decision:undefined,committedKind:undefined};
 });
}
export function bounds(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export function inferShape(points) {
  const b = bounds(points);
  if (b.h < 12) return 'unknown';
  const closed = Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < Math.max(b.w, b.h) * .35;
  if (closed && b.w / b.h > .65 && b.w / b.h < 1.5) {
    const cornerCount = points.filter(p => Math.abs(p.x - b.x - b.w / 2) > b.w * .35 && Math.abs(p.y - b.y - b.h / 2) > b.h * .35).length;
    if (cornerCount / points.length < .16) return 'unknown';
  }

  if (!closed) return 'unknown';
  return 'container';
}
export function snapBox(box, elements, grid = 8) {
  const snapped = { x: Math.round(box.x/grid)*grid, y: Math.round(box.y/grid)*grid, w: Math.max(grid*3, Math.round(box.w/grid)*grid), h: Math.max(grid, Math.round(box.h/grid)*grid) };
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? 'w' : 'h';
    let best = 7;
    let delta = 0;
    for (const el of elements) for (const a of [0, .5, 1]) for (const b of [0, .5, 1]) {
      const diff = el[axis] + el[size] * a - (snapped[axis] + snapped[size] * b);
      if (Math.abs(diff) < best) { best = Math.abs(diff); delta = diff; }
    }
    snapped[axis] = Math.max(0, snapped[axis] + delta);
  }
  return snapped;
}

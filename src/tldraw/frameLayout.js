import { getControlSize } from '../componentSizes.js';
import { LABEL_SPACE } from './horizontalLine.js';

// Layout distances live in frame coordinates, never screen pixels. Zooming or
// moving a frame must not change its contents' layout.
export function frameInset(frame, grid = 4) {
  return Math.min(24, Math.floor(Math.min(frame.w, frame.h) / (4 * grid)) * grid);
}

const overlap = (a, b, axis, size) => Math.min(a[axis] + a[size], b[axis] + b[size]) - Math.max(a[axis], b[axis]);
const tolerance = (a, b, grid) => Math.max(grid * 2, Math.max(a, b) / 3);
const similar = (a, b, grid) => Math.abs(a - b) <= tolerance(a, b, grid);
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

function relation(a, b, grid) {
  const horizontalGap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const verticalGap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  if (horizontalGap >= -Math.min(a.w, b.w) * .15 && horizontalGap <= 96 && overlap(a, b, 'y', 'h') >= Math.min(a.h, b.h) / 2 &&
    Math.abs(a.y - b.y) <= tolerance(a.h, b.h, grid)) return { axis: 'x', size: 'w', cross: 'y', gap: horizontalGap };
  if (verticalGap >= -Math.min(a.h, b.h) * .15 && verticalGap <= 96 && overlap(a, b, 'x', 'w') >= Math.min(a.w, b.w) / 2 &&
    Math.abs(a.x - b.x) <= tolerance(a.w, b.w, grid)) return { axis: 'y', size: 'h', cross: 'x', gap: verticalGap };
  return null;
}

function keepsSeparation(raw, box, others) {
  const separate = (a, b) => a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;
  // Intentional containment/overlap is preserved; separate siblings stay apart.
  return others.every(other => !separate(raw, other.raw) || separate(box, other.box));
}

// Infer spatial runs from the sketch, not the order in which shapes were drawn.
// Each run gets solved together so corrections cannot accumulate along a row.
function findRuns(items, owners, grid) {
  const remaining = new Set(items);
  const runs = [];
  for (const axis of ['x', 'y']) {
    const sorted = [...items].sort((a, b) => a.raw[axis] - b.raw[axis] || a.id.localeCompare(b.id));
    for (const first of sorted) {
      if (!remaining.has(first)) continue;
      const run = [first];
      for (const next of sorted) {
        if (!remaining.has(next) || next === first) continue;
        const last = run.at(-1);
        if (next.raw[axis] <= last.raw[axis] || owners.get(next.id) !== owners.get(first.id)) continue;
        if (relation(last.raw, next.raw, grid)?.axis !== axis) continue;
        // Comparing with every member prevents a chain of progressively larger
        // boxes from swallowing an intentionally different component.
        if (!run.every(peer => similar(peer.raw.w, next.raw.w, grid) &&
          (axis === 'y' || (peer.kind === next.kind && similar(peer.raw.h, next.raw.h, grid))))) continue;
        run.push(next);
      }
      if (run.length < 2) continue;
      run.forEach(item => remaining.delete(item));
      runs.push({ items: run, axis });
    }
  }
  return runs;
}

export function layoutFrame(items, frame, grid = 4) {
  const snap = value => Math.round(value / grid) * grid;
  const padding = frameInset(frame, grid);
  const right = Math.floor((frame.w - padding) / grid) * grid;
  const bottom = Math.floor((frame.h - padding) / grid) * grid;
  const within = box => box.x >= padding && box.y >= padding && box.x + box.w <= right && box.y + box.h <= bottom;
  const owners = new Map(items.map(item => [item.id, items.filter(other => {
    const a = other.box, b = item.box;
    return other.id !== item.id && other.kind === 'container' && a.w * a.h > b.w * b.h &&
      a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
  }).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0]?.id]));
  const placed = items.map(item => {
    const raw = item.box;
    const fixedHeight = getControlSize(item.kind, raw.h)?.height;
    const w = Math.min(Math.max(grid, snap(raw.w)), Math.max(grid, right - padding));
    const h = fixedHeight ?? Math.min(Math.max(grid, snap(raw.h)), Math.max(grid, bottom - padding));
    const box = {
      x: Math.max(padding, Math.min(snap(raw.x), right - w)),
      y: Math.max(padding + (item.label ? LABEL_SPACE : 0), Math.min(snap(raw.y), bottom - h)), w, h,
    };
    // Offer the inset as a guide, without pulling ordinary interior items to it.
    if (Math.abs(box.x - padding) <= grid * 2) box.x = padding;
    if (!item.label && Math.abs(box.y - padding) <= grid * 2) box.y = padding;
    return { id: item.id, kind: item.kind, raw, box, fixedHeight, label: item.label };
  });
  const groups = [];
  for (const { items: run, axis } of findRuns(placed, owners, grid)) {
    const size = axis === 'x' ? 'w' : 'h';
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'h' : 'w';
    const step = grid * 2;
    const gaps = run.slice(1).map((item, i) => item.raw[axis] - run[i].raw[axis] - run[i].raw[size]);
    const labelGap = axis === 'y' && run.slice(1).some(item => item.label) ? Math.ceil((LABEL_SPACE + step) / step) * step : step;
    const gap = Math.max(labelGap, Math.round(average(gaps) / step) * step);
    const sharedWidth = snap(average(run.map(item => item.raw.w)));
    const equalHeight = run.every(item => item.kind === run[0].kind && similar(item.raw.h, run[0].raw.h, grid));
    const sharedHeight = getControlSize(run[0].kind, average(run.map(item => item.raw.h)))?.height
      ?? snap(average(run.map(item => item.raw.h)));
    const boxes = run.map(item => ({ ...item.box, w: sharedWidth, h: equalHeight ? sharedHeight : item.box.h }));
    const limit = axis === 'x' ? right : bottom;
    const crossLimit = axis === 'x' ? bottom : right;
    // Fit the entire repeated group, never squeeze only the last sibling.
    const startPadding = padding + (axis === 'y' && run[0].label ? LABEL_SPACE : 0);
    const available = limit - startPadding - gap * (run.length - 1);
    if (axis === 'x' || (equalHeight && run.every(item => !item.fixedHeight))) {
      const fitted = Math.min(boxes[0][size], Math.floor(available / run.length / grid) * grid);
      if (fitted < grid || !similar(fitted, boxes[0][size], grid)) continue;
      boxes.forEach(box => { box[size] = fitted; });
    }
    const total = boxes.reduce((sum, box) => sum + box[size], 0) + gap * (run.length - 1);
    if (total > limit - startPadding) continue;
    let cursor = clamp(snap(run[0].raw[axis]), startPadding, limit - total);
    const crossPadding = padding + (axis === 'x' && run.some(item => item.label) ? LABEL_SPACE : 0);
    const crossPosition = clamp(snap(average(run.map(item => item.raw[cross]))), crossPadding,
      crossLimit - Math.max(...boxes.map(box => box[crossSize])));
    for (const box of boxes) {
      box[axis] = cursor;
      box[cross] = crossPosition;
      cursor += box[size] + gap;
    }
    const others = placed.filter(item => !run.includes(item));
    if (!boxes.every((box, i) => within(box) && keepsSeparation(run[i].raw, box, others))) continue;
    run.forEach((item, i) => { item.box = boxes[i]; });
    groups.push({ ids: run.map(item => item.id), axis, gap,
      box: { x: boxes[0].x, y: boxes[0].y,
        w: axis === 'x' ? total : Math.max(...boxes.map(box => box.w)),
        h: axis === 'y' ? total : Math.max(...boxes.map(box => box.h)) } });
  }
  return { boxes: new Map(placed.map(item => [item.id, item.box])), groups };
}

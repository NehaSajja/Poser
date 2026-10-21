// Accept a quick, slightly wobbly stroke, but not an arrow, caret, or box.
export function isHorizontalLine(strokes) {
  if (strokes.length !== 1 || strokes[0].length < 2) return false;
  const points = strokes[0];
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const end = points.at(-1), start = points[0];
  const travel = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  return width >= 24 && height <= Math.max(4, width * .1) &&
    Math.abs(end.x - start.x) >= width * .9 && travel <= width * 1.2;
}

export const LABEL_SPACE = 32; // 20px label line + shadcn Field's 12px gap.

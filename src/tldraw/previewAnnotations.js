import { b64Vecs, Mat } from 'tldraw';
import { nativeInk, isNativeInkShape } from './nativeInk';
import { inkBounds, containsBox } from './grouping';
import { isHorizontalLine } from './horizontalLine';

const touches = (a, b) => a.x <= b.x + b.w + 3 && a.x + a.w >= b.x - 3 &&
  a.y <= b.y + b.h + 3 && a.y + a.h >= b.y - 3;

// This is derived from current ink on every edit. A separator can become a label
// when a box is added below it, and become a separator again when that box moves.
export function inferLineAnnotations(drawings, controls) {
  const annotations = [], labeled = new Set();
  for (const line of drawings.filter(d => d.horizontal).sort((a, b) => b.box.y - a.box.y || a.id.localeCompare(b.id))) {
    const peers = controls.filter(c => c.scope === line.scope);
    // Keep internal marks available to button/input recognition. Touching partial
    // edges stay ink while the user is still constructing an outline.
    if (peers.some(c => c.kind !== 'container' && containsBox(c.box, line.box, 2)) ||
      drawings.some(d => d.id !== line.id && d.scope === line.scope && touches(d.box, line.box))) continue;
    const target = peers.filter(c => ['container', 'input', 'button'].includes(c.kind) && !labeled.has(c.id))
      .map(c => ({ control: c, gap: c.box.y - line.box.y - line.box.h }))
      .filter(({control: c, gap}) => gap >= 4 && gap <= 64 && line.box.w <= c.box.w * 1.2 &&
        line.box.x >= c.box.x - 16 && line.box.x + line.box.w <= c.box.x + c.box.w + 16)
      .sort((a, b) => a.gap - b.gap || a.control.box.w - b.control.box.w)[0]?.control;
    if (target) {
      labeled.add(target.id);
      annotations.push({ ...line, kind: 'text', targetId: target.id });
    } else if (!peers.some(c => containsBox(c.box, line.box, 2))) {
      annotations.push({ ...line, kind: 'separator' });
    }
  }
  return annotations;
}

export function getLineAnnotations(editor, shapes, controls) {
  const drawings = shapes.filter(s => (s.type === 'draw' && s.props.isComplete) || isNativeInkShape(s)).map(shape => {
    const frame = editor.findShapeAncestor(shape, parent => parent.type === 'frame');
    const matrix = frame ? editor.getShapePageTransform(frame) : new Mat(1, 0, 0, 1, 0, 0);
    const relative = matrix.clone().invert().multiply(editor.getShapePageTransform(shape));
    const local = shape.type === 'draw'
      ? shape.props.segments.map(s => b64Vecs.decodePoints(s.path, s.dim)
        .map(p => ({ x: p.x * shape.props.scaleX, y: p.y * shape.props.scaleY })))
      : nativeInk(editor, shape);
    const strokes = local.map(stroke => stroke.map(p => relative.applyToPoint(p)));
    return { id: shape.id, shape, frame, matrix, scope: frame?.id, box: inkBounds(strokes),
      horizontal: shape.type !== 'geo' && !shape.props.isClosed && isHorizontalLine(strokes) };
  }).filter(item => item.box);
  return inferLineAnnotations(drawings, controls);
}

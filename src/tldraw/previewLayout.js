import { inkBounds } from './grouping';
import { frameInset, layoutFrame } from './frameLayout';
import { getControlSize } from '../componentSizes';
import { CONTROL_TYPE } from './SketchControlShape';
import { getLineAnnotations } from './previewAnnotations';

export function getPreviewShapes(editor) {
  const shapes = editor.getCurrentPageShapesSorted().filter(shape => !editor.isShapeHidden(shape));
  const items = shapes.filter(shape => shape.type === CONTROL_TYPE || shape.type === 'frame')
    .map(shape => ({ shape, props: shape.props, matrix: editor.getShapePageTransform(shape), clipPath: editor.getShapeClipPath(shape) }));
  const frames = new Map();
  for (const item of items) {
    if (item.shape.type !== CONTROL_TYPE) continue;
    const frame = editor.findShapeAncestor(item.shape, parent => parent.type === 'frame');
    const frameMatrix = frame && editor.getShapePageTransform(frame);
    const relative = frameMatrix ? frameMatrix.clone().invert().multiply(item.matrix) : item.matrix;
    const { ink, w, h } = item.shape.props;
    // The stored ink retains the original sketch, even for shapes that were
    // previously snapped against a frame border. Recover its actual bounds.
    const points = ink.length ? ink.flat().map(p => ({ x: p.x * w, y: p.y * h }))
      : [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const box = inkBounds([points.map(p => relative.applyToPoint(p))]);
    if (!box || box.w <= 0 || box.h <= 0) continue;
    item.rawBox = box;
    item.scope = frame?.id;
    if (!frame) continue;
    if (!frames.has(frame.id)) frames.set(frame.id, { frame, matrix: frameMatrix, items: [] });
    frames.get(frame.id).items.push({ id: item.shape.id, kind: item.shape.props.kind, box, item });
  }
  const controls = items.filter(item => item.rawBox).map(item => ({
    id: item.shape.id, kind: item.props.kind, box: item.rawBox, scope: item.scope, item,
  }));
  const annotations = getLineAnnotations(editor, shapes, controls);
  for (const annotation of annotations) {
    if (annotation.kind === 'text') {
      controls.find(control => control.id === annotation.targetId).item.label = annotation.id;
      continue;
    }
    const grid = editor.getDocumentSettings().gridSize;
    const snap = value => Math.round(value / grid) * grid;
    const { frame, box } = annotation;
    const inset = frame ? frameInset(frame.props, grid) : 0;
    const width = Math.max(grid, Math.min(snap(box.w), frame ? frame.props.w - inset * 2 : Infinity));
    const x = frame ? Math.max(inset, Math.min(snap(box.x), frame.props.w - inset - width)) : snap(box.x);
    const y = snap(box.y + box.h / 2);
    items.push({ shape: annotation.shape, props: { kind: 'separator', w: width, h: 1 },
      matrix: annotation.matrix.clone().translate(x, y) });
  }
  for (const { frame, matrix, items: children } of frames.values()) {
    const { boxes, groups } = layoutFrame(children.map(child => ({ ...child, label: Boolean(child.item.label) })),
      frame.props, editor.getDocumentSettings().gridSize);
    const groupById = new Map();
    for (const group of groups) {
      const previewGroup = { ...group, key: `${frame.id}:${group.ids[0]}`,
        transform: matrix.clone().translate(group.box.x, group.box.y).toCssString() };
      group.ids.forEach(id => groupById.set(id, previewGroup));
    }
    for (const { id, item } of children) {
      const box = boxes.get(id);
      item.group = groupById.get(id);
      item.props = { ...item.props, w: box.w, h: box.h };
      item.matrix = matrix.clone().translate(box.x, box.y);
    }
  }
  for (const item of items) {
    if (item.shape.type === 'frame') continue;
    const mask = editor.getShapeMask(item.shape);
    if (!mask) continue;
    const inverse = item.matrix.clone().invert();
    const local = mask.map(p => inverse.applyToPoint(p));
    item.clipPath = local.length ? `polygon(${local.map(p => `${p.x}px ${p.y}px`).join(',')})` : 'polygon(0px 0px, 0px 0px, 0px 0px)';
  }
  return items.map(item => ({ ...item, transform: item.matrix.toCssString(),
    height: getControlSize(item.props.kind, item.props.h)?.height ?? item.props.h }));
}

export function isNativeInkShape(shape) {
  return shape.type === 'line' ||
    (shape.type === 'geo' && ['rectangle', 'ellipse'].includes(shape.props.geo));
}

// Geometry vertices exclude label hitboxes. Sample ellipses more densely than
// tldraw's hit-test polygon so small circles stay round in the enlarged crop.
// The caller transforms these local points into page space.
export function nativeInk(editor, shape) {
  if (shape.type === 'geo' && shape.props.geo === 'ellipse') {
    const rx = shape.props.w / 2, ry = (shape.props.h + (shape.props.growY || 0)) / 2;
    return [Array.from({ length: 65 }, (_, i) => ({
      x: rx + rx * Math.cos(i * Math.PI / 32), y: ry + ry * Math.sin(i * Math.PI / 32),
    }))];
  }
  const points = editor.getShapeGeometry(shape).vertices.map(({ x, y }) => ({ x, y }));
  if (!points.length) return [];
  if (shape.type === 'geo') points.push({ ...points[0] });
  return [points];
}

export function isBareNativeRectangle(group) {
  const shape = group?.members.length === 1 && !group.control ? group.members[0].shape : null;
  return shape?.type === 'geo' && shape.props.geo === 'rectangle';
}

export function needsRecognition(group) {
  // Standalone horizontal strokes are local label/separator gestures. Leave the
  // original ink intact so it can still become part of a multi-stroke outline.
  if (group && !group.control && isHorizontalLine(group.strokes)) return false;
  // Rectangles have a direct component equivalent; lone lines/circles need more ink.
  return Boolean(group && (isBareNativeRectangle(group) || group.control || group.members.length > 1 || group.members[0].shape.type === 'draw'));
}
import { isHorizontalLine } from './horizontalLine.js';


import { b64Vecs, Box, Vec, createShapeId } from 'tldraw';
import { strokeImage } from '../sketch';
import { resolvedKind } from '../recognition';
import { KINDS } from '../design';
import { CONTROL_TYPE } from './SketchControlShape';
import { inkBounds, containsBox, proposeInkGroup } from './grouping';
import { RecognitionQueue } from './RecognitionQueue';
import { isNativeInkShape, nativeInk, needsRecognition, isBareNativeRectangle } from './nativeInk';
import { matchNearbyEdges, nudgeKeepingGaps, SNAP_DISTANCE } from './snapping';
import { frameScope } from './frames';

function readInk(editor, shape) {
  const transform = editor.getShapePageTransform(shape);
  const strokes = shape.type === CONTROL_TYPE
    ? shape.props.ink.map(stroke => stroke.map(p => ({ x: p.x * shape.props.w, y: p.y * shape.props.h })))
    : isNativeInkShape(shape) ? nativeInk(editor, shape)
    : shape.props.segments.map(segment => b64Vecs.decodePoints(segment.path, segment.dim)
      .map(p => ({ x: p.x * shape.props.scaleX, y: p.y * shape.props.scaleY })));
  return strokes.map(stroke => stroke.map(p => transform.applyToPoint(p)));
}

export function attachRecognition(editor, { onPending, onError }) {
  let gesture = null;
  let interacting = false;
  const isSource = shape => (shape.type === 'draw' && shape.props.isComplete) ||
    (isNativeInkShape(shape) && (shape.type !== 'geo' || !editor.getShapeUtil(shape).getText(shape)));
  const snapshot = shape => JSON.stringify([shape, editor.getShapePageTransform(shape)]);
  const record = shape => {
    const strokes = readInk(editor, shape);
    return { id: shape.id, shape, frameId: frameScope(editor, shape), strokes, box: inkBounds(strokes),
      closed: shape.type === 'geo' || (shape.type === 'draw' && shape.props.isClosed), revision: snapshot(shape) };
  };
  const queue = new RecognitionQueue({
    onPending, onError,
    canApply: () => !interacting,
    isCurrent: group => [...group.members, group.control].filter(Boolean).every(member => {
      const current = editor.getShape(member.id);
      return current && snapshot(current) === member.revision;
    }),
    evaluate: async (group, signal) => {
      // The tool already supplies the type. Only ambiguous ink needs the model.
      if (isBareNativeRectangle(group)) return { kind: 'container', probabilities: [{value:'container', probability:1}] };
      const image = strokeImage(group.strokes);
      // Source outlines and ink share one crop, with no rendered component labels.
      const response = await fetch('/api/recognize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ image }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Recognition failed. Your sketch is preserved.');
      return result;
    },
    apply: (group, result) => {
      const kind = resolvedKind(null, result);
      if (!KINDS.includes(kind)) return;
      const sourceBox = group.box;
      if (sourceBox.w <= 0 || sourceBox.h <= 0) return;
      const gridSize = editor.getDocumentSettings().gridSize;
      const source = group.control || group.members[0];
      const parentId = source.shape.parentId;
      const inFrame = source.frameId !== editor.getCurrentPageId();
      const snap = value => Math.round(value / gridSize) * gridSize;
      // Snap new components once. Refining an existing component keeps its placement.
      const box = group.control || inFrame ? sourceBox : {
        x: snap(sourceBox.x), y: snap(sourceBox.y),
        w: Math.max(gridSize, snap(sourceBox.w)), h: Math.max(gridSize, snap(sourceBox.h)),
      };
      editor.markHistoryStoppingPoint('Recognize sketch');
      editor.run(() => {
        editor.deleteShapes(group.members.map(m => m.id));
        // Framed previews have their own local grid. Native page snapping here
        // attracts ink to the frame border and cannot see its child controls.
        if (!group.control && !inFrame && editor.user.getIsSnapMode()) {
          // Source ink is gone, so it cannot attract the new component to itself.
          // Temporarily clear selection so selected neighbors remain snap targets.
          const selectedIds = editor.getSelectedShapeIds();
          editor.setSelectedShapes([]);
          try {
            const neighbors = editor.getCurrentPageShapes()
              .filter(shape => shape.type === CONTROL_TYPE && frameScope(editor, shape) === source.frameId)
              .map(shape => editor.getShapePageBounds(shape)).filter(Boolean);
            Object.assign(box, matchNearbyEdges(box, neighbors, SNAP_DISTANCE / editor.getZoomLevel()));
            const bounds = new Box(box.x, box.y, box.w, box.h);
            const { nudge } = editor.snaps.shapeBounds.snapTranslateShapes({
              initialSelectionPageBounds: bounds,
              initialSelectionSnapPoints: bounds.cornersAndCenter.map((p, i) => ({ ...p, id: `recognition:${i}` })),
              dragDelta: new Vec(0, 0), lockedAxis: null,
            });
            Object.assign(box, nudgeKeepingGaps(box, nudge, neighbors));
          } finally {
            editor.snaps.clearIndicators();
            editor.setSelectedShapes(selectedIds);
          }
        }
        // Normalize after snapping so the original freehand points survive.
        const ink = group.strokes.map(stroke => stroke.map(p => group.control
          ? editor.getPointInShapeSpace(group.control.shape, p)
          : { x: p.x - box.x, y: p.y - box.y }))
          .map(stroke => stroke.map(p => ({ x: p.x / (group.control?.shape.props.w || box.w), y: p.y / (group.control?.shape.props.h || box.h) })));
        const props = { kind, ink, checked: result.checked };
        if (group.control) editor.updateShape({ id: group.control.id, type: CONTROL_TYPE, props });
        else {
          const id = createShapeId();
          // Bounds and ink are in page space. Reparenting preserves those coordinates,
          // including inside moved or rotated frames, without guessing the container.
          editor.createShape({ id, type: CONTROL_TYPE, parentId: editor.getCurrentPageId(), x: box.x, y: box.y, props: { w: box.w, h: box.h, ...props } });
          if (editor.getShape(parentId)) editor.reparentShapes([id], parentId);
        }
      });
      editor.markHistoryStoppingPoint('After recognition');
    },
  });

  const interruptAt = point => queue.invalidate(job => containsBox(job.group.box, { ...point, w: 0, h: 0 }, 8 / editor.getZoomLevel()));
  const beforeEvent = event => {
    if (event.type !== 'pointer' || event.name !== 'pointer_down' || event.button !== 0) return;
    // Selection and erasing may change a candidate, but clicking elsewhere must
    // not cancel it. Wait for release, then let isCurrent check its actual shapes.
    interacting = true;
    if (!['draw', 'geo', 'line'].includes(editor.getCurrentToolId())) return;
    gesture = new Map(editor.getCurrentPageShapes().filter(isSource).map(s => [s.id, s]));
    interruptAt(editor.screenToPage(event.point));
  };
  const afterEvent = event => {
    if (event.type === 'pointer' && event.name === 'pointer_move' && gesture) interruptAt(editor.inputs.getCurrentPagePoint());
    if (event.type === 'pointer' && event.name === 'pointer_up' && event.button === 0) {
      interacting = false;
      if (gesture) {
        const shapes = editor.getCurrentPageShapes();
        const changed = shapes.filter(s => isSource(s) && gesture.get(s.id) !== s).map(s => s.id);
        gesture = null;
        const scopes = new Set(changed.map(id => frameScope(editor, editor.getShape(id))));
        for (const scope of scopes) {
          // Never combine overlapping sketches from different screens.
          const scopedShapes = shapes.filter(shape => frameScope(editor, shape) === scope);
          const drawings = scopedShapes.filter(isSource).map(record).filter(r => r.box);
          const controls = scopedShapes.filter(s => s.type === CONTROL_TYPE).map(record);
          const group = proposeInkGroup(changed, drawings, controls, 8 / editor.getZoomLevel());
          if (needsRecognition(group)) queue.schedule(group);
        }
      }
      queue.flush();
    }
    if (event.type === 'misc' && ['cancel', 'interrupt'].includes(event.name)) { gesture = null; interacting = false; queue.flush(); }
  };
  editor.on('before-event', beforeEvent);
  editor.on('event', afterEvent);
  return {
    cancel: () => { gesture = null; interacting = false; queue.invalidate(); },
    dispose: () => { queue.invalidate(); editor.off('before-event', beforeEvent); editor.off('event', afterEvent); },
  };
}

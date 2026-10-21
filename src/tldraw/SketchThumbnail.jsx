import { useEffect, useRef, useState } from 'react';
import { exportPoseSketch, poseSketchBounds, poseShapes } from '../poser/canvas';

// False restores the permanent split; 'split' restores the 20/80 experiment.
export const ENABLE_SKETCH_THUMBNAIL = true;
export const SKETCH_THUMBNAIL_LAYOUT = 'overlay';
export const SKETCH_TRANSITION_MS = 800;

export function useSketchThumbnail(editor, medium, results) {
  const [snapshot, setSnapshot] = useState(null);
  const [compact, setCompact] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const request = useRef(0);
  function expand() {
    request.current++;
    setCompact(false);
    setExpanding(compact && Boolean(snapshot) && SKETCH_THUMBNAIL_LAYOUT === 'overlay');
  }
  useEffect(() => {
    request.current++;
    setCompact(false); setExpanding(false); setSnapshot(null);
  }, [medium, results]);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!expanding) return;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SKETCH_TRANSITION_MS;
    const timer = setTimeout(() => setExpanding(false), delay);
    return () => clearTimeout(timer);
  }, [expanding]);
  async function collapse() {
    if (!ENABLE_SKETCH_THUMBNAIL || !editor || medium !== 'poser2') return;
    const version = ++request.current;
    const host = editor.getContainer();
    try {
      const hasInk = poseShapes(editor).length > 0;
      const image = hasInk ? await exportPoseSketch(editor, { background: false })
        : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221200%22 height=%221200%22/%3E';
      if (version !== request.current) return;
      const rect = host.getBoundingClientRect();
      const bounds = hasInk ? poseSketchBounds(editor) : null;
      const screen = bounds ? editor.pageToScreen({ x: bounds.x, y: bounds.y }) : rect;
      setSnapshot({ image, width: host.clientWidth, height: host.clientHeight,
        x: screen.x - rect.left, y: screen.y - rect.top, size: bounds ? bounds.w * editor.getZoomLevel() : host.clientWidth });
      setExpanding(false);
      // Mount the snapshot at the exact on-screen ink bounds before shrinking it.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (version === request.current) setCompact(true);
      }));
    } catch {
      // Keep the working drawing editor if a local snapshot cannot be made.
    }
  }
  function onPoseSelect(item) { return item ? collapse() : expand(); }
  return { ...snapshot, compact, expanding, editorHidden: compact || expanding, expand, collapse, onPoseSelect,
    canCollapse: ENABLE_SKETCH_THUMBNAIL && Boolean(editor) && medium === 'poser2' };
}

export function SketchThumbnail({ image, onExpand, compact, expanding, x, y, size }) {
  return <button type="button" className="sketch-thumbnail" onClick={onExpand}
    data-expanding={expanding} inert={!compact} aria-hidden={!compact}
    style={{ '--ink-x': `${x}px`, '--ink-y': `${y}px`, '--ink-size': `${size}px` }}
    aria-label="Expand sketch canvas" title="Expand sketch canvas">
    <span className="medium-wordmark">poser</span>
    <img src={image} alt="Your pose sketch" draggable={false}/>
  </button>;
}

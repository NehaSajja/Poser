import { useEffect, useRef, useState } from 'react';
import './canvas-motion.css';
import './canvas-card-backdrop.css';
import './sketch-thumbnail.css';
import { SKETCH_THUMBNAIL_LAYOUT } from './SketchThumbnail';

// Flip this flag to restore the manual divider experiment. Automatic thumbnail motion is independent.
const ENABLE_MANUAL_CANVAS_RESIZE = false;
const COLLAPSE_THRESHOLD = 25;
const clampSplit = (value, minimum = 33) => Math.min(67, Math.max(minimum, value));

export function SplitWorkspace({ sketch, preview, compactSketch = false, expandingSketch = false, onCollapseSketch }) {
  const [split, setSplit] = useState(50);
  const drag = useRef(null);
  const collapsePending = useRef(false);
  const minimum = onCollapseSketch ? COLLAPSE_THRESHOLD : 33;
  const [resizing, setResizing] = useState(false);
  const wasCompact = useRef(false);
  useEffect(() => {
    if (wasCompact.current && !compactSketch) setSplit(50);
    wasCompact.current = compactSketch;
  }, [compactSketch]);
  useEffect(() => {
    // Capture before React handlers, including controls portaled outside the panels.
    const root = document.documentElement;
    const keyboard = () => { root.dataset.canvasInput = 'keyboard'; };
    const pointer = () => { if (root.dataset.canvasInput !== 'pointer') root.dataset.canvasInput = 'pointer'; };
    window.addEventListener('keydown', keyboard, true);
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('pointermove', pointer, true);
    return () => {
      window.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('pointermove', pointer, true);
      delete root.dataset.canvasInput;
    };
  }, []);

  function startDrag(event) {
    if (event.button !== 0 || drag.current || compactSketch || expandingSketch || collapsePending.current) return;
    const handle = event.currentTarget;
    const width = handle.parentElement.clientWidth - handle.offsetWidth;
    if (!width) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    setResizing(true);
    drag.current = { pointerId: event.pointerId, x: event.clientX, split, width };
  }

  function moveDrag(event) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const next = start.split + (event.clientX - start.x) / start.width * 100;
    setSplit(clampSplit(next, minimum));
    if (onCollapseSketch && next < COLLAPSE_THRESHOLD) {
      endDrag(event);
      collapseAfterResize();
    }
  }

  function endDrag(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function collapseAfterResize() {
    if (collapsePending.current) return;
    collapsePending.current = true;
    try {
      // Let the editor observe the resized canvas before taking its local snapshot.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await onCollapseSketch?.();
    } finally { collapsePending.current = false; }
  }

  function resizeWithKeyboard(event) {
    const step = event.shiftKey ? 10 : 1;
    const changes = { ArrowLeft: () => split - step, ArrowRight: () => split + step, Home: () => minimum, End: () => 67 };
    if (!changes[event.key]) return;
    event.preventDefault();
    const next = changes[event.key]();
    setSplit(clampSplit(next, minimum));
    if (onCollapseSketch && next < COLLAPSE_THRESHOLD) collapseAfterResize();
  }

  return <main className="sketch-workspace canvas-card-backdrop" data-compact-sketch={compactSketch} data-sketch-layout={SKETCH_THUMBNAIL_LAYOUT} data-expanding-sketch={expandingSketch} data-resizing={resizing} style={{ '--split-ratio': split / 100, '--sketch-width': `${compactSketch ? 20 : split}fr`, '--preview-width': `${compactSketch ? 80 : 100 - split}fr` }}>
    {sketch}
    {ENABLE_MANUAL_CANVAS_RESIZE ? <div className="workspace-divider" role="separator" aria-hidden={compactSketch} tabIndex={compactSketch ? -1 : 0} aria-label="Resize panels"
      aria-orientation="vertical" aria-controls="sketch-pane preview-pane"
      aria-valuemin={minimum} aria-valuemax={67} aria-valuenow={Math.round(split)}
      aria-valuetext={`${Math.round(split)}% sketch, ${Math.round(100 - split)}% preview`}
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
      onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onKeyDown={resizeWithKeyboard} onDoubleClick={() => setSplit(50)}/> :
      <div className="workspace-gutter" aria-hidden="true"/>}
    {preview}
    {(compactSketch || expandingSketch) && SKETCH_THUMBNAIL_LAYOUT === 'overlay' &&
      <div className="compact-sketch-title"><span className="medium-wordmark">Poser</span></div>}
  </main>;
}

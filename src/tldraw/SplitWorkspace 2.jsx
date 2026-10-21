import { useRef, useState } from 'react';

const clampSplit = value => Math.min(67, Math.max(33, value));

export function SplitWorkspace({ sketch, preview }) {
  const [split, setSplit] = useState(50);
  const drag = useRef(null);

  function startDrag(event) {
    if (event.button !== 0 || drag.current) return;
    const handle = event.currentTarget;
    const panels = handle.parentElement.querySelectorAll(':scope > section');
    const width = [...panels].reduce((sum, panel) => sum + panel.getBoundingClientRect().width, 0);
    if (!width) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, split, width };
  }

  function moveDrag(event) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setSplit(clampSplit(start.split + (event.clientX - start.x) / start.width * 100));
  }

  function endDrag(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeWithKeyboard(event) {
    const step = event.shiftKey ? 10 : 1;
    const changes = { ArrowLeft: () => split - step, ArrowRight: () => split + step, Home: () => 33, End: () => 67 };
    if (!changes[event.key]) return;
    event.preventDefault();
    setSplit(clampSplit(changes[event.key]()));
  }

  return <main className="sketch-workspace" style={{ '--sketch-width': `${split}fr`, '--preview-width': `${100 - split}fr` }}>
    {sketch}
    <div className="workspace-divider" role="separator" tabIndex={0} aria-label="Resize panels"
      aria-orientation="vertical" aria-controls="sketch-pane preview-pane"
      aria-valuemin={33} aria-valuemax={67} aria-valuenow={Math.round(split)}
      aria-valuetext={`${Math.round(split)}% sketch, ${Math.round(100 - split)}% preview`}
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
      onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={resizeWithKeyboard} onDoubleClick={() => setSplit(50)}/>
    {preview}
  </main>;
}

import { useEffect, useRef, useState } from 'react';
import { panPreview, zoomPreview } from './previewCamera';

export function usePreviewCamera(initialCamera, { onTap } = {}) {
  const viewport = useRef(null);
  const current = useRef(initialCamera);
  const [camera, setCamera] = useState(initialCamera);
  const tapHandler = useRef(onTap);
  tapHandler.current = onTap;
  useEffect(() => {
    const element = viewport.current;
    let frame = 0;
    const pointers = new Map();
    let tap = null;
    const update = next => {
      current.current = next;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; setCamera(current.current); });
    };
    const local = event => {
      const box = element.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const wheel = event => {
      event.preventDefault(); event.stopPropagation();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        update(zoomPreview(current.current, local(event), current.current.z * Math.exp(-event.deltaY * unit * .01)));
      } else {
        const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
        update(panPreview(current.current, -dx * unit, -dy * unit));
      }
    };
    const down = event => {
      if (event.pointerType === 'mouse' && ![0, 1].includes(event.button)) return;
      event.preventDefault(); event.stopPropagation(); element.focus({ preventScroll: true });
      element.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(event)); element.dataset.dragging = 'true';
      tap = pointers.size === 1 && event.button === 0 ? { id: event.pointerId, point: local(event), target: event.target, moved: false } : null;
    };
    const move = event => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault(); event.stopPropagation();
      const before = [...pointers.values()], old = pointers.get(event.pointerId), next = local(event);
      pointers.set(event.pointerId, next);
      if (tap && Math.hypot(next.x - tap.point.x, next.y - tap.point.y) > 4) tap.moved = true;
      if (pointers.size === 2) {
        const after = [...pointers.values()];
        const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
        const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const a = midpoint(before), b = midpoint(after);
        const zoomed = zoomPreview(current.current, a, current.current.z * distance(after) / Math.max(1, distance(before)));
        update(panPreview(zoomed, b.x - a.x, b.y - a.y));
      } else if (pointers.size === 1) update(panPreview(current.current, next.x - old.x, next.y - old.y));
    };
    const up = event => {
      if (tap?.id === event.pointerId && event.type === 'pointerup' && !tap.moved && Math.hypot(local(event).x - tap.point.x, local(event).y - tap.point.y) <= 4) tapHandler.current?.(tap.target);
      tap = null;
      pointers.delete(event.pointerId);
      if (!pointers.size) delete element.dataset.dragging;
    };
    const key = event => {
      event.stopPropagation();
      const steps = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
      if (steps[event.key]) { event.preventDefault(); update(panPreview(current.current, ...steps[event.key])); }
      else if (['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault();
        update(zoomPreview(current.current, { x: element.clientWidth / 2, y: element.clientHeight / 2 },
          event.key === '0' ? 1 : current.current.z * (event.key === '-' ? 1 / 1.2 : 1.2)));
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('lostpointercapture', up);
    element.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('wheel', wheel); element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up); element.removeEventListener('lostpointercapture', up);
      element.removeEventListener('keydown', key);
    };
  }, []);
  return { viewport, camera };
}

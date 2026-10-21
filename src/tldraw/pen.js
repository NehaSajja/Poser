export const PEN_STABILIZATION = 3; // Screen pixels: a short tether, with no timed delay.

export function stabilizePoint(previous, point, radius = PEN_STABILIZATION) {
  const dx = point.x - previous.x, dy = point.y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return { ...previous };
  const follow = (distance - radius) / distance;
  return { x: previous.x + dx * follow, y: previous.y + dy * follow };
}

export function attachPenStabilizer(editor) {
  let anchor = null, pointerId = null;
  const reset = () => { anchor = null; pointerId = null; };
  const beforeEvent = event => {
    if (event.type === 'misc' && ['cancel', 'interrupt', 'complete'].includes(event.name)) reset();
    if (event.type === 'pinch') reset();
    if (event.type !== 'pointer') return;
    if (event.name === 'pointer_down') {
      reset();
      if (event.button === 0 && editor.getCurrentToolId() === 'draw' && !editor.inputs.getIsPanning()) {
        anchor = { x: event.point.x, y: event.point.y };
        pointerId = event.pointerId;
      }
      return;
    }
    if (!anchor || pointerId !== event.pointerId) return;
    if (event.name === 'pointer_up' || editor.getCurrentToolId() !== 'draw' || editor.inputs.getIsPanning()) {
      reset();
      return;
    }
    if (event.name !== 'pointer_move') return;
    if (event.shiftKey || event.accelKey) {
      anchor = { x: event.point.x, y: event.point.y };
      return;
    }
    anchor = stabilizePoint(anchor, event.point);
    // tldraw processes before-event before updating its inputs and native pen.
    // Stabilizing here keeps the displayed ink and recognition evidence identical.
    event.point = { ...event.point, ...anchor };
  };
  editor.on('before-event', beforeEvent);
  return () => { reset(); editor.off('before-event', beforeEvent); };
}

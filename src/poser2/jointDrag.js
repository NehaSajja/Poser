// Capture on the stationary canvas host, not a joint that can leave the viewport.
// Losing a pointer ends an edit; only an explicit Escape reverts it.
export function createJointDrag({ surface, focusWindow = window, begin, move, end }) {
  let active = null;
  const finish = reason => {
    if (!active) return;
    const previous = active;
    active = null; // releasePointerCapture can synchronously emit lostpointercapture.
    if (surface.hasPointerCapture(previous.pointerId)) surface.releasePointerCapture(previous.pointerId);
    end(previous, reason);
  };
  const matches = event => active && active.pointerId === event.pointerId;
  const pointerMove = event => {
    if (!matches(event)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.pointerType === 'mouse' && event.buttons === 0) { finish('release'); return; }
    move(active, event);
  };
  const pointerUp = event => {
    if (!matches(event)) return;
    event.preventDefault(); event.stopPropagation();
    move(active, event); // Include the release position even if no final move arrived.
    finish('release');
  };
  const interrupted = event => { if (matches(event)) finish('interrupted'); };
  const blur = () => finish('blur');
  surface.addEventListener('pointermove', pointerMove);
  surface.addEventListener('pointerup', pointerUp);
  surface.addEventListener('pointercancel', interrupted);
  surface.addEventListener('lostpointercapture', interrupted);
  focusWindow.addEventListener('blur', blur);
  return {
    get active() { return active; },
    start(event, handle) {
      if (active || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const state = begin(event, handle);
      if (!state) return;
      active = { ...state, pointerId: event.pointerId };
      surface.setPointerCapture(event.pointerId);
    },
    finish,
    dispose() {
      finish('dispose');
      surface.removeEventListener('pointermove', pointerMove);
      surface.removeEventListener('pointerup', pointerUp);
      surface.removeEventListener('pointercancel', interrupted);
      surface.removeEventListener('lostpointercapture', interrupted);
      focusWindow.removeEventListener('blur', blur);
    },
  };
}

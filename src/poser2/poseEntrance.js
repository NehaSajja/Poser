export const FLOOR_ENTRANCE_MS = 320;

// Scroll actual, decoded renders: no substitute thumbnails or fake loading loop.
// Every exit restores native scrolling, including interruption and new results.
export function startPoseEntrance({ element, offsets, target, delay = 0, reducedMotion = false, onActive, onFinish }) {
  const from = offsets[Math.max(0, target - 3)], to = offsets[target];
  const width = element.clientWidth;
  let frame = 0, ended = false, active = -1;
  const started = performance.now() + delay;
  const duration = reducedMotion ? 0 : 720;
  const previousSnap = element.style.scrollSnapType;
  element.style.scrollSnapType = 'none';
  element.style.visibility = 'hidden';

  const clean = () => {
    cancelAnimationFrame(frame);
    element.style.scrollSnapType = previousSnap;
    for (const property of ['transform', 'opacity', 'visibility']) element.style.removeProperty(property);
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    element.scrollLeft = to;
    clean(); onActive(target); onFinish();
  };
  const tick = now => {
    if (ended) return;
    if (!reducedMotion && now < started) { frame = requestAnimationFrame(tick); return; }
    const progress = duration ? Math.min(1, (now - started) / duration) : 1;
    const eased = 1 - (1 - progress) ** 3;
    const entrance = Math.min(1, progress / .4);
    element.style.visibility = 'visible';
    element.style.transform = `translateX(${width * (1 - entrance) ** 3}px)`;
    element.style.opacity = Math.min(1, progress / .16);
    element.scrollLeft = from + (to - from) * eased;
    const index = offsets.reduce((best, offset, i) => Math.abs(offset - element.scrollLeft) < Math.abs(offsets[best] - element.scrollLeft) ? i : best, 0);
    if (index !== active) { active = index; onActive(index); }
    if (progress < 1) frame = requestAnimationFrame(tick);
    else finish();
  };
  frame = requestAnimationFrame(tick);
  return { finish, cancel() { if (ended) return; ended = true; clean(); } };
}

import { useEffect, useRef } from 'react';
import './ReservoirSlider.css';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const WIDTH = 268, START = 14, TRAVEL = 240;
const rangeKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

// Pointer coordinates use a logical horizontal track with equal end insets.
// The small release rebound is presentation only: it never changes the body value.
export default function ReservoirSlider({ field, value, enabled, onChange, onCommit }) {
  const instrument = useRef(null);
  const animation = useRef(0);
  const gesture = useRef(null);
  const target = useRef(value);
  const keyboardSpeed = useRef(0);
  const ratio = number => (number - field.min) / (field.max - field.min);
  const boundary = () => START + TRAVEL * ratio(target.current);
  const draw = (shift = 0) => instrument.current?.style.setProperty('--reservoir-level', `${(boundary() + shift) / WIDTH * 100}%`);
  const cancel = () => { cancelAnimationFrame(animation.current); animation.current = 0; draw(); };

  useEffect(() => {
    if (!gesture.current && target.current !== value) {
      target.current = value;
      cancel();
    }
  }, [value]);
  useEffect(() => {
    if (!enabled) { gesture.current = null; cancel(); }
    return () => cancelAnimationFrame(animation.current);
  }, [enabled]);

  function update(next) {
    const stepped = field.min + Math.round((next - field.min) / field.step) * field.step;
    target.current = Number(clamp(stepped, field.min, field.max).toFixed(2));
    draw();
    onChange(target.current);
  }
  function rebound(speed) {
    cancel();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(speed) < 8) return;
    const strength = clamp(Math.abs(speed) / 320, .4, 1);
    let start;
    const frame = now => {
      start ??= now;
      const t = (now - start) / 1000;
      if (t >= .72) { animation.current = 0; draw(); return; }
      draw(Math.sign(speed) * 9 * strength * Math.exp(-9 * t) * Math.sin(20 * t));
      animation.current = requestAnimationFrame(frame);
    };
    animation.current = requestAnimationFrame(frame);
  }
  function pointerX(event) {
    const rect = instrument.current.getBoundingClientRect();
    return (event.clientX - rect.left) * WIDTH / rect.width;
  }
  function fromPointer(event, offset) {
    update(field.min + clamp((pointerX(event) - offset - START) / TRAVEL, 0, 1) * (field.max - field.min));
  }
  function finish(event, animate) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    rebound(animate && performance.now() - active.time < 130 ? active.speed : 0);
    onCommit();
  }

  return <label className="reservoir-slider">
    <span className="reservoir-slider__labels"><span>{field.start}</span><span>{field.end}</span></span>
    <span ref={instrument} className="reservoir-slider__instrument"
      style={{ '--reservoir-level': `${(START + TRAVEL * ratio(value)) / WIDTH * 100}%` }}>
      <span className="reservoir-slider__vessel" aria-hidden="true"><span className="reservoir-slider__fill"/></span>
      <span className="reservoir-slider__grip" aria-hidden="true"><i/><i/><i/></span>
      <input type="range" aria-label={field.label} aria-orientation="horizontal"
        aria-valuetext={`${Math.round(ratio(value) * 100)} percent toward ${field.end.toLowerCase()}`}
        min={field.min} max={field.max} step={field.step} value={value} disabled={!enabled}
        onPointerDown={event => {
          if (event.button !== 0 || gesture.current) return;
          event.preventDefault(); cancel();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          const x = pointerX(event), current = boundary();
          const offset = Math.abs(x - current) < 20 ? x - current : 0;
          fromPointer(event, offset);
          gesture.current = { id: event.pointerId, offset, x: boundary(), time: performance.now(), speed: 0 };
        }}
        onPointerMove={event => {
          const active = gesture.current;
          if (!active || active.id !== event.pointerId) return;
          event.preventDefault(); fromPointer(event, active.offset);
          const x = boundary(), now = performance.now();
          if (Math.abs(x - active.x) > .05) {
            active.speed = (x - active.x) * 1000 / Math.max(8, now - active.time);
            active.x = x; active.time = now;
          }
        }}
        onPointerUp={event => finish(event, true)}
        onPointerCancel={event => finish(event, false)}
        onLostPointerCapture={event => finish(event, false)}
        onChange={event => {
          cancel();
          keyboardSpeed.current = Math.sign(Number(event.target.value) - target.current) * 160;
          update(Number(event.target.value));
        }}
        onKeyUp={event => { if (rangeKeys.has(event.key)) { rebound(keyboardSpeed.current); onCommit(); } }}
        onBlur={onCommit}/>
    </span>
  </label>;
}

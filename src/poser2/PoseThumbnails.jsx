import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePoseRenders } from './usePoseRenders';
import InteractivePose from './InteractivePose';
import PoseToolbar from './PoseToolbar';
import SelectionGrid from './SelectionGrid';
import { FLOOR_ENTRANCE_MS, startPoseEntrance } from './poseEntrance';
import './thumbnails.css';

const axis = { scroll: 'scrollLeft', offset: 'offsetLeft', viewport: 'clientWidth', size: 'offsetWidth', position: 'left', pointer: 'clientX' };

const wrap = (index, count) => ((index % count) + count) % count;
const LOOP_COPIES = 17;
const MIDDLE_COPY = Math.floor(LOOP_COPIES / 2);

export function Poser2Thumbnails({ pose, onSelect, onReadyChange, ref }) {
  const carousel = useRef(null);
  const drag = useRef(null);
  const tap = useRef(null);
  const mouseAnimation = useRef(null);
  const scrollFrame = useRef(null);
  const idleTimer = useRef(null);
  const lastInput = useRef(0);
  const destination = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [active, setActive] = useState(0);
  const [selection, setSelection] = useState(null);
  const viewer = useRef(null);
  const entrance = useRef(null), enteredData = useRef(null), floorStarted = useRef(0);
  const [entering, setEntering] = useState(false);
  const [rigging, setRigging] = useState(false);
  const [lighting, setLighting] = useState(false);
  const [modelState, setModelState] = useState({ id: null, busy: false, error: '' });
  const [controls, setControls] = useState({ canUndo: false, canRedo: false });
  const selected = selection && selection.data === pose.data ? selection.item : null;
  useImperativeHandle(ref, () => ({ back() { if (selected) viewer.current?.close(false); } }), [selected]);
  // The retrieval API already returns distinct poses in descending score order.
  const previewData = useMemo(() => pose.data
    ? { ...pose.data, results: (pose.data.results ?? []).slice(0, 4) }
    : null, [pose.data]);
  const images = usePoseRenders(previewData, Boolean(selected));
  // The render hook publishes a batch only after its full-quality images decode.
  // Failed models are omitted; never expose the library's low-resolution PNGs.
  const results = (previewData?.results ?? []).filter(item => images.has(item.key));
  const count = results.length;
  const ready = count > 0;
  useLayoutEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  const looping = count > 1;
  const copies = looping ? Array.from({ length: LOOP_COPIES }, (_, index) => index) : [0];
  const hasFloor = Boolean(pose.busy || previewData?.results?.length);

  useLayoutEffect(() => {
    if (hasFloor && !floorStarted.current) floorStarted.current = performance.now();
    if (!hasFloor) floorStarted.current = 0;
  }, [hasFloor]);

  useLayoutEffect(() => {
    stopMouseAnimation();
    entrance.current?.cancel(); entrance.current = null;
    setEntering(false);
    if (!count) enteredData.current = null;
    drag.current = null;
    tap.current = null;
    setDragging(false);
    const first = count > 1 ? count * MIDDLE_COPY : 0;
    destination.current = first;
    setActive(first);
    carousel.current?.scrollTo({ left: 0, top: 0, [axis.position]: positions()[first] ?? 0, behavior: 'instant' });
    return () => {
      entrance.current?.cancel(); entrance.current = null;
      cancelAnimationFrame(mouseAnimation.current);
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
      clearTimeout(idleTimer.current);
    };
  }, [pose.data, count]);

  useLayoutEffect(() => {
    const element = carousel.current;
    setEntering(false);
    // Geometry arrives once per result batch. Panel resizing can change the
    // fitted footprints too; keep the same pose centered without reflowing on scroll.
    const align = () => {
      if (!count) return;
      entrance.current?.finish();
      stopMouseAnimation();
      clearTimeout(idleTimer.current);
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
      drag.current = null;
      tap.current = null;
      setDragging(false);
      const index = (looping ? count * MIDDLE_COPY : 0) + wrap(destination.current, count);
      destination.current = index;
      setActive(index);
      element.scrollTo({ [axis.position]: positions()[index] ?? 0, behavior: 'instant' });
    };
    align();
    if (count && enteredData.current !== pose.data) {
      enteredData.current = pose.data;
      setEntering(true);
      entrance.current = startPoseEntrance({ element, offsets: positions(), target: destination.current,
        delay: Math.max(0, FLOOR_ENTRANCE_MS - (performance.now() - floorStarted.current)),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onActive: setActive,
        onFinish: () => { entrance.current = null; setEntering(false); },
      });
    }
    let width = element.clientWidth, height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width === element.clientWidth && height === element.clientHeight) return;
      width = element.clientWidth; height = element.clientHeight;
      align();
    });
    observer.observe(element, { box: 'border-box' });
    return () => { observer.disconnect(); entrance.current?.cancel(); entrance.current = null; };
  }, [images, count, pose.data]);

  function positions() {
    const element = carousel.current;
    return [...element.children].map(slide => slide[axis.offset] - (element[axis.viewport] - slide[axis.size]) / 2);
  }

  function currentIndex() {
    const offset = carousel.current[axis.scroll];
    return positions().reduce((best, position, index, all) => Math.abs(position - offset) < Math.abs(all[best] - offset) ? index : best, 0);
  }

  // Identical copies give native scrolling room on both sides. Recenter without
  // changing the visible poses, and keep an in-progress mouse drag continuous.
  function recenter(index) {
    if (!looping) return index;
    const middle = count * MIDDLE_COPY + wrap(index, count);
    if (middle === index) return index;
    const offsets = positions();
    const shift = offsets[middle] - offsets[index];
    const element = carousel.current;
    const snapping = element.style.scrollSnapType;
    element.style.scrollSnapType = 'none';
    element.scrollTo({ [axis.position]: element[axis.scroll] + shift, behavior: 'instant' });
    element.style.scrollSnapType = snapping;
    if (drag.current) {
      drag.current.scrollStart += shift;
      drag.current.index += middle - index;
      if (drag.current.target >= 0) drag.current.target += middle - index;
    }
    return middle;
  }

  function settle() {
    if (selected || entrance.current || drag.current || mouseAnimation.current !== null || !count) return;
    // A scrollend can occur between trackpad events. Never rebase until the
    // wheel stream and native momentum have both been quiet for a moment.
    const remaining = 160 - (performance.now() - lastInput.current);
    if (remaining > 0) {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(settle, remaining);
      return;
    }
    const index = recenter(currentIndex());
    destination.current = index;
    setActive(index);
  }

  function trackScroll() {
    if (selected || entrance.current) return;
    lastInput.current = performance.now();
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(settle, 180);
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const index = currentIndex();
      setActive(index);
      if (!drag.current && mouseAnimation.current === null) destination.current = index;
    });
  }

  function startWheel() {
    entrance.current?.finish();
    lastInput.current = performance.now();
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(settle, 180);
    if (mouseAnimation.current !== null) stopMouseAnimation();
  }

  function goTo(index, behavior = 'smooth') {
    if (!count) return;
    const next = looping ? Math.max(0, Math.min(count * LOOP_COPIES - 1, index)) : 0;
    destination.current = next;
    setActive(next);
    carousel.current.scrollTo({ [axis.position]: positions()[next] ?? 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior });
  }

  function stopMouseAnimation() {
    cancelAnimationFrame(mouseAnimation.current);
    mouseAnimation.current = null;
    carousel.current?.style.removeProperty('scroll-snap-type');
  }

  function finishMouseDrag(index, animate = true) {
    const element = carousel.current;
    const from = element[axis.scroll];
    const to = positions()[index];
    destination.current = index;
    setActive(index);
    const duration = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    const started = performance.now();
    const tick = now => {
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      element[axis.scroll] = from + (to - from) * (1 - (1 - progress) ** 3);
      if (progress < 1) mouseAnimation.current = requestAnimationFrame(tick);
      else {
        stopMouseAnimation();
        settle();
      }
    };
    // Keep snapping disabled until the release animation actually finishes.
    // Restoring it on pointer-up makes the browser fight the intended motion.
    if (duration) mouseAnimation.current = requestAnimationFrame(tick);
    else tick(started);
  }

  function startDrag(event) {
    if (event.button !== 0) return;
    entrance.current?.finish();
    const model = event.target.closest('.poser2-model');
    const slide = model?.closest('.poser2-slide');
    tap.current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0,
      item: slide?.dataset.active === 'true' && model.dataset.rendered === 'true'
        ? results[Number(slide.dataset.poseIndex)] : null };
    // Touch and trackpads retain native scrolling and momentum.
    if (event.pointerType !== 'mouse' || event.button !== 0 || !looping) return;
    const element = event.currentTarget;
    event.preventDefault();
    stopMouseAnimation();
    element.style.scrollSnapType = 'none';
    element.focus({ preventScroll: true });
    element.scrollTo({ [axis.position]: element[axis.scroll], behavior: 'instant' });
    const previous = currentIndex();
    const target = [...element.children].indexOf(event.target.closest('.poser2-slide'));
    const index = recenter(previous);
    drag.current = { id: event.pointerId, coordinate: event[axis.pointer], lastCoordinate: event[axis.pointer],
      lastTime: event.timeStamp, velocity: 0, scrollStart: element[axis.scroll],
      index, target: target < 0 ? -1 : target + index - previous };
    element.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event) {
    if (tap.current?.id === event.pointerId) tap.current.distance = Math.max(tap.current.distance,
      Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y));
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const elapsed = event.timeStamp - start.lastTime;
    if (elapsed > 0) start.velocity = (start.lastCoordinate - event[axis.pointer]) / elapsed;
    start.lastCoordinate = event[axis.pointer];
    start.lastTime = event.timeStamp;
    // Follow the pointer one-to-one while held; momentum belongs on release.
    event.currentTarget[axis.scroll] = start.scrollStart + start.coordinate - event[axis.pointer];
  }

  function endDrag(event, cancelled = false) {
    const clicked = tap.current?.id === event.pointerId ? tap.current : null;
    const item = !cancelled && clicked?.distance < 4
      && Math.hypot(event.clientX - clicked.x, event.clientY - clicked.y) < 4 ? clicked.item : null;
    tap.current = null;
    const start = drag.current;
    if (!start || start.id !== event.pointerId) {
      if (item) openPose(item);
      return;
    }
    const distance = start.coordinate - event[axis.pointer];
    const offsets = positions();
    const current = currentIndex();
    const neighbor = Math.max(0, Math.min(offsets.length - 1, current + (Math.sign(distance) || 1)));
    const step = Math.abs(offsets[neighbor] - offsets[current]) || event.currentTarget[axis.viewport];
    const velocity = event.timeStamp - start.lastTime < 80 ? start.velocity : 0;
    const momentum = Math.max(-step * 2, Math.min(step * 2, velocity * 160));
    const projected = event.currentTarget[axis.scroll] + momentum;
    let next = offsets.reduce((best, offset, index) => Math.abs(offset - projected) < Math.abs(offsets[best] - projected) ? index : best, 0);
    if (Math.abs(distance) < 4) next = start.index;
    else if (Math.abs(distance) >= 14 && next === start.index) next += Math.sign(distance);
    next = Math.max(0, Math.min(offsets.length - 1, next));
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (item) { stopMouseAnimation(); openPose(item); }
    else finishMouseDrag(cancelled ? currentIndex() : next);
  }

  function openPose(item, animate = true) {
    if (!item || selected) return;
    const preview = images.get(item.key);
    if (!preview) return;
    stopMouseAnimation();
    clearTimeout(idleTimer.current);
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    const element = carousel.current;
    element.scrollTo({ [axis.position]: element[axis.scroll], behavior: 'instant' });
    const index = currentIndex();
    // Confirmation always opens the model currently centered on screen.
    if (results[wrap(index, count)]?.key !== item.key) return;
    setActive(index);
    destination.current = index;
    const model = element.children[index].querySelector('.poser2-model');
    const origin = () => {
      const box = model.getBoundingClientRect(), panel = element.getBoundingClientRect();
      return { left: box.left - panel.left, top: box.top - panel.top, width: box.width, height: box.height };
    };
    setRigging(false);
    setLighting(false);
    setControls({ canUndo: false, canRedo: false });
    setSelection({ data: pose.data, item, preview, origin, animate, motion: animate, closing: false });
    onSelect?.(item);
  }

  function stepPose(direction, animate) {
    if (selected || !count) return;
    const next = destination.current + direction;
    stopMouseAnimation();
    clearTimeout(idleTimer.current);
    // Reuse the interruptible drag-release motion so repeated clicks retain
    // their destination instead of being overwritten by native scroll events.
    carousel.current.style.scrollSnapType = 'none';
    finishMouseDrag(Math.max(0, Math.min(count * LOOP_COPIES - 1, next)), animate);
  }

  function closePose() {
    setSelection(null);
    onSelect?.(null);
    requestAnimationFrame(() => carousel.current?.focus({ preventScroll: true }));
  }

  function navigate(event) {
    entrance.current?.finish();
    if ((event.key === 'Enter' || event.key === ' ') && count) {
      event.preventDefault();
      openPose(results[wrap(currentIndex(), count)], false);
      return;
    }
    const current = destination.current;
    const first = looping ? count * MIDDLE_COPY : 0;
    const next = { ArrowLeft: current - 1,
      ArrowRight: current + 1, Home: first, End: first + count - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    stopMouseAnimation();
    goTo(next, 'instant');
    lastInput.current = 0;
    settle();
  }

  return <>
    <SelectionGrid hidden={!hasFloor}/>
    <div ref={carousel} className="poser2-carousel" data-orientation="horizontal" data-dragging={dragging}
    data-motion={selected && !selection.motion ? 'instant' : undefined}
    data-viewing={Boolean(selected)} data-closing={Boolean(selected && selection.closing)} inert={selected ? true : undefined}
    aria-busy={Boolean(entering || (hasFloor && !count))}
    role="region" aria-roledescription="carousel" aria-label="Pose matches" tabIndex={count ? 0 : -1}
    onScroll={trackScroll} onScrollEnd={settle}
    onWheel={startWheel}
    onKeyDown={navigate} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
    onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)}>
    {copies.flatMap(copy => results.map((item, index) => <div className="poser2-slide" key={`${copy}-${item.id}`}
      style={{ '--body-width': images.get(item.key)?.footprint?.width ?? 1,
        '--body-height': images.get(item.key)?.footprint?.height ?? 1 }}
      data-pose-index={index} data-active={copy * count + index === active}
      data-near={Math.abs(copy * count + index - active) <= 3}
      aria-hidden={looping && copy !== MIDDLE_COPY ? true : undefined}
      role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`}>
      {images.has(item.key) && <div className="poser2-shadow" aria-hidden="true">
        <div className="poser2-image-frame"><img src={images.get(item.key).shadow} style={images.get(item.key).style} alt="" draggable={false}/></div>
      </div>}
      <div className="poser2-model" key={item.key} data-rendered="true">
        <div className="poser2-image-frame"><img className="poser2-render"
          src={images.get(item.key).body} style={images.get(item.key).style}
          alt={item.name} draggable={false}/></div>
      </div>
    </div>))}
  </div>
    {selected && <InteractivePose ref={viewer} key={selected.key} preview={selection.preview} origin={selection.origin} animate={selection.animate}
      onControlsChange={setControls} onModelStateChange={setModelState}
      onClose={closePose} onClosing={motion => setSelection(value => value ? { ...value, motion, closing: true } : value)}/>}
    {count > 0 && <PoseToolbar viewing={Boolean(selected && !selection.closing)}
      canNavigate={count > 1 && !selected && !entering} canConfirm={!selected && !entering && images.has(results[wrap(active, count)]?.key)}
      onPrevious={event => stepPose(-1, event.detail !== 0)} onNext={event => stepPose(1, event.detail !== 0)}
      onConfirm={event => openPose(results[wrap(currentIndex(), count)], event.detail !== 0)}
      rigging={rigging} {...controls} lighting={lighting}
      modelState={modelState} onModelChange={id => viewer.current?.setModel(id)}
      onLightingChange={value => { setLighting(value); viewer.current?.setLighting(value); }}
      onBack={animate => viewer.current?.close(animate)}
      onRiggingChange={value => { setRigging(value); viewer.current?.setRigging(value); }}
      onUndo={() => viewer.current?.undo()} onRedo={() => viewer.current?.redo()}/>}
  </>;
}

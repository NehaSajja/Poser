import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreviewCamera } from '../../tldraw/usePreviewCamera';
import { referenceStore } from './store';
import { createReferenceLayout, visibleReferenceTiles } from './layout';
import ArtworkDetail, { MatchScore } from './ArtworkDetail';

function CardContents({ image }) {
  return <>
    <img src={image.src} alt="" draggable={false} decoding="async" referrerPolicy="no-referrer"/>
    <span className="reference-card-title">{image.title || 'Untitled'}</span><MatchScore score={image.score}/>
  </>;
}

function ImageCanvas({ images, width }) {
  const [detail, setDetail] = useState(null);
  const [host, setHost] = useState(null);
  const trigger = useRef(null);
  const measurement = useRef(null);
  const [metrics, setMetrics] = useState({ heights: [], width: 224, viewport: { width: 0, height: 0 } });
  const z = Math.min(1, Math.max(.45, (width - 64) / 600));
  function open(target) {
    const button = target.closest('[data-artwork-index]');
    if (!button) return;
    trigger.current = button;
    setDetail(Number(button.dataset.artworkIndex));
  }
  const { camera, viewport } = usePreviewCamera({ x: 32 / z, y: 102 / z, z }, { onTap: open });
  useLayoutEffect(() => {
    const measure = () => {
      const cards = [...measurement.current.children];
      const next = { heights: cards.map(card => card.offsetHeight), width: cards[0]?.offsetWidth || 224,
        viewport: { width: viewport.current.clientWidth, height: viewport.current.clientHeight } };
      setMetrics(previous => previous.width === next.width && previous.viewport.width === next.viewport.width
        && previous.viewport.height === next.viewport.height && previous.heights.length === next.heights.length
        && previous.heights.every((height, index) => height === next.heights[index]) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    for (const card of measurement.current.children) observer.observe(card);
    measure();
    return () => observer.disconnect();
  }, [images, viewport]);
  const layout = useMemo(() => createReferenceLayout(metrics.heights, metrics.width), [metrics.heights, metrics.width]);
  const tiles = visibleReferenceTiles(layout, camera, metrics.viewport);
  return <div className="reference-gallery" ref={setHost}>
    <div className="reference-measure" ref={measurement} aria-hidden="true" inert>
      {images.map(image => <div key={image.id} className="reference-card"><CardContents image={image}/></div>)}
    </div>
    <div className="reference-canvas" ref={viewport} tabIndex={0} role="region" aria-label="Reference canvas"
      aria-description="Drag or scroll to pan. Pinch or Control-scroll to zoom. Select an artwork to inspect it.">
      <div className="reference-world" style={{ transform: `translate(${camera.x * camera.z}px, ${camera.y * camera.z}px) scale(${camera.z})` }}>
        {tiles.map(tile => {
          const image = images[tile.index];
          return <button key={tile.key} className="reference-card" data-artwork-index={tile.index} aria-label={`View ${image.title}`}
            style={{ transform: `translate(${tile.x}px, ${tile.y}px)` }}
            onClick={event => { if (event.detail === 0) open(event.currentTarget); }}>
            <CardContents image={image}/>
          </button>;
        })}
      </div>
    </div>
    {detail !== null && host && <ArtworkDetail images={images} index={detail} onIndex={setDetail} onClose={() => setDetail(null)} container={host} returnFocus={trigger.current}/>}
  </div>;
}

export default function ReferenceCanvas({ query, width }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!query) { setState({ status: 'loading' }); return; }
    const entry = referenceStore.ensure(query, attempt > 0);
    function update() {
      setState(previous => entry.state.status === 'ready' ? { ...entry.state, key: query.key }
        : { ...previous, status: entry.state.status, error: entry.state.error });
    }
    entry.listeners.add(update); update();
    return () => entry.listeners.delete(update);
  }, [query?.key, attempt]);
  if (!query) return null;
  // A prefetched pose is displayed synchronously on selection, without a loading frame.
  const cached = referenceStore.get(query.key)?.state;
  const visible = cached?.status === 'ready' ? { ...cached, key: query.key } : state;
  const hasImages = Boolean(visible.images?.length);
  return <>
    {hasImages && <ImageCanvas key={visible.key} images={visible.images} width={width}/>}
    {visible.status === 'loading' && <div className={`reference-status ${hasImages ? 'reference-updating' : ''}`} role="status" aria-label="Finding references"><span className="reference-spinner"/></div>}
    {visible.status === 'error' && <div className={`reference-status ${hasImages ? 'reference-updating' : ''}`} role="alert"><p>References could not update.</p><button onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {visible.status === 'ready' && !hasImages && <div className="reference-status" role="status">No matching references.</div>}
  </>;
}

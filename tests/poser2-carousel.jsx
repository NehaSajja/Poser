// Browser fixture for drag, keyboard, result replacement, and quiet loading states.
// Uses existing local thumbnails; never sends a search or writes a canvas page.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Poser2Thumbnails } from '../src/poser2/PoseThumbnails';
import { SplitWorkspace } from '../src/tldraw/SplitWorkspace';
import '../src/style.css';
import '../src/tldraw/tldraw.css';

const results = ['1010', '1011', '1012', '1013', '1014', '1015'].map((id, index) => ({
  id, key: `${id}-authored`, name: `Pose ${id}`, thumbnail: `/api/pose-retrieval/thumbnails/${id}-authored.png`, score: .95 - index * .05,
}));

const wideResults = ['2717', '2273', '2270', '2264', '2820', '1343'].map((id, index) => ({
  id, key: `${id}-authored`, name: `Wide pose ${id}`, thumbnail: `/api/pose-retrieval/thumbnails/${id}-authored.png`, score: .95 - index * .05,
}));
const mixedResults = [results[0], wideResults[0], {
  id: '853', key: '853-authored', name: 'Wide arms', thumbnail: '/api/pose-retrieval/thumbnails/853-authored.png', score: .8,
}, wideResults[1]];

function Check() {
  const [data, setData] = useState({ results, description: 'This description must stay hidden.' });
  const [busy, setBusy] = useState(false);
  const [renderTime, setRenderTime] = useState(null);
  const [scrollCheck, setScrollCheck] = useState('');
  const [shadowCheck, setShadowCheck] = useState('');
  const [layoutCheck, setLayoutCheck] = useState('');
  function checkLayout() {
    const element = document.querySelector('.poser2-carousel');
    const vertical = element.dataset.orientation === 'vertical';
    const scroll = vertical ? 'scrollTop' : 'scrollLeft';
    const start = vertical ? 'top' : 'left', end = vertical ? 'bottom' : 'right';
    const models = [...element.querySelectorAll('.poser2-model')];
    const slots = [...element.children];
    const original = element[scroll], snap = element.style.scrollSnapType;
    const sizes = slots.map(slot => vertical ? slot.offsetHeight : slot.offsetWidth);
    const cycle = sizes.slice(0, 4).reduce((sum, size) => sum + size, 0);
    element.style.scrollSnapType = 'none';
    let frames = 0, overlaps = 0, shifts = 0, minGap = Infinity;
    const tick = () => {
      const boxes = models.map(model => model.getBoundingClientRect());
      boxes.slice(1).forEach((box, i) => {
        const gap = box[start] - boxes[i][end];
        minGap = Math.min(minGap, gap);
        if (gap < -.5) overlaps++;
      });
      slots.forEach((slot, i) => { if ((vertical ? slot.offsetHeight : slot.offsetWidth) !== sizes[i]) shifts++; });
      if (++frames < 60) {
        element[scroll] = original + cycle * frames / 60;
        requestAnimationFrame(tick);
      } else {
        element[scroll] = original;
        element.style.scrollSnapType = snap;
        setLayoutCheck(`60 frames: ${overlaps} overlaps, ${shifts} slot shifts; minimum gap ${minGap.toFixed(1)} px`);
      }
    };
    requestAnimationFrame(tick);
  }
  async function checkShadowEdges() {
    const images = [...new Map([...document.querySelectorAll('.poser2-shadow img')].map(image => [image.src, image])).values()];
    let clipped = 0, empty = 0, maxEdgeAlpha = 0;
    for (const image of images) {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let edge = 0, darkest = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        darkest = Math.max(darkest, alpha);
        if (x < 2 || y < 2 || x >= canvas.width - 2 || y >= canvas.height - 2) edge = Math.max(edge, alpha);
      }
      maxEdgeAlpha = Math.max(maxEdgeAlpha, edge);
      if (edge > 1) clipped++;
      if (darkest < 8) empty++;
    }
    setShadowCheck(`${images.length} shadows: ${clipped} clipped, ${empty} empty; edge alpha ${maxEdgeAlpha}/255`);
  }
  function checkFastScroll() {
    const element = document.querySelector('.poser2-carousel');
    const scroll = element.dataset.orientation === 'vertical' ? 'scrollTop' : 'scrollLeft';
    const originalSnap = element.style.scrollSnapType;
    element.style.scrollSnapType = 'none';
    let frames = 0, previous = element[scroll], rewinds = 0;
    setScrollCheck('Scrolling continuously…');
    const tick = () => {
      if (element[scroll] < previous - 1) rewinds++;
      element[scroll] += 72;
      previous = element[scroll];
      if (++frames < 45) requestAnimationFrame(tick);
      else {
        element.style.scrollSnapType = originalSnap;
        setScrollCheck(`Fast scroll: ${rewinds} unexpected reversals across 3,240 px`);
      }
    };
    requestAnimationFrame(tick);
  }
  useEffect(() => {
    if (!data) return;
    const start = performance.now();
    const observer = new MutationObserver(() => {
      if (document.querySelectorAll('.poser2-slide:not([aria-hidden="true"]) .poser2-model[data-rendered="true"]').length !== 4) return;
      setRenderTime(Math.round(performance.now() - start));
      observer.disconnect();
    });
    observer.observe(document.querySelector('#preview-pane'), { subtree: true, attributes: true, attributeFilter: ['data-rendered'] });
    return () => observer.disconnect();
  }, [data]);
  return <SplitWorkspace sketch={<section className="sketch-pane" style={{ padding: '2rem' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'start', gap: '1rem' }}>
      <button onClick={() => setBusy(value => !value)}>Toggle searching</button>
      <button onClick={() => setData({ results, description: 'Still hidden.' })}>New results</button>
      <button onClick={() => setData(null)}>Clear results</button>
      <button onClick={() => setData({ results: wideResults })}>Wide poses</button>
      <button onClick={() => setData({ results: mixedResults })}>Mixed poses</button>
      <button onClick={() => setData({ results: [mixedResults[1], mixedResults[0], ...mixedResults.slice(2)] })}>Wide-first mixed poses</button>
      <button onClick={checkLayout}>Check layout</button>
      <output>{layoutCheck}</output>
      <button onClick={checkFastScroll}>Check fast scroll</button>
      <output>{scrollCheck}</output>
      <button onClick={checkShadowEdges}>Check shadow edges</button>
      <output>{shadowCheck}</output>
      <output>{renderTime === null ? 'Preparing four poses' : `Four poses rendered in ${renderTime} ms`}</output>
    </div>
  </section>} preview={<section className="preview-pane" id="preview-pane" data-medium="poser2">
    <Poser2Thumbnails pose={{ data, busy, status: busy ? 'searching' : 'ready' }}/>
  </section>}/>;
}

createRoot(document.getElementById('root')).render(<Check/>);

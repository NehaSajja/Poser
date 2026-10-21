import { useEffect, useRef, useState } from 'react';

const emptyImages = new Map();

export function usePoseRenders(data, paused = false) {
  const renderer = useRef(null);
  const pausedRef = useRef(paused);
  const pauseVersion = useRef(0);
  if (pausedRef.current !== paused) pauseVersion.current++;
  pausedRef.current = paused;
  const [rendered, setRendered] = useState({ data: null, images: emptyImages });
  useEffect(() => () => { renderer.current?.dispose(); renderer.current = null; }, []);

  useEffect(() => {
    if (!data?.results?.length) return;
    const controller = new AbortController();
    const urls = new Set();
    let activeUrls = [], resizeTimer, generation = 0;
    const release = url => { URL.revokeObjectURL(url); urls.delete(url); };
    const render = async (whileClosing = false) => {
      if (pausedRef.current && !whileClosing) return;
      const version = pauseVersion.current;
      const current = ++generation;
      const nextUrls = [];
      const imageUrl = async canvas => {
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        controller.signal.throwIfAborted();
        if (!blob) throw new Error('Preview image unavailable.');
        const url = URL.createObjectURL(blob);
        urls.add(url); nextUrls.push(url);
        const image = new Image();
        image.src = url;
        await image.decode();
        return url;
      };
      try {
        const { createPoseRenderer } = await import('./poseRenderer');
        if (controller.signal.aborted) return;
        renderer.current ??= createPoseRenderer();
        const size = Math.min(1024, Math.ceil(window.innerHeight * .5 * Math.min(window.devicePixelRatio, 1.5)));
        const results = await Promise.allSettled(data.results.map(async item => {
          const canvas = document.createElement('canvas');
          const { shadowCanvas, style, aspectRatio, body: footprint } = await renderer.current.render(item, canvas, size, controller.signal);
          const [body, shadow] = await Promise.all([imageUrl(canvas), imageUrl(shadowCanvas)]);
          return [item.key, { body, shadow, style, aspectRatio, footprint,
            mount: (container, origin, onControlsChange, options) => {
              const mounted = renderer.current.mount(item, container, origin, onControlsChange, options);
              let released = false, disposed = false, frozen;
              const release = () => { if (!released) { mounted.dispose(); released = true; } };
              return { ...mounted,
                get modelId() { return mounted.modelId; },
                close(done, animate) {
                  mounted.close(async () => {
                    // Keep the final edited frame visible while the shared WebGL
                    // renderer makes replacement thumbnails. Never flash the old pose.
                    const live = container.querySelector('canvas');
                    if (live) {
                      frozen = document.createElement('canvas');
                      frozen.width = live.width; frozen.height = live.height;
                      frozen.getContext('2d').drawImage(live, 0, 0);
                      container.append(frozen);
                    }
                    release();
                    await render(true);
                    if (!disposed) done();
                  }, animate);
                },
                dispose() {
                  disposed = true;
                  frozen?.remove();
                  const needsRefresh = !released;
                  release();
                  if (needsRefresh) queueMicrotask(() => { if (!controller.signal.aborted) void render(); });
                },
              };
            } }];
        }));
        if (controller.signal.aborted || current !== generation || (pausedRef.current && !whileClosing) || version !== pauseVersion.current) {
          nextUrls.forEach(release);
          return;
        }
        // Every loop copy shares the same decoded images, instead of owning
        // another full-size canvas. Decode before swapping to avoid blank frames.
        const images = new Map(results.filter(result => result.status === 'fulfilled').map(result => result.value));
        setRendered({ data, images });
        activeUrls.forEach(release);
        activeUrls = nextUrls;
      } catch {
        nextUrls.forEach(release);
        // Keep the existing thumbnail if WebGL or a model is unavailable.
      }
    };
    void render();
    const resize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); };
    window.addEventListener('resize', resize);
    return () => {
      controller.abort(); clearTimeout(resizeTimer); window.removeEventListener('resize', resize);
      urls.forEach(URL.revokeObjectURL);
    };
  }, [data]);

  return rendered.data === data ? rendered.images : emptyImages;
}

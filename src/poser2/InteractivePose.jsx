import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

export default function InteractivePose({ ref, preview, origin, animate, onClose, onClosing, onControlsChange, onModelStateChange }) {
  const host = useRef(null);
  const viewer = useRef(null);
  const modelRequest = useRef(0);
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    try {
      viewer.current = preview.mount(host.current, origin, onControlsChange, { animate });
      onModelStateChange({ id: viewer.current.modelId, busy: false, error: '' });
    }
    catch { setError(true); }
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, [preview, origin, animate, onControlsChange, onModelStateChange]);
  useImperativeHandle(ref, () => ({
    setRigging: value => viewer.current?.setRigging(value),
    setLighting: value => viewer.current?.setLighting(value),
    async setModel(id) {
      const mounted = viewer.current;
      if (!mounted) return;
      const request = ++modelRequest.current;
      onModelStateChange(value => ({ ...value, busy: true, error: '' }));
      try {
        await mounted.setModel(id);
        if (viewer.current === mounted && request === modelRequest.current) onModelStateChange({ id: mounted.modelId, busy: false, error: '' });
      } catch {
        if (viewer.current === mounted && request === modelRequest.current) onModelStateChange(value => ({ ...value, busy: false, error: 'Could not load this model. Try again.' }));
      }
    },
    undo: () => viewer.current?.undo(),
    redo: () => viewer.current?.redo(),
    close: (shouldAnimate = true) => close(shouldAnimate),
  }), [onClose, onClosing, onModelStateChange]);

  const close = (shouldAnimate = true) => {
    if (!viewer.current) { onClose(); return; }
    onClosing(shouldAnimate);
    viewer.current.close(onClose, shouldAnimate);
  };

  return <section className="poser2-interactive" aria-label="Interactive pose" onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.stopPropagation();
      if (event.shiftKey) viewer.current?.redo(); else viewer.current?.undo();
    }
    if (event.key === 'Escape') { event.stopPropagation(); close(false); }
  }}>
    <div className="poser2-interactive-canvas" ref={host}/>
    {error && <div className="poser2-view-status" role="status">
      Could not open this pose. Go back and try again.
    </div>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';

function restore(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return { id: typeof saved?.id === 'string' ? saved.id : null, modelUrl: /^\/api\/poser\/models\/[\da-f-]+$/.test(saved?.modelUrl) ? saved.modelUrl : null };
  } catch { return { id: null, modelUrl: null }; }
}

export function usePoseGeneration(persistenceKey) {
  const key = `${persistenceKey || 'temporary'}:poser-result`;
  const [saved, setSaved] = useState(() => restore(key));
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const busy = preparing || Boolean(saved.id);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* Canvas can still generate without browser persistence. */ }
  }, [key, saved]);

  useEffect(() => {
    if (!saved.id) return;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const response = await fetch(`/api/poser/jobs/${saved.id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        const job = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || job.status === 'failed') {
          setError(job.error || 'Generation failed. Your sketch is preserved.');
          setSaved(previous => ({ ...previous, id: null }));
          return;
        }
        if (job.status === 'complete') {
          setSaved({ id: null, modelUrl: job.modelUrl });
          setError('');
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
        // Polling can retry safely: it never submits another generation.
        setError('Connection lost. Reconnecting to your generation…');
      }
      timer = setTimeout(poll, 1000);
    };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [saved.id]);

  async function generate(exportSketch) {
    if (submitting.current || saved.id) return;
    submitting.current = true;
    setPreparing(true); setError('');
    let id;
    try {
      const sketch = await exportSketch();
      id = crypto.randomUUID();
      // Save before submitting so a refresh can recover a job already accepted by the server.
      try { localStorage.setItem(key, JSON.stringify({ ...saved, id })); } catch { /* Optional persistence. */ }
      const response = await fetch('/api/poser/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, sketch }), signal: AbortSignal.timeout(30_000) });
      const job = await response.json();
      if (!response.ok) { id = null; throw new Error(job.error || 'Generation could not be started.'); }
      setSaved(previous => ({ ...previous, id: job.id }));
    } catch (failure) {
      if (id) setSaved(previous => ({ ...previous, id })); // Resolve an unknown POST outcome by reading, never resubmitting.
      else {
        setError(failure.message || 'Generation could not be started.');
        setSaved(previous => ({ ...previous, id: null }));
      }
    } finally { submitting.current = false; setPreparing(false); }
  }

  return { busy, modelUrl: saved.modelUrl, error, generate, dismissError: () => setError(''), onViewerError: setError };
}

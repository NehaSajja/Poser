export function createRetrievalSession({ capture, request, onStart, onResult, onError }) {
  let version = 0, current = null;
  function cancel() {
    const running = Boolean(current); version++; current?.abort(); current = null; return running;
  }
  async function run() {
    cancel(); const token = version, controller = new AbortController(); current = controller; onStart();
    const valid = () => token === version && !controller.signal.aborted;
    try {
      const sketch = await capture(); if (!valid()) return;
      const start = performance.now();
      const data = await request({ sketch }, controller.signal);
      if (valid()) onResult({ ...data, elapsedMs: performance.now() - start });
    } catch (error) { if (valid()) onError(error.message); }
    finally { if (token === version) current = null; }
  }
  return { run, cancel };
}

export async function requestPoseRetrieval(payload, signal) {
  const response = await fetch('/api/pose-retrieval/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Search failed.');
  return body;
}

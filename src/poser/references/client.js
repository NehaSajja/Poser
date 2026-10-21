export function topReferencePose(data) {
  const top = data?.results?.[0];
  const key = /^(\d+)-(authored|front)$/.exec(top?.key || '');
  return key ? { pose: key[1], view: key[2], key: top.key } : null;
}

function pause(signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 350);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestReferences(query, signal, request = fetch) {
  let id;
  // The worker accepts four concurrent searches; retry only if its bounded queue is full.
  while (!id) {
    const response = await request('/api/art-references/search', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pose: query.pose, view: query.view }), signal });
    if (response.status === 409) { await pause(signal); continue; }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'References could not load.');
    id = body.id;
    if (!id) throw new Error('References could not load.');
  }
  for (;;) {
    const response = await request(`/api/art-references/jobs/${id}`, { signal });
    const body = await response.json();
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'References could not load.');
    if (body.status === 'done') return body.images;
    await pause(signal);
  }
}

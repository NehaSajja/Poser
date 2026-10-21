import { requestReferences, topReferencePose } from './client.js';

// One request per pose/camera, shared by the foreground and four-pose prefetch.
// Unsubscribing a view does not discard useful work already running for that set.
export function createReferenceStore(request = requestReferences) {
  const entries = new Map();
  function ensure(query, retry = false) {
    if (!query) return null;
    const previous = entries.get(query.key);
    if (previous && !(retry && previous.state.status === 'error')) return previous;
    const entry = { state: { status: 'loading', images: [] }, listeners: new Set(), promise: null };
    entries.delete(query.key); entries.set(query.key, entry);
    const publish = state => { entry.state = state; for (const listener of entry.listeners) listener(); };
    entry.promise = request(query, AbortSignal.timeout(600000))
      .then(images => {
        // Warm the first screen of each pose before the user switches to it.
        if (typeof Image !== 'undefined') for (const artwork of images.slice(0, 9)) {
          const image = new Image(); image.referrerPolicy = 'no-referrer'; image.src = artwork.src;
        }
        publish({ status: 'ready', images }); return images;
      })
      .catch(error => { publish({ status: 'error', images: [], error: error.message }); return []; });
    for (const [key, value] of entries) {
      if (entries.size <= 40) break;
      if (value !== entry && value.state.status !== 'loading' && !value.listeners.size) entries.delete(key);
    }
    return entry;
  }
  return {
    ensure,
    prefetch(data) { return (data?.results || []).slice(0, 4).map(item => topReferencePose({ results: [item] })).filter(Boolean).map(query => ensure(query)); },
    get(key) { return entries.get(key); },
  };
}
export const referenceStore = createReferenceStore();

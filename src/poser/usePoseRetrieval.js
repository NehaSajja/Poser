import { useEffect, useRef, useState } from 'react';
import { exportPoseSketch, poseShapes } from './canvas';
import { createRetrievalSession, requestPoseRetrieval } from './retrievalSession';

const empty = () => ({ status: 'empty' });
const INK_TYPES = new Set(['draw', 'geo', 'line', 'arrow']);

export function usePoseRetrieval(editor, active) {
  const [state, setState] = useState(empty), [live, setLive] = useState(true);
  const commands = useRef(null), liveRef = useRef(live);
  useEffect(() => {
    if (!editor || !active) return;
    const pageId = editor.getCurrentPageId();
    const onPage = () => !disposed && editor.getCurrentPageId() === pageId;
    let timer, down = false, dirty = false, disposed = false;
    const session = createRetrievalSession({
      capture: () => exportPoseSketch(editor), request: requestPoseRetrieval,
      onStart: () => setState(p => ({ ...p, status: 'searching', error: '' })),
      onResult: data => { if (onPage()) setState({ data, status: 'ready' }); },
      onError: error => { if (onPage()) setState(p => ({ ...p, status: 'error', error })); },
    });
    function markDirty() {
      session.cancel();
      if (!dirty) setState(p => ({ ...p, status: p.data ? 'waiting' : 'empty', error: '' }));
      dirty = true;
    }
    function search() {
      clearTimeout(timer);
      if (!onPage() || down || !poseShapes(editor).length) return;
      dirty = false; return session.run();
    }
    function schedule() {
      clearTimeout(timer);
      if (onPage() && liveRef.current && dirty && !down) timer = setTimeout(search, 800);
    }
    const off = editor.store.listen(({ changes }) => {
      if (!onPage()) return;
      const records = [...Object.values(changes.added), ...Object.values(changes.removed), ...Object.values(changes.updated).map(([, v]) => v)];
      if (!records.some(r => r.typeName === 'shape' && INK_TYPES.has(r.type))) return;
      markDirty();
      if (!poseShapes(editor).length) { dirty = false; clearTimeout(timer); setState(empty()); }
      else schedule();
    }, { scope: 'document' });
    const before = event => {
      if (!onPage()) return;
      if (event.type === 'pointer' && event.name === 'pointer_down' && event.button === 0) {
        down = true; clearTimeout(timer); if (session.cancel()) markDirty();
      }
    };
    const after = event => {
      if (!onPage()) return;
      if ((event.type === 'pointer' && event.name === 'pointer_up') || (event.type === 'misc' && ['cancel', 'interrupt'].includes(event.name))) {
        down = false; schedule();
      }
    };
    editor.on('before-event', before); editor.on('event', after);
    commands.current = { search, cancel() { clearTimeout(timer); session.cancel(); }, toggleLive() {
      liveRef.current = !liveRef.current; setLive(liveRef.current);
      if (liveRef.current) { dirty = Boolean(poseShapes(editor).length); schedule(); }
      else { clearTimeout(timer); if (session.cancel()) markDirty(); }
    } };
    if (poseShapes(editor).length) { markDirty(); schedule(); }
    else setState(empty());
    const warmup = new AbortController();
    fetch('/api/pose-retrieval/status', { signal: warmup.signal }).then(async r => {
      if (!r.ok) throw new Error('The pose index could not be loaded.');
      const data = await r.json(); if (!data.configured) throw new Error('Add GEMINI_API_KEY to .env.local and restart.');
    }).catch(error => { if (!warmup.signal.aborted && onPage()) setState(p => ({ ...p, status: 'error', error: error.message })); });
    return () => { disposed = true; clearTimeout(timer); session.cancel(); off(); warmup.abort(); editor.off('before-event', before); editor.off('event', after); commands.current = null; };
  }, [editor, active]);
  return { ...state, busy: state.status === 'searching', live, dismissError: () => setState(p => ({ ...p, error: '' })), cancel: () => commands.current?.cancel(), search: () => commands.current?.search(), toggleLive: () => commands.current?.toggleLive() };
}

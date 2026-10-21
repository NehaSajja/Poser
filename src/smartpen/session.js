import { createPenInput } from './ink.js';
import { connectPen } from './bluetooth.js';

export const initialPenState = { mode: 'computer', status: 'disconnected', error: '' };

// Own the connection with the canvas, not the menu. Closing the menu never stops ink.
export function createSmartpenSession(editor, onChange, connect = connectPen) {
  const input = createPenInput(editor);
  let state = { ...initialPenState }, attempt = null, connection = null, disposed = false, generation = 0;
  const update = patch => {
    state = { ...state, ...patch };
    if (!disposed) onChange(state);
  };
  function disconnect() {
    generation++;
    const previous = attempt;
    attempt = null;
    previous?.abort();
    connection?.disconnect();
    connection = null;
    input.finish();
    input.setMaxForce(null);
    update({ status: 'disconnected', error: '' });
  }
  return {
    setMode(mode) {
      if (disposed || !['computer', 'smartpen'].includes(mode)) return;
      if (mode === 'computer') disconnect();
      update({ mode });
    },
    async connect() {
      if (disposed || state.mode !== 'smartpen' || attempt) return;
      const current = new AbortController();
      const version = ++generation;
      attempt = current;
      const live = () => !disposed && attempt === current && !current.signal.aborted;
      update({ status: 'choosing', error: '' });
      try {
        // Call the chooser synchronously from the menu click, before loading the SDK.
        const result = await connect({
          onDot: dot => { if (live() && state.status === 'ready') input.dot(dot); },
          onMessage: (kind, value) => {
            if (!live()) return;
            if (kind === 'connecting') update({ status: 'connecting' });
            if (kind === 'settings') {
              input.setMaxForce(value?.MaxForce);
            }
            if (kind === 'ready') update({ status: 'ready' });
            if (kind === 'error') { input.finish(); update({ error: value }); }
          },
          onClose: () => {
            if (!live()) return;
            input.finish(); input.setMaxForce(null);
            connection = null; attempt = null;
            update({ status: 'disconnected' });
          },
        }, current.signal);
        if (live()) connection = result;
        else result.disconnect();
      } catch (error) {
        // A stale chooser must never replace a newer session or switch modes back.
        if (disposed || current.signal.aborted || version !== generation) return;
        attempt = null;
        input.finish();
        update({ status: 'disconnected', error: error.name === 'NotFoundError' ? '' : error.message });
      }
    },
    disconnect,
    finish: input.finish,
    reanchor: input.reanchor,
    dispose() { disposed = true; disconnect(); },
  };
}

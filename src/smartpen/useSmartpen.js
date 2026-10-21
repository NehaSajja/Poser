import { useEffect, useRef, useState } from 'react';
import { createSmartpenSession, initialPenState } from './session';

export function useSmartpen(editor) {
  const session = useRef(null);
  const [state, setState] = useState(initialPenState);
  useEffect(() => {
    const current = createSmartpenSession(editor, setState);
    session.current = current;
    setState(initialPenState);
    return () => { current.dispose(); session.current = null; };
  }, [editor]);
  return {
    ...state,
    supported: Boolean(navigator.bluetooth?.requestDevice),
    setMode: mode => session.current?.setMode(mode),
    connect: () => session.current?.connect(),
    disconnect: () => session.current?.disconnect(),
    finish: () => session.current?.finish(),
    reanchor: () => session.current?.reanchor(),
  };
}

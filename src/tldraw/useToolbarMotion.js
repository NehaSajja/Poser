import { useEffect, useRef } from 'react';

export function useToolbarMotion(onPointerDown) {
  const ref = useRef(null);
  useEffect(() => {
    // Keyboard selection is immediate, even while the pointer rests on an icon.
    const keyboard = () => { if (ref.current) ref.current.dataset.motion = 'instant'; };
    window.addEventListener('keydown', keyboard, true);
    return () => window.removeEventListener('keydown', keyboard, true);
  }, []);

  const pointerMotion = () => {
    if (ref.current && ref.current.dataset.motion !== 'pointer') ref.current.dataset.motion = 'pointer';
  };
  return {
    ref,
    onPointerEnter: pointerMotion,
    onPointerMoveCapture: pointerMotion,
    onPointerDownCapture: event => { pointerMotion(); onPointerDown?.(event); },
  };
}

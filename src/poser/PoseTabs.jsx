import { useId, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';

// Match paulstamatiou.com/about's shared tab-wrap / activeIndicator spring.
const spring = { type: 'spring', bounce: .3, duration: .525 };
const instant = { duration: 0 };

export default function PoseTabs({ value, onChange }) {
  const group = useId();
  const reducedMotion = useReducedMotion();
  const [keyboard, setKeyboard] = useState(false);
  const transition = reducedMotion || keyboard ? instant : spring;
  return <LayoutGroup id={group}><div className="poser-tabs pose-controls-enter" role="tablist" aria-label="Pose view">
    {['model', 'references'].map(tab => <button key={tab} type="button" role="tab" id={`poser-tab-${tab}`}
      aria-selected={value === tab} aria-controls={`poser-view-${tab}`} tabIndex={value === tab ? 0 : -1}
      onClick={event => { setKeyboard(event.detail === 0); onChange(tab); }} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); setKeyboard(true);
        const next = event.key === 'Home' ? 'model' : event.key === 'End' ? 'references' : tab === 'model' ? 'references' : 'model';
        onChange(next); event.currentTarget.parentElement.querySelector(`#poser-tab-${next}`).focus();
      }}>
      <span className="poser-tab-label">{tab === 'model' ? 'Model' : 'References'}</span>
      <AnimatePresence initial={false}>
        {value === tab && <motion.span aria-hidden="true" className="poser-tab-highlight-wrap" layoutId="tab-wrap"
          initial={{ scale: .85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .85, opacity: 0 }} transition={transition}>
          <motion.span className="poser-tab-highlight" layoutId="activeIndicator" transition={transition} style={{ borderRadius: 999 }}/>
        </motion.span>}
      </AnimatePresence>
    </button>)}
  </div></LayoutGroup>;
}

import { useEffect, useRef } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { BODY_FIELDS } from './bodyShape';
import './BodyShapePanel.css';

// Presentation is deliberately independent of the model service and pose editor.
export default function BodyShapePanel({ open, value, error, onChange, onCommit, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => panel.current?.querySelector('input')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return <aside ref={panel} className="body-shape-panel" data-open={open}
    aria-label="Custom body" aria-hidden={!open || undefined} inert={!open}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    }}>
    <header className="body-shape-panel__header"><h2>Custom body</h2>
      <button type="button" aria-label="Close body controls" onClick={onClose}><XIcon size={18}/></button>
    </header>
    <div className="body-shape-panel__sliders">
      {BODY_FIELDS.map(field => <label className="body-shape-slider" key={field.id}>
        <span className="body-shape-slider__heading"><span>{field.label}</span>
          <output>{field.id === 'height' ? `${Math.round(value[field.id]*100)}%` : value[field.id].toFixed(2)}</output>
        </span>
        <span className="body-shape-slider__well">
          <input type="range" aria-label={field.label} min={field.min} max={field.max} step={field.step}
            onPointerUp={onCommit} onPointerCancel={onCommit} onKeyUp={onCommit} onBlur={onCommit}
            value={value[field.id]} onChange={event => onChange({ ...value, [field.id]: Number(event.target.value) })}/>
        </span>
        <span className="body-shape-slider__ends"><span>{field.start}</span><span>{field.end}</span></span>
      </label>)}
    </div>
    {error && <p className="body-shape-panel__error" role="status">{error}</p>}
  </aside>;
}

import { useEffect, useId, useRef } from 'react';
import { CollapseIcon, CloseIcon } from '../tldraw/drawesome/ToolbarIcons';
import '../tldraw/drawing-toolbar.css';
import { BODY_FIELDS } from './bodyShape';
import ReservoirSlider from './ReservoirSlider';
import './BodyShapePanel.css';

// Presentation is deliberately independent of the model service and pose editor.
export default function BodyShapePanel({ open, collapsed, onCollapse, onExpand, value, error, onChange, onCommit, onClose }) {
  const panel = useRef(null), dial = useRef(null), contentId = useId();
  useEffect(() => {
    if (!open) return;
    // Wait until the transitioning control is visible before moving keyboard focus.
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    const timer = setTimeout(() => (collapsed ? dial.current : panel.current?.querySelector('input'))?.focus({ preventScroll: true }), delay);
    return () => clearTimeout(timer);
  }, [open, collapsed]);
  return <aside ref={panel} className="body-shape-panel" data-open={open} data-collapsed={collapsed}
    aria-label="Model adjustments" aria-hidden={!open || undefined} inert={!open}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    }}>
    <div id={contentId} className="body-shape-panel__content" aria-hidden={collapsed || undefined} inert={collapsed}>
      <header className="body-shape-panel__header">
        <h2>Body</h2>
        <div className="body-shape-panel__actions">
        <button type="button" className="body-shape-panel__action" aria-label="Collapse body controls" title="Collapse" onClick={onCollapse}><CollapseIcon/></button>
        <button type="button" className="body-shape-panel__action" aria-label="Close body controls" title="Close" onClick={onClose}><CloseIcon/></button>
        </div>
      </header>
      <div className="body-shape-panel__sliders">
        {BODY_FIELDS.filter(field => field.id !== 'height').map(field =>
          <ReservoirSlider key={field.id} field={field} value={value[field.id]} enabled={open && !collapsed}
            onChange={next => onChange({ ...value, [field.id]: next })} onCommit={onCommit}/>
        )}
      </div>
      {error && <p className="body-shape-panel__error" role="status">{error}</p>}
    </div>
    <button ref={dial} type="button" className="body-shape-panel__expand" aria-label="Expand body controls"
      title="Body controls" aria-expanded={false} aria-controls={contentId} aria-hidden={!collapsed || undefined}
      tabIndex={collapsed ? 0 : -1} inert={!collapsed} onClick={onExpand}>
      <span className="body-shape-dial" aria-hidden="true"><span/></span>
    </button>
  </aside>;
}

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { RigIcon, LightIcon, ModelIcon } from '../tldraw/ToolIcons';
import { useTooltips } from '../tldraw/drawesome/Tooltip';
import { useToolbarMotion } from '../tldraw/useToolbarMotion';
import { BackIcon, NextIcon, SelectIcon, CollapseIcon, UndoIcon, RedoIcon } from '../tldraw/drawesome/ToolbarIcons';
import '../tldraw/drawing-toolbar.css';
import ModelMenu from './ModelMenu';

export default function PoseToolbar({ viewing, canNavigate, canConfirm, onPrevious, onNext, onConfirm,
  rigging, onRiggingChange, lighting, onLightingChange, modelState, onModelChange, canUndo, canRedo, onUndo, onRedo, onBack }) {
  const [collapsed, setCollapsed] = useState(false);
  const dockMotion = useToolbarMotion();
  const collapseButton = useRef(null), expandButton = useRef(null);
  const previousCollapsed = useRef(collapsed);
  const toolsId = useId();
  const tip = useTooltips(true);
  useLayoutEffect(() => { tip.hide(true); setCollapsed(false); }, [viewing]);
  useLayoutEffect(() => {
    if (previousCollapsed.current === collapsed) return;
    previousCollapsed.current = collapsed;
    (collapsed ? expandButton : collapseButton).current?.focus({ preventScroll: true });
  }, [collapsed]);
  const toggle = next => { tip.hide(true); setCollapsed(next); };

  return <div className="poser2-dock-position" data-viewing={viewing} onKeyDown={event => {
    if (!viewing) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.stopPropagation();
      if (event.shiftKey) onRedo(); else onUndo();
    }
    if (event.key === 'Escape') { event.stopPropagation(); onBack(false); }
  }}>
    <div {...dockMotion} className="drawing-dock" data-collapsed={collapsed}>
      <div className="dock-anchor"><div className="drawing-tray">
        <div className="dock-content pose-selection-tools" role="toolbar" aria-label="Pose selection"
          inert={viewing} aria-hidden={viewing || undefined}>
          <button type="button" className="dock-control" aria-label="Back" disabled={!canNavigate}
            onClick={onPrevious} {...tip.bindControl('Back')}><BackIcon/></button>
          <button type="button" className="dock-control" aria-label="Next" disabled={!canNavigate}
            onClick={onNext} {...tip.bindControl('Next')}><NextIcon/></button>
          <span className="dock-divider" aria-hidden="true"/>
          <button type="button" className="dock-control" aria-label="Select" disabled={!canConfirm}
            onClick={onConfirm} {...tip.bindControl('Select')}><SelectIcon/></button>
        </div>
        <div id={toolsId} className="dock-content pose-model-tools" role="toolbar" aria-label="Model tools"
          inert={collapsed || !viewing} aria-hidden={collapsed || !viewing || undefined}>
          <div className="dock-tools">
            {viewing && <ModelMenu state={modelState} onChange={onModelChange} tip={tip}/>}
            <button type="button" className="tool" aria-label="Rigging" aria-pressed={rigging}
              onClick={() => onRiggingChange(!rigging)} {...tip.bind('Rigging')}><RigIcon/></button>
            <button type="button" className="tool" aria-label="Light" aria-pressed={lighting}
              onClick={() => onLightingChange(!lighting)} {...tip.bind('Light')}>
              <LightIcon/>
            </button>
          </div>
          <span className="dock-divider" aria-hidden="true"/>
          <div className="dock-actions">
            <button type="button" className="dock-control" aria-label="Undo pose edit" disabled={!canUndo}
              onClick={onUndo} {...tip.bindControl('Undo', '⌘Z')}><UndoIcon/></button>
            <button type="button" className="dock-control" aria-label="Redo pose edit" disabled={!canRedo}
              onClick={onRedo} {...tip.bindControl('Redo', '⇧⌘Z')}><RedoIcon/></button>
            <span className="dock-divider dock-action-divider" aria-hidden="true"/>
            <button ref={collapseButton} type="button" className="dock-control dock-collapse" aria-label="Collapse model tools"
              aria-expanded={!collapsed} aria-controls={toolsId} onClick={() => toggle(true)}
              {...tip.bindControl('Collapse')}><CollapseIcon/></button>
          </div>
        </div>
        <span className="dock-selected" aria-hidden="true">{rigging ? <RigIcon/> : lighting ? <LightIcon/> : <ModelIcon/>}</span>
        {collapsed && <button ref={expandButton} type="button" className="dock-expand" aria-label="Show model tools"
          aria-expanded={false} aria-controls={toolsId} onClick={() => toggle(false)} {...tip.bindControl('Show model tools')}/>}
      </div></div>
      {tip.node}
    </div>
  </div>;
}

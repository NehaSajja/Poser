import { useId, useLayoutEffect, useRef, useState } from 'react';
import { DrawingTools, SelectedToolIcon } from './DrawingTools';
import { useTooltips } from './drawesome/Tooltip';
import { CollapseIcon, RedoIcon, TrashIcon, UndoIcon } from './drawesome/ToolbarIcons';
import { useToolbarMotion } from './useToolbarMotion';

export function DrawingToolbar({ medium, canUndo, canRedo, hasShapes, onUndo, onRedo, onClear, pen }) {
  const [collapsed, setCollapsed] = useState(false);
  const dockMotion = useToolbarMotion(() => pen?.finish());
  const collapseButton = useRef(null), expandButton = useRef(null);
  const previousCollapsed = useRef(collapsed);
  const toolsId = useId();
  const tip = useTooltips(true);

  useLayoutEffect(() => {
    if (previousCollapsed.current === collapsed) return;
    previousCollapsed.current = collapsed;
    (collapsed ? expandButton : collapseButton).current?.focus({ preventScroll: true });
  }, [collapsed]);

  function toggle(next) {
    tip.hide(true);
    setCollapsed(next);
  }

  return <div {...dockMotion} className="drawing-dock" data-collapsed={collapsed}>
    <div className="dock-anchor">
    <div className="drawing-tray">
      <div id={toolsId} className="dock-content" role="toolbar" aria-label="Drawing tools"
        inert={collapsed} aria-hidden={collapsed || undefined}>
        <div className="dock-tools"><DrawingTools medium={medium} bindTooltip={tip.bind} pen={pen}/></div>
        <span className="dock-divider" aria-hidden="true"/>
        <div className="dock-actions">
          <button type="button" className="dock-control" aria-label="Undo (⌘Z)" disabled={!canUndo}
            onClick={onUndo} {...tip.bindControl('Undo', '⌘Z')}><UndoIcon/></button>
          <button type="button" className="dock-control" aria-label="Redo (⌘⇧Z)" disabled={!canRedo}
            onClick={onRedo} {...tip.bindControl('Redo', '⇧⌘Z')}><RedoIcon/></button>
          <button type="button" className="dock-control" data-tone="danger" aria-label="Clear canvas" disabled={!hasShapes}
            onClick={onClear} {...tip.bindControl('Clear')}><TrashIcon/></button>
          <span className="dock-divider dock-action-divider" aria-hidden="true"/>
          <button ref={collapseButton} type="button" className="dock-control dock-collapse" aria-label="Collapse"
            aria-expanded={!collapsed} aria-controls={toolsId} onClick={() => toggle(true)}
            {...tip.bindControl('Collapse')}><CollapseIcon/></button>
        </div>
      </div>
      <span className="dock-selected" aria-hidden="true"><SelectedToolIcon/></span>
      {collapsed ? <button ref={expandButton} type="button" className="dock-expand" aria-label="Show drawing tools"
        aria-expanded={false} aria-controls={toolsId} onClick={() => toggle(false)}
        {...tip.bindControl('Show drawing tools')}/> : null}
    </div>
    </div>
    {tip.node}
  </div>;
}

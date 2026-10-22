import { useEffect } from 'react';
import { useEditor, useIsToolSelected, useTools } from 'tldraw';
import { PencilIcon } from './ToolIcons';
import { Button } from '../components/ui/button';

// Draw selects Physical directly; selecting the tool does not open a device chooser.
export function PenMenu({ pen, bindTooltip }) {
  const editor = useEditor(), tools = useTools();
  const active = useIsToolSelected(tools.draw);
  // Keep keyboard selection (D) consistent with clicking the pencil.
  useEffect(() => {
    if (active && pen.mode !== 'smartpen') pen.setMode('smartpen');
  }, [active, pen.mode, pen.setMode]);
  return <Button type="button" variant="ghost" size="icon" className="tool pen-tool" aria-label="Draw"
    aria-pressed={active} aria-keyshortcuts="d" {...bindTooltip?.('Draw', 'D')}
    onClick={() => {
      pen.setMode('smartpen');
      tools.draw.onSelect('toolbar');
      editor.focus();
    }}>
    <PencilIcon size={20} aria-hidden="true"/>
  </Button>;
}

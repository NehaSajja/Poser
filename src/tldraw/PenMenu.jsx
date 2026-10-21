import { useEffect, useState } from 'react';
import { useEditor, useIsToolSelected, useTools } from 'tldraw';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { Bluetooth } from '@phosphor-icons/react/dist/csr/Bluetooth';
import { Cursor } from '@phosphor-icons/react/dist/csr/Cursor';
import { Plus } from '@phosphor-icons/react/dist/csr/Plus';
import { PencilIcon } from './ToolIcons';
import { Button } from '../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';

export function PenMenu({ pen, bindTooltip }) {
  const editor = useEditor(), tools = useTools();
  const active = useIsToolSelected(tools.draw);
  const [open, setOpen] = useState(false);
  const busy = pen.status === 'choosing' || pen.status === 'connecting';
  const ready = pen.status === 'ready';
  useEffect(() => { if (ready) setOpen(false); }, [ready]);
  const select = mode => { pen.setMode(mode); tools.draw.onSelect('toolbar'); };
  return <DropdownMenu open={open} onOpenChange={value => {
    setOpen(value);
    if (value) tools.draw.onSelect('toolbar');
  }}>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="tool pen-tool" aria-label="Draw"
        aria-pressed={active} aria-keyshortcuts="d" {...bindTooltip?.(pen.mode === 'smartpen' ? 'Physical' : 'Draw', 'D')}>
        <PencilIcon size={20} aria-hidden="true"/>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="toolbar-menu pen-menu" side="top" align="center" sideOffset={12}
      onCloseAutoFocus={event => { event.preventDefault(); editor.focus(); }}>
      <DropdownMenuItem role="menuitemradio" aria-checked={pen.mode === 'computer'} onSelect={() => select('computer')}>
        <Cursor size={18} aria-hidden="true"/>Virtual
        {pen.mode === 'computer' && <Check size={16} className="ml-auto" aria-hidden="true"/>}
      </DropdownMenuItem>
      <div className="pen-menu-physical">
        <DropdownMenuItem role="menuitemradio" aria-checked={pen.mode === 'smartpen'}
          onSelect={event => { event.preventDefault(); select('smartpen'); }}>
          <Bluetooth size={18} aria-hidden="true"/>Physical
          {pen.mode === 'smartpen' && <Check size={16} className="ml-auto" aria-hidden="true"/>}
        </DropdownMenuItem>
        <DropdownMenuItem className="pen-connect" disabled={!pen.supported}
          aria-label={ready ? 'Disconnect pen' : busy ? 'Cancel connection' : 'Connect pen'}
          data-disconnect={ready || busy}
          onSelect={event => {
            event.preventDefault();
            if (ready || busy) pen.disconnect();
            else { select('smartpen'); pen.connect(); }
          }}>
          <Plus size={14} aria-hidden="true"/>
        </DropdownMenuItem>
      </div>
      {pen.mode === 'smartpen' && <>
        {(pen.error || !pen.supported) && <div className="pen-menu-status" role="status">
          {pen.error || 'Open in Chrome or Edge to connect.'}
        </div>}
        {ready && <DropdownMenuItem onSelect={() => pen.reanchor()}>Start here</DropdownMenuItem>}
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

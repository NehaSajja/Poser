import { useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react';
import { ModelIcon } from '../tldraw/ToolIcons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { MODEL_OPTIONS } from './models';

export default function ModelMenu({ state, onChange, tip }) {
  const [open, setOpen] = useState(false);
  return <DropdownMenu open={open} onOpenChange={value => { tip.hide(true); setOpen(value); }}>
    <DropdownMenuTrigger asChild>
      <button type="button" className="tool" aria-label="Model" aria-busy={state.busy} {...tip.bind('Model')}>
        <ModelIcon/>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="toolbar-menu pose-model-menu" side="top" align="center" sideOffset={12}
      onEscapeKeyDown={event => event.stopPropagation()}>
      {MODEL_OPTIONS.map(option => <DropdownMenuItem key={option.id} role="menuitemradio"
        aria-checked={state.id === option.id} disabled={state.busy} onSelect={() => onChange(option.id)}>
        {option.label}{state.id === option.id && <CheckIcon size={16} className="ml-auto" aria-hidden="true"/>}
      </DropdownMenuItem>)}
      {state.error && <div className="pose-model-error" role="status">{state.error}</div>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

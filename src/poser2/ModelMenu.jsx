import { useRef, useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react';
import { ModelIcon } from '../tldraw/ToolIcons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { MODEL_OPTIONS, MHR_FLOW_ENABLED } from './models';

export default function ModelMenu({ state, onChange, tip }) {
  const [open, setOpen] = useState(false);
  const customSelected = useRef(false);
  const options = MHR_FLOW_ENABLED ? [{id:'feminine',label:'Feminine'},{id:'masculine',label:'Masculine'},{id:'custom',label:'Custom'}] : MODEL_OPTIONS;
  const chosen = MHR_FLOW_ENABLED ? state.choice : state.id;
  return <DropdownMenu open={open} onOpenChange={value => { tip.hide(true); setOpen(value); }}>
    <DropdownMenuTrigger asChild>
      <button type="button" className="tool" aria-label="Model" aria-busy={state.busy} {...tip.bind('Model')}>
        <ModelIcon/>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="toolbar-menu pose-model-menu" side="top" align="center" sideOffset={12}
      onCloseAutoFocus={event => { if(customSelected.current){event.preventDefault();customSelected.current=false;} }}
      onEscapeKeyDown={event => event.stopPropagation()}>
      {options.map(option => <DropdownMenuItem key={option.id} role="menuitemradio"
        aria-checked={chosen === option.id} disabled={state.busy} onSelect={() => { customSelected.current=option.id==='custom';onChange(option.id); }}>
        {option.label}{chosen === option.id && <CheckIcon size={16} className="ml-auto" aria-hidden="true"/>}
      </DropdownMenuItem>)}
      {state.error && <div className="pose-model-error" role="status">{state.error}</div>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

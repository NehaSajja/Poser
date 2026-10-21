import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { Button } from '../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { MEDIUM_NAMES } from './canvas';

export function MediumMenu({ medium, onChange }) {
  return <div className="medium-picker"><DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" className="medium-menu" aria-label={`Mediums: ${MEDIUM_NAMES[medium]}`}>
      <span className="medium-wordmark">{MEDIUM_NAMES[medium]}</span>
    </Button></DropdownMenuTrigger>
    <DropdownMenuContent className="toolbar-menu medium-options" align="start">
      {Object.entries(MEDIUM_NAMES).map(([value, label]) =>
        <DropdownMenuItem key={value} onSelect={() => onChange(value)} aria-current={medium === value ? 'true' : undefined}>
          {label}{medium === value ? <Check size={16} weight="regular" className="ml-auto" aria-hidden="true"/> : null}
        </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu></div>;
}

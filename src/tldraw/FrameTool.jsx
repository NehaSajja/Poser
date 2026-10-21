import { useEditor, useIsToolSelected, useTools } from 'tldraw';
import { FrameIcon } from './ToolIcons';
import { File } from '@phosphor-icons/react/dist/csr/File';
import { Button } from '../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { Icon } from '../icons';
import { framePresetsFor, setFramePreset } from './frames';

export function FrameTool({ medium = 'ui', bindTooltip }) {
  const editor = useEditor();
  const tools = useTools();
  const active = useIsToolSelected(tools.frame);
  const trigger = <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="tool" aria-label="Frame"
        aria-pressed={active} aria-keyshortcuts="f" {...bindTooltip?.('Frame', 'F')}>
        <FrameIcon size={20} weight="regular" aria-hidden="true"/>
      </Button>
    </DropdownMenuTrigger>;
  return <DropdownMenu>{bindTooltip ? trigger : <Tooltip>
    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
    <TooltipContent sideOffset={6}>Frame (F)</TooltipContent>
  </Tooltip>}
    <DropdownMenuContent className="toolbar-menu frame-menu" side="top" align="center" sideOffset={12} onCloseAutoFocus={event => { event.preventDefault(); editor.focus(); }}>
      {Object.entries(framePresetsFor(medium)).map(([preset, { name, label }]) =>
        <DropdownMenuItem key={preset} onSelect={() => { setFramePreset(editor, preset); tools.frame.onSelect('toolbar'); }}>
          {medium !== 'ui' ? <File size={20} weight="regular" aria-hidden="true"/> : <Icon name={preset}/>}{name}<span className="ml-auto pl-4 text-muted-foreground">{label}</span>
        </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

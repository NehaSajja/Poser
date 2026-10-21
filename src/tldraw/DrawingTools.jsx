import { useEditor, useIsToolSelected, useTools } from 'tldraw';
import { CursorIcon, PencilIcon, EraserIcon, FrameIcon } from './ToolIcons';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { FrameTool } from './FrameTool';
import { PenMenu } from './PenMenu';

const tools = [
  ['select', 'Select', CursorIcon, 'V'], ['draw', 'Draw', PencilIcon, 'D'],
  ['eraser', 'Eraser', EraserIcon, 'E'],
];

function ToolButton({ item, bindTooltip }) {
  const [id, label, Glyph, shortcut] = item;
  const tools = useTools();
  const editor = useEditor();
  const active = useIsToolSelected(tools[id]);
  const button = <Button type="button" variant="ghost" size="icon" className="tool" aria-label={label}
        aria-pressed={active} aria-keyshortcuts={shortcut.toLowerCase()}
        {...bindTooltip?.(label, shortcut)}
        onClick={() => { tools[id].onSelect('toolbar'); editor.focus(); }}>
        <Glyph size={20} weight="regular" aria-hidden="true"/>
      </Button>;
  if (bindTooltip) return button;
  return <Tooltip>
    <TooltipTrigger asChild>{button}</TooltipTrigger>
    <TooltipContent sideOffset={6}>{label} ({shortcut})</TooltipContent>
  </Tooltip>;
}


export function DrawingTools({ medium = 'ui', bindTooltip, pen }) {
  return <>{tools.map(item => item[0] === 'draw' && pen
    ? <PenMenu key="draw" pen={pen} bindTooltip={bindTooltip}/>
    : <ToolButton key={item[0]} item={item} bindTooltip={bindTooltip}/>)}<FrameTool medium={medium} bindTooltip={bindTooltip}/></>;
}

function SelectedGlyph({ id, Glyph }) {
  const tools = useTools();
  const active = useIsToolSelected(tools[id]);
  return active ? <Glyph size={24} weight="regular"/> : null;
}

export function SelectedToolIcon() {
  return <>{tools.map(([id, , Glyph]) => <SelectedGlyph key={id} id={id} Glyph={Glyph}/>)}<SelectedGlyph id="frame" Glyph={FrameIcon}/></>;
}

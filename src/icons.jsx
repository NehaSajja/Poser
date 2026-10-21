import { Button } from './components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip';
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { UploadSimple } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { SquaresFour } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { Code } from '@phosphor-icons/react/dist/csr/Code';
import { TrashSimple } from '@phosphor-icons/react/dist/csr/TrashSimple';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle';
import { Warning } from '@phosphor-icons/react/dist/csr/Warning';
import { Circle } from '@phosphor-icons/react/dist/csr/Circle';
import { Triangle } from '@phosphor-icons/react/dist/csr/Triangle';
import { Cpu } from '@phosphor-icons/react/dist/csr/Cpu';
import { Monitor } from '@phosphor-icons/react/dist/csr/Monitor';
import { DeviceMobile } from '@phosphor-icons/react/dist/csr/DeviceMobile';

const icons = {
 pen: PencilSimple, upload: UploadSimple, grid: SquaresFour,
 undo: ArrowCounterClockwise, close: X, code: Code, trash: TrashSimple,
 arrow: ArrowRight, spark: Sparkle, warning: Warning,
 circle: Circle, triangle: Triangle, chip: Cpu,
 desktop: Monitor, mobile: DeviceMobile,
};
export function Icon({name}) {
 const Glyph = icons[name];
 return <Glyph size={20} weight="regular" aria-hidden="true"/>;
}
export function Tool({name, label, text, active, ...props}) {
 return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size={text?'default':'icon'} className={`tool ${text ? 'with-label' : ''} ${active ? 'active' : ''}`} aria-label={label} aria-pressed={active === undefined ? undefined : active} {...props}><Icon name={name}/>{text ? <span>{text}</span> : null}</Button></TooltipTrigger><TooltipContent sideOffset={6}>{label}</TooltipContent></Tooltip>;
}

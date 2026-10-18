import type { CSSProperties } from "react";
import { PersonStanding, Scan, Landmark, Pencil, Eraser, Undo2, Redo2, Hand, Plus, Minus, ArrowRight, ChevronRight, X, Upload, Download, RotateCcw, Layers, Box, Image, History, SlidersHorizontal, Link, Check, Info, ExternalLink, Pause, Play, Trash2, FilePenLine, Lightbulb, Sun, type LucideIcon } from "lucide-react";
const icons: Record<string, LucideIcon> = {
  pose: PersonStanding, focus: Scan, museum: Landmark, bulb: Lightbulb, sun: Sun, pen: Pencil, eraser: Eraser, undo: Undo2, redo: Redo2, hand: Hand,
  plus: Plus, minus: Minus, arrow: ArrowRight, chevron: ChevronRight,
  close: X, upload: Upload, download: Download, reset: RotateCcw,
  layers: Layers, cube: Box, image: Image, history: History,
  settings: SlidersHorizontal, link: Link, check: Check, info: Info,
  external: ExternalLink, pause: Pause, play: Play, trash: Trash2, sample: FilePenLine,
};
export default function Icon({name, size=18, style}: {name: string; size?: number; style?: CSSProperties}) {
  const Glyph = icons[name] || Info;
  return <Glyph size={size} strokeWidth={1.7} aria-hidden="true" style={style}/>;
}

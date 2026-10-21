// Adapted from benjitaylor/drawesome, Copyright (c) 2026 Benji Taylor.
// MIT license: ./LICENSE
function Glyph({ children, className }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{children}</svg>;
}

export function UndoIcon() {
  return <Glyph><path d="M2.8 5.5h6.9a3.6 3.6 0 0 1 0 7.2H6.2"/><path d="M5.4 2.9 2.8 5.5l2.6 2.6"/></Glyph>;
}

export function RedoIcon() {
  return <Glyph><path d="M13.2 5.5H6.3a3.6 3.6 0 0 0 0 7.2h3.5"/><path d="M10.6 2.9l2.6 2.6-2.6 2.6"/></Glyph>;
}

// Original Drawesome BackIcon geometry; mirror it for forward navigation.
const backPath = 'M9.8 3.6 5.4 8l4.4 4.4';
export function BackIcon() {
  return <Glyph><path d={backPath}/></Glyph>;
}

export function NextIcon() {
  return <Glyph><path d={backPath} transform="translate(16 0) scale(-1 1)"/></Glyph>;
}

export function SelectIcon() {
  return <Glyph><path d="M3.2 8.4 6.4 11.6 12.8 4.8"/></Glyph>;
}

export function TrashIcon() {
  return <Glyph className="dock-trash"><path d="M4.9 7.5v3.9a2.3 2.3 0 0 0 2.3 2.3h1.6a2.3 2.3 0 0 0 2.3-2.3V7.5"/>
    <g className="dock-trash-lid"><path d="M3.5 5.6h9"/><path d="M6.8 5.6V4.5a1.2 1.2 0 0 1 1.2-1.2 1.2 1.2 0 0 1 1.2 1.2v1.1"/></g>
  </Glyph>;
}

export function CollapseIcon() {
  return <Glyph><path d="M6.6 2.9v3.7H2.9"/><path d="M2.6 2.6 6.6 6.6"/><path d="M9.4 13.1V9.4h3.7"/><path d="M13.4 13.4 9.4 9.4"/></Glyph>;
}

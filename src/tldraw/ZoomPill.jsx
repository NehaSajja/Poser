import { useEditor, useValue } from 'tldraw';

export function ZoomPill() {
  const editor = useEditor();
  const percentage = useValue('zoom percentage', () => Math.round(editor.getZoomLevel() * 100), [editor]);

  return <div className="zoom-pill" aria-label={`Canvas zoom: ${percentage}%`}>
    <span aria-hidden="true">{percentage}%</span>
  </div>;
}

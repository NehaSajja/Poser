import { DefaultBackground, DefaultGrid, useEditor, useValue } from 'tldraw';

export function PaperBackground() {
  const editor = useEditor();
  const { x, y, z } = useValue('paper camera', () => editor.getCamera(), [editor]);

  // Reuse tldraw's adaptive grid without enabling its grid-snapping mode.
  return <div className="paper-background" style={{ '--paper-dot-radius': `${.55 * z}px` }}>
    <DefaultBackground />
    <DefaultGrid x={x} y={y} z={z} size={5} />
  </div>;
}

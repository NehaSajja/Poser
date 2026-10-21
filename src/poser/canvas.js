import { Box } from 'tldraw';

import { MEDIUM_NAMES } from './mediums';
export { MEDIUM_NAMES } from './mediums';

export function switchMediumPage(editor, medium) {
  editor.complete();
  editor.run(() => {
    let page = editor.getPages().find(page => page.meta.medium === medium);
    if (!page && medium === 'ui') {
      page = editor.getPages().find(page => !page.meta.medium);
      if (page) editor.updatePage({ id: page.id, meta: { ...page.meta, medium } });
    }
    if (!page) {
      editor.createPage({ name: MEDIUM_NAMES[medium] || MEDIUM_NAMES.ui, meta: { medium, ...(medium === 'poser2' ? { poserVersion: 'carousel' } : {}) } });
      page = editor.getPages().find(page => page.meta.medium === medium);
    }
    editor.setCurrentPage(page.id);
  }, { history: 'ignore' });
  // tldraw's history spans pages. Undo must not change the other medium silently.
  editor.clearHistory();
}

export const poseShapes = editor => editor.getCurrentPageShapes().filter(shape => ['draw', 'geo', 'line', 'arrow'].includes(shape.type));

export function poseSketchBounds(editor, shapes = poseShapes(editor)) {
  const boxes = shapes.map(shape => editor.getShapePageBounds(shape)).filter(Boolean);
  if (!boxes.length) throw new Error('Draw a pose first.');
  const ink = Box.Common(boxes);
  const size = Math.max(ink.w, ink.h, 1) * 1.36;
  return new Box(ink.center.x - size / 2, ink.center.y - size / 2, size, size);
}

export async function exportPoseSketch(editor, { background = true } = {}) {
  editor.complete();
  const shapes = poseShapes(editor);
  const bounds = poseSketchBounds(editor, shapes);
  // Native export captures the whole pose, independent of pan, zoom, or selection.
  const { url } = await editor.toImageDataUrl(shapes, { format: 'png', bounds, padding: 0, scale: 1200 / bounds.w, pixelRatio: 1, background, darkMode: false });
  return url;
}

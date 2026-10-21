import { DrawShapeUtil } from 'tldraw';

// tldraw adds 1 to this display width before building its native ink outline.
// 1.4 gives a 2.4px nominal mouse stroke at 100%, close to the original Poser
// brush after its 1000-unit drawing canvas was scaled to a typical split panel.
// Keep native geometry, pressure, hit testing, SVG export and shape persistence.
export const PoserDrawShapeUtil = DrawShapeUtil.configure({
  getCustomDisplayValues(_editor, shape) {
    if (shape.meta.poserInk !== 1) return {};
    return {
      strokeWidth: 1.4,
      ...(shape.props.color === 'black' ? { strokeColor: '#242423' } : {}),
    };
  },
});

export function attachPoserInk(editor) {
  return editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
    // Only newly drawn Poser ink. Do not restyle persisted/pasted drawings,
    // wireframes, geometric shapes or remote changes.
    if (source !== 'user' || shape.type !== 'draw' || shape.props.isComplete ||
        shape.meta.poserInk !== undefined || editor.getCurrentToolId() !== 'draw' ||
        editor.getCurrentPage().meta.medium !== 'poser2') return shape;
    return { ...shape, meta: { ...shape.meta, poserInk: 1 },
      props: { ...shape.props, dash: 'draw', size: 's' } };
  });
}

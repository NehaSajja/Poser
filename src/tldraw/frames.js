export const FRAME_PRESETS = {
  desktop: { name: 'Desktop', ratio: 16 / 10, label: '16:10' },
  mobile: { name: 'Mobile', ratio: 9 / 16, label: '9:16' },
};
export const PAPER_FRAME_PRESETS = {
  a4: { name: 'A4', ratio: 210 / 297, label: '210 × 297 mm' },
  a3: { name: 'A3', ratio: 297 / 420, label: '297 × 420 mm' },
  letter: { name: 'US Letter', ratio: 8.5 / 11, label: '8.5 × 11 in' },
  tabloid: { name: 'US Tabloid', ratio: 11 / 17, label: '11 × 17 in' },
};

export const framePresetsFor = medium => medium === 'ui' ? FRAME_PRESETS : PAPER_FRAME_PRESETS;
const frameMedium = editor => editor.getCurrentPage().meta.medium || 'ui';

const presets = new WeakMap();

export function setFramePreset(editor, preset) { presets.set(editor, { ...presets.get(editor), [frameMedium(editor)]: preset }); }
export function getFramePreset(editor) {
  const medium = frameMedium(editor), choices = framePresetsFor(medium);
  return choices[presets.get(editor)?.[medium]] || choices[medium === 'ui' ? 'desktop' : 'a4'];
}

export function frameScope(editor, shape) {
  return editor.findShapeAncestor(shape, ancestor => ancestor.type === 'frame')?.id ?? editor.getCurrentPageId();
}


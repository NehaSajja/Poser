import { createElement } from 'react';
import { FrameShapeUtil, Group2d, Rectangle2d } from 'tldraw';
import { ScreenFrame } from './FramePresentation';
import { frameHeadingPlacement, frameHeadingBounds, frameName, FRAME_LABEL_MAX_WIDTH } from './frameHeading';
import { getFramePreset } from './frames';

// Keep tldraw's frame tool, resizing, enclosure, parenting and clipping. Only
// the preset and heading presentation are customized.
export class ScreenFrameShapeUtil extends FrameShapeUtil {
  getDefaultProps() {
    const { name, ratio } = getFramePreset(this.editor);
    return { ...super.getDefaultProps(), name,
      w: ratio >= 1 ? 800 : 800 * ratio, h: ratio >= 1 ? 800 / ratio : 800 };
  }

  onBeforeCreate(shape) {
    // The native tool seeds a 1 × 1 box before handing the drag to resizing.
    if (shape.props.w !== 1 || shape.props.h !== 1) return;
    const { ratio } = getFramePreset(this.editor);
    return { ...shape, props: { ...shape.props, w: ratio, h: 1 } };
  }

  isAspectRatioLocked() { return true; }

  component(shape) { return createElement(ScreenFrame, { shape }); }

  getGeometry(shape) {
    const zoom = this.editor.getZoomLevel();
    const { side } = frameHeadingPlacement(shape.props, this.editor.getShapePageTransform(shape).rotation(), zoom);
    const text = this.editor.textMeasure.measureText(frameName(shape.props.name), {
      fontFamily: '"GT Maru", sans-serif', fontSize: 12, fontWeight: '500', fontStyle: 'normal',
      lineHeight: 1.4, maxWidth: null, padding: '0px',
    });
    const width = Math.min(FRAME_LABEL_MAX_WIDTH, Math.max(32, text.w + 14));
    return new Group2d({ children: [
      new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false }),
      new Rectangle2d({ ...frameHeadingBounds(shape.props, side, zoom, width), isFilled: true,
        isLabel: true, excludeFromShapeBounds: true }),
    ] });
  }

}

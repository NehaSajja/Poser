import { BaseBoxShapeUtil, HTMLContainer, T } from 'tldraw';
import { KINDS } from '../design';

export const CONTROL_TYPE = 'sketch-control';

export class SketchControlShapeUtil extends BaseBoxShapeUtil {
  static type = CONTROL_TYPE;
  static props = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    kind: T.literalEnum(...KINDS),
    checked: T.boolean.optional(),
    text: T.string.optional(),
    ink: T.arrayOf(T.arrayOf(T.object({ x: T.number, y: T.number }))),
  };

  getDefaultProps() { return { w: 240, h: 64, kind: 'container', ink: [] }; }
  canEdit() { return false; }
  hideRotateHandle() { return true; }

  component(shape) {
    const { w, h, ink } = shape.props;
    return <HTMLContainer className="tldraw-sketch" style={{ width: w, height: h }} data-sketch-id={shape.id}>
      <svg width={w} height={h} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {ink.length ? ink.map((stroke, i) => stroke.length === 1
          ? <circle key={i} cx={stroke[0].x * w} cy={stroke[0].y * h} r={1} fill="currentColor"/>
          : <polyline key={i} points={stroke.map(p => `${p.x * w},${p.y * h}`).join(' ')}/>)
          : <rect width={w} height={h}/>}
      </svg>
    </HTMLContainer>;
  }

  getIndicatorPath(shape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

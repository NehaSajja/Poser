// Screen-space dimensions shared by the sketch label, preview label and hit area.
export const FRAME_LABEL_HEIGHT = 24;
export const FRAME_LABEL_GAP = 4;
export const FRAME_LABEL_MAX_WIDTH = 320;
export const frameName = name => name.trim() ? name : 'Frame';

export function frameHeadingPlacement({ w, h }, rotation, zoom) {
  const side = ((Math.floor((rotation + Math.PI / 4) / (Math.PI / 2)) % 4) + 4) % 4;
  const [x, y, angle] = [[0, 0, 0], [0, h, 270], [w, h, 180], [w, 0, 90]][side];
  return { side, transform: `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${1 / zoom})` };
}

export function frameHeadingBounds(props, side, zoom, width) {
  const w = width / zoom, h = FRAME_LABEL_HEIGHT / zoom, gap = FRAME_LABEL_GAP / zoom;
  return [
    { x: 0, y: -h - gap, width: w, height: h },
    { x: -h - gap, y: props.h - w, width: h, height: w },
    { x: props.w - w, y: props.h + gap, width: w, height: h },
    { x: props.w + gap, y: 0, width: h, height: w },
  ][side];
}

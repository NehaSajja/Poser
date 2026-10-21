/** Image documents isolate SVG gradient IDs across expanded and collapsed copies. */
function ToolArtwork({ src, size = 20, weight: _weight, ...props }) {
  return <img src={src} width={size * 1.3} height={size * 1.3}
    alt="" draggable={false} style={{ flexShrink: 0, pointerEvents: 'none' }} {...props}/>;
}

export function CursorIcon(props) {
  return <ToolArtwork {...props} src="/icons/cursor/cursor-black.svg"/>;
}

export function PencilIcon(props) {
  return <ToolArtwork {...props} src="/icons/pencil/pencil-yellow.svg"/>;
}

export function EraserIcon(props) {
  return <ToolArtwork {...props} src="/icons/eraser/eraser-rose.svg"/>;
}

export function FrameIcon(props) {
  return <ToolArtwork {...props} src="/icons/frame/frame-walnut.svg"/>;
}

export function RigIcon(props) {
  return <ToolArtwork {...props} src="/icons/rig/rig-joint.svg"/>;
}

export function LightIcon(props) {
  return <ToolArtwork {...props} src="/icons/light/light-porcelain.svg"/>;
}

export function ModelIcon(props) {
  return <ToolArtwork {...props} src="/icons/model/model-bust.svg"/>;
}

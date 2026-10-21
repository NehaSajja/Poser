import { createPortal } from 'react-dom';
import { useEditor, useValue } from 'tldraw';
import { Component } from '../Component';
import { getPreviewShapes } from './previewLayout';
import { Field, FieldLabel } from '../components/ui/field';
import { LABEL_SPACE } from './horizontalLine';
import { FramePill } from './FramePresentation';
import { frameHeadingPlacement } from './frameHeading';
import { usePreviewCamera } from './usePreviewCamera';

function PreviewControl({ item, axis }) {
  const { shape, props, height, transform, clipPath } = item;
  return <div className="tldraw-control preview-control"
    data-component-library="shadcn" data-control-kind={props.kind} data-control-id={shape.id}
    style={{ width: axis ? (axis === 'x' ? 0 : '100%') : props.w, height,
      flex: axis === 'x' ? '1 1 0' : undefined,
      transform: axis ? undefined : transform, clipPath, opacity: shape.opacity }}>
    {item.label ? <Field className="preview-field" style={{ top: -LABEL_SPACE, '--control-height': `${height}px` }}>
      <FieldLabel className="preview-label" data-control-kind="text" data-source-id={item.label}
        htmlFor={['input','button'].includes(props.kind) ? `preview-${shape.id}` : undefined}>Label</FieldLabel>
      <Component element={props} id={`preview-${shape.id}`}/>
    </Field> : <Component element={props} id={`preview-${shape.id}`}/>}
  </div>;
}

export function LivePreview({ target }) {
  const editor = useEditor();
  const { camera, viewport } = usePreviewCamera(editor.getCamera());
  const shapes = useValue('preview shapes', () => getPreviewShapes(editor), [editor]);
  const byId = new Map(shapes.map(item => [item.shape.id, item]));
  const renderedGroups = new Set();

  return createPortal(<div ref={viewport} className="preview-viewport" tabIndex={0}
    role="region" aria-label="Preview canvas" aria-description="Drag or scroll to pan. Pinch or Control-scroll to zoom. Arrow keys pan; plus and minus zoom."
    onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}
    onPointerUp={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <div className="preview-world" style={{
    '--preview-scale': 1 / camera.z,
    transform: `translate(${camera.x * camera.z}px, ${camera.y * camera.z}px) scale(${camera.z})`,
  }}>
    {shapes.map(item => {
      const { shape, transform, clipPath, group } = item;
      if (shape.type === 'frame') return <div key={shape.id} className="preview-frame" data-frame-id={shape.id}
        style={{ width: shape.props.w, height: shape.props.h, transform, clipPath, opacity: shape.opacity }}>
        <div className="frame-heading" style={{ transform: frameHeadingPlacement(shape.props, item.matrix.rotation(), camera.z).transform }}>
          <FramePill name={shape.props.name}/>
        </div>
      </div>;
      if (!group) return <PreviewControl key={shape.id} item={item}/>;
      if (renderedGroups.has(group.key)) return null;
      renderedGroups.add(group.key);
      return <div key={group.key} className="preview-layout" data-layout={group.axis === 'x' ? 'row' : 'column'}
        style={{ width: group.box.w, height: group.box.h, transform: group.transform,
          flexDirection: group.axis === 'x' ? 'row' : 'column', gap: group.gap }}>
        {group.ids.map(id => <PreviewControl key={id} item={byId.get(id)} axis={group.axis}/>)}
      </div>;
    })}
  </div>
    <div className="zoom-pill" aria-label={`Preview zoom: ${Math.round(camera.z * 100)}%`}><span>{Math.round(camera.z * 100)}%</span></div>
  </div>, target);
}

import { useEffect, useRef } from 'react';
import { SVGContainer, useEditor, useIsEditing, useValue } from 'tldraw';
import { frameHeadingPlacement, frameName } from './frameHeading';

export function FramePill({ name, children, ...props }) {
  return <div className="frame-pill" {...props}>
    <span className="frame-pill-text">{frameName(name)}</span>{children}
  </div>;
}

function EditableFrameHeading({ shape, transform }) {
  const editor = useEditor();
  const editing = useIsEditing(shape.id);
  const input = useRef(null);
  const original = useRef(shape.props.name);
  useEffect(() => {
    if (!editing) return;
    original.current = editor.getShape(shape.id).props.name;
    editor.markHistoryStoppingPoint('Rename frame');
    input.current?.focus(); input.current?.select();
  }, [editing, editor, shape.id]);

  const rename = name => editor.updateShapes([{ id: shape.id, type: 'frame', props: { name } }]);
  const finish = () => {
    if (editor.getEditingShapeId() !== shape.id) return;
    editor.setEditingShape(null);
    editor.markHistoryStoppingPoint('Finish renaming frame');
  };
  return <div className="frame-heading" style={{ transform }}>
    <FramePill name={shape.props.name} data-editing={editing || undefined}
      onDoubleClick={event => {
        editor.markEventAsHandled(event); event.stopPropagation();
        editor.setSelectedShapes([shape.id]); editor.setEditingShape(shape.id);
      }}>
      {editing && <input ref={input} className="frame-name-input" aria-label="Frame name"
        value={shape.props.name} spellCheck={false} autoComplete="off"
        onChange={event => rename(event.target.value)} onBlur={finish}
        onPointerDownCapture={event => { editor.markEventAsHandled(event); event.stopPropagation(); }}
        onKeyDownCapture={event => {
          editor.markEventAsHandled(event); event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            if (event.key === 'Escape') rename(original.current);
            finish(); editor.focus();
          }
        }}/>} 
    </FramePill>
  </div>;
}

export function ScreenFrame({ shape }) {
  const editor = useEditor();
  const placement = useValue('frame heading placement', () => frameHeadingPlacement(shape.props,
    editor.getShapePageTransform(shape).rotation(), editor.getZoomLevel()), [editor, shape]);
  const creating = useValue('creating frame', () => editor.isIn('select.resizing') &&
    editor.getStateDescendant('select.resizing')?.info?.isCreating && editor.getOnlySelectedShapeId() === shape.id, [editor, shape.id]);
  return <>
    <SVGContainer><rect className={`tl-frame__body${creating ? ' tl-frame__creating' : ''}`}
      width={shape.props.w} height={shape.props.h} fill="white" stroke="rgba(0,0,0,.08)"/></SVGContainer>
    {!creating && <EditableFrameHeading shape={shape} transform={placement.transform}/>}
  </>;
}

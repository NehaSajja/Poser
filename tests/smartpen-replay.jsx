// Isolated, non-persistent canvas. Recorded hardware input, no live device or API calls.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Tldraw, useEditor, useValue, DefaultSizeStyle } from 'tldraw';
import { DrawingToolbar } from '../src/tldraw/DrawingToolbar';
import { SplitWorkspace } from '../src/tldraw/SplitWorkspace';
import { attachPenStabilizer } from '../src/tldraw/pen';
import { createPenInput } from '../src/smartpen/ink';
import { useSmartpen } from '../src/smartpen/useSmartpen';
import captured from './fixtures/m1-plus-strokes.json';
import 'tldraw/tldraw.css';
import '../src/style.css';
import '../src/tldraw/tldraw.css';
import '../src/tldraw/drawing-toolbar.css';

function Controls() {
  const editor = useEditor(), pen = useSmartpen(editor);
  const [result, setResult] = useState('No recording replayed');
  const [sdk, setSdk] = useState('SDK not loaded');
  const shapes = useValue('shapes', () => editor.getCurrentPageShapes(), [editor]);
  const canUndo = useValue('undo', () => editor.canUndo(), [editor]);
  const canRedo = useValue('redo', () => editor.canRedo(), [editor]);
  useEffect(() => attachPenStabilizer(editor), [editor]);
  function replay() {
    const input = createPenInput(editor);
    input.setMaxForce(1023);
    editor.markHistoryStoppingPoint('Recording replay');
    captured.forEach(dot => input.dot(dot));
    input.finish();
    editor.zoomToFit({ animation: { duration: 0 }, inset: 100 });
    const draws = editor.getCurrentPageShapes().filter(s => s.type === 'draw');
    setResult(`${draws.length} strokes · ${draws.filter(s => s.props.isComplete).length} complete`);
  }
  return <>
    <div className="top-left" style={{ display: 'grid', gap: '.5rem' }}>
      <button onClick={replay}>Replay recorded M1+ strokes</button>
      <output>{result} · {shapes.length} shapes now</output>
      <button onClick={async () => {
        try {
          const { PenController, PenMessageType } = await import('web_pen_sdk');
          setSdk(typeof PenController === 'function' && PenMessageType ? 'Neo SDK loaded' : 'Invalid SDK');
        } catch (error) { setSdk(error.message); }
      }}>Check Neo SDK</button>
      <output>{sdk}</output>
    </div>
    <div className="bottom drawing-bottom"><DrawingToolbar medium="poser2" pen={pen}
      canUndo={canUndo} canRedo={canRedo} hasShapes={shapes.length > 0}
      onUndo={() => editor.undo()} onRedo={() => editor.redo()}
      onClear={() => editor.deleteShapes([...editor.getCurrentPageShapeIds()])}/></div>
  </>;
}
createRoot(document.getElementById('root')).render(<SplitWorkspace sketch={
  <section id="sketch-pane" className="tldraw-app sketch-pane" aria-label="Sketch canvas">
    <Tldraw hideUi onMount={editor => {
      editor.setCurrentTool('draw'); editor.setStyleForNextShapes(DefaultSizeStyle, 's');
    }}><Controls/></Tldraw>
  </section>
} preview={<section id="preview-pane" className="preview-pane" aria-label="Preview"/>}/>);

// Isolated real-SDK recognition replay. No persisted user canvas or mocked model.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Tldraw, b64Vecs, createShapeId } from 'tldraw';
import { SketchControlShapeUtil } from '../src/tldraw/SketchControlShape';
import { attachRecognition } from '../src/tldraw/recognition';
import { LivePreview } from '../src/tldraw/LivePreview';
import { attachPenStabilizer } from '../src/tldraw/pen';
import { SNAP_DISTANCE } from '../src/tldraw/snapping';
import '../src/style.css';
import 'tldraw/tldraw.css';
import '../src/tldraw/tldraw.css';

const shapeUtils = [SketchControlShapeUtil];
const options = { snapThreshold: SNAP_DISTANCE };
function Replay() {
  const editorRef = useRef(null), controllerRef = useRef(null);
  const [previewRoot, setPreviewRoot] = useState(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [shapes, setShapes] = useState([]), [decision, setDecision] = useState(null);
  function replay(native) {
    const editor = editorRef.current;
    controllerRef.current.cancel();
    editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
    setError('');
    setDecision(null);
    editor.setCurrentTool(native ? 'geo' : 'draw');
    editor.emit('before-event', { type: 'pointer', name: 'pointer_down', button: 0, point: { x: 100, y: 160 } });
    if (native) editor.createShape({ id: createShapeId(), type: 'geo', x: 100, y: 160, props: { geo: 'rectangle', w: 400, h: 180 } });
    else {
      // Approximation of the reported overshooting top-left corner, in one stroke.
      const points = [[60,20],[110,24],[300,19],[566,20],[574,24],[580,80],[585,180],[584,225],[578,232],[280,245],[135,246],[127,241],[127,2]]
        .map(([x,y]) => ({x,y,z:.5}));
      editor.createShape({ id: createShapeId(), type: 'draw', x: 60, y: 160, props: { isComplete: true, isClosed: false,
        segments: [{ type: 'free', dim: 3, path: b64Vecs.encodePoints(points) }] } });
    }
    editor.emit('event', { type: 'pointer', name: 'pointer_up', button: 0 });
  }
  function addNearbyRectangle() {
    const editor = editorRef.current;
    editor.setCurrentTool('geo');
    editor.emit('before-event', {type:'pointer',name:'pointer_down',button:0,point:{x:112,y:380}});
    editor.createShape({id:createShapeId(),type:'geo',x:112,y:380,props:{geo:'rectangle',w:380,h:176}});
    editor.emit('event', {type:'pointer',name:'pointer_up',button:0});
  }
  return <main className="sketch-workspace">
    <section className="tldraw-app sketch-pane grid-hidden" aria-label="Sketch canvas">
    <Tldraw hideUi shapeUtils={shapeUtils} options={options} onMount={editor => {
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (args[0] === '/api/recognize') setDecision(await response.clone().json());
        return response;
      };
      editorRef.current = editor;
      editor.user.updateUserPreferences({colorScheme:'light',isSnapMode:true,isDynamicSizeMode:false});
      editor.updateDocumentSettings({gridSize:4});
      editor.updateInstanceState({isGridMode:true});
      const stopPen = attachPenStabilizer(editor);
      const controller = attachRecognition(editor, {onPending:setPending,onError:setError});
      controllerRef.current = controller;
      const stop = editor.store.listen(() => setShapes(editor.getCurrentPageShapes().map(s => ({type:s.type,kind:s.props.kind,x:s.x,y:s.y}))), {scope:'document'});
      return () => {stopPen();controller.dispose();stop();window.fetch=originalFetch;};
    }}>{previewRoot ? <LivePreview target={previewRoot}/> : null}</Tldraw>
    <div style={{position:'absolute',left:16,top:16,zIndex:500,pointerEvents:'auto'}}>
      <button onClick={() => replay(false)}>Replay rough rectangle</button>{' '}
      <button onClick={() => replay(true)}>Replay native rectangle</button>
      {' '}<button onClick={addNearbyRectangle}>Add nearby rectangle</button>
      <details><summary>Diagnostics</summary><pre role="status" style={{fontSize:12,maxHeight:100,overflow:'auto'}}>{JSON.stringify({pending,error,shapes,decision:decision && {kind:decision.kind,probability:decision.probabilities?.find(p=>p.value===decision.kind)?.probability,elapsedMs:decision.elapsedMs}},null,2)}</pre></details>
    </div>
    </section>
    <section ref={setPreviewRoot} className="preview-pane" aria-label="Live preview"/>
  </main>;
}
createRoot(document.getElementById('root')).render(<Replay/>);

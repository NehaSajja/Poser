import { useEffect, useRef, useState } from 'react';
import { DefaultColorStyle, DefaultDashStyle, DefaultSizeStyle, Tldraw, useEditor, useValue } from 'tldraw';
import { Card } from '../components/ui/card';
import { Tool, Icon } from '../icons';
import { Component } from '../Component';
import { PREVIEW_KINDS, COMPONENT_NAMES } from '../design';
import { SketchControlShapeUtil } from './SketchControlShape';
import { attachRecognition } from './recognition';
import { DrawingToolbar } from './DrawingToolbar';
import { ZoomPill } from './ZoomPill';
import { PaperBackground } from './PaperBackground';
import { LivePreview } from './LivePreview';
import { SplitWorkspace } from './SplitWorkspace';
import { attachPenStabilizer } from './pen';
import { PoserDrawShapeUtil, attachPoserInk } from './PoserDrawShape';
import { useSmartpen } from '../smartpen/useSmartpen';
import { TOOL_SNAP_DISTANCE } from './snapping';
import { ScreenFrameShapeUtil } from './ScreenFrameShape';
import { MediumMenu } from '../poser/MediumMenu';
import { switchMediumPage } from '../poser/canvas';
import { migratePoserPages, resolveMedium } from '../poser/mediums';
import { usePoseRetrieval } from '../poser/usePoseRetrieval';
import PoserPanel from '../poser/PoserPanel';
import { useSketchThumbnail, SketchThumbnail } from './SketchThumbnail';
import 'tldraw/tldraw.css';
import './tldraw.css';
import './drawing-toolbar.css';

const shapeUtils = [PoserDrawShapeUtil, SketchControlShapeUtil, ScreenFrameShapeUtil];
const components = { StylePanel: null, ContextMenu: null, Grid: null, Background: PaperBackground };
const options = {
  maxShapesPerPage: 500,
  snapThreshold: TOOL_SNAP_DISTANCE,
  gridSteps: [
    { min: -1, mid: .15, step: 32 },
    { min: .05, mid: .375, step: 8 },
    { min: .15, mid: 1, step: 2 },
  ],
};

function CanvasControls({ medium, onMediumChange, poseRetrieval, compact }) {
  const editor = useEditor();
  const pen = useSmartpen(editor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(false);
  const recognition = useRef(null);
  const canUndo = useValue('can undo', () => editor.canUndo(), [editor]);
  const canRedo = useValue('can redo', () => editor.canRedo(), [editor]);
  const hasShapes = useValue('has shapes', () => editor.getCurrentPageShapeIds().size > 0, [editor]);

  useEffect(() => {
    const stopPen = attachPenStabilizer(editor);
    const keyboard = event => {
      if (compact) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      if (event.target.closest('input,textarea,[contenteditable="true"]')) return;
      if (event.target.closest('.preview-pane')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      pen.finish();
      recognition.current?.cancel();
      if (event.shiftKey) editor.redo(); else editor.undo();
    };
    window.addEventListener('keydown', keyboard, true);
    return () => { stopPen(); window.removeEventListener('keydown', keyboard, true); };
  }, [editor, compact]);

  useEffect(() => {
    if (medium !== 'ui') return;
    const controller = attachRecognition(editor, { onPending: setPending, onError: setError });
    recognition.current = controller;
    return () => { controller.dispose(); recognition.current = null; };
  }, [editor, medium]);

  function changeMedium(value) {
    if (value === medium) return;
    pen.finish();
    poseRetrieval.cancel();
    recognition.current?.dispose();
    recognition.current = null;
    setPending(false); setError(''); setPanel(false);
    switchMediumPage(editor, value);
    onMediumChange(value);
    editor.focus();
  }
  function undo() { pen.finish(); recognition.current?.cancel(); editor.undo(); }
  function redo() { pen.finish(); recognition.current?.cancel(); editor.redo(); }
  function clear() {
    pen.reanchor();
    recognition.current?.cancel();
    editor.markHistoryStoppingPoint('Clear canvas');
    editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
    editor.markHistoryStoppingPoint('After clear');
    setError('');
  }
  const visibleError = medium === 'ui' ? error : poseRetrieval.error;
  return <>
    <div className="top-left">
      <MediumMenu medium={medium} onChange={changeMedium}/>
      {medium === 'ui' ? <Tool data-components-toggle name="grid" label="Components" text="Components" active={panel} onClick={() => setPanel(!panel)}/> : null}
    </div>
    <ZoomPill/>
    {medium === 'ui' && panel ? <Card className="design-panel" role="complementary" aria-label="shadcn components">
      <div className="panel-tools"><span>Components</span><Tool name="close" label="Close components" onClick={() => setPanel(false)}/></div>
      <div className="specimens" data-component-library="shadcn">{PREVIEW_KINDS.map(kind => <div key={kind} className={`specimen specimen-${kind}`} aria-label={`${COMPONENT_NAMES[kind]} specimen`} title={COMPONENT_NAMES[kind]}><Component element={{kind,text:''}}/></div>)}</div>
    </Card> : null}
    <div className="bottom drawing-bottom"><DrawingToolbar medium={medium} canUndo={canUndo} canRedo={canRedo} pen={pen}
      hasShapes={hasShapes} onUndo={undo} onRedo={redo} onClear={clear}/></div>
    {visibleError ? <div className="error" role="alert"><Icon name="warning"/><span>{visibleError}</span><Tool name="close" label="Dismiss error" onClick={() => medium === 'ui' ? setError('') : poseRetrieval.dismissError()}/></div> : null}
    <span className="sr-only" role="status">{medium === 'ui' ? (pending ? 'Recognizing sketch' : '') : poseRetrieval.busy ? 'Searching poses' : ''}</span>
  </>;
}

export default function TldrawApp({ persistenceKey = 'sketch-ui-tldraw-v1' }) {
  const [previewRoot, setPreviewRoot] = useState(null);
  const [medium, setMedium] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('medium');
    return resolveMedium(requested);
  });
  const [editor, setEditor] = useState(null);
  const poseRetrieval = usePoseRetrieval(editor, medium === 'poser2');
  const thumbnail = useSketchThumbnail(editor, medium, poseRetrieval.data);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (medium === 'poser2') url.searchParams.delete('medium');
    else url.searchParams.set('medium', medium);
    window.history.replaceState(null, '', url);
  }, [medium]);
  return <SplitWorkspace onCollapseSketch={thumbnail.canCollapse ? thumbnail.collapse : undefined} compactSketch={thumbnail.compact} expandingSketch={thumbnail.expanding} sketch={
    <section id="sketch-pane" className="tldraw-app sketch-pane" aria-label="Sketch canvas">
    <div className="sketch-editor-host" inert={thumbnail.editorHidden} aria-hidden={thumbnail.editorHidden}
      style={thumbnail.editorHidden ? { width: thumbnail.width, height: thumbnail.height } : undefined}>
    <Tldraw hideUi persistenceKey={persistenceKey} shapeUtils={shapeUtils} components={components} options={options}
      licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
      onMount={editor => {
        setEditor(editor);
        migratePoserPages(editor);
        switchMediumPage(editor, medium);
        editor.user.updateUserPreferences({ colorScheme: 'light', isSnapMode: true, isDynamicSizeMode: false });
        editor.updateDocumentSettings({ gridSize: 4 });
        editor.updateInstanceState({ isGridMode: false });
        editor.setStyleForNextShapes(DefaultColorStyle, 'black');
        editor.setStyleForNextShapes(DefaultDashStyle, 'solid');
        editor.setStyleForNextShapes(DefaultSizeStyle, 's');
        editor.setCurrentTool('draw');
        if (editor.getCurrentPageShapeIds().size) editor.zoomToFit({ animation: { duration: 0 } });
        return attachPoserInk(editor);
      }}>
      <CanvasControls compact={thumbnail.editorHidden} medium={medium} onMediumChange={setMedium} poseRetrieval={poseRetrieval}/>
      {medium === 'ui' && previewRoot ? <LivePreview target={previewRoot}/> : null}
    </Tldraw>
    </div>
    {thumbnail.image && <SketchThumbnail {...thumbnail} onExpand={thumbnail.expand}/>}
    </section>
  } preview={
    <section id="preview-pane" ref={setPreviewRoot} className="preview-pane" data-medium={medium} aria-label={medium === 'poser2' ? 'Pose matches' : 'Live preview'}>
      {medium === 'poser2' ? <PoserPanel pose={poseRetrieval} onPoseSelect={thumbnail.onPoseSelect}/> : null}
    </section>
  }/>;
}

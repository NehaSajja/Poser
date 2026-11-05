import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import BodyShapePanel from './BodyShapePanel';
import { BODY_PRESETS, bodyChoice } from './bodyShape';
import { MHR_FLOW_ENABLED } from './models';

export default function InteractivePose({ ref, preview, origin, animate, onClose, onClosing, onControlsChange, onModelStateChange }) {
  const host = useRef(null), viewer = useRef(null), modelRequest = useRef(0), shapeRequest = useRef(0);
  const [error, setError] = useState(false), [panelOpen, setPanelOpen] = useState(false);
  const [shape, setShape] = useState({...BODY_PRESETS.feminine}), [shapeError, setShapeError] = useState('');
  const report = (mounted, choice) => {
    const value = mounted.bodyShape;
    if (value) setShape(value);
    onModelStateChange({id:mounted.modelId,choice:choice||(value?bodyChoice(value):null),busy:false,error:''});
  };
  useLayoutEffect(() => {
    try { viewer.current = preview.mount(host.current, origin, state => {
        onControlsChange(state);
        if(state.bodyShape){setShape(state.bodyShape);onModelStateChange(previous=>({...previous,choice:bodyChoice(state.bodyShape)}));}
      }, { animate }); report(viewer.current); }
    catch { setError(true); }
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, [preview, origin, animate, onControlsChange, onModelStateChange]);
  const changeShape = async (value, commit=false) => {
    const mounted=viewer.current;if(!mounted)return;
    const request=++shapeRequest.current;setShape(value);setShapeError('');
    try { await mounted.setBodyShape(value,commit);if(viewer.current===mounted&&request===shapeRequest.current)report(mounted,'custom'); }
    catch { if(viewer.current===mounted&&request===shapeRequest.current){setShape(mounted.bodyShape);setShapeError('Could not update this body. Try again.');} }
  };
  const navigate = async direction => { const mounted=viewer.current;if(!mounted)return;await mounted[direction]();if(viewer.current===mounted)report(mounted); };
  const closePanel=()=>{setPanelOpen(false);document.querySelector('button[aria-label="Model"]')?.focus({preventScroll:true});};
  useImperativeHandle(ref, () => ({
    setRigging: value => viewer.current?.setRigging(value),
    setLighting: value => viewer.current?.setLighting(value),
    async setModel(id) {
      const mounted=viewer.current;if(!mounted)return;
      const request=++modelRequest.current;
      onModelStateChange(value=>({...value,busy:true,error:''}));
      try {
        const bodyOption=MHR_FLOW_ENABLED&&(id==='custom'||BODY_PRESETS[id]);
        await mounted.setModel(bodyOption?'mhr':id);
        if(viewer.current!==mounted||request!==modelRequest.current)return;
        if(bodyOption){
          if(id!=='custom'){setPanelOpen(false);await changeShape(BODY_PRESETS[id],true);}
          else {setShape(mounted.bodyShape);setPanelOpen(true);}
        }
        report(mounted,id==='custom'?'custom':undefined);
      } catch {if(viewer.current===mounted&&request===modelRequest.current)onModelStateChange(value=>({...value,busy:false,error:'Could not load this model. Try again.'}));}
    },
    undo: () => navigate('undo'), redo: () => navigate('redo'), close: (shouldAnimate=true)=>close(shouldAnimate),
  }), [onClose,onClosing,onModelStateChange]);
  const close = (shouldAnimate=true) => {
    setPanelOpen(false);shapeRequest.current++;
    if(!viewer.current){onClose();return;}
    onClosing(shouldAnimate);viewer.current.close(onClose,shouldAnimate);
  };
  return <>
    <section className="poser2-interactive" aria-label="Interactive pose" onKeyDown={event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();void navigate(event.shiftKey?'redo':'undo');}
      if(event.key==='Escape'){event.stopPropagation();close(false);}
    }}>
      <div className="poser2-interactive-canvas" ref={host}/>
      {error&&<div className="poser2-view-status" role="status">Could not open this pose. Go back and try again.</div>}
    </section>
    {MHR_FLOW_ENABLED&&<BodyShapePanel open={Boolean(panelOpen)} collapsed={panelOpen==='collapsed'} onCollapse={()=>setPanelOpen('collapsed')} onExpand={()=>setPanelOpen(true)} value={shape} error={shapeError} onChange={changeShape} onCommit={()=>viewer.current?.commitBodyShape()} onClose={closePanel}/>}
  </>;
}

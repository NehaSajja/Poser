import { lazy, Suspense, useRef, useState } from 'react';
import { Poser2Thumbnails } from '../poser2/PoseThumbnails';
import { topReferencePose } from './references/client';
import './references/references.css';
import PoseTabs from './PoseTabs';
import { BackIcon } from '../tldraw/drawesome/ToolbarIcons';

const ReferenceCanvas = lazy(() => import('./references/ReferenceCanvas'));

export default function PoserPanel({ pose, onPoseSelect }) {
  const [tab, setTab] = useState('model');
  const [modelsReady, setModelsReady] = useState(false);
  const [choice, setChoice] = useState(null);
  const panel = useRef(null);
  const models = useRef(null);
  const selected = choice && choice.data === pose.data ? choice.item : null;
  const query = topReferencePose(selected ? { results: [selected] } : pose.data);
  return <div className="poser-panel" ref={panel}>
    {(modelsReady || tab === 'references') && <PoseTabs value={tab} onChange={setTab}/>}
    {tab === 'references' && <button type="button" className="pose-back-button reference-back-bottom" aria-label="Back to pose options" title="Back" onClick={() => {
      models.current?.back(); setChoice(null); setTab('model');
    }}><BackIcon/></button>}
    <div className="poser-panel-view" id="poser-view-model" role="tabpanel" aria-labelledby="poser-tab-model"
      data-hidden={tab !== 'model'} aria-hidden={tab !== 'model'} inert={tab !== 'model'}>
      <Poser2Thumbnails ref={models} pose={pose} onReadyChange={setModelsReady} onSelect={item => { setChoice(item ? { data: pose.data, item } : null); onPoseSelect?.(item); }}/>
    </div>
    <div className="poser-panel-view" id="poser-view-references" role="tabpanel" aria-labelledby="poser-tab-references"
      data-hidden={tab !== 'references'} aria-hidden={tab !== 'references'} inert={tab !== 'references'}>
      <Suspense fallback={null}><ReferenceCanvas query={query} active={tab === 'references'} width={panel.current?.clientWidth || 600}/></Suspense>
    </div>
  </div>;
}

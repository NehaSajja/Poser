import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Poser2Thumbnails } from '../poser2/PoseThumbnails';
import { topReferencePose } from './references/client';
import './references/references.css';
import PoseTabs from './PoseTabs';
import { referenceStore } from './references/store';
import { BackIcon } from '../tldraw/drawesome/ToolbarIcons';

const ReferenceCanvas = lazy(() => import('./references/ReferenceCanvas'));

export default function PoserPanel({ pose }) {
  const [tab, setTab] = useState('model');
  const [choice, setChoice] = useState(null);
  const panel = useRef(null);
  const models = useRef(null);
  const selected = choice && choice.data === pose.data ? choice.item : null;
  const query = topReferencePose(selected ? { results: [selected] } : pose.data);
  useEffect(() => { referenceStore.prefetch(pose.data); }, [pose.data]);
  return <div className="poser-panel" ref={panel}>
    <PoseTabs value={tab} onChange={setTab}/>
    {tab === 'references' && <button className="poser2-back reference-back" onClick={() => {
      models.current?.back(); setChoice(null); setTab('model');
    }}><BackIcon/> Back</button>}
    <div className="poser-panel-view" id="poser-view-model" role="tabpanel" aria-labelledby="poser-tab-model"
      data-hidden={tab !== 'model'} aria-hidden={tab !== 'model'} inert={tab !== 'model'}>
      <Poser2Thumbnails ref={models} pose={pose} onSelect={item => setChoice({ data: pose.data, item })}/>
    </div>
    <div className="poser-panel-view" id="poser-view-references" role="tabpanel" aria-labelledby="poser-tab-references"
      data-hidden={tab !== 'references'} aria-hidden={tab !== 'references'} inert={tab !== 'references'}>
      <Suspense fallback={null}><ReferenceCanvas query={query} width={panel.current?.clientWidth || 600}/></Suspense>
    </div>
  </div>;
}

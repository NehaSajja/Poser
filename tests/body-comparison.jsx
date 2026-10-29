import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBodyBench } from './bodyBench.js';
import './skinning.css';
import './body-comparison.css';

const poses = [['2013','Seated · knees up'],['1351','Seated fold'],['201','Kneeling'],['1010','Squat'],['1176','Standing'],['2933','Holding head']];
const defaults = { torso: 0, nod: 0, turn: 0, left: 0, right: 0 };
const fields = [['torso','Torso tilt',-30,30],['nod','Head nod',-40,40],['turn','Head turn',-60,60],['left','Left shoulder',-15,25],['right','Right shoulder',-15,25]];
function App() {
  const hosts = [useRef(), useRef(), useRef()], bench = useRef();
  const [pose, setPose] = useState('2013'), [values, setValues] = useState(defaults);
  const [status, setStatus] = useState('Loading comparison…'), [ready, setReady] = useState(false);
  const [timing, setTiming] = useState(null), [fitErrors, setFitErrors] = useState([]);
  useEffect(() => {
    bench.current = createBodyBench(hosts.map(h => h.current), setTiming, error => { setStatus(error.message); setReady(false); });
    return () => { bench.current.dispose(); bench.current = null; };
  }, []);
  useEffect(() => {
    let active = true; setReady(false); setStatus('Loading comparison…'); setValues({ ...defaults });
    bench.current.load(pose).then(errors => { if (active) { setFitErrors(errors || []); setStatus('Same source pose, camera, lighting and controls. Each body retains its proportions; drag a view to orbit all three.'); setReady(true); } })
      .catch(error => { if (active && error.name !== 'AbortError') setStatus(error.message); });
    return () => { active = false; };
  }, [pose]);
  const edit = next => { setValues(next); bench.current.edit(next); };
  return <main>
    <header><a className="brand" href="/tests/upper-body.html">poser</a><span className="experiment">Body comparison · A</span>
      <label>Pose <select aria-label="Pose" value={pose} onChange={e => setPose(e.target.value)}>{poses.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <a href="/tests/experiments.html">Experiments</a><button disabled={!ready} onClick={() => bench.current.resetCamera()}>Reset view</button>
    </header>
    <div className="comparison" aria-busy={!ready}>{[['Realistic','Existing PMA body'],['MakeHuman','Current linear skinning'],['Quaternius','Independent authored rig · CC0']].map(([title,subtitle], i) =>
      <section key={title}><div className="panel-title"><h1>{title}</h1><p>{subtitle}</p>{ready && fitErrors[i] != null && <p className="fit-error">Initial contact gap: {fitErrors[i].toFixed(1)}% of stature</p>}</div><div ref={hosts[i]} className="viewport" aria-label={title + ' view'}/></section>)}</div>
    <footer><div className="status" role="status">{status}</div>
      <fieldset disabled={!ready}><legend>Shared pose adjustments</legend>{fields.map(([id,label,min,max]) => <label key={id}>{label}<output>{values[id]}°</output><input aria-label={label} type="range" min={min} max={max} step="1" value={values[id]} onChange={e => edit({...values, [id]: Number(e.target.value)})}/></label>)}
      <button onClick={() => edit({...defaults})}>Reset pose</button></fieldset>
      <div className="footnote">Initial gap measures fitting residual before edits, not anatomy quality · no shape sliders{timing != null && <span>Last shared update: {timing.toFixed(1)} ms</span>}</div>
    </footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);

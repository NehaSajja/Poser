// Free local interaction fixture: previews bundled assets, never starts a search.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Poser2Thumbnails } from '../src/poser2/PoseThumbnails';
import '../src/style.css';
import '../src/tldraw/tldraw.css';
import './upper-body.css';

const poses = [
  ['1176', 'Standing'], ['1351', 'Seated fold'], ['2013', 'Seated'],
  ['1010', 'Squat'], ['2273', 'Prone'], ['2933', 'Raised hand'],
];

function Experiment() {
  const [id, setId] = useState(poses[0][0]);
  const data = useMemo(() => ({ results: [{
    id, key: `${id}-authored`, name: poses.find(item => item[0] === id)[1],
    thumbnail: `/api/pose-retrieval/thumbnails/${id}-authored.png`, score: 1,
  }] }), [id]);
  return <main className="upper-body-experiment">
    <header className="experiment-header">
      <strong>poser</strong>
      <label>Torso test <select value={id} onChange={event => setId(event.target.value)}>
        {poses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      <p>Select the model, turn on Rig, then drag the chest dot. Orbit for another editing angle.</p>
    </header>
    <section className="preview-pane" id="preview-pane" data-medium="poser2">
      <Poser2Thumbnails pose={{ data, busy: false, status: 'ready' }}/>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<Experiment/>);

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PoserPanel from '../src/poser/PoserPanel';
import { SplitWorkspace } from '../src/tldraw/SplitWorkspace';
import '../src/style.css';
import '../src/tldraw/tldraw.css';
import '../src/tldraw/drawing-toolbar.css';

const match = id => ({ id, key: `${id}-authored`, name: `Pose ${id}`, score: .9 });
function Check() {
  const [data, setData] = useState({ results: ['1321', '1010', '201', '2933'].map(match) });
  return <SplitWorkspace sketch={<section className="sketch-pane" style={{ padding: '3rem', display: 'flex', gap: '1rem', alignItems: 'start', flexDirection: 'column' }}>
    <button onClick={() => setData({ results: ['1321', '1010', '201', '2933'].map(match) })}>Crossed arms first</button>
    <button onClick={() => setData({ results: ['1010', '1321', '201', '2933'].map(match) })}>Squat first</button>
    <button onClick={() => setData(null)}>Clear poses</button>
  </section>} preview={<section className="preview-pane" id="preview-pane" data-medium="poser2"><PoserPanel pose={{ data, status: data ? 'ready' : 'empty' }}/></section>}/>;
}
createRoot(document.getElementById('root')).render(<Check/>);

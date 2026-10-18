"use client";
import {useRef,useState} from 'react';
import {GUIDE_BONES,HANDLES,type HandleId,type PoseFrame} from '@/lib/rig';
import type {ViewerHandle} from './ModelViewer';
import type {Tool} from './DrawingCanvas';
export default function LivePoseCanvas({frame,viewer,tool='hand',transparent=false}:{frame:PoseFrame;viewer:React.RefObject<ViewerHandle|null>;tool?:Tool;transparent?:boolean}){
  const svg=useRef<SVGSVGElement>(null);const active=useRef<{id:HandleId;draw:boolean;start:string;points:[number,number][]}|null>(null);
  const [stroke,setStroke]=useState<[number,number][]>([]);
  const point=(e:React.PointerEvent)=>{const r=svg.current!.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height] as [number,number];};
  const pos=(name:string)=>frame.points[name]||[0,0];
  const start=(e:React.PointerEvent,name:string)=>{
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();svg.current!.setPointerCapture(e.pointerId);
    const p=point(e);let id=name as HandleId;let draw=tool==='pen';
    if(draw||tool==='eraser'){if(/_shoulder|_elbow/.test(name))id=(name.slice(0,2)+'wrist') as HandleId;if(/_hip|_knee/.test(name))id=(name.slice(0,2)+'ankle') as HandleId;}
    if(!HANDLES[id])return;
    if(tool==='eraser'){viewer.current?.resetLimb(id);return;}
    active.current={id,draw,start:name,points:[p]};setStroke([]);viewer.current?.begin(id,...p);
  };
  const end=()=>{if(active.current){active.current=null;viewer.current?.end();setStroke([]);}};
  return <svg ref={svg} className={`live-pose-canvas ${transparent?'on-model':''}`} viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" aria-label={transparent?'Live 3D pose controls':'Live linked pose drawing'}
    onPointerMove={e=>{const a=active.current;if(!a)return;const p=point(e);a.points.push(p);if(a.draw)setStroke([...a.points]);let pole:[number,number]|undefined;if(a.draw&&a.points.length>4&&/_shoulder|_hip/.test(a.start))pole=a.points[Math.floor(a.points.length*.5)];viewer.current?.move(...p,pole);}}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    <g className="pose-guide-lines">{GUIDE_BONES.map(([a,b])=><line key={a+b} x1={pos(a)[0]*frame.width} y1={pos(a)[1]*frame.height} x2={pos(b)[0]*frame.width} y2={pos(b)[1]*frame.height}/>)}
      {!transparent&&<circle cx={pos('head')[0]*frame.width} cy={pos('head')[1]*frame.height} r={Math.max(14,Math.hypot((pos('head')[0]-pos('neck')[0])*frame.width,(pos('head')[1]-pos('neck')[1])*frame.height)*.54)} fill="#fff"/>}
    </g>
    {stroke.length>1&&<polyline className="live-stroke" points={stroke.map(p=>`${p[0]*frame.width},${p[1]*frame.height}`).join(' ')}/>}
    {tool!=='hand'&&(['l_hip','r_hip'] as const).map(id=><g key={id} transform={`translate(${pos(id)[0]*frame.width} ${pos(id)[1]*frame.height})`} className="pose-joint" role="button" aria-label={`${id==='l_hip'?'Left':'Right'} leg drawing anchor${transparent?' in 3D':' in drawing'}`} onPointerDown={e=>start(e,id)}><title>Draw from hip to ankle to reposition this leg</title><circle r="15" className="joint-hit"/><circle r="5.5" className="joint-dot"/></g>)}
    {Object.entries(HANDLES).map(([id,h])=><g key={id} transform={`translate(${pos(id)[0]*frame.width} ${pos(id)[1]*frame.height})`} className="pose-joint" role="button" tabIndex={0} aria-label={`${h.label}${transparent?' in 3D':' in drawing'}`} onPointerDown={e=>start(e,id)}
      onKeyDown={e=>{const deltas:Record<string,[number,number]>={ArrowLeft:[-.012,0],ArrowRight:[.012,0],ArrowUp:[0,-.012],ArrowDown:[0,.012]};const d=deltas[e.key];if(d){e.preventDefault();e.stopPropagation();const p=pos(id);viewer.current?.begin(id as HandleId,...p);viewer.current?.move(p[0]+d[0],p[1]+d[1]);viewer.current?.end();}}}>
      <title>{h.label} · drag to pose; arrow keys to nudge</title><circle r="15" className="joint-hit"/><circle r={id.includes('hand')||id.includes('toe')?4:5.5} className="joint-dot"/>
    </g>)}
  </svg>;
}

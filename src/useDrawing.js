import { useEffect, useRef, useState } from 'react';
import { bounds, KINDS } from './design';
import { addStroke } from './gestures';
import { strokeImage, sceneImage } from './sketch';
import { DecisionClient } from './decisionClient';
import { samplingDelay, commitDelay, nearbyContext } from './recognition';
import { rawStrokes } from './ink';
import { recognitionCandidates, applyCandidateDecision } from './candidates';
export function useDrawing(initial,{board,spacing,configured,onError}) {
 const [elements,setElements]=useState(initial),[stroke,setStroke]=useState([]),[pending,setPending]=useState(false),[canUndo,setCanUndo]=useState(false);
 const state=useRef({elements:initial,history:[],gesture:null,timer:null,version:0,recognizing:false,inFlight:false,resettle:false,disposed:false,lastDraw:Date.now(),gaps:[],pointer:null,commitTimers:new Map()});
 const options=useRef({});options.current={spacing,configured,onError};
 const client=useRef(null);if(!client.current)client.current=new DecisionClient(fetch,(el,strokes,title)=>strokeImage(strokes||rawStrokes(el),{title}),sceneImage);
 const s=state.current;
 function publish(next){s.elements=next;setElements(next);}
 function commit(next){s.history.push(s.elements);s.history=s.history.slice(-50);setCanUndo(true);publish(next);}
 function cancel(abort=false){s.version++;if(abort){client.current.clear();s.resettle=false;}clearTimeout(s.timer);s.commitTimers.forEach(clearTimeout);s.commitTimers.clear();s.recognizing=false;setPending(false);}
 async function settle(){
  if(s.inFlight){s.resettle=true;return;}
  s.inFlight=true;
  try{
  const version=s.version;
  const todo=s.elements.filter(e=>e.unresolved);
  if(!options.current.configured)return;
  s.recognizing=todo.length>0;setPending(todo.length>0);
  for(const el of todo){
   try{
    if(!s.elements.some(e=>e.id===el.id&&e.revision===el.revision&&e.unresolved))continue;
    const candidates=recognitionCandidates(el,s.elements);
    const result=await client.current.request(el,nearbyContext(el,s.elements),candidates,s.elements);
    if(version!==s.version)return;
    if(KINDS.includes(result.kind)||result.kind==='unknown'){
     const update=list=>applyCandidateDecision(list,candidates,result);
     const apply=()=>{s.commitTimers.delete(el.id);if(version!==s.version)return;publish(update(s.elements));s.history=s.history.map(update);};
     const delay=commitDelay(el,s.pointer,Date.now()-s.lastDraw);
     if(delay)s.commitTimers.set(el.id,setTimeout(apply,delay));else apply();
    }
    if(result.warning)options.current.onError(result.warning);
   }catch(error){if(version!==s.version)return;if(error.name!=='AbortError')options.current.onError(error.message);}
  }
  if(version===s.version){s.recognizing=false;setPending(false);}
  }finally{
   s.inFlight=false;
   if(s.resettle&&!s.disposed){s.resettle=false;if(!s.gesture)schedule();}
  }
 }
 function schedule(){clearTimeout(s.timer);s.timer=setTimeout(settle,samplingDelay(s.gaps));}
 function point(e){const r=board.current.getBoundingClientRect();return{x:e.clientX-r.left+board.current.scrollLeft,y:e.clientY-r.top+board.current.scrollTop};}
 function down(e){if(e.button!==0||s.gesture)return;cancel();e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);s.pointer=p;s.gaps.push(Date.now()-s.lastDraw);s.gaps=s.gaps.slice(-8);s.gesture={points:[p],pointerId:e.pointerId};setStroke([p]);}
 function move(e){s.pointer=point(e);const g=s.gesture;if(!g||g.pointerId!==e.pointerId)return;const p=point(e);if(Math.hypot(p.x-g.points.at(-1).x,p.y-g.points.at(-1).y)<2)return;g.points.push(p);if(g.points.length>1600)g.points=g.points.filter((_,i)=>i%2===0);setStroke([...g.points]);}
 function up(e){const g=s.gesture;if(!g||g.pointerId!==e.pointerId)return;const p=point(e);g.points.push(p);s.gesture=null;setStroke([]);s.lastDraw=Date.now();
  if(g.points.length>=2&&Math.max(bounds(g.points).w,bounds(g.points).h)>=6){
   const next=addStroke(g.points,s.elements,options.current.spacing);
   if(next.error)options.current.onError(next.error);
   else if(next.elements.length>200)options.current.onError('Canvas limit reached. Clear the canvas to continue.');else commit(next.elements);
  }schedule();
 }
 function cancelGesture(){cancel();s.gesture=null;setStroke([]);s.lastDraw=Date.now();schedule();}
 function undo(){if(!s.history.length)return;cancel(true);s.gesture=null;setStroke([]);publish(s.history.pop());setCanUndo(s.history.length>0);}
 function clear(){cancel(true);s.gesture=null;setStroke([]);commit([]);}
 useEffect(()=>{s.disposed=false;schedule();return()=>{s.disposed=true;clearTimeout(s.timer);client.current.clear();s.commitTimers.forEach(clearTimeout);s.version++;};},[configured]);
 useEffect(()=>{const key=e=>{if(e.target.closest('textarea,input'))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}if(e.key==='Escape')cancelGesture();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 return {elements,stroke,pending,canUndo,undo,clear,handlers:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:cancelGesture}};
}

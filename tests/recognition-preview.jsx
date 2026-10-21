// Isolated drawing surface using the production hook and renderer. No persistence.
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Component,SketchMarks} from '../src/Component';
import {useDrawing} from '../src/useDrawing';
import {Button} from '../src/components/ui/button';
import '../src/style.css';
function Preview(){
 const board=useRef(null),[error,onError]=useState('');
 const {elements,stroke,handlers,undo,canUndo,pending}=useDrawing([],{board,spacing:8,configured:true,onError});
 return <main><section ref={board} className="board" aria-label="Drawing canvas" {...handlers}><div className="elements">{[...elements].sort((a,b)=>(b.kind==='container'?b.w*b.h:0)-(a.kind==='container'?a.w*a.h:0)).map(e=><div className="placed" key={e.id} data-decision={JSON.stringify(e.decision)} data-kind={e.kind} data-recognition={e.decision?.kind} data-ink={e.showInk} style={{left:e.x,top:e.y,width:e.w,height:e.h}}><Component element={e}/><SketchMarks element={e}/></div>)}</div><svg className="ink"><polyline points={stroke.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2"/></svg></section><div className="bottom"><Button style={{pointerEvents:'auto'}} onClick={undo} disabled={!canUndo}>Undo</Button></div>{error?<div role="alert">{error}</div>:null}<span className="sr-only" role="status">{pending?'Recognizing sketch':''}</span></main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);

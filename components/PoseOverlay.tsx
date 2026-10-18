"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Icon from "./Icon";
type Stroke={points:[number,number][];erase:boolean};
export default function PoseOverlay({image,busy,onCancel,onApply}:{image:string;busy:boolean;onCancel:()=>void;onApply:(marked:string,instruction:string)=>void}){
  const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),background=useRef<HTMLImageElement|null>(null);
  const strokes=useRef<Stroke[]>([]),future=useRef<Stroke[]>([]),active=useRef<number|null>(null);
  const [tool,setTool]=useState<"pen"|"eraser">("pen"),[count,setCount]=useState(0),[redoCount,setRedoCount]=useState(0),[instruction,setInstruction]=useState("");
  const paint=useCallback((out:HTMLCanvasElement)=>{
    const img=background.current;if(!img)return;
    const ctx=out.getContext("2d")!;ctx.clearRect(0,0,out.width,out.height);ctx.fillStyle="#f7f7f5";ctx.fillRect(0,0,out.width,out.height);
    const scale=Math.min(out.width/img.width,out.height/img.height),w=img.width*scale,h=img.height*scale,x=(out.width-w)/2,y=(out.height-h)/2;
    ctx.drawImage(img,x,y,w,h);
    const layer=document.createElement("canvas");layer.width=out.width;layer.height=out.height;const ink=layer.getContext("2d")!;
    ink.lineCap="round";ink.lineJoin="round";ink.strokeStyle="#e23c4c";ink.fillStyle="#e23c4c";
    for(const stroke of strokes.current){ink.globalCompositeOperation=stroke.erase?"destination-out":"source-over";ink.lineWidth=(stroke.erase?28:4)*w/1024;
      const points=stroke.points;if(!points.length)continue;ink.beginPath();ink.moveTo(x+points[0][0]*w,y+points[0][1]*h);for(const p of points)ink.lineTo(x+p[0]*w,y+p[1]*h);ink.stroke();
      if(points.length===1){ink.beginPath();ink.arc(x+points[0][0]*w,y+points[0][1]*h,ink.lineWidth/2,0,Math.PI*2);ink.fill();}}
    ctx.drawImage(layer,0,0);
  },[]);
  const render=useCallback(()=>{if(canvas.current)paint(canvas.current);setCount(strokes.current.length);setRedoCount(future.current.length);},[paint]);
  useEffect(()=>{const img=new Image();img.onload=()=>{background.current=img;render();};img.src=image;const observer=new ResizeObserver(()=>{if(!host.current||!canvas.current)return;canvas.current.width=host.current.clientWidth*2;canvas.current.height=host.current.clientHeight*2;render();});observer.observe(host.current!);return()=>observer.disconnect();},[image,render]);
  const undo=()=>{const s=strokes.current.pop();if(s)future.current.push(s);render();};
  const redo=()=>{const s=future.current.pop();if(s)strokes.current.push(s);render();};
  function point(e:React.PointerEvent):[number,number]{const rect=canvas.current!.getBoundingClientRect(),img=background.current!;const scale=Math.min(rect.width/img.width,rect.height/img.height),w=img.width*scale,h=img.height*scale;return[(e.clientX-rect.left-(rect.width-w)/2)/w,(e.clientY-rect.top-(rect.height-h)/2)/h];}
  return <div className="pose-overlay" ref={host} onKeyDown={e=>{e.stopPropagation();if(busy||(e.target as HTMLElement).tagName==="INPUT")return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();}else if(e.key==="Escape")onCancel();else if(e.key.toLowerCase()==="e")setTool("eraser");else if(e.key.toLowerCase()==="b")setTool("pen");}}>
    <canvas ref={canvas} aria-label="Draw pose corrections over the 3D view" tabIndex={0} className={tool==="pen"?"cursor-pen":"cursor-erase"}
      onPointerDown={e=>{if(busy||!background.current||e.button!==0)return;e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);active.current=e.pointerId;future.current=[];strokes.current.push({points:[point(e)],erase:tool==="eraser"});render();}}
      onPointerMove={e=>{if(active.current!==e.pointerId)return;strokes.current.at(-1)!.points.push(point(e));render();}}
      onPointerUp={()=>{active.current=null;}} onPointerCancel={()=>{active.current=null;}}/>
    <div className="annotation-tools" role="toolbar" aria-label="Pose correction tools">
      <button className={`tool-button ${tool==="pen"?"active":""}`} aria-label="Draw correction" title="Draw the new limb position in red" disabled={busy} onClick={()=>setTool("pen")}><Icon name="pen"/></button>
      <button className={`tool-button ${tool==="eraser"?"active":""}`} aria-label="Erase correction" title="Erase red marks" disabled={busy} onClick={()=>setTool("eraser")}><Icon name="eraser"/></button>
      <button className="tool-button" aria-label="Undo correction" disabled={busy||!count} onClick={undo}><Icon name="undo"/></button>
      <button className="tool-button" aria-label="Redo correction" disabled={busy||!redoCount} onClick={redo}><Icon name="redo"/></button>
      <button className="tool-button" aria-label="Cancel correction" title="Cancel correction" disabled={busy} onClick={onCancel}><Icon name="close"/></button>
    </div>
    <div className="annotation-submit"><input aria-label="Pose correction direction" placeholder="Optional: “move this hand higher”" maxLength={2000} value={instruction} disabled={busy} onChange={e=>setInstruction(e.target.value)}/><button className="generate-button" disabled={busy||(!count&&!instruction.trim())} onClick={()=>{if(!background.current)return;const out=document.createElement("canvas");out.width=background.current.width;out.height=background.current.height;paint(out);onApply(out.toDataURL("image/png"),instruction);}}>{busy?"Updating…":"Update pose"}<Icon name="arrow"/></button></div>
  </div>;
}

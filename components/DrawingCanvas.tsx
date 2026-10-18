"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";

type Point = { x: number; y: number; pressure?: number };
type Stroke = { points: Point[]; erase: boolean; stylus?: boolean };
type Drawing = { strokes: Stroke[]; image?: string };
export type CanvasHandle = { export: () => string | null; load: (url: string) => Promise<void>; clear: () => void; undo: () => void; redo: () => void; zoom: (amount: number) => void; resetView: () => void };
export type Tool = "pen" | "eraser" | "hand";

const DrawingCanvas = forwardRef<CanvasHandle, {tool: Tool; onChange: (hasDrawing: boolean, edited?: boolean) => void; onHistory: (undo: boolean, redo: boolean) => void; onZoom: (zoom: number) => void; disabled?: boolean}>(function DrawingCanvas({tool,onChange,onHistory,onZoom,disabled}, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const doc = useRef<Drawing>({ strokes: [] });
  const history = useRef<Drawing[]>([]); const future = useRef<Drawing[]>([]);
  const image = useRef<HTMLImageElement | null>(null);
  const view = useRef({ x: 0, y: 0, zoom: 1 });
  const size = useRef({ w: 1, h: 1, ratio: 1 });
  const active = useRef<{id: number; mode: "pan" | "draw"; last: Point} | null>(null);
  const [space, setSpace] = useState(false);
  const drawDocument = useCallback((ctx: CanvasRenderingContext2D) => {
    if (image.current) {
      const img = image.current;
      const scale = Math.min(650/img.width, 790/img.height);
      const w=img.width*scale, h=img.height*scale;
      ctx.drawImage(img, (1000-w)/2, (1000-h)/2, w,h);
    }
    for (const s of doc.current.strokes) {
      if (!s.points.length) continue;
      ctx.strokeStyle = s.erase ? "#ffffff" : "#242423";
      ctx.fillStyle = ctx.strokeStyle;
      if (!s.erase) {
        const outline = getStroke(s.points, {
          size: 4.8, thinning: .45, smoothing: .6, streamline: .45,
          simulatePressure: !s.stylus,
          last: active.current?.mode !== "draw" || s !== doc.current.strokes.at(-1),
        });
        if (outline.length) {
          ctx.beginPath(); ctx.moveTo(outline[0][0], outline[0][1]);
          for (let i=0;i<outline.length;i++) {
            const p=outline[i], next=outline[(i+1)%outline.length];
            ctx.quadraticCurveTo(p[0],p[1],(p[0]+next[0])/2,(p[1]+next[1])/2);
          }
          ctx.closePath(); ctx.fill();
        }
        continue;
      }
      ctx.lineWidth = s.erase ? 32 : 3.7;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const p=s.points;
      if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x,p[0].y,ctx.lineWidth/2,0,Math.PI*2); ctx.fill(); continue; }
      ctx.beginPath(); ctx.moveTo(p[0].x,p[0].y);
      for(let i=1;i<p.length-1;i++) ctx.quadraticCurveTo(p[i].x,p[i].y,(p[i].x+p[i+1].x)/2,(p[i].y+p[i+1].y)/2);
      ctx.lineTo(p[p.length-1].x,p[p.length-1].y); ctx.stroke();
    }
  }, []);
  const render = useCallback(() => {
    const ctx = canvas.current?.getContext("2d"); if(!ctx) return;
    const {w,h,ratio}=size.current; const {x,y,zoom}=view.current;
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,w,h); ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
    const scale=Math.min(w,h)/1000*zoom;
    ctx.translate(w/2+x,h/2+y);ctx.scale(scale,scale);ctx.translate(-500,-500);
    drawDocument(ctx);
  },[drawDocument]);
  const notify = useCallback((edited=true) => {
    onChange(!!doc.current.image || doc.current.strokes.some(s=>!s.erase),edited);
    onHistory(history.current.length>0,future.current.length>0);
    try { localStorage.setItem("poser-drawing",JSON.stringify(doc.current)); } catch {}
  },[onChange,onHistory]);
  const checkpoint=()=>{ history.current.push(structuredClone(doc.current)); if(history.current.length>60) history.current.shift(); future.current=[]; };
  const apply=useCallback(async(d:Drawing,edited=true)=>{
    doc.current=d; image.current=null;
    if(d.image) {const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error("This image could not be opened."));img.src=d.image!;});image.current=img;}
    render();notify(edited);
  },[render,notify]);
  useImperativeHandle(ref,()=>({
    export:()=>{
      if(!doc.current.image&&!doc.current.strokes.some(s=>!s.erase)) return null;
      // Export the whole drawing, including marks panned beyond the initial frame.
      const points=doc.current.strokes.flatMap(s=>s.points);
      let minX=doc.current.image?150:Infinity,minY=doc.current.image?90:Infinity,maxX=doc.current.image?850:-Infinity,maxY=doc.current.image?910:-Infinity;
      for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
      const span=Math.max(maxX-minX,maxY-minY,200)*1.18;
      const out=document.createElement("canvas");out.width=1200;out.height=1200;
      const ctx=out.getContext("2d")!;ctx.fillStyle="white";ctx.fillRect(0,0,1200,1200);
      ctx.translate(600,600);ctx.scale(1200/span,1200/span);ctx.translate(-(minX+maxX)/2,-(minY+maxY)/2);drawDocument(ctx);
      return out.toDataURL("image/png");
    },
    load:async(url)=>{
      let data=url;
      if(!url.startsWith("data:")){const blob=await(await fetch(url)).blob();data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});}
      checkpoint(); view.current={x:0,y:0,zoom:1};onZoom(100);await apply({strokes:[],image:data});
    },
    clear:()=>{checkpoint();doc.current={strokes:[]};image.current=null;render();notify();},
    undo:()=>{const last=history.current.pop();if(last){future.current.push(structuredClone(doc.current));void apply(last);}},
    redo:()=>{const next=future.current.pop();if(next){history.current.push(structuredClone(doc.current));void apply(next);}},
    zoom:(amount)=>{view.current.zoom=Math.min(4,Math.max(.35,view.current.zoom*amount));onZoom(Math.round(view.current.zoom*100));render();},
    resetView:()=>{view.current={x:0,y:0,zoom:1};onZoom(100);render();},
  }));
  useEffect(()=>{
    const observer=new ResizeObserver(()=>{
      if(!wrapper.current||!canvas.current)return;
      const {width:w,height:h}=wrapper.current.getBoundingClientRect();const ratio=Math.min(devicePixelRatio,2);
      size.current={w,h,ratio};canvas.current.width=Math.round(w*ratio);canvas.current.height=Math.round(h*ratio);render();
    });
    observer.observe(wrapper.current!);
    try {const saved=localStorage.getItem("poser-drawing");if(saved)void apply(JSON.parse(saved),false).catch(()=>{});}catch{}
    return()=>observer.disconnect();
  },[apply,render]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]"))return;if(e.code==="Space"){e.preventDefault();setSpace(e.type==="keydown");}};
    const blur=()=>setSpace(false);window.addEventListener("keydown",key);window.addEventListener("keyup",key);window.addEventListener("blur",blur);
    return()=>{window.removeEventListener("keydown",key);window.removeEventListener("keyup",key);window.removeEventListener("blur",blur);};
  },[]);
  const position=(e:React.PointerEvent):Point=>{const box=canvas.current!.getBoundingClientRect();const {w,h}=size.current;const scale=Math.min(w,h)/1000*view.current.zoom;return{x:(e.clientX-box.left-w/2-view.current.x)/scale+500,y:(e.clientY-box.top-h/2-view.current.y)/scale+500,pressure:e.pressure};};
  return <div ref={wrapper} className="canvas-wrap">
    <canvas ref={canvas} aria-label="Pose drawing canvas" tabIndex={0} className={tool==="hand"||space?"cursor-pan":tool==="eraser"?"cursor-erase":"cursor-pen"}
      onContextMenu={e=>e.preventDefault()}
      onPointerDown={e=>{
        if(disabled||active.current)return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const pan=tool==="hand"||space||e.button===1;
        active.current={id:e.pointerId,mode:pan?"pan":"draw",last:{x:e.clientX,y:e.clientY}};
        if(!pan){checkpoint();doc.current.strokes.push({points:[position(e)],erase:tool==="eraser",stylus:e.pointerType==="pen"});render();}
      }}
      onPointerMove={e=>{
        const a=active.current;if(!a||a.id!==e.pointerId)return;
        if(a.mode==="pan"){view.current.x+=e.clientX-a.last.x;view.current.y+=e.clientY-a.last.y;a.last={x:e.clientX,y:e.clientY};}
        else doc.current.strokes[doc.current.strokes.length-1].points.push(position(e));
        render();
      }}
      onPointerUp={e=>{if(active.current?.id===e.pointerId){active.current=null;render();notify();}}}
      onPointerCancel={()=>{active.current=null;render();notify();}}
    />
  </div>;
});
export default DrawingCanvas;

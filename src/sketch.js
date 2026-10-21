import { bounds } from './design.js';
import { displayStrokes } from './ink.js';
export function strokeImage(strokes,{box=bounds(strokes.flat()),highlight,title}={}) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
 const scale=440/Math.max(box.w,box.h,1),x=p=>(p-box.x)*scale+(512-box.w*scale)/2,y=p=>(p-box.y)*scale+(512-box.h*scale)/2;
 ctx.strokeStyle='#20201e';ctx.lineWidth=3;ctx.lineCap=ctx.lineJoin='round';
 for(const points of strokes){
  if(!points.length)continue;
  ctx.beginPath();
  if(points.every(p=>Math.hypot(p.x-points[0].x,p.y-points[0].y)<.01)){
   ctx.arc(x(points[0].x),y(points[0].y),1.5,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();
  }else{points.forEach((p,i)=>i?ctx.lineTo(x(p.x),y(p.y)):ctx.moveTo(x(p.x),y(p.y)));ctx.stroke();}
 }
 if(highlight){ctx.strokeStyle='#888';ctx.lineWidth=1;ctx.setLineDash([5,5]);ctx.strokeRect(x(highlight.x-8),y(highlight.y-8),(highlight.w+16)*scale,(highlight.h+16)*scale);}
 if(title){ctx.fillStyle='#fff';ctx.fillRect(0,0,512,28);ctx.fillStyle='#20201e';ctx.font='16px Arial';ctx.fillText(title,12,20);}
 return canvas.toDataURL('image/png');
}
export function sceneImage(element,elements){
 const nearby=elements.filter(e=>e.x<element.x+element.w+160&&e.x+e.w>element.x-160&&e.y<element.y+element.h+160&&e.y+e.h>element.y-160);
 const box={x:element.x-120,y:element.y-120,w:element.w+240,h:element.h+240};
 return strokeImage(nearby.flatMap(displayStrokes),{box,highlight:element,title:'Neighborhood — context only'});
}

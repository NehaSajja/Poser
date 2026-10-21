import { controlDetail } from './grouping.js';
import { resolvedKind } from './recognition.js';
import { bounds, inferShape, snapBox, KINDS } from './design.js';
import { captures, capture, displayStrokes, normalizedInk } from './ink.js';
const area=e=>e.w*e.h;
const hasInteriorInk=(box,elements)=>elements.some(e=>(!e.outline&&e.showInk||controlDetail(box,e))&&e.x+e.w/2>=box.x-12&&e.x+e.w/2<=box.x+box.w+12&&e.y+e.h/2>=box.y-12&&e.y+e.h/2<=box.y+box.h+12);
export function isClosed(points) {
 const b=bounds(points);
 return b.w>12&&b.h>12&&Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<Math.max(12,Math.min(b.w,b.h)*.4);
}
export const absoluteStrokes=displayStrokes;
export function strokeTarget(points,elements,now=Date.now()) {
 const b=bounds(points),closed=isClosed(points),cx=b.x+b.w/2,cy=b.y+b.h/2;
 const retraced=closed&&elements.find(e=>e.outline&&Math.abs(b.x-e.x)<Math.max(10,e.w*.12)&&Math.abs(b.y-e.y)<Math.max(10,e.h*.12)&&Math.abs(b.w-e.w)<e.w*.2&&Math.abs(b.h-e.h)<e.h*.2);
 if(retraced)return retraced;
 const containing=elements.filter(e=>(KINDS.includes(e.kind)||e.closedBoundary)&&cx>e.x+3&&cx<e.x+e.w-3&&cy>e.y+3&&cy<e.y+e.h-3&&b.x>=e.x-12&&b.y>=e.y-12&&b.x+b.w<=e.x+e.w+12&&b.y+b.h<=e.y+e.h+12).sort((a,b)=>area(a)-area(b));
 for(const e of containing){
  // Closed boxes inside a frame start a child. Tiny glyph loops in controls stay attached.
  const roundGlyph=closed&&inferShape(points)==='unknown'&&b.w<=e.h*1.1&&b.h<=e.h*.9;
  // A thumb may be an angular oval; a dropdown's narrow end-cap may close
  // against the border. Treat these as control details, not nested cards.
  const endGlyph=closed&&e.w>=e.h*1.3&&e.h<=160&&b.w<=e.h*1.3&&b.w<e.w*.6&&b.h<=e.h*1.1;
  const controlGlyph=endGlyph||roundGlyph&&(e.closedBoundary||e.kind==='radio'||e.kind==='switch'||e.w>=e.h*1.6);
  if(closed&&!controlGlyph&&(inferShape(points)==='container'||e.w>280&&e.h>140||b.h>e.h*.55)) continue;
  // A large frame owns layout, not every open mark drawn anywhere inside it.
  if(e.w>420&&e.h>240) continue;
  // Overlapping peers are ambiguous: retain the mark as its own candidate.
  if(containing.filter(other=>area(other)<area(e)*1.4).length>1)continue;
  return e;
 }
 // Concentric ink loops are a single glyph, in either drawing order.
 if(closed&&inferShape(points)==='unknown'){
  const inner=elements.find(e=>e.kind==='unknown'&&e.closedBoundary&&e.w<b.w*.5&&e.h<b.h*.5&&Math.abs(e.x+e.w/2-cx)<b.w*.15&&Math.abs(e.y+e.h/2-cy)<b.h*.15);
  if(inner)return inner;
 }
 if(!closed) return [...elements].reverse().find(e=>!e.outline&&e.strokes?.length&&now-e.updatedAt<5000&&b.x<=e.x+e.w+40&&b.x+b.w>=e.x-24&&b.y<=e.y+e.h+24&&b.y+b.h>=e.y-24);
 return null;
}
export function addStroke(points,elements,grid=8,now=Date.now()) {
 const target=strokeTarget(points,elements,now), b=bounds(points);
 if(target){
  if(captures(target).length>=80)return {elements,element:target,error:'This shape has reached its stroke limit. Undo a stroke to continue.'};
  const outline=target.outline??KINDS.includes(target.kind);
  const existing=absoluteStrokes(target);
  const all=[...existing,points];
  const box=outline?target:snapBox(bounds(all.flat()),elements.filter(e=>e.id!==target.id),grid);
  // Rebase capture frames when an unfinished group grows, without changing points.
  const ink=captures(target).map(record=>({...record,frame:{x:record.frame.x+(box.x-target.x)*record.frame.w/target.w,y:record.frame.y+(box.y-target.y)*record.frame.h/target.h,w:box.w*record.frame.w/target.w,h:box.h*record.frame.h/target.h}}));
  ink.push(capture(points,box));
  const updated={...target,...Object.fromEntries(['x','y','w','h'].map(k=>[k,box[k]])),ink,outline,revision:(target.revision||0)+1,unresolved:true,showInk:true,updatedAt:now};
  // Keep geometry provisional. Recognition can revisit it with any later stroke.
  if(outline)updated.kind='container';
  else if(assembledOutline(all))Object.assign(updated,{kind:'container',outline:true,outlineStrokeCount:ink.length,unresolved:false,showInk:false});
  if(updated.outline&&hasInteriorInk(updated,elements.filter(e=>e.id!==target.id))){updated.unresolved=true;updated.showInk=true;}
  updated.strokes=normalizedInk(updated);
  return {elements:elements.map(e=>e.id===target.id?updated:e),element:updated};
 }
 const kind=inferShape(points),outline=isClosed(points)&&kind==='container',box=snapBox(b,elements,grid);
 const el={id:crypto.randomUUID(),kind,...box,text:'',strokes:[],ink:[capture(points,box)],closedBoundary:isClosed(points),outline,outlineStrokeCount:outline?1:0,revision:1,updatedAt:now,unresolved:!outline,showInk:!outline};
 if(outline&&hasInteriorInk(b,elements)){el.unresolved=true;el.showInk=true;}
 el.strokes=normalizedInk(el);
 // A bare rectangle is intentionally not sent for premature control classification.
 return {elements:[...elements,el],element:el};
}
export function applyDecision(el,result) {
 const kind=resolvedKind(el,result);
 if(!kind) return {...el,decision:result,unresolved:false};
 return {...el,decision:result,kind,checked:result.checked,outline:true,committedKind:kind,unresolved:false,showInk:false};
}

// Multiple pen lifts can form the four edges of one rectangle.
export function assembledOutline(strokes) {
 if(strokes.length<2)return false;
 const points=strokes.flat(),b=bounds(points);
 if(b.w<24||b.h<24)return false;
 const near=(p,side)=>side==='top'?Math.abs(p.y-b.y)<b.h*.12:side==='bottom'?Math.abs(p.y-b.y-b.h)<b.h*.12:side==='left'?Math.abs(p.x-b.x)<b.w*.12:Math.abs(p.x-b.x-b.w)<b.w*.12;
 if(points.filter(p=>['top','bottom','left','right'].some(side=>near(p,side))).length/points.length<.9)return false;
 // Measure actual segments along each edge; corner points alone do not prove four sides.
 return ['top','bottom','left','right'].every(side=>{
  const axis=side==='top'||side==='bottom'?'x':'y',length=axis==='x'?b.w:b.h;
  let covered=0;
  for(const stroke of strokes)for(let i=1;i<stroke.length;i++)if(near(stroke[i-1],side)&&near(stroke[i],side))covered+=Math.abs(stroke[i][axis]-stroke[i-1][axis]);
  return covered>=length*.75;
 });
}

import { controlDetail } from './grouping.js';
import { bounds } from './design.js';
import { captures, displayStrokes, rawStrokes, normalizedInk } from './ink.js';
import { applyDecision } from './gestures.js';

const near=(a,b,pad=24)=>a.x<=b.x+b.w+pad&&a.x+a.w>=b.x-pad&&a.y<=b.y+b.h+pad&&a.y+a.h>=b.y-pad;
const contains=(a,b)=>b.x+b.w/2>=a.x-12&&b.x+b.w/2<=a.x+a.w+12&&b.y+b.h/2>=a.y-12&&b.y+b.h/2<=a.y+a.h+12;
const ref=e=>({id:e.id,revision:e.revision});
export function recognitionCandidates(element,elements) {
 const base={members:[ref(element)],element,strokes:rawStrokes(element)};
 const alternatives=elements.filter(e=>e.id!==element.id&&near(e,element)&&
  ((!element.outline&&e.outline&&contains(e,element)&&element.w<e.w*1.2&&element.h<e.h*1.2)||(!e.outline&&e.showInk)||controlDetail(element,e)))
  .filter(e=>captures(e).length+captures(element).length<=80)
  .sort((a,b)=>a.w*a.h-b.w*b.h).slice(0,3);
 return [base,...alternatives.map(other=>{
  const anchor=controlDetail(element,other)?element:other.outline?other:element.outline?element:null;
  const members=anchor===element?[element,other]:[other,element];
  const ink=members.flatMap(e=>captures(e).map(record=>({...record,owner:e})));
  const box=anchor||bounds(members.flatMap(displayStrokes).flat());
  const merged={...element,...Object.fromEntries(['x','y','w','h'].map(k=>[k,box[k]])),outline:Boolean(anchor),outlineStrokeCount:anchor?.outlineStrokeCount||0,
   ink:ink.map(({owner,points,frame})=>({points,frame:{x:frame.x+(box.x-owner.x)*frame.w/owner.w,y:frame.y+(box.y-owner.y)*frame.h/owner.h,w:box.w*frame.w/owner.w,h:box.h*frame.h/owner.h}}))};
  merged.strokes=normalizedInk(merged);
  return {members:members.map(ref),element:merged,strokes:rawStrokes(merged)};
 })];
}
export function applyCandidateDecision(elements,candidates,result) {
 const candidate=candidates[result.candidate??0];
 if(!candidate)return elements;
 // A response must describe exactly the evidence still present, including grouping.
 if(!candidate.members.every(m=>elements.some(e=>e.id===m.id&&e.revision===m.revision)))return elements;
 const resolved=applyDecision(candidate.element,result);
 if(resolved.showInk||result.kind==='unknown')return elements.map(e=>e.id===candidates[0].element.id?{...e,decision:result,unresolved:false}:e);
 const ids=new Set(candidate.members.map(m=>m.id));
 const anchor=candidate.members.map(m=>elements.find(e=>e.id===m.id)).find(e=>e.outline)||candidate.element;
 const merged={...resolved,id:anchor.id,revision:Math.max(...candidate.members.map(m=>m.revision||0))+1};
 return [...elements.filter(e=>!ids.has(e.id)),merged];
}

// This only prunes impossible semantic variants of a known empty outline. Rough
// or open shapes are still free to become any supported component through vision.
export function emptyOutline(candidate){
 if(!candidate.element.outline)return false;
 const points=candidate.strokes.flat(),b=bounds(points),tolerance=Math.min(b.w,b.h)*.12;
 return points.length>0&&points.every(p=>Math.min(Math.abs(p.x-b.x),Math.abs(p.x-b.x-b.w),Math.abs(p.y-b.y),Math.abs(p.y-b.y-b.h))<=tolerance);
}

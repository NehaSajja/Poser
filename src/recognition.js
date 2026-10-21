export const RECOGNITION_VERSION='single-crop-v2';
// Retain the existing conservative floor until calibrated on live drawing sessions.
// The old .20 margin was redundant for a normalized distribution with a .70 winner.
export const MIN_ACCEPT_PROBABILITY = .70;
export function resolvedKind(_element,result) {
 if(result.kind==='switch'&&typeof result.checked!=='boolean')return null;
 if(!['button','input','container','checkbox','switch','radio','select'].includes(result.kind))return null;
 const distribution=[...(result.probabilities||[])].sort((a,b)=>b.probability-a.probability);
 const winner=distribution.find(p=>p.value===result.kind)?.probability||0;
 return winner>=MIN_ACCEPT_PROBABILITY&&distribution[0]?.value===result.kind?result.kind:null;
}
export function decisionGate(element,result){return resolvedKind(element,result)!==null;}
export function samplingDelay(gaps){
 const recent=gaps.filter(v=>v>80&&v<2500).slice(-6).sort((a,b)=>a-b);
 const median=recent.length?recent[Math.floor(recent.length/2)]:300;
 return Math.max(180,Math.min(500,median*.6));
}
export function pointerNear(element,pointer){
 return pointer&&pointer.x>=element.x-32&&pointer.x<=element.x+element.w+32&&pointer.y>=element.y-32&&pointer.y<=element.y+element.h+32;
}
export function commitDelay(element,pointer,idle){return Math.max(0,(pointerNear(element,pointer)?650:250)-idle);}
export function nearbyContext(element,elements){
 const distance=e=>Math.hypot(e.x+e.w/2-element.x-element.w/2,e.y+e.h/2-element.y-element.h/2);
 return elements.filter(e=>e.id!==element.id).sort((a,b)=>distance(a)-distance(b)).slice(0,12).map(({kind,x,y,w,h})=>({kind,x,y,w,h}));
}

import { bounds } from './design.js';

// Each capture retains the original pointer coordinates and the element's display
// frame at capture time. Layout never rewrites this evidence.
export function captures(element) {
 if(element.ink?.length)return element.ink;
 return (element.strokes||[]).map(points=>({points:points.map(p=>({x:element.x+p.x*element.w,y:element.y+p.y*element.h})),frame:{x:element.x,y:element.y,w:element.w,h:element.h}}));
}
export function rawStrokes(element) {
 const ink=captures(element),reference=ink[0]?.frame||element;
 return ink.map(({points,frame})=>points.map(p=>({x:reference.x+(p.x-frame.x)*reference.w/Math.max(1,frame.w),y:reference.y+(p.y-frame.y)*reference.h/Math.max(1,frame.h)})));
}
export function displayStrokes(element) {
 return captures(element).map(({points,frame})=>points.map(p=>({x:element.x+(p.x-frame.x)*element.w/Math.max(1,frame.w),y:element.y+(p.y-frame.y)*element.h/Math.max(1,frame.h)})));
}
export function capture(points,frame=bounds(points)) {
 return {points:points.map(p=>({...p})),frame:{x:frame.x,y:frame.y,w:Math.max(1,frame.w),h:Math.max(1,frame.h)}};
}
export function normalizedInk(element) {
 return displayStrokes(element).map(stroke=>stroke.map(p=>({x:(p.x-element.x)/element.w,y:(p.y-element.y)/element.h})));
}

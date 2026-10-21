import test from 'node:test';
import assert from 'node:assert/strict';
import {addStroke,absoluteStrokes} from '../src/gestures.js';
import {rawStrokes} from '../src/ink.js';
import {recognitionCandidates,applyCandidateDecision,emptyOutline} from '../src/candidates.js';
const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}];
const answer=(kind,candidate=0)=>({kind,candidate,probabilities:[{value:kind,probability:.95},{value:'unknown',probability:.05}]});
test('snapping and layout retain original pointer coordinates for vision',()=>{
 const points=rect(103,101,197,63),{element}=addStroke(points,[]);
 assert.deepEqual(rawStrokes(element),[points]);
 const moved={...element,x:500,y:300,w:300,h:80};
 assert.deepEqual(rawStrokes(moved),[points]);
 assert.equal(absoluteStrokes(moved)[0][0].x,500+(points[0].x-element.x)*300/element.w);
});
test('a mark touching the box border stays with the box',()=>{
 let result=addStroke(rect(100,100,200,160),[]);
 result=addStroke([{x:100,y:100},{x:300,y:260}],result.elements);
 assert.equal(result.elements.length,1);assert.equal(result.element.ink.length,2);
});
test('marks first and box second can be interpreted as one control',()=>{
 let result=addStroke([{x:120,y:120},{x:120,y:145}],[]);
 const mark=result.element;
 result=addStroke(rect(100,100,200,64),result.elements);
 assert.equal(result.element.unresolved,true);
 const candidates=recognitionCandidates(result.element,result.elements);
 assert.equal(candidates.length,2);
 const next=applyCandidateDecision(result.elements,candidates,answer('input',1));
 assert.equal(next.length,1);assert.equal(next[0].kind,'input');assert.equal(next[0].ink.length,2);
 // Older undo snapshots must never acquire strokes they did not contain.
 assert.deepEqual(applyCandidateDecision([mark],candidates,answer('input',1)),[mark]);
});
test('ambiguous overlapping boxes offer competing attachments; stale responses cannot merge',()=>{
 const first=addStroke(rect(100,100,200,64),[]).element;
 const second={...addStroke(rect(180,100,200,64),[]).element,id:'second'};
 const result=addStroke([{x:220,y:120},{x:220,y:145}],[first,second]);
 assert.equal(result.elements.length,3);
 const candidates=recognitionCandidates(result.element,result.elements);
 assert.equal(candidates.length,3);
 const changed=result.elements.map(e=>e.id===first.id?{...e,revision:e.revision+1}:e);
 assert.deepEqual(applyCandidateDecision(changed,candidates,answer('input',1)),changed);
 const next=applyCandidateDecision(result.elements,candidates,answer('input',1));
 assert.equal(next.length,2);assert.equal(next.find(e=>e.id===first.id).kind,'input');
});
test('incomplete four-side outlines preserve every original stroke',()=>{
 const sides=[[{x:100,y:100},{x:300,y:100}],[{x:300,y:100},{x:300,y:200}],[{x:300,y:200},{x:100,y:200}],[{x:100,y:200},{x:100,y:100}]];
 let elements=[];
 for(const points of sides)elements=addStroke(points,elements).elements;
 assert.equal(elements.length,1);assert.equal(elements[0].outlineStrokeCount,4);
 assert.deepEqual(elements[0].ink.map(i=>i.points),sides);
});

test('a caret followed by four box edges keeps the original aspect ratio',()=>{
 const strokes=[[{x:450,y:175},{x:450,y:210}],[{x:425,y:150},{x:700,y:150}],[{x:700,y:150},{x:700,y:230}],[{x:700,y:230},{x:425,y:230}],[{x:425,y:230},{x:425,y:150}]];
 let result;
 for(const stroke of strokes)result=addStroke(stroke,result?.elements||[]);
 assert.equal(result.element.unresolved,true);
 const candidates=recognitionCandidates(result.element,result.elements);
 const combined=candidates.find(c=>c.members.length===2);
 assert.ok(combined);
 const all=combined.strokes.flat();
 assert.equal(Math.max(...all.map(p=>p.x))-Math.min(...all.map(p=>p.x)),275);
 assert.equal(Math.max(...all.map(p=>p.y))-Math.min(...all.map(p=>p.y)),80);
 assert.equal(applyCandidateDecision(result.elements,candidates,answer('input',candidates.indexOf(combined))).length,1);
});

test('only genuinely empty outlines lose their button/input alternatives',()=>{
 let result=addStroke(rect(100,100,200,64),[]);
 assert.equal(emptyOutline(recognitionCandidates(result.element,result.elements)[0]),true);
 result=addStroke([{x:130,y:115},{x:130,y:145}],result.elements);
 assert.equal(emptyOutline(recognitionCandidates(result.element,result.elements)[0]),false);
});

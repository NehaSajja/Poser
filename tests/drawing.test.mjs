import test from 'node:test';
import assert from 'node:assert/strict';
import { addStroke, applyDecision, absoluteStrokes } from '../src/gestures.js';
import { decisionGate, samplingDelay, commitDelay } from '../src/recognition.js';
const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}];
const strong=(kind,evidence={})=>({kind,confidence:.9,probabilities:[{value:kind,probability:.96},{value:'unknown',probability:.04}],evidence:{complete:.95,...evidence}});
test('bare rectangle stays neutral indefinitely; arrow strokes refine the same element',()=>{
 const a=addStroke(rect(100,100,200,64),[],8,1);
 assert.equal(a.element.kind,'container');assert.equal(a.element.unresolved,false);
 const b=addStroke([{x:180,y:132},{x:240,y:132}],a.elements,8,10000);
 const c=addStroke([{x:225,y:117},{x:240,y:132},{x:225,y:147}],b.elements,8,11000);
 assert.equal(c.elements.length,1);assert.equal(c.element.strokes.length,3);assert.equal(c.element.showInk,true);
 assert.equal(applyDecision(c.element,strong('button',{arrow:.95})).kind,'button');
});
test('closed child rectangles are separate from their enclosing frame',()=>{
 const a=addStroke(rect(100,100,600,500),[],8,0);
 const b=addStroke(rect(140,140,160,200),a.elements,8,100);
 assert.equal(b.elements.length,2);
});
test('unknown marks survive; subsequent evidence can reopen a committed button',()=>{
 let a=addStroke(rect(100,100,200,64),[],8,0);
 a=addStroke([{x:180,y:132},{x:240,y:132}],a.elements,8,10);
 const unknown=applyDecision(a.element,{kind:'unknown',confidence:1});assert.equal(unknown.showInk,true);
 const button=applyDecision(a.element,strong('button',{arrow:.95}));
 const b=addStroke([{x:140,y:120},{x:140,y:145}],[button],8,20000);
 assert.equal(b.element.kind,'container');assert.equal(b.element.committedKind,'button');assert.equal(b.element.strokes.length,3);
 assert.equal(absoluteStrokes(b.element).length,3);
});
test('vision can recognize a rough outline without local geometry or predicate vetoes',()=>{
 assert.equal(decisionGate({outline:false},strong('button')),true);
 assert.equal(decisionGate({},strong('input')),true);
 assert.equal(decisionGate({},strong('unknown')),false);
 assert.equal(decisionGate({}, {...strong('input'),probabilities:[{value:'input',probability:.54},{value:'button',probability:.46}]}),false);
});
test('drawing cadence and pointer proximity affect timing; pauses do not change evidence',()=>{
 assert.ok(samplingDelay([100,150,120])<samplingDelay([700,800,900]));
 const el={x:100,y:100,w:200,h:64};assert.equal(commitDelay(el,{x:150,y:120},500),150);assert.equal(commitDelay(el,{x:700,y:400},500),0);
});
test('four separately drawn sides assemble into one neutral outline',()=>{
 let elements=[];
 for(const points of [[{x:100,y:100},{x:300,y:100}],[{x:300,y:100},{x:300,y:200}],[{x:300,y:200},{x:100,y:200}],[{x:100,y:200},{x:100,y:100}]])elements=addStroke(points,elements,8,100).elements;
 assert.equal(elements.length,1);assert.equal(elements[0].outline,true);assert.equal(elements[0].unresolved,false);
});


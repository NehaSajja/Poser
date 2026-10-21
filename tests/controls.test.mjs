import test from 'node:test';
import assert from 'node:assert/strict';
import {addStroke,applyDecision} from '../src/gestures.js';
import {recognitionCandidates,applyCandidateDecision} from '../src/candidates.js';
import {parseAnswer,buildRequest,validatePayload} from '../server/decisions.mjs';
import {resolvedKind} from '../src/recognition.js';
const box=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}];
const circle=(x,y,r)=>Array.from({length:49},(_,i)=>({x:x+r*Math.cos(i*Math.PI/24),y:y+r*Math.sin(i*Math.PI/24)}));
const answer=variant=>parseAnswer({answers:[{name:'component',type:'choice',choice:variant,probabilities:[{value:variant,probability:.95},{value:'unknown',probability:.05}]}]},'openai');
test('new control decisions preserve checked state through application',()=>{
 for(const [variant,kind,checked] of [['checkbox','checkbox',true],['radio','radio',true],['switch_right','switch',true],['switch_left','switch',false],['select','select',undefined]]){
  const result=answer(variant);assert.equal(resolvedKind(null,result),kind);
  const applied=applyDecision({kind:'unknown',showInk:true},result);
  assert.equal(applied.kind,kind);assert.equal(applied.checked,checked);assert.equal(applied.showInk,false);
 }
});
test('uncertain switch states are not combined into a confident switch',()=>{
 const result=parseAnswer({answers:[{name:'component',type:'choice',choice:'switch_right',probabilities:[{value:'switch_right',probability:.55},{value:'switch_left',probability:.45}]}]},'openai');
 assert.equal(resolvedKind(null,result),null);
 assert.throws(()=>answer('switch'));assert.throws(()=>answer('invented'));
});
test('a closed round thumb attaches to the track instead of becoming a child card',()=>{
 let drawing=addStroke(box(100,100,144,64),[]);
 drawing=addStroke(circle(209,132,23),drawing.elements);
 assert.equal(drawing.elements.length,1);assert.equal(drawing.element.ink.length,2);assert.equal(drawing.element.unresolved,true);
});
test('a dot and outer circle can merge in either drawing order',()=>{
 for(const strokes of [[circle(160,160,40),circle(160,160,9)],[circle(160,160,9),circle(160,160,40)]]){
  let drawing;for(const stroke of strokes)drawing=addStroke(stroke,drawing?.elements||[]);
  const candidates=recognitionCandidates(drawing.element,drawing.elements);
  const i=candidates.findIndex(c=>c.strokes.length===2);assert.ok(i>=0);
  const after=applyCandidateDecision(drawing.elements,candidates,{...answer('radio'),candidate:i});
  assert.equal(after.length,1);assert.equal(after[0].kind,'radio');assert.equal(after[0].checked,true);
 }
});
test('all labels stay available even when old geometry calls a sketch empty',()=>{
 const image='data:image/png;base64,AA==';
 assert.equal(validatePayload({image,strokeBounds:{w:100,h:50},context:['checkbox','switch','radio','select'].map(kind=>({kind,x:0,y:0,w:100,h:50}))}),true);
 const request=buildRequest({image,candidates:[{id:0,image,emptyOutline:true}],context:[]});
 assert.deepEqual(request.questions[0].choices.map(c=>c.value),['container','input','button','checkbox','radio','switch_left','switch_right','select','unknown']);
});

test('a provisional thumb drawn first is offered with its enclosing track',()=>{
 let drawing=addStroke(box(242,139,25,58),[]);
 drawing=addStroke(box(100,100,180,116),drawing.elements);
 assert.equal(drawing.element.unresolved,true);
 const candidates=recognitionCandidates(drawing.element,drawing.elements);
 const combined=candidates.findIndex(c=>c.members.length===2);
 assert.ok(combined>=0);
 assert.equal(candidates[combined].element.w,drawing.element.w);
 const after=applyCandidateDecision(drawing.elements,candidates,{...answer('switch_right'),candidate:combined});
 assert.equal(after.length,1);assert.equal(after[0].kind,'switch');
});

test('a retraced outer boundary stays in one drawing while separate peers stay separate',()=>{
 let drawing=addStroke(box(100,100,180,64),[]);
 drawing=addStroke(box(103,101,176,62),drawing.elements);
 assert.equal(drawing.elements.length,1);assert.equal(drawing.element.ink.length,2);
 drawing=addStroke(box(340,100,180,64),drawing.elements);
 assert.equal(drawing.elements.length,2);
});

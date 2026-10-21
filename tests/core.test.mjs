import test from 'node:test';
import assert from 'node:assert/strict';
import { inferShape, snapBox, KINDS, migrateElements } from '../src/design.js';
import { buildRequest, parseAnswer, validatePayload } from '../server/decisions.mjs';
const rect=(w,h)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h},{x:0,y:0}];
test('keeps rectangles neutral and leaves unsupported circles and lines as ink',()=>{
 assert.equal(inferShape(rect(144,48)),'container');assert.equal(inferShape(rect(320,48)),'container');assert.equal(inferShape(rect(400,300)),'container');assert.equal(inferShape([{x:0,y:1},{x:200,y:4}]),'unknown');
 const circle=Array.from({length:50},(_,i)=>({x:50+40*Math.cos(i/49*Math.PI*2),y:50+40*Math.sin(i/49*Math.PI*2)}));assert.equal(inferShape(circle),'unknown');
});
test('aligns near edges and quantizes dimensions',()=>{const b=snapBox({x:99,y:53,w:143,h:46},[{x:100,y:200,w:144,h:48}],8);assert.equal(b.x,100);assert.equal(b.w,144);assert.equal(b.h,48);});
test('OpenAI request uses documented decisions input and choices',()=>{const r=buildRequest({image:'data:image/png;base64,AA==',design:'reference',context:[]});assert.equal(r.model,'gpt-6-luna');assert.equal(r.input[0].content[0].type,'input_image');assert.equal(r.questions[0].name,'component');assert.ok(r.questions[0].choices.some(c=>c.value==='unknown'));});
test('provider adapters remain distinct',()=>{const r=buildRequest({image:'data:image/png;base64,AA==',design:'',context:[]},'openrouter');assert.ok(r.state);assert.ok(r.questions.component.criteria);assert.equal(parseAnswer({answers:[{type:'choice',name:'component',choice:'button',confidence:.9}]},'openai').kind,'button');assert.equal(parseAnswer({answers:{component:{type:'choice',choice:'input',confidence:.8}}},'openrouter').kind,'input');});
test('rejects invented choices, external image URLs and missing images',()=>{assert.throws(()=>parseAnswer({answers:[{name:'component',type:'choice',choice:'execute'}]},'openai'));assert.equal(validatePayload({image:'https://example.com/x',design:'',context:[]}),false);assert.equal(validatePayload({context:[]}),false);});

test('classification uses one question and excludes design instructions',()=>{const r=buildRequest({image:'data:image/png;base64,AA==',design:'Secret untrusted styling prose',context:[],strokeBounds:{w:180,h:60}});assert.deepEqual(r.questions.map(q=>q.name),['component']);assert.ok(!JSON.stringify(r).includes('Secret'));});
test('parses fixed choices and preserves opposing switch states',()=>{
 const r=parseAnswer({answers:[{name:'component',type:'choice',choice:'switch_right',confidence:.8,probabilities:[{value:'switch_right',probability:.8},{value:'switch_left',probability:.2}]}]},'openai');
 assert.equal(r.kind,'switch');assert.equal(r.checked,true);
 assert.deepEqual(r.probabilities,[{value:'switch',probability:.8},{value:'switch_left',probability:.2}]);
 assert.throws(()=>parseAnswer({answers:[{name:'component',type:'choice',choice:'1/button'}]}));
 assert.equal(parseAnswer({answers:[{name:'component',type:'refusal'}]},'openai').kind,'unknown');
});

test('only supported components are exposed and legacy drawings are preserved',()=>{assert.deepEqual(KINDS,['button','container','input','checkbox','switch','radio','select']);const old=[{id:'old',kind:'image',x:10,y:10,w:100,h:100,strokes:[[{x:0,y:0},{x:1,y:1}]]},{id:'plain',kind:'avatar',x:200,y:100,w:48,h:48}];const migrated=migrateElements(old);assert.equal(migrated.length,2);assert.equal(migrated[0].kind,'unknown');assert.equal(migrated[0].showInk,true);assert.deepEqual(migrated[0].strokes,old[0].strokes);assert.equal(migrated[1].kind,'container');assert.equal(migrated[1].id,'plain');});

// Live replay through the real grouping pipeline; all pointer data is synthetic.
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {addStroke,absoluteStrokes} from '../src/gestures.js';
import {recognitionCandidates,applyCandidateDecision,emptyOutline} from '../src/candidates.js';
import {bounds} from '../src/design.js';
import {nearbyContext} from '../src/recognition.js';
const box=[{x:103,y:101},{x:303,y:101},{x:303,y:165},{x:103,y:165},{x:103,y:101}];
const caret=[{x:124,y:115},{x:124,y:150}];
const shaft=[{x:155,y:133},{x:290,y:133}],head=[{x:267,y:113},{x:290,y:133},{x:267,y:153}];
const rectangle=(x,y,w,h)=>[{x:x+12,y},{x:x+w-12,y},{x:x+w,y:y+12},{x:x+w,y:y+h-12},{x:x+w-12,y:y+h},{x:x+12,y:y+h},{x,y:y+h-12},{x,y:y+12},{x:x+12,y}];
const circle=(x,y,r)=>Array.from({length:49},(_,i)=>({x:x+r*Math.cos(i*Math.PI/24),y:y+r*Math.sin(i*Math.PI/24)}));
const cases=[
 {name:'box then tick',strokes:[rectangle(100,100,64,64),[{x:112,y:133},{x:129,y:149},{x:152,y:115}]],kind:'checkbox'},
 {name:'circle then dot',strokes:[circle(160,160,40),circle(160,160,9)],kind:'radio'},
 {name:'dot then circle',strokes:[circle(160,160,9),circle(160,160,40)],kind:'radio'},
 {name:'switch right thumb',strokes:[rectangle(100,100,144,64),circle(209,132,23)],kind:'switch',checked:true},
 {name:'switch left thumb',strokes:[rectangle(100,100,144,64),circle(135,132,23)],kind:'switch',checked:false},
 {name:'select field and chevron',strokes:[box,[{x:260,y:125},{x:275,y:140},{x:290,y:125}]],kind:'select'},
 {name:'nested switch',strokes:[rectangle(50,50,500,400),rectangle(100,100,144,64),circle(209,132,23)],kind:'switch',checked:true,expectedElements:2},
 {name:'reported wide input',strokes:[rectangle(144,86,560,156),[{x:178,y:132},{x:177,y:177},{x:178,y:217}]],kind:'input'},
 {name:'reported input inside frame',strokes:[rectangle(109,403,720,454),rectangle(179,497,384,108),[{x:222,y:519},{x:221,y:555},{x:222,y:596}]],kind:'input',expectedElements:2},
 {name:'reported caret close to bottom edge',strokes:[rectangle(128,208,344,56),[{x:156.7,y:227.7},{x:156.5,y:248.5},{x:156.5,y:261.8}]],kind:'input'},
 {name:'caret then four box edges',strokes:[caret,...box.slice(1).map((p,i)=>[box[i],p])],kind:'input'},
 {name:'caret then box',strokes:[caret,box],kind:'input'},
 {name:'four sides then arrow',strokes:box.slice(1).map((p,i)=>[box[i],p]).concat([shaft,head]),kind:'button'},
 {name:'arrow touching border',strokes:[box,[{x:155,y:133},{x:303,y:133}],[{x:280,y:113},{x:303,y:133},{x:280,y:153}]],kind:'button'},
 {name:'rough open box then arrow',strokes:[box.slice(0,4).concat([{x:103,y:112}]),shaft,head],kind:'button'},
];
const dir=await mkdtemp(join(tmpdir(),'sketch-replay-'));let failures=0;
async function image(strokes,title=''){
 const b=bounds(strokes.flat()),scale=440/Math.max(b.w,b.h,1);
 const paths=strokes.map(points=>`<polyline points="${points.map(p=>`${(p.x-b.x)*scale+(512-b.w*scale)/2},${(p.y-b.y)*scale+(512-b.h*scale)/2}`).join(' ')}"/>`).join('');
 await writeFile(join(dir,'image.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="white"/><g fill="none" stroke="#20201e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${paths}</g><text x="12" y="20" font-family="Arial" font-size="16">${title}</text></svg>`);
 execFileSync('magick',[join(dir,'image.svg'),join(dir,'image.png')]);
 return `data:image/png;base64,${(await readFile(join(dir,'image.png'))).toString('base64')}`;
}
try{
 for(const fixture of cases.filter(c=>!process.env.EVAL_FILTER||c.name.includes(process.env.EVAL_FILTER))){
  let drawing;
  for(const stroke of fixture.strokes)drawing=addStroke(stroke,drawing?.elements||[]);
  const candidates=recognitionCandidates(drawing.element,drawing.elements),images=[];
  for(const [i,c] of candidates.entries())images.push(await image(c.strokes,`Candidate ${i}`));
  if(process.env.EVAL_ARTIFACTS)for(const [i,png] of images.entries())await writeFile(join(process.env.EVAL_ARTIFACTS,fixture.name.replaceAll(' ','-')+'-'+i+'.png'),Buffer.from(png.split(',')[1],'base64'));
  const payload={image:images[0],sceneImage:await image(drawing.elements.flatMap(absoluteStrokes),'Neighborhood (context only)'),context:nearbyContext(drawing.element,drawing.elements),strokeBounds:drawing.element,candidates:candidates.map((c,i)=>({id:i,emptyOutline:emptyOutline(c),image:images[i],strokeBounds:c.element,strokeCount:c.strokes.length,memberCount:c.members.length}))};
  const start=Date.now(),res=await fetch((process.env.EVAL_URL||'http://127.0.0.1:4317')+'/api/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),decision=await res.json();
  const after=res.ok?applyCandidateDecision(drawing.elements,candidates,decision):drawing.elements;
  const pass=res.ok&&after.length===(fixture.expectedElements||1)&&after.some(e=>e.kind===fixture.kind&&!e.showInk&&(fixture.checked===undefined||e.checked===fixture.checked));
  if(!pass)failures++;
  console.log(JSON.stringify({fixture:fixture.name,pass,ms:Date.now()-start,before:drawing.elements.length,candidates:candidates.length,after:after.map(e=>e.kind),decision}));
 }
}finally{await rm(dir,{recursive:true,force:true});}
process.exitCode=failures?1:0;

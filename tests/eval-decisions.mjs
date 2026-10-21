// Explicit live smoke test; not included in npm test. Uses the running local server.
// Requires ImageMagick (`magick`) to rasterize synthetic fixtures.
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {decisionGate,resolvedKind} from '../src/recognition.js';
const outline='M36 176 H476 V336 H36 Z';
const cases=[
 {name:'checked square',path:'M176 176 H336 V336 H176 Z M205 255 L240 293 L310 211',kind:'checkbox',outline:true,count:2,accept:true},
 {name:'selected radio',path:'M336 256 A80 80 0 1 0 176 256 A80 80 0 1 0 336 256 M274 256 A18 18 0 1 0 238 256 A18 18 0 1 0 274 256',kind:'radio',outline:false,count:2,accept:true},
 {name:'switch on',path:'M166 176 H346 A80 80 0 0 1 346 336 H166 A80 80 0 0 1 166 176 M406 256 A60 60 0 1 0 286 256 A60 60 0 1 0 406 256',kind:'switch',checked:true,outline:true,count:2,accept:true},
 {name:'switch off',path:'M166 176 H346 A80 80 0 0 1 346 336 H166 A80 80 0 0 1 166 176 M226 256 A60 60 0 1 0 106 256 A60 60 0 1 0 226 256',kind:'switch',checked:false,outline:true,count:2,accept:true},
 {name:'select chevron',path:outline+' M380 240 L406 266 L432 240',kind:'select',outline:true,count:2,accept:true},
 {name:'empty rectangle',path:outline,kind:'container',outline:true,count:1,accept:true},
 {name:'unfinished arrow',path:outline+' M180 256 H330',kind:'unknown',outline:true,count:2,accept:false},
 {name:'complete arrow',path:outline+' M180 256 H330 M300 226 L330 256 L300 286',kind:'button',outline:true,count:3,accept:true},
 {name:'rough open box with arrow',path:'M36 196 V336 H476 V176 H48 M180 256 H330 M300 226 L330 256 L300 286',kind:'button',outline:false,count:3,accept:true},
 {name:'entry caret',path:outline+' M80 216 V296',kind:'input',outline:true,count:2,accept:true},
 {name:'image cross',path:'M76 76 H436 V436 H76 Z M76 76 L436 436 M436 76 L76 436',kind:'unknown',outline:true,count:3,accept:false},
 {name:'placeholder text',path:'M76 176 H436 M76 236 H416 M76 296 H340',kind:'unknown',outline:false,count:3,accept:false},
];
const dir=await mkdtemp(join(tmpdir(),'sketch-decisions-'));
let failures=0;
try{
 for(const c of cases){
  const svg=join(dir,'fixture.svg'),png=join(dir,'fixture.png');
  await writeFile(svg,`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="white"/><path d="${c.path}" fill="none" stroke="#20201e" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>`);
  execFileSync('magick',[svg,png]);
  const start=Date.now();
  const response=await fetch((process.env.EVAL_URL||'http://127.0.0.1:4317')+'/api/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:`data:image/png;base64,${(await readFile(png)).toString('base64')}`,strokeBounds:{w:c.kind==='image'?180:200,h:c.kind==='image'?180:72},strokeCount:c.count,hasOutline:c.outline,context:[]})});
  const result=await response.json();
  const accepted=response.ok&&decisionGate({outline:c.outline,strokes:Array(c.count).fill([])},result);
  const resolved=resolvedKind({outline:c.outline,strokes:Array(c.count).fill([])},result);
  const pass=response.ok&&(c.accept?accepted&&resolved===c.kind&&(c.checked===undefined||result.checked===c.checked):!accepted);
  if(!pass)failures++;
  console.log(JSON.stringify({fixture:c.name,pass,http:response.status,ms:Date.now()-start,accepted,resolved,...result}));
 }
}finally{await rm(dir,{recursive:true,force:true});}
process.exitCode=failures?1:0;

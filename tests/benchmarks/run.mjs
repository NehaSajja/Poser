// End-to-end grouping + Decisions benchmark. Does not modify the saved browser canvas.
import {mkdir,writeFile,readFile,cp,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {doodleCases} from './doodleui.mjs';
const [split='dev',label='baseline']=process.argv.slice(2);
if(!['dev','holdout'].includes(split)||!/^[a-z0-9-]+$/.test(label))throw new Error('Usage: run.mjs dev|holdout label');
const snapshot=resolve('output/recognition-benchmark/snapshots',label);
try{await access(join(snapshot,'ready.json'));}catch{
 await mkdir(join(snapshot,'server'),{recursive:true});await mkdir(join(snapshot,'src'),{recursive:true});
 for(const path of ['server/decisions.mjs','server/recognize.mjs','server/assets','src/recognition.js','src/design.js','src/gestures.js','src/candidates.js','src/ink.js','src/grouping.js'])await cp(path,join(snapshot,path),{recursive:true});
 await writeFile(join(snapshot,'ready.json'),JSON.stringify({label,created:new Date().toISOString()}));
}
const moduleAt=path=>import(pathToFileURL(join(snapshot,path)).href);
const {addStroke,absoluteStrokes}=await moduleAt('src/gestures.js');
const {recognitionCandidates,applyCandidateDecision,emptyOutline}=await moduleAt('src/candidates.js');
const {bounds}=await moduleAt('src/design.js');
const {nearbyContext}=await moduleAt('src/recognition.js');
const {recognize}=await moduleAt('server/recognize.mjs');
for(const file of ['.env.local','.env']){try{process.loadEnvFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
const provider=process.env.DECISIONS_PROVIDER||'openai',key=provider==='openai'?process.env.OPENAI_API_KEY:process.env.OPENROUTER_API_KEY;
if(!key)throw new Error('API key is not configured');
const model=process.env.DECISIONS_MODEL;
const evaluate=async body=>{
 for(let attempt=0;attempt<4;attempt++){
  const r=await fetch(provider==='openai'?'https://api.openai.com/v1/decisions':'https://openrouter.ai/api/alpha/decisions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if(r.ok)return r.json();
  if((r.status===429||r.status>=500)&&attempt<3){await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));continue;}
  throw new Error(`Provider HTTP ${r.status}`);
 }
};
const dir=resolve('output/recognition-benchmark',label,split);await mkdir(dir,{recursive:true});
function svg(strokes,title='',box=bounds(strokes.flat())){
 const scale=440/Math.max(box.w,box.h,1);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="white"/><g fill="none" stroke="#20201e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${strokes.map(s=>`<polyline points="${s.map(p=>`${(p.x-box.x)*scale+(512-box.w*scale)/2},${(p.y-box.y)*scale+(512-box.h*scale)/2}`).join(' ')}"/>`).join('')}</g><text x="12" y="20" font-family="Arial" font-size="16">${title}</text></svg>`;
}
async function image(strokes,name,title='',box){
 const path=join(dir,name);await writeFile(path+'.svg',svg(strokes,title,box));
 const b=box||bounds(strokes.flat()),scale=440/Math.max(b.w,b.h,1);
 const draw=strokes.map(s=>'polyline '+s.map(p=>`${(p.x-b.x)*scale+(512-b.w*scale)/2},${(p.y-b.y)*scale+(512-b.h*scale)/2}`).join(' ')).join(' ');
 execFileSync('magick',['-size','512x512','xc:white','-fill','none','-stroke','#20201e','-strokewidth','3','-draw','stroke-linecap round stroke-linejoin round '+draw,'-stroke','none','-fill','#20201e','-font','Arial','-pointsize','16','-annotate','+12+20',title,path+'.png'],{stdio:'pipe'});
 return 'data:image/png;base64,'+(await readFile(path+'.png')).toString('base64');
}
const allCases=await doodleCases(split);
const selected=process.env.BENCH_IDS?new Set(JSON.parse(await readFile(process.env.BENCH_IDS,'utf8'))):null;
const cases=allCases.filter(c=>!selected||selected.has(c.id)),rows=[];
async function runCase(fixture){
 // A label freezes the source snapshot. Successful rows can resume after interruption.
 try{const cached=JSON.parse(await readFile(join(dir,fixture.id+'-result.json'),'utf8'));if(!cached.error&&cached.source===fixture.source){rows.push(cached);return;}}catch(e){if(e.code!=='ENOENT')throw e;}
 let drawing;for(const [i,stroke] of fixture.strokes.entries())drawing=addStroke(stroke,drawing?.elements||[],8,10000+i*250);
 const candidates=recognitionCandidates(drawing.element,drawing.elements);
 const payload={image:await image(fixture.strokes,fixture.id+'-raw'),context:nearbyContext(drawing.element,drawing.elements),strokeBounds:{w:drawing.element.w,h:drawing.element.h},hasOutline:drawing.element.outline,strokeCount:drawing.element.strokes.length,candidates:[]};
 for(const [i,c] of candidates.entries())payload.candidates.push({id:i,emptyOutline:emptyOutline(c),image:await image(c.strokes,fixture.id+'-candidate-'+i,`Candidate ${i}`),strokeBounds:{w:c.element.w,h:c.element.h},strokeCount:c.strokes.length,memberCount:c.members.length});
 const el=drawing.element,sceneBox={x:el.x-120,y:el.y-120,w:el.w+240,h:el.h+240};
 payload.sceneImage=await image(drawing.elements.flatMap(absoluteStrokes),fixture.id+'-scene','Neighborhood context',sceneBox);
 const start=Date.now();let decision=null,after=drawing.elements,error=null;
 if(drawing.element.unresolved){
  try{
   decision=await recognize(payload,{provider,model,evaluate});
   after=applyCandidateDecision(drawing.elements,candidates,decision);
  }catch(e){error=e.message;}
 }
 const controls=after.filter(e=>!e.showInk&&e.kind!=='unknown');
 const pass=!error&&(fixture.kind==='unknown'?controls.length===0:after.length===1&&controls[0]?.kind===fixture.kind&&(fixture.checked===undefined||controls[0].checked===fixture.checked));
 const row={id:fixture.id,source:fixture.source,expected:fixture.kind,checked:fixture.checked,pass,error,ms:Date.now()-start,strokeCount:fixture.strokes.length,before:drawing.elements.length,candidates:candidates.length,after:after.map(e=>({kind:e.kind,ink:e.showInk,checked:e.checked})),decision};
 rows.push(row);const completed=rows.length;await writeFile(join(dir,fixture.id+'-result.json'),JSON.stringify(row));
 if(completed%100===0)console.log(JSON.stringify({completed,total:cases.length,...(split==='dev'?{correct:rows.filter(r=>r.pass).length}:{} )}));
}
let cursor=0;
await Promise.all(Array.from({length:Number(process.env.BENCH_WORKERS||6)},async()=>{while(cursor<cases.length){const fixture=cases[cursor++];await runCase(fixture);}}));
rows.sort((a,b)=>a.id.localeCompare(b.id));await writeFile(join(dir,'results.json'),JSON.stringify(rows,null,2));
const summary={split,label,total:rows.length,correct:rows.filter(r=>r.pass).length,errors:rows.filter(r=>r.error).length,falsePositive:rows.filter(r=>r.expected==='unknown'&&!r.pass&&!r.error).length,byKind:Object.fromEntries([...new Set(rows.map(r=>r.expected))].map(kind=>{const group=rows.filter(r=>r.expected===kind);return [kind,{correct:group.filter(r=>r.pass).length,total:group.length}]}))};
await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2));
console.log(split==='holdout'?`Sealed holdout results saved: ${dir}`:JSON.stringify(summary));

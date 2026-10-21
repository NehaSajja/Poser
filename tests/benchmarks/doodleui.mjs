// Public human stroke recordings, pinned by manifest commit and SHA-256.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=new URL('../corpus/doodleui-full/',import.meta.url);
export async function doodleCases(split){
 const manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
 const cases=[];
 for(const item of manifest.samples.filter(x=>x.split===split)){
  const bytes=await readFile(new URL(item.id+'.json',dir));
  if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Changed source sample: '+item.id);
  const drawing=JSON.parse(bytes),raw=drawing.map(s=>s[0].map((x,i)=>({x,y:s[1][i]}))).filter(s=>s.length>=2);
  const points=raw.flat(),x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  const w=Math.max(...points.map(p=>p.x))-x,h=Math.max(...points.map(p=>p.y))-y;
  const size={checkbox:96,switch:180,dropDown:240,cancel:96,squiggle:160}[item.category],scale=size/Math.max(w,h);
  const strokes=raw.map(s=>s.map(p=>({x:100+(p.x-x)*scale,y:100+(p.y-y)*scale}))).filter(s=>Math.max(Math.max(...s.map(p=>p.x))-Math.min(...s.map(p=>p.x)),Math.max(...s.map(p=>p.y))-Math.min(...s.map(p=>p.y)))>=6);
  const kind={checkbox:'checkbox',switch:'switch',dropDown:'select',cancel:'unknown',squiggle:'unknown'}[item.category];
  cases.push({...item,kind,strokes});
  if(manifest.includeMirrors&&kind==='switch')cases.push({...item,id:item.id+'-mirrored',kind,checked:false,strokes:strokes.map(s=>s.map(p=>({...p,x:200+w*scale-p.x})))});
 }
 return cases;
}

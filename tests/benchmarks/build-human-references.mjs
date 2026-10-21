import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {doodleCases} from './doodleui.mjs';
const cases=await doodleCases('dev');
const ids=['switch-toogle_615','switch-toogle_202','dropDown-dropDown_604','dropDown-dropDown_300'];
const small=JSON.parse(await readFile('tests/corpus/doodleui/manifest.json','utf8')).samples;
for(const category of ['checkbox','cancel']){const item=small.find(s=>s.category===category&&s.id.endsWith('05'));ids.push(category+'-'+item.path.split('/').at(-1));}
const labels=['switch: right thumb','switch: left thumb','select','select','checkbox','unknown: cancel icon'];
const drawing=[],sources=[];
for(const [i,id] of ids.entries()){
 const fixture=cases.find(c=>c.id===id);if(!fixture)throw new Error('Reference must be development-only: '+id);
 const strokes=fixture.strokes,points=strokes.flat(),x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),w=Math.max(...points.map(p=>p.x))-x,h=Math.max(...points.map(p=>p.y))-y,k=140/Math.max(w,h);
 const ox=i%3*220,oy=Math.floor(i/3)*180;
 drawing.push(`fill '#171717' stroke none font Arial font-size 16 text ${ox+12},${oy+170} '${labels[i]}' fill none stroke '#171717' stroke-width 2 stroke-linecap round stroke-linejoin round`);
 for(const s of strokes)drawing.push('polyline '+s.map(p=>`${ox+110+((i===1?w-(p.x-x):p.x-x)-w/2)*k},${oy+80+(p.y-y-h/2)*k}`).join(' '));
 sources.push({id,source:fixture.source,sha256:fixture.sha256,label:labels[i],mirrored:i===1,split:'dev'});
}
execFileSync('magick',['-size','660x360','xc:white','-draw',drawing.join(' '),'server/assets/human-references.png']);
await writeFile('server/assets/human-references-sources.json',JSON.stringify(sources,null,2));
await copyFile('tests/corpus/doodleui-full/LICENSE','server/assets/DoodleUI-LICENSE');

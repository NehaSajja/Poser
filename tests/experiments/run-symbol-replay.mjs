// Start with: node tests/experiments/run-symbol-replay.mjs
// Open /tests/experiments/symbol-replay.html on the existing dev server.
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildRequest, parseAnswer } from '../../server/decisions.mjs';
import { resolvedKind } from '../../src/recognition.js';
import { buildSymbolRequest, symbolPrediction } from './symbol-question.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
for (const name of ['.env.local', '.env']) {
  try { process.loadEnvFile(resolve(root, name)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
if (process.env.DECISIONS_PROVIDER && process.env.DECISIONS_PROVIDER !== 'openai') throw Error('This experiment uses OpenAI.');
if (!process.env.OPENAI_API_KEY) throw Error('Missing OpenAI key.');
const model = process.env.DECISIONS_MODEL || 'gpt-6-luna';
const output = resolve(root, 'tests/experiments/live-canvas-2026-10-17');
let busy = false, latest = null;

async function evaluate(request) {
  const start = performance.now();
  const response = await fetch('https://api.openai.com/v1/decisions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify(request), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`Provider HTTP ${response.status}`);
  return { raw: await response.json(), elapsedMs: Math.round(performance.now() - start) };
}

async function compare(cases) {
  await mkdir(output, { recursive:true });
  await writeFile(resolve(output, 'cases.json'), JSON.stringify(cases.map(({image,...rest}) => rest), null, 2));
  for (const item of cases) await writeFile(resolve(output, item.name + '.png'), Buffer.from(item.image.split(',')[1], 'base64'));
  const rows = [];
  for (let repetition = 0; repetition < 2; repetition++) {
    for (const item of cases) {
      for (const method of repetition === 0 ? ['current','symbols'] : ['symbols','current']) {
        const request = method === 'current' ? buildRequest({image:item.image}, 'openai', model) : buildSymbolRequest(item.image, model);
        const {raw,elapsedMs} = await evaluate(request);
        let prediction;
        if (method === 'current') {
          const result = parseAnswer(raw);
          prediction = {kind:result.interpretation, probability:result.probabilities.find(p=>p.value===result.kind)?.probability||0,
            accepted:Boolean(resolvedKind(null,result))};
        } else prediction = symbolPrediction(raw);
        const row = {name:item.name,expected:item.expected,repetition:repetition+1,method,...prediction,elapsedMs,
          correct:prediction.kind===item.expected,raw};
        rows.push(row);
        console.log(JSON.stringify({...row,raw:undefined}));
      }
    }
  }
  const summary = Object.fromEntries(['current','symbols'].map(method=>{
    const subset=rows.filter(r=>r.method===method), times=subset.map(r=>r.elapsedMs).sort((a,b)=>a-b);
    return [method,{total:subset.length,topCorrect:subset.filter(r=>r.correct).length,
      acceptedCorrect:subset.filter(r=>r.correct&&r.accepted).length,
      wrongAccepted:subset.filter(r=>!r.correct&&r.accepted).length,
      medianMs:(times[(times.length-1)>>1]+times[times.length>>1])/2}];
  }));
  latest = {model,repetitions:2,threshold:.70,summary,rows};
  await writeFile(resolve(output,'results.json'),JSON.stringify(latest,null,2));
  await writeFile(resolve(output,'questions.json'),JSON.stringify({current:buildRequest({image:'<same PNG>'},'openai',model),symbols:buildSymbolRequest('<same PNG>',model)},null,2));
  return latest;
}

http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4317');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.url==='/results')return send(200,latest||{status:busy?'running':'idle'});
  if(req.url!=='/run'||req.method!=='POST')return send(404,{error:'Not found'});
  if(busy)return send(409,{error:'Already running'});
  try {
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)throw Error('Payload too large');}
    const cases=JSON.parse(body);
    const allowed=['select','checkbox','switch','roughRadio','nativeRadio','button','rectangle','input'];
    if(!Array.isArray(cases)||cases.length!==8||new Set(cases.map(c=>c.name)).size!==8||cases.some(c=>!allowed.includes(c.name)||!Array.isArray(c.strokes)||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(c.image)))throw Error('Use the five failure cases and three authorized working controls');
    busy=true;const report=await compare(cases);send(200,{...report,rows:report.rows.map(({raw,...rest})=>rest)});
  } catch(e) {send(500,{error:e.message});}
  finally {busy=false;}
}).listen(4327,'127.0.0.1',()=>console.log('Isolated replay listening on 127.0.0.1:4327'));

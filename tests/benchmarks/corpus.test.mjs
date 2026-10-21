// Executed explicitly with node --test tests/benchmarks/corpus.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {doodleCases} from './doodleui.mjs';
test('frozen corpus splits have no duplicate source traces and references are development-only',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../corpus/doodleui-full/manifest.json',import.meta.url)));
 assert.equal(manifest.samples.length,2425);
 assert.equal(new Set(manifest.samples.map(s=>s.traceHash)).size,2425);
 const train=new Set(manifest.samples.filter(s=>s.split==='dev').map(s=>s.id));
 const refs=JSON.parse(await readFile(new URL('../../server/assets/human-references-sources.json',import.meta.url)));
 assert.equal(refs.length,6);for(const ref of refs)assert.ok(train.has(ref.id));
 const dev=await doodleCases('dev'),held=await doodleCases('holdout');
 assert.equal(dev.length,1695);assert.equal(held.length,730);
 for(const fixture of [...dev,...held])assert.ok(fixture.strokes.length>0&&fixture.strokes.every(s=>s.length>=2&&s.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
});

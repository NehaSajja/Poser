import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchLibraryFit} from '../src/poser2/mhrLibraryFits.js';
const meta={mapping:{Hips:'root',Head:'c_head'},limits:Array.from({length:204},()=>[-3,3])};
const source={positions:{Hips:[0,0,0],Head:[0,1,0]},orientations:{Hips:[0,0,0,1],Head:[0,0,0,1]}};
const entry=()=>({version:1,params:Array(204).fill(0),meanJointErrorPercent:1.2,source:structuredClone(source)});
test('saved fit accepts unchanged poses and equivalent quaternion signs',()=>{const e=entry();e.source.orientations.Head=[0,0,0,-1];assert.ok(matchLibraryFit(e,source,meta));e.source.positions.Head[0]=1e-7;assert.ok(matchLibraryFit(e,source,meta));});
test('saved fit never overrides edits or accepts malformed or incompatible parameters',()=>{
 for(const change of [e=>e.source.positions.Head[0]=.01,e=>e.source.orientations.Head=[0,.1,0,.99],e=>e.params[0]=NaN,e=>e.params[0]=4,e=>e.params.pop(),e=>e.version=2,e=>delete e.source.positions.Head]){const e=entry();change(e);assert.equal(matchLibraryFit(e,source,meta),null);}
});

const manifestPath='public/experiments/mhr-library-fits.json';
test('every saved library fit matches its source and native parameter limits',{skip:!fs.existsSync(manifestPath)},()=>{
 const manifest=JSON.parse(fs.readFileSync(manifestPath)),runtime=JSON.parse(fs.readFileSync('public/experiments/mhr-browser-rig.json'));
 const catalog=JSON.parse(fs.readFileSync('data/cloud-retrieval/catalog.json'));
 assert.equal(manifest.count,catalog.length);assert.equal(new Set(manifest.ids).size,catalog.length);
 for(const pose of catalog){const entry=JSON.parse(fs.readFileSync(`public/experiments/mhr-library/${pose.id}.json`));assert.ok(matchLibraryFit(entry,entry.source,runtime),`Invalid saved fit ${pose.id}`);}
});

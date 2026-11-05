import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserKinematics,skinAttributes,unposeSurface,skinSurface} from '../src/poser2/mhrBrowserMath.js';
const data=JSON.parse(fs.readFileSync('public/experiments/mhr-browser-rig.json'));
const cases=fs.existsSync('.local/mhr-browser-fixtures/cases.json')?JSON.parse(fs.readFileSync('.local/mhr-browser-fixtures/cases.json')):[];
if(!cases.length)test('Native fixtures require npm run test:mhr-browser',{skip:true},()=>{});
const math=createBrowserKinematics(data),attrs=skinAttributes(data);
const packet=name=>{const b=fs.readFileSync(`.local/mhr-browser-fixtures/${name}.bin`);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
for(const item of cases)test(`Browser kinematics and corrected skin round-trip: ${item.name}`,()=>{
 const reference=packet(item.name),n=data.vertexCount*3,states=math.forward(item.params,item.shape);
 const expected=reference.subarray(n,n+data.parents.length*8);let positionError=0;
 for(let i=0;i<states.length;i+=8){for(let k=0;k<3;k++)positionError=Math.max(positionError,Math.abs(states[i+k]-expected[i+k]));
  const dot=[3,4,5,6].reduce((s,k)=>s+states[i+k]*expected[i+k],0);assert.ok(Math.abs(Math.abs(dot)-1)<2e-5,'quaternion mismatch');}
 assert.ok(positionError<2e-5,`position error ${positionError}`);
 const rest=unposeSurface(reference.subarray(0,n),expected,data,attrs,item.shape.height);
 const reconstructed=skinSurface(rest,states,data,attrs,item.shape.height);
 const max=Math.max(...reconstructed.map((v,i)=>Math.abs(v-reference[i])));assert.ok(max<3e-5,`skin drift ${max}`);
 for(const role of ['LeftHand','RightHand','LeftFoot','RightFoot']){
  const i=data.jointNames.indexOf(data.mapping[role])*8,known=item.params.slice();
  const parameter=data.names.indexOf((role.startsWith('Left')?'l':'r')+(/Hand/.test(role)?'_uparm_ry':'_upleg_ry'));
  known[parameter]=Math.max(data.limits[parameter][0],Math.min(data.limits[parameter][1],known[parameter]+(known[parameter]>.1?-.08:.08)));
  const target=Array.from(math.forward(known,item.shape).subarray(i,i+3));
  const solved=math.solve(item.params,{role,target},item.shape),after=math.forward(solved,item.shape);
  const distance=s=>Math.hypot(...target.map((v,k)=>v-s[i+k]));assert.ok(distance(after)<distance(states),`${role} IK made no progress`);
 }
});

import {Euler,Matrix4,Quaternion,Vector3} from 'three';

// Exact MHR parameter transform and forward kinematics, without Torch or the
// corrective network. Units are meters; the official rig uses centimeters.
export function createBrowserKinematics(data) {
 const count=data.parents.length, joint=new Float64Array(count*7);
 const local=Array.from({length:count},()=>new Matrix4());
 const global=Array.from({length:count},()=>new Matrix4());
 const p=new Vector3(),q=new Quaternion(),pre=new Quaternion(),scale=new Vector3(),e=new Euler(0,0,0,'ZYX');
 function forward(params,shape={silhouette:0,height:1}) {
  const shaped=Array.from(params);shaped[data.names.indexOf('scale_shoulder_width')]=-.12*shape.silhouette;
  shaped[data.names.indexOf('scale_hip_width')]=.06*shape.silhouette;
  for(let i=0;i<joint.length;i++){let value=0;for(const [column,weight]of data.transform[i])value+=shaped[column]*weight;joint[i]=value;}
  const states=new Float32Array(count*8),height=shape.height??1;
  for(let i=0;i<count;i++){
   const k=i*7,o=data.offsets[i];p.set((joint[k]+o[0])/100,(joint[k+1]+o[1])/100,(joint[k+2]+o[2])/100);
   q.setFromEuler(e.set(joint[k+3],joint[k+4],joint[k+5],'ZYX')).premultiply(pre.fromArray(data.preRotations[i]));
   local[i].compose(p,q,scale.setScalar(2**joint[k+6]));
   global[i].copy(local[i]);if(data.parents[i]>=0)global[i].premultiply(global[data.parents[i]]);
   global[i].decompose(p,q,scale);p.multiplyScalar(height);p.toArray(states,i*8);q.toArray(states,i*8+3);states[i*8+7]=scale.x;
  }
  return states;
 }
 // Small damped least-squares solve in native parameters. Only the selected
 // chain changes; using those same parameters for MHR avoids a second IK solve.
 function solve(params,limb,shape,warm=params){
  const left=limb.role.startsWith('Left'),prefix=left?'l':'r';
  const arm=/Hand|ForeArm/.test(limb.role),tip=/Hand|Foot/.test(limb.role),base=arm?'uparm':'upleg';
  const names=['_twist','_ry','_rz'].map(s=>prefix+'_'+base+s);if(tip)names.push(prefix+(arm?'_elbow_bend':'_knee_bend'));
  const indices=names.map(n=>data.names.indexOf(n)),ji=data.jointNames.indexOf(data.mapping[limb.role])*8;
  const result=Array.from(params);for(const i of indices)result[i]=warm[i];
  let best=Infinity,bestParams=result.slice();
  for(let iteration=0;iteration<16;iteration++){
   const state=forward(result,shape),error=limb.target.map((v,k)=>v-state[ji+k]),distance=error.reduce((s,v)=>s+v*v,0);
   if(distance<best){best=distance;bestParams=result.slice();}if(distance<1e-7)break;
   const columns=indices.map(i=>{const test=result.slice();test[i]+=.001;const s=forward(test,shape);return [0,1,2].map(k=>(s[ji+k]-state[ji+k])/.001);});
   const a=Array.from({length:3},(_,r)=>Array.from({length:4},(_,c)=>c===3?error[r]:columns.reduce((v,j)=>v+j[r]*j[c],r===c?.0001:0)));
   for(let k=0;k<3;k++){const divisor=a[k][k];for(let c=k;c<4;c++)a[k][c]/=divisor;for(let r=0;r<3;r++)if(r!==k){const f=a[r][k];for(let c=k;c<4;c++)a[r][c]-=f*a[k][c];}}
   for(let j=0;j<indices.length;j++){const i=indices[j],step=columns[j].reduce((v,x,k)=>v+x*a[k][3],0);result[i]=Math.max(data.limits[i][0],Math.min(data.limits[i][1],result[i]+Math.max(-.2,Math.min(.2,step))));}
  }
  return bestParams;
 }
 return {forward,solve};
}
export function matricesFromStates(states){
 const p=new Vector3(),q=new Quaternion(),s=new Vector3();return Array.from({length:states.length/8},(_,i)=>new Matrix4().compose(p.fromArray(states,i*8),q.fromArray(states,i*8+3),s.setScalar(states[i*8+7])));
}
export function inverseBindMatrices(data,height=1){
 return matricesFromStates(data.inverseBind.flat()).map(m=>{m.elements[12]*=height/100;m.elements[13]*=height/100;m.elements[14]*=height/100;return m;});
}
export function skinAttributes(data){
 const ids=new Uint16Array(data.vertexCount*4),weights=new Float32Array(ids.length),counts=new Uint8Array(data.vertexCount);
 for(let i=0;i<data.skinWeights.length;i++){const v=data.skinVertices[i],slot=v*4+counts[v]++;if(counts[v]>4)throw new Error('Rig exceeds four GPU skin weights');ids[slot]=data.skinJoints[i];weights[slot]=data.skinWeights[i];}
 return {ids,weights};
}
// Recover the pose-corrected unposed surface with the inverse of the *blended*
// skin matrix. Inverting each bone separately is not equivalent and causes drift.
export function unposeSurface(vertices,states,data,attributes,height=1){
 const transforms=matricesFromStates(states),bind=inverseBindMatrices(data,height);transforms.forEach((m,i)=>m.multiply(bind[i]));
 const out=new Float32Array(vertices.length),blend=new Matrix4(),p=new Vector3();let singular=0;
 for(let v=0;v<data.vertexCount;v++){
  blend.elements.fill(0);
  for(let k=0;k<4;k++){const slot=v*4+k,w=attributes.weights[slot];if(!w)continue;const e=transforms[attributes.ids[slot]].elements;for(let j=0;j<16;j++)blend.elements[j]+=w*e[j];}
  if(Math.abs(blend.determinant())<1e-10){singular++;continue;}
  p.fromArray(vertices,v*3).applyMatrix4(blend.invert()).toArray(out,v*3);
 }
 if(singular)throw new Error(`Cannot preview this pose: ${singular} singular skin transforms`);
 return out;
}
export function skinSurface(vertices,states,data,attributes,height=1){
 const transforms=matricesFromStates(states),bind=inverseBindMatrices(data,height);transforms.forEach((m,i)=>m.multiply(bind[i]));
 const out=new Float32Array(vertices.length),p=new Vector3();
 for(let v=0;v<data.vertexCount;v++)for(let k=0;k<4;k++){const slot=v*4+k,w=attributes.weights[slot];if(!w)continue;p.fromArray(vertices,v*3).applyMatrix4(transforms[attributes.ids[slot]]);out[v*3]+=p.x*w;out[v*3+1]+=p.y*w;out[v*3+2]+=p.z*w;}
 return out;
}

// Three's skin-normal shader applies the blended skin matrix directly. Recover
// an input direction which produces the normals of the corrected posed mesh;
// recomputing normals on the inverse-skinned surface gives a different result.
export function unposeNormals(normals,states,data,attributes,height=1){
 const transforms=matricesFromStates(states),bind=inverseBindMatrices(data,height);transforms.forEach((m,i)=>m.multiply(bind[i]));
 const out=new Float32Array(normals.length),blend=new Matrix4(),p=new Vector3();
 for(let v=0;v<data.vertexCount;v++){
  blend.elements.fill(0);
  for(let k=0;k<4;k++){const slot=v*4+k,w=attributes.weights[slot];if(!w)continue;const e=transforms[attributes.ids[slot]].elements;for(let j=0;j<16;j++)blend.elements[j]+=w*e[j];}
  if(Math.abs(blend.determinant())<1e-10)throw new Error('Cannot recover skin normals for a singular pose');
  p.fromArray(normals,v*3).transformDirection(blend.invert()).toArray(out,v*3);
 }
 return out;
}

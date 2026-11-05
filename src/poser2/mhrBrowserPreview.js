import * as THREE from 'three';
import {createBrowserKinematics,inverseBindMatrices,skinAttributes,unposeSurface,unposeNormals} from './mhrBrowserMath.js';
let runtime;
export function loadBrowserRig(){return runtime??=fetch('/experiments/mhr-browser-rig.json').then(r=>{if(!r.ok)throw new Error('Browser rig assets unavailable');return r.json();}).catch(e=>{runtime=null;throw e;});}
export function attachBrowserPreview({data,mesh,bones,setSkeleton,geometry,native}){
 const math=createBrowserKinematics(data),attributes=skinAttributes(data),n=data.vertexCount*3;
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(attributes.ids,4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(attributes.weights,4));
 const skeleton=new THREE.Skeleton(bones,inverseBindMatrices(data));mesh.bind(skeleton,new THREE.Matrix4());
 let states,previewed=false,animation=0,resolveAnimation;
 const cancel=()=>{if(animation)cancelAnimationFrame(animation);animation=0;resolveAnimation?.();resolveAnimation=null;};
 function apply(packet){
  cancel();states=packet.slice(n,n+bones.length*8);skeleton.boneInverses=inverseBindMatrices(data,packet.bodyShape?.height??native.shape.height);
  const rest=unposeSurface(packet.subarray(0,n),states,data,attributes,packet.bodyShape?.height??native.shape.height);
  geometry.attributes.position.array.set(packet.subarray(0,n));geometry.computeVertexNormals();
  const normals=unposeNormals(geometry.attributes.normal.array,states,data,attributes,packet.bodyShape?.height??native.shape.height);
  geometry.attributes.position.array.set(rest);geometry.attributes.normal.array.set(normals);geometry.attributes.normal.needsUpdate=true;previewed=false;
 }
 function capture(base){
  if(!states)return base;const packet=base.slice();packet.bodyShape={...native.shape};
  const v=new THREE.Vector3();for(let i=0;i<data.vertexCount;i++)mesh.getVertexPosition(i,v).toArray(packet,i*3);
  packet.set(states,n);packet.set(native.params,n+states.length);return packet;
 }
 function preview(body){
  cancel();const start=performance.now();
  const params=body.limb?math.solve(body.params,body.limb,native.shape,native.params):body.params.slice();
  states=math.forward(params,native.shape);setSkeleton(states);native.params=params;previewed=true;
  native.metric?.({type:'preview',ms:performance.now()-start});return {params};
 }
 async function settle(packet,invalidate){
  cancel();const before=capture(packet),old=geometry.attributes.position.array.slice(),oldNormals=geometry.attributes.normal.array.slice();
  let squared=0,max=0;for(let i=0;i<n;i+=3){const d=Math.hypot(before[i]-packet[i],before[i+1]-packet[i+1],before[i+2]-packet[i+2]);squared+=d*d;max=Math.max(max,d);}
  native.apply(packet);const target=geometry.attributes.position.array.slice(),targetNormals=geometry.attributes.normal.array.slice();
  native.metric?.({type:'correction',rmsMm:Math.sqrt(squared/data.vertexCount)*1000,maxMm:max*1000});
  if(max<.0001){invalidate();return;}
  const start=performance.now();previewed=true;
  await new Promise(resolve=>{resolveAnimation=resolve;const tick=now=>{const t=Math.min(1,(now-start)/120),ease=t*t*(3-2*t),positions=geometry.attributes.position.array;
   for(let i=0;i<n;i++)positions[i]=old[i]+(target[i]-old[i])*ease;
   for(let i=0;i<n;i++)geometry.attributes.normal.array[i]=oldNormals[i]+(targetNormals[i]-oldNormals[i])*ease;
   geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;invalidate();
   if(t<1)animation=requestAnimationFrame(tick);else{animation=0;previewed=false;resolveAnimation=null;resolve();}
  };tick(start);});
 }
 return {apply,capture,preview,settle,cancel,get active(){return previewed;},dispose(){cancel();skeleton.dispose();}};
}

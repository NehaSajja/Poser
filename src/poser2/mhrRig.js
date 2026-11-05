import * as THREE from 'three';
import { captureRig, updateRigMatrices } from '../poser/libraryPose.js';
import { prepareModelRig } from './modelRig.js';
import { BODY_PRESETS, bodyState } from './bodyShape.js';

const API='/mhr-experiment/api';
let assets;
async function request(path, body, signal){
  const r=await fetch(`${API}/${path}`,{signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  if(!r.ok)throw new Error('Body controls are temporarily unavailable. Please try again.');
  return r;
}
export function loadMhrAssets(){
  assets??=Promise.all([request('flow-meta').then(r=>r.json()),request('topology').then(r=>r.arrayBuffer()).then(b=>new Uint32Array(b))])
    .then(([meta,indices])=>({meta,indices})).catch(e=>{assets=null;throw e;});
  return assets;
}
export function sourceTargets(source){
  updateRigMatrices(source);
  const hips=source.joints.get('Hips').getWorldPosition(new THREE.Vector3());
  const height=(source.mhr?.shape?.height||source.mhrPose?.shape?.height||1)*source.stature*source.joints.get('Hips').getWorldScale(new THREE.Vector3()).x/source.restJoints.get('Hips').scale.x;
  const positions={},orientations={};
  for(const [role,bone] of source.joints){
    positions[role]=bone.getWorldPosition(new THREE.Vector3()).sub(hips).divideScalar(height).toArray();
    orientations[role]=bone.getWorldQuaternion(new THREE.Quaternion()).multiply(source.restJoints.get(role).rotation.clone().invert()).toArray();
  }
  return {source:{positions,orientations},hips,height};
}
export async function createMhrRig(material){
  const {meta,indices}=await loadMhrAssets();
  const root=new THREE.Group(), reverse=new Map(Object.entries(meta.mapping).map(([role,name])=>[name,role]));
  const bones=meta.jointNames.map(name=>{const b=new THREE.Bone();b.name=reverse.has(name)?`mixamorig${reverse.get(name)}`:`mhr_${name}`;return b;});
  bones.forEach((b,i)=>{(meta.parents[i]<0?root:bones[meta.parents[i]]).add(b);});
  function setSkeleton(data){
    const matrices=meta.jointNames.map((_,i)=>new THREE.Matrix4().compose(new THREE.Vector3().fromArray(data,i*8),new THREE.Quaternion().fromArray(data,i*8+3),new THREE.Vector3().setScalar(data[i*8+7])));
    bones.forEach((b,i)=>{const local=matrices[i].clone();if(meta.parents[i]>=0)local.premultiply(matrices[meta.parents[i]].clone().invert());local.decompose(b.position,b.quaternion,b.scale);});
    root.updateMatrixWorld(true);
  }
  setSkeleton(meta.rest.flat());
  const geometry=new THREE.BufferGeometry();geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(meta.vertexCount*3),3));
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);
  const rig=prepareModelRig(captureRig(root),'mhr');
  let packet=null;
  rig.mhr={meta,params:Array(204).fill(0),shape:{silhouette:0,fullness:0,height:1},fitError:null,
    get state(){return bodyState(this.params,this.shape);},
    apply(data){
      const n=meta.vertexCount*3,j=meta.jointNames.length*8;
      if(data.length!==n+j+204||!data.every(Number.isFinite))throw new Error('Invalid MHR surface');
      const nextShape={...(data.bodyShape||this.shape)};
      const changed=packet&&Object.keys(nextShape).some(k=>nextShape[k]!==this.shape[k]);
      const floor=changed?new THREE.Box3().setFromObject(root,true).min.y:null;
      this.shape=nextShape;packet=data.slice();packet.bodyShape={...this.shape};geometry.attributes.position.array.set(data.subarray(0,n));geometry.attributes.position.needsUpdate=true;
      geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
      setSkeleton(data.subarray(n,n+j));this.params=Array.from(data.subarray(n+j));
      if(changed){root.position.y+=floor-new THREE.Box3().setFromObject(root,true).min.y;root.updateMatrixWorld(true);}
    },
    capture(){if(!packet)return null;const copy=packet.slice();copy.bodyShape={...this.shape};return copy;},
    async evaluate(body,signal){const shape={...(body.shape||this.shape)};const response=await request('flow',{...body,shape},signal);const data=new Float32Array(await response.arrayBuffer());data.bodyShape=shape;return data;},
    async fit(source,signal){
      const {source:targets,hips,height}=sourceTargets(source);
      const state=source.mhrPose;
      const shape={...(state?.shape||BODY_PRESETS.feminine)};
      const response=await request('flow',{...(state?{params:state.params}:{source:targets}),shape},signal);
      const data=new Float32Array(await response.arrayBuffer());signal?.throwIfAborted();
      data.bodyShape=shape;this.apply(data);this.fitError=Number(response.headers.get('X-MHR-Fit'));
      if(state){root.position.copy(source.root.position);root.quaternion.copy(source.root.quaternion);root.scale.copy(source.root.scale);}
      else{
        root.position.set(0,0,0);root.quaternion.identity();root.scale.setScalar(height/meta.stature);root.updateMatrixWorld(true);
        root.position.add(hips.sub(rig.joints.get('Hips').getWorldPosition(new THREE.Vector3())));
      }
      updateRigMatrices(rig);
    },
    dispose(){geometry.dispose();},
  };
  return rig;
}

export function createMhrHistory(initial){
  let current=[...initial];const past=[],future=[];
  return {get current(){return [...current];},get canUndo(){return !!past.length;},get canRedo(){return !!future.length;},
    commit(next){if(next.every((v,i)=>Math.abs(v-current[i])<1e-7))return false;past.push(current);if(past.length>100)past.shift();current=[...next];future.length=0;return true;},
    undo(){if(!past.length)return null;future.push(current);current=past.pop();return [...current];},
    redo(){if(!future.length)return null;past.push(current);current=future.pop();return [...current];}};
}

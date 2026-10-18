import * as THREE from 'three';
export type RigAsset={version:number;names:string[];parents:number[];vertexCount:number;faces:number[];indices:number[];weights:number[]};
export type SamMetadata={metadata:{num_people:number;people:{pred_joint_coords:number[][];pred_cam_t:number[];keypoints_2d:number[][]}[];keypoint_names:string[]}};
export type RigPose={rotations:number[][];root:number[]};
export const HANDLES={
  pelvis:{bone:'root',chain:[],label:'Pelvis'},chest:{bone:'c_spine3',chain:['c_spine2','c_spine1','c_spine0'],label:'Chest'},
  head:{bone:'c_head_null',chain:['c_head','c_neck'],label:'Head'},
  l_shoulder:{bone:'l_uparm',chain:['l_clavicle'],label:'Left shoulder'},r_shoulder:{bone:'r_uparm',chain:['r_clavicle'],label:'Right shoulder'},
  l_elbow:{bone:'l_lowarm',chain:['l_uparm'],label:'Left elbow'},r_elbow:{bone:'r_lowarm',chain:['r_uparm'],label:'Right elbow'},
  l_wrist:{bone:'l_wrist',chain:['l_lowarm','l_uparm'],label:'Left wrist'},r_wrist:{bone:'r_wrist',chain:['r_lowarm','r_uparm'],label:'Right wrist'},
  l_hand:{bone:'l_middle1',chain:['l_wrist'],label:'Left hand direction'},r_hand:{bone:'r_middle1',chain:['r_wrist'],label:'Right hand direction'},
  l_knee:{bone:'l_lowleg',chain:['l_upleg'],label:'Left knee'},r_knee:{bone:'r_lowleg',chain:['r_upleg'],label:'Right knee'},
  l_ankle:{bone:'l_foot',chain:['l_lowleg','l_upleg'],label:'Left ankle'},r_ankle:{bone:'r_foot',chain:['r_lowleg','r_upleg'],label:'Right ankle'},
  l_toe:{bone:'l_ball',chain:['l_talocrural','l_foot'],label:'Left foot direction'},r_toe:{bone:'r_ball',chain:['r_talocrural','r_foot'],label:'Right foot direction'},
} as const;
export type HandleId=keyof typeof HANDLES;
export const GUIDE_BONES=[['head','neck'],['neck','chest'],['chest','pelvis'],['chest','l_shoulder'],['chest','r_shoulder'],['l_shoulder','l_elbow'],['l_elbow','l_wrist'],['l_wrist','l_hand'],['r_shoulder','r_elbow'],['r_elbow','r_wrist'],['r_wrist','r_hand'],['pelvis','l_hip'],['pelvis','r_hip'],['l_hip','l_knee'],['l_knee','l_ankle'],['l_ankle','l_toe'],['r_hip','r_knee'],['r_knee','r_ankle'],['r_ankle','r_toe']] as const;
export const POINT_BONES:Record<string,string>={...Object.fromEntries(Object.entries(HANDLES).map(([id,h])=>[id,h.bone])),neck:'c_neck',l_hip:'l_upleg',r_hip:'r_upleg'};
export type PoseFrame={width:number;height:number;points:Record<string,[number,number]>;revision:number;frameMs:number;canUndo:boolean;canRedo:boolean};
export function validateTopology(index:THREE.BufferAttribute|null,vertices:number,asset:RigAsset){
  if(vertices!==asset.vertexCount||!index||index.count!==asset.faces.length)return false;
  for(let i=0;i<index.count;i++)if(index.getX(i)!==asset.faces[i])return false;
  return true;
}
export function attachRig(root:THREE.Group,asset:RigAsset,data:SamMetadata){
  if(data.metadata?.num_people!==1)throw new Error('Live editing currently supports one figure at a time.');
  const person=data.metadata.people[0];if(person.pred_joint_coords?.length!==asset.names.length||!person.pred_cam_t?.every(Number.isFinite))throw new Error('Joint data is unavailable for this model.');
  let original:THREE.Mesh|undefined;root.traverse(o=>{if(o instanceof THREE.Mesh&&!original)original=o;});
  if(!original||!validateTopology(original.geometry.index,original.geometry.attributes.position.count,asset))throw new Error('This mesh does not match the supported MHR rig.');
  const originalMesh:THREE.Mesh=original;
  const camera=person.pred_cam_t;
  const positions=person.pred_joint_coords.map(p=>new THREE.Vector3(p[0]+camera[0],-p[1]-camera[1],-p[2]-camera[2]));
  if(positions.some(p=>!Number.isFinite(p.length())))throw new Error('Invalid joint coordinates.');
  const bones=asset.names.map((name,i)=>{const b=new THREE.Bone();b.name=name;b.position.copy(positions[i]);if(asset.parents[i]>=0)b.position.sub(positions[asset.parents[i]]);return b;});
  const mesh=new THREE.SkinnedMesh(originalMesh.geometry,originalMesh.material);mesh.name='MHR_live_mesh';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  mesh.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(asset.indices,4));mesh.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(asset.weights,4));
  originalMesh.parent!.add(mesh);originalMesh.removeFromParent();
  bones.forEach((b,i)=>{if(asset.parents[i]<0)root.add(b);else bones[asset.parents[i]].add(b);});root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones);mesh.bind(skeleton);mesh.normalizeSkinWeights();
  const named=Object.fromEntries(bones.map(b=>[b.name,b]));
  const world=(name:string)=>named[name].getWorldPosition(new THREE.Vector3());
  const snapshot=():RigPose=>({rotations:bones.map(b=>b.quaternion.toArray()),root:named.root.position.toArray()});
  const restore=(pose:RigPose)=>{if(pose.rotations?.length!==bones.length||pose.rotations.some(q=>q.length!==4||!q.every(Number.isFinite))||pose.root?.length!==3||!pose.root.every(Number.isFinite))return false;bones.forEach((b,i)=>b.quaternion.fromArray(pose.rotations[i]).normalize());named.root.position.fromArray(pose.root);root.updateMatrixWorld(true);return true;};
  const initial=snapshot();
  function aim(boneName:string,endName:string,target:THREE.Vector3){
    const b=named[boneName],origin=world(boneName),from=world(endName).sub(origin),to=target.clone().sub(origin);
    if(from.lengthSq()<1e-10||to.lengthSq()<1e-10)return;
    const delta=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
    const parentQ=b.parent!.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.premultiply(parentQ.clone().invert().multiply(delta).multiply(parentQ));root.updateMatrixWorld(true);
  }
  function move(id:HandleId,target:THREE.Vector3,pole?:THREE.Vector3){
    const handle=HANDLES[id];if(!handle)return;
    if(id==='pelvis'){named.root.position.copy(named.root.parent!.worldToLocal(target.clone()));root.updateMatrixWorld(true);return;}
    // Analytic two-bone solve: preserve lengths and the elbow/knee bend plane.
    if(['l_wrist','r_wrist','l_ankle','r_ankle'].includes(id)){
      const chain=handle.chain as readonly string[],aName=chain[1],bName=chain[0],cName=handle.bone;
      const a=world(aName),b=world(bName),c=world(cName),l1=a.distanceTo(b),l2=b.distanceTo(c);
      let direction=target.clone().sub(a),distance=direction.length();if(distance<1e-6)return;
      direction.normalize();distance=THREE.MathUtils.clamp(distance,Math.abs(l1-l2)+.0001,l1+l2-.0001);
      const end=a.clone().addScaledVector(direction,distance);
      let bend=(pole||b).clone().sub(a);bend.addScaledVector(direction,-bend.dot(direction));
      if(bend.lengthSq()<1e-8){bend.set(0,1,0).addScaledVector(direction,-direction.y);if(bend.lengthSq()<1e-8)bend.set(1,0,0);}
      bend.normalize();const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
      const elbow=a.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
      aim(aName,bName,elbow);aim(bName,cName,end);return;
    }
    for(let step=0;step<5;step++)for(const joint of handle.chain)aim(joint,handle.bone,target);
  }
  return {mesh,skeleton,bones,named,world,snapshot,restore,initial,move};
}
export type LiveRig=ReturnType<typeof attachRig>;

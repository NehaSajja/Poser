import { Vector3 } from 'three';
import { jointPositions } from './skeleton.mjs';

function cameraFromBounds(bounds,basis) {
  const right=new Vector3(...basis.right),up=new Vector3(...basis.up),out=new Vector3().crossVectors(right,up).normalize();
  const target=right.clone().multiplyScalar((bounds.minX+bounds.maxX)/2).addScaledVector(up,(bounds.minY+bounds.maxY)/2).addScaledVector(out,(bounds.minZ+bounds.maxZ)/2);
  const height=Math.max(bounds.maxY-bounds.minY,30)*1.2,width=Math.max(bounds.maxX-bounds.minX,30)*1.2;
  return {projection:'orthographic',position:target.clone().addScaledVector(out,Math.max(height*3,width*3,500)).toArray(),target:target.toArray(),up:up.toArray(),height,width};
}
export function cameraForPose(points,basis) {
  const right=new Vector3(...basis.right),up=new Vector3(...basis.up),out=new Vector3().crossVectors(right,up).normalize();
  const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(const point of points){const p=new Vector3(...point),x=p.dot(right),y=p.dot(up),z=p.dot(out);bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);bounds.minZ=Math.min(bounds.minZ,z);bounds.maxZ=Math.max(bounds.maxZ,z);}
  return cameraFromBounds(bounds,basis);
}
export function cameraForRig(rig,basis) {
  const right=new Vector3(...basis.right),up=new Vector3(...basis.up),out=new Vector3().crossVectors(right,up).normalize();
  const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity},point=new Vector3();
  rig.root.updateMatrixWorld(true);
  rig.root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    if(mesh.isSkinnedMesh)mesh.skeleton.update();
    for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);
      const x=point.dot(right),y=point.dot(up),z=point.dot(out);
      bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);bounds.minZ=Math.min(bounds.minZ,z);bounds.maxZ=Math.max(bounds.maxZ,z);
    }
  });
  if(!Number.isFinite(bounds.minX))return cameraForPose(jointPositions(rig),basis);
  return cameraFromBounds(bounds,basis);
}

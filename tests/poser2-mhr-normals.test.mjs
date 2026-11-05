import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BufferGeometry,BufferAttribute,MeshStandardMaterial,Vector3,Matrix4} from 'three';
import {createMhrRig} from '../src/poser2/mhrRig.js';
import {matricesFromStates,inverseBindMatrices,skinAttributes} from '../src/poser2/mhrBrowserMath.js';
const cases=fs.existsSync('.local/mhr-browser-fixtures/cases.json')?JSON.parse(fs.readFileSync('.local/mhr-browser-fixtures/cases.json')):[];
test('initial corrected mesh normals match the server surface, including deeply bent knees',{skip:!cases.length},async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>new Response(fs.readFileSync(url.endsWith('flow-meta')?'.local/mhr-flow-meta.json':url.endsWith('topology')?'.local/mhr-flow-topology.bin':'public/experiments/mhr-browser-rig.json'));
 const data=JSON.parse(fs.readFileSync('public/experiments/mhr-browser-rig.json')),attrs=skinAttributes(data);
 try{
  const rig=await createMhrRig(new MeshStandardMaterial(),{browserNative:true});let mesh;rig.root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
  const reference=new BufferGeometry();reference.setIndex(mesh.geometry.index.clone());
  for(const c of cases){
   const b=fs.readFileSync(`.local/mhr-browser-fixtures/${c.name}.bin`),packet=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));packet.bodyShape=c.shape;rig.mhr.apply(packet);
   const n=data.vertexCount*3,states=packet.slice(n,n+127*8),transforms=matricesFromStates(states),bind=inverseBindMatrices(data,c.shape.height);transforms.forEach((m,i)=>m.multiply(bind[i]));
   reference.setAttribute('position',new BufferAttribute(packet.slice(0,n),3));reference.computeVertexNormals();
   const actual=new Vector3(),expected=new Vector3(),blend=new Matrix4();let maximum=0;
   for(let v=0;v<data.vertexCount;v++){
    blend.elements.fill(0);for(let k=0;k<4;k++){const s=v*4+k,w=attrs.weights[s],m=transforms[attrs.ids[s]];for(let j=0;j<16;j++)blend.elements[j]+=w*m.elements[j];}
    actual.fromBufferAttribute(mesh.geometry.attributes.normal,v).transformDirection(blend);expected.fromBufferAttribute(reference.attributes.normal,v);
    if(expected.lengthSq()<1e-10)continue;
    maximum=Math.max(maximum,actual.angleTo(expected)*180/Math.PI);
   }
   assert.ok(maximum<.05,`${c.name}: ${maximum} degrees normal error`);
  }
  reference.dispose();rig.mhr.dispose();
 }finally{globalThis.fetch=original;}
});

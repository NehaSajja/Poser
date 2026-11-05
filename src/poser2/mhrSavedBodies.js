const BASE='/experiments/mhr-bodies';
let manifestPromise;
const packets=new Map();
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Saved body assets unavailable');return r.json();}
export function loadBodyManifest(){
 return manifestPromise??=json(`${BASE}/manifest.json`).then(m=>{
  if(m.version!==1||!/^[a-f0-9]{20}$/.test(m.revision)||m.parameterCount!==204||m.packetBytes!==(m.vertexCount*3+m.jointCount*8+204)*4||!m.shape||!m.bodies)throw new Error('Incompatible saved body assets');return m;
 }).catch(e=>{manifestPromise=null;throw e;});
}
export async function loadSavedMhrAssets(){
 const m=await loadBodyManifest(),base=`${BASE}/${m.revision}`;
 const [meta,r]=await Promise.all([json(`${base}/meta.json`),fetch(`${base}/topology.bin`,{signal:AbortSignal.timeout(10000)})]);
 if(!r.ok||meta.protocol!==1||meta.vertexCount!==m.vertexCount||meta.jointNames.length!==m.jointCount)throw new Error('Incompatible saved body rig');
 const bytes=await r.arrayBuffer();if(bytes.byteLength%4)throw new Error('Invalid saved topology');
 const indices=new Uint32Array(bytes);if(!indices.every(i=>i<meta.vertexCount))throw new Error('Invalid saved topology');
 return {meta,indices};
}
export async function loadSavedBody(key,fit,shape,signal){
 const id=/^(\d+)-(?:authored|front)$/.exec(key||'')?.[1];if(!id||!fit)return null;
 try{
  const m=await loadBodyManifest();signal?.throwIfAborted();const entry=m.bodies[id];
  if(!entry||fit.fingerprint!==m.fitFingerprint||!['silhouette','fullness','height'].every(k=>Math.abs(shape[k]-m.shape[k])<1e-6))return null;
  if(!new RegExp(`^${id}-[a-f0-9]{16}\\.bin$`).test(entry.file)||!/^[a-f0-9]{64}$/.test(entry.sha256))return null;
  const url=`${BASE}/${m.revision}/${entry.file}`;
  if(!packets.has(url)){
   packets.set(url,(async()=>{
    const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Saved body unavailable');
    const bytes=await r.arrayBuffer();if(bytes.byteLength!==m.packetBytes)throw new Error('Invalid saved body size');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    if(digest!==entry.sha256)throw new Error('Saved body checksum mismatch');
    const p=new Float32Array(bytes);if(!p.every(Number.isFinite))throw new Error('Invalid saved body');return p;
   })().catch(e=>{packets.delete(url);throw e;}));
   while(packets.size>16)packets.delete(packets.keys().next().value);
  }
  const packet=await packets.get(url);signal?.throwIfAborted();
  const offset=packet.length-204;if(!fit.params.every((v,i)=>Math.abs(v-packet[offset+i])<1e-5))return null;
  const copy=packet.slice();copy.bodyShape={...shape};return copy;
 }catch(e){signal?.throwIfAborted();console.warn('Saved MHR body unavailable; using the correction service.');return null;}
}

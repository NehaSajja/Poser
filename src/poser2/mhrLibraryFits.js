// Only unchanged library skeletons can reuse a fit. Edited sources fall back to
// the fitter; camera changes do not affect the body pose. No credentials needed.
const cached=new Map();
export function matchLibraryFit(entry,source,meta){
 if(entry?.version!==1||!Array.isArray(entry.params)||entry.params.length!==204||!Number.isFinite(entry.meanJointErrorPercent))return null;
 if(!entry.params.every((v,i)=>Number.isFinite(v)&&v>=meta.limits[i][0]-1e-5&&v<=meta.limits[i][1]+1e-5))return null;
 for(const role of Object.keys(meta.mapping)){
  const a=entry.source?.positions?.[role],b=source.positions?.[role],q=entry.source?.orientations?.[role],r=source.orientations?.[role];
  if(a?.length!==3||b?.length!==3||q?.length!==4||r?.length!==4)return null;
  if([...a,...b,...q,...r].some(v=>!Number.isFinite(v)))return null;
  if(a.some((v,i)=>Math.abs(v-b[i])>1e-5))return null;
  // q and -q represent the same rotation.
  const qn=Math.hypot(...q),rn=Math.hypot(...r);if(qn<1e-8||rn<1e-8)return null;
  if(Math.min(Math.hypot(...q.map((v,i)=>v/qn-r[i]/rn)),Math.hypot(...q.map((v,i)=>v/qn+r[i]/rn)))>1e-5)return null;
 }
 return {params:entry.params.slice(),fitError:entry.meanJointErrorPercent,fingerprint:entry.fingerprint};
}
export async function loadLibraryFit(key,source,meta){
 const id=/^(\d+)-(?:authored|front)$/.exec(key||'')?.[1];if(!id)return null;
 if(!cached.has(id))cached.set(id,fetch(`/experiments/mhr-library/${id}.json`,{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok){cached.delete(id);return null;}return r.json();}).catch(()=>{cached.delete(id);return null;}));
 return matchLibraryFit(await cached.get(id),source,meta);
}

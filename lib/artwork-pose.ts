import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {credentials,localData,providerJSON} from './server';
import {parseImage} from './validation';
import {samPose,type PoseGeometry} from './pose-match';
import type {Artwork} from './artwork-types';
const directory=path.join(process.cwd(),'.local','museum-pose-cache');
const shared=globalThis as typeof globalThis&{poserMuseumPose?:Map<string,Promise<DetectedFigure[]>>};
const jobs=shared.poserMuseumPose??=new Map();
export type DetectedFigure={box:number[];geometry:PoseGeometry;person:number};
export async function artworkPeople(art:Artwork,region?:number[]):Promise<DetectedFigure[]>{
  const image=await localData(art.image);const bytes=parseImage(image).bytes;
  const key=art.id+'-'+createHash('sha256').update(bytes).digest('hex').slice(0,16)+(region?'-'+createHash('sha256').update(JSON.stringify(region)).digest('hex').slice(0,8):'');
  if(jobs.has(key))return jobs.get(key)!;
  const job=(async()=>{
    await fs.mkdir(directory,{recursive:true});const resultPath=path.join(directory,key+'.json');const queuePath=path.join(directory,key+'-queue.json');let result;
    try{result=JSON.parse(await fs.readFile(resultPath,'utf8'));}catch{}
    if(!result){const {fal}=await credentials();if(!fal)throw new Error('Connect fal to verify artwork poses.');const headers={'Content-Type':'application/json','Authorization':`Key ${fal}`,'X-Fal-No-Retry':'1'};
      let queued;try{queued=JSON.parse(await fs.readFile(queuePath,'utf8'));}catch{}
      if(!queued){let mask_url:string|undefined;
        if(region){const m=await sharp(bytes).metadata();const w=m.width!,h=m.height!;const svg=Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="black"/><rect x="${region[0]*w}" y="${region[1]*h}" width="${(region[2]-region[0])*w}" height="${(region[3]-region[1])*h}" fill="white"/></svg>`);mask_url='data:image/png;base64,'+(await sharp(svg).png().toBuffer()).toString('base64');}
        queued=await providerJSON('https://queue.fal.run/fal-ai/sam-3/3d-body',{method:'POST',headers,body:JSON.stringify({image_url:image,...(mask_url?{mask_url}:{}),export_meshes:false,include_3d_keypoints:false,include_mhr_params:false})},'SAM artwork pose detection');
        await fs.writeFile(queuePath,JSON.stringify(queued));}
      for(const u of [queued.status_url,queued.response_url])if(typeof u!=='string'||new URL(u).origin!=='https://queue.fal.run')throw new Error('Unexpected pose provider URL.');
      const deadline=Date.now()+120000;
      while(Date.now()<deadline){const state=await providerJSON(queued.status_url,{headers},'SAM artwork pose detection');if(state.status==='COMPLETED'){if(state.error)throw new Error('This artwork could not be posed.');result=await providerJSON(queued.response_url,{headers},'SAM artwork pose detection');await fs.writeFile(resultPath,JSON.stringify(result));break;}if(state.status==='FAILED')throw new Error('This artwork could not be posed.');await new Promise(resolve=>setTimeout(resolve,600));}
      if(!result)throw new Error('Artwork pose detection is still pending. Its request is saved and will be resumed without another charge.');
    }
    const size=await sharp(bytes).metadata(),w=size.width!,h=size.height!;const metadata=result.metadata;
    if(!Array.isArray(metadata?.keypoint_names)||!Array.isArray(metadata?.people))return [];
    return metadata.people.slice(0,30).flatMap((person:{person_id:number;bbox:number[];keypoints_2d:number[][]})=>{
      if(!Array.isArray(person.bbox)||person.bbox.length!==4||!person.bbox.every(Number.isFinite)||!Array.isArray(person.keypoints_2d))return [];
      const box=person.bbox.map((n,i)=>Math.max(0,Math.min(1,n/(i%2===0?w:h))));if(box[2]<=box[0]||box[3]<=box[1])return [];
      const geometry=samPose({...metadata,people:[person]},w,h);
      // SAM infers occluded joints; the visual audit below determines which estimates have visible support.
      for(const p of Object.values(geometry.joints))p[2]=.6;
      return [{box,geometry,person:person.person_id}];
    });
  })().finally(()=>jobs.delete(key));jobs.set(key,job);return job;
}

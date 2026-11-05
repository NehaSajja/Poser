// Export precisely the same source skeletons used by the carousel. No AI calls.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {captureRig,applyLibraryPose} from '../../src/poser/libraryPose.js';
import {prepareModelRig,snapshotModelRig} from '../../src/poser2/modelRig.js';
import {sourceTargets} from '../../src/poser2/mhrRig.js';
import {getAssetPath} from '../../server/pose-library/skeleton.mjs';
import {loadRetrievalPreview} from '../../server/pose-retrieval/preview.mjs';
globalThis.ProgressEvent ??= class {constructor(type,data){Object.assign(this,data);}};
const catalog=JSON.parse(await fs.readFile('data/cloud-retrieval/catalog.json','utf8')),rigs=new Map(),rows=[];
for(const pose of catalog){
 if(!rigs.has(pose.model)){const b=await fs.readFile(getAssetPath(pose.model));rigs.set(pose.model,prepareModelRig(captureRig(new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')),pose.model));}
 const preview=await loadRetrievalPreview({pose,view:'authored'}),rig=rigs.get(pose.model);applyLibraryPose(rig,preview.model);
 const source=sourceTargets(snapshotModelRig(rig)).source;
 rows.push({id:String(pose.id),name:pose.name,source,sourceHash:createHash('sha256').update(JSON.stringify(source)).digest('hex')});
}
await fs.mkdir('.local',{recursive:true});await fs.writeFile('.local/mhr-library-targets.json',JSON.stringify(rows));console.log(`Exported ${rows.length} source poses.`);

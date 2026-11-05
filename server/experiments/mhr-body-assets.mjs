import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
// Finished bodies are ordinary public files. This route never starts or calls MHR.
export function createMhrBodyAssets(directory){
 return async(req,res,path)=>{
  if(!path.startsWith('/experiments/mhr-bodies/'))return false;
  const match=/^\/experiments\/mhr-bodies\/(manifest\.json|([a-f0-9]{20})\/(meta\.json|topology\.bin|\d+-[a-f0-9]{16}\.bin))$/.exec(path);
  if(!match||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return true;}
  try{
   const packet=/\d+-[a-f0-9]{16}\.bin$/.test(match[1]);
   const file=resolve(directory,match[1]+(packet?'.gz':''));let bytes=await readFile(file);
   const headers={'Content-Type':path.endsWith('.json')?'application/json':'application/octet-stream','Cache-Control':match[2]?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff'};
   if(packet){headers.Vary='Accept-Encoding';if(/\bgzip\b/.test(req.headers['accept-encoding']||''))headers['Content-Encoding']='gzip';else bytes=gunzipSync(bytes);}
   if(match[2]){headers.ETag=`W/"${match[2]}-${match[3]}"`;if(req.headers['if-none-match']===headers.ETag){res.writeHead(304,headers);res.end();return true;}}
   headers['Content-Length']=bytes.length;res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404,{'Cache-Control':'no-store'});res.end();}
  return true;
 };
}

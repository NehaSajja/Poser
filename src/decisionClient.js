import {emptyOutline} from './candidates.js';
export class DecisionClient {
 constructor(fetcher=fetch,imageFor=()=>{throw new Error('Image renderer required');},sceneFor=()=>undefined){this.fetcher=(...args)=>fetcher(...args);this.imageFor=imageFor;this.sceneFor=sceneFor;this.requests=new Map();}
 request(element,context,candidates,elements=[]){
  // Context and candidate membership matter even when the target ink is unchanged.
  const key=JSON.stringify([element.id,element.revision,context,candidates?.map(c=>c.members),elements.map(e=>[e.id,e.revision,e.x,e.y,e.w,e.h])]);
  if(this.requests.has(key))return this.requests.get(key).promise;
  const controller=new AbortController();
  const payload={image:this.imageFor(element),sceneImage:this.sceneFor(element,elements),strokeBounds:{w:element.w,h:element.h},strokeCount:element.strokes.length,hasOutline:element.outline,context,
   candidates:candidates?.map((c,i)=>({id:i,emptyOutline:emptyOutline(c),image:this.imageFor(c.element,c.strokes,`Candidate ${i}`),strokeCount:c.strokes.length,strokeBounds:{w:c.element.w,h:c.element.h},memberCount:c.members.length}))};
  const promise=this.fetcher('/api/recognize',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(payload)})
   .then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Recognition failed.');return result;})
   .catch(error=>{this.requests.delete(key);throw error;});
  this.requests.set(key,{controller,promise});
  if(this.requests.size>200)this.requests.delete(this.requests.keys().next().value);
  return promise;
 }
 clear(){for(const {controller} of this.requests.values())controller.abort();this.requests.clear();}
}

import type {PoseComparison,PoseGeometry} from "./pose-match";
export type Artwork={id:string;title:string;artist:string;date:string;medium:string;source:"The Met"|"Art Institute of Chicago"|"Cleveland Museum of Art";sourceUrl:string;image:string;credit:string;score?:number;reason?:string;figure?:string;box?:number[];crop?:string;evidence?:PoseComparison&{geometry:PoseGeometry;viewScore:number;similarities:string[];differences:string[];reliability:string;verified:boolean}};
export type ArtworkSearch={version?:number;key?:string;referenceImage?:string;referencePose?:PoseGeometry;status:"searching"|"ranking"|"verifying"|"complete"|"error";matches:Artwork[];queries:string[];pose?:string;examined:number;candidates:number;sources:string[];warnings:string[];error?:string;durationMs?:number;startedAt:string};
/** Treat VLM output as untrusted: it may rank only records actually downloaded. */
export function rankedArtworks(raw:unknown,candidates:Artwork[]):Artwork[]{
  if(!Array.isArray(raw))return [];
  const allowed=new Map(candidates.map(a=>[a.id,a]));const seen=new Set<string>();const matches:Artwork[]=[];
  for(const row of raw){if(!row||typeof row!=="object")continue;const r=row as Record<string,unknown>;const a=allowed.get(String(r.id));if(!a||seen.has(a.id)||r.hasFigure!==true||typeof r.score!=="number"||!Number.isFinite(r.score)||r.score<0||r.score>100)continue;seen.add(a.id);
    const box=Array.isArray(r.box)&&r.box.length===4&&r.box.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1)&&r.box[2]>r.box[0]&&r.box[3]>r.box[1]?r.box as number[]:undefined;
    matches.push({...a,score:Math.round(r.score),reason:typeof r.reason==="string"?r.reason.slice(0,500):"",figure:typeof r.figure==="string"?r.figure.slice(0,300):"",box});}
  return matches.filter(a=>a.score!>=25).sort((a,b)=>b.score!-a.score!);
}
export function museumImageUrl(value:string){const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port||!["images.metmuseum.org","www.artic.edu","openaccess-cdn.clevelandart.org"].includes(url.hostname))throw new Error("Unsupported museum image host.");return url.toString();}

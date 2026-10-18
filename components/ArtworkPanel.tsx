"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ArtworkSearch} from '@/lib/artwork-types';
import {POSE_SEGMENTS,type PoseGeometry} from '@/lib/pose-match';
import Icon from './Icon';
type Input={image?:string;pose?:PoseGeometry};
function Skeleton({pose}:{pose?:PoseGeometry}){if(!pose)return null;return <svg className="evidence-skeleton" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{POSE_SEGMENTS.map(([a,b])=>{const p=pose.joints[a],q=pose.joints[b];return p&&q&&Math.min(p[2],q[2])>=.35?<line key={a+b} x1={p[0]*100} y1={p[1]*100} x2={q[0]*100} y2={q[1]*100}/>:null;})}{Object.entries(pose.joints).filter(([,p])=>p[2]>=.35).map(([id,p])=><circle key={id} cx={p[0]*100} cy={p[1]*100} r="1.1"/>)}</svg>;}
export default function ArtworkPanel({runId,input={}}:{runId:string;input?:Input}){
  const [result,setResult]=useState<ArtworkSearch|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[index,setIndex]=useState(0),[details,setDetails]=useState(false),[crop,setCrop]=useState(false),[skeleton,setSkeleton]=useState(false),[view,setView]=useState({scale:1,x:0,y:0});
  const drag=useRef<{id:number;x:number;y:number;ox:number;oy:number}|null>(null);const inputRef=useRef(input);inputRef.current=input;
  useEffect(()=>{let alive=true;let timer:ReturnType<typeof setInterval>|undefined;
    setError('');setResult(null);setIndex(0);
    void(async()=>{try{const payload=inputRef.current;const digest=payload.image?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload.image)))).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16):'base';
      const read=async()=>{const r=await fetch(`/api/runs/${runId}/artworks?key=${digest}`,{cache:'no-store'});if(!r.ok)throw new Error('The museum search could not be opened.');return r.json() as Promise<ArtworkSearch|null>;};
      const cached=await read();if(!alive)return;if(cached?.status==='complete'&&cached.version===5){setResult(cached);return;}
      timer=setInterval(()=>void read().then(data=>{if(alive&&data&&data.version===5){setResult(data);if(data.status==='complete'||data.status==='error')clearInterval(timer);}}).catch(()=>{}),1500);
      const r=await fetch(`/api/runs/${runId}/artworks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Museum search failed.');if(alive){setResult(data);clearInterval(timer);}
    }catch(e){if(alive){setError(e instanceof Error?e.message:'Museum search failed.');clearInterval(timer);}}})();return()=>{alive=false;clearInterval(timer);};
  },[runId,attempt]);
  const artworks=result?.matches||[],art=artworks[index];
  const go=useCallback((n:number)=>{setIndex(i=>Math.max(0,Math.min(artworks.length-1,i+n)));setView({scale:1,x:0,y:0});setDetails(false);},[artworks.length]);
  const loading=!error&&result?.status!=='complete'&&result?.status!=='error';
  if(loading)return <div className="art-status" role="status"><span className="spinner"/><span>{result?.status==='verifying'?'Checking the individual figures':result?.status==='ranking'?`Comparing ${Math.min(result.candidates,30)} artworks`:'Finding historical precedents'}</span></div>;
  if(error||result?.status==='error')return <div className="art-status" role="alert"><p>{error||result?.error}</p><button className="secondary" onClick={()=>setAttempt(v=>v+1)}>Try again</button></div>;
  if(!art)return <div className="art-status"><p>No sufficiently visible pose matches in the {result?.examined||0} artworks checked.</p><p>Try another pose or viewing angle.</p></div>;
  const evidence=art.evidence;
  return <div className="art-browser evidence-browser" tabIndex={0} aria-label="Historical pose references" onKeyDown={e=>{if((e.target as HTMLElement).closest('button'))return;if(e.key==='ArrowRight'){e.preventDefault();go(1);}if(e.key==='ArrowLeft'){e.preventDefault();go(-1);}}}>
    <button className="art-score" title="Pose similarity combines joint directions, visible evidence and viewing angle. It is not a probability or calibrated confidence." onClick={()=>setDetails(v=>!v)} aria-label={`Pose similarity ${art.score} out of 100. Show match explanation.`}>{art.score}<span>/100 · {art.score!>=75?'close':art.score!>=50?'partial':'loose'}{evidence?.mirrored?' · mirrored':''}</span></button>
    <div className={`art-stage ${details?'show-details':''}`} onWheel={e=>setView(v=>({...v,scale:Math.max(1,Math.min(4,v.scale-e.deltaY*.002))}))}
      onPointerDown={e=>{if((e.target as HTMLElement).closest('button,a'))return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,ox:view.x,oy:view.y};}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;if(view.scale>1)setView(v=>({...v,x:d.ox+e.clientX-d.x,y:d.oy+e.clientY-d.y}));}}
      onPointerUp={e=>{const d=drag.current;if(d&&view.scale===1&&Math.abs(e.clientX-d.x)>65)go(e.clientX<d.x?1:-1);drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
      <div className="art-image-frame" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}>
        <img src={crop&&art.crop?art.crop:art.image} alt={`${crop?'Matching figure in ':''}${art.title} — ${art.artist}`} draggable={false}/>
        {!crop&&art.box&&<span className="figure-box" style={{left:`${art.box[0]*100}%`,top:`${art.box[1]*100}%`,width:`${(art.box[2]-art.box[0])*100}%`,height:`${(art.box[3]-art.box[1])*100}%`}}/>}
        {crop&&skeleton&&<Skeleton pose={evidence?.geometry}/>}
      </div>
      <div className="art-metadata"><h3>{art.title}</h3><p>{art.artist} · {art.date}</p>{art.medium&&<p>{art.medium}</p>}<p>{art.figure}</p><a href={art.sourceUrl} target="_blank" rel="noreferrer">{art.source}<Icon name="external" size={12}/></a><small>Public domain{art.credit?` · ${art.credit}`:''}</small>{!!result?.warnings.length&&<small>{result.warnings.join(' ')}</small>}</div>
    </div>
    <div className="match-evidence" aria-label="Why this figure matched">
      <button className="comparison-thumb" aria-label="Show estimated joint comparison" aria-pressed={skeleton} title="Toggle located joints" onClick={()=>setSkeleton(v=>!v)}><span className="comparison-image"><span className="comparison-fit"><img src={result?.referenceImage} alt="Your current pose"/>{skeleton&&<Skeleton pose={result?.referencePose}/>}</span></span><span>Your pose</span></button>
      <button className="comparison-thumb" aria-label="Focus matching figure" aria-pressed={crop} title="Switch between matching figure and full artwork" onClick={()=>{setCrop(v=>!v);setView({scale:1,x:0,y:0});}}><span className="comparison-image"><span className="comparison-fit"><img src={art.crop||art.image} alt="Matched figure crop"/>{skeleton&&<Skeleton pose={evidence?.geometry}/>}</span></span><span>Matched figure</span></button>
      <div className="match-breakdown">{evidence&&<div className="match-bars">{Object.entries({...evidence.parts,view:evidence.viewScore}).map(([part,score])=><div key={part} title={score===null?'Not enough visible joints':`${part}: ${score}/100`}><span>{part}</span><i><b style={{width:`${score||0}%`}}/></i><span>{score??'—'}</span></div>)}</div>}<p className="match-agrees">{evidence?.similarities[0]||art.reason}</p>{evidence?.differences[0]&&<p className="match-differs">{evidence.differences[0]}</p>}{evidence&&<small title="Only visible, sufficiently certain joint pairs count. A missing limb reduces the overall score.">{evidence.compared}/{evidence.total} joint pairs · {evidence.reliability} visibility</small>}</div>
    </div>
    <div className="art-navigation"><button className="icon-button prev" aria-label="Previous artwork" disabled={index===0} onClick={()=>go(-1)}><Icon name="chevron"/></button><span>{index+1} / {artworks.length}</span><button className="icon-button" aria-label="Next artwork" disabled={index===artworks.length-1} onClick={()=>go(1)}><Icon name="chevron"/></button></div>
    <div className="art-actions"><button className="icon-button" aria-label="Artwork metadata" aria-expanded={details} title="Artwork details" onClick={()=>setDetails(v=>!v)}><Icon name="info"/></button><button className="icon-button" aria-label="Locate matching figure" aria-pressed={crop} title="Focus the matching figure" onClick={()=>{setCrop(v=>!v);setView({scale:1,x:0,y:0});}}><Icon name="focus"/></button><button className="icon-button" aria-label="Show pose landmarks" aria-pressed={skeleton} title="Show estimated joints" onClick={()=>setSkeleton(v=>!v)}><Icon name="pose"/></button><button className="icon-button" aria-label="Reset artwork view" title="Reset artwork view" onClick={()=>setView({scale:1,x:0,y:0})}><Icon name="reset"/></button></div>
  </div>;
}

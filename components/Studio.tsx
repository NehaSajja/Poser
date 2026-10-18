"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import DrawingCanvas, {type CanvasHandle, type Tool} from "./DrawingCanvas";
import type {ViewerHandle} from "./ModelViewer";
import Icon from "./Icon";
import PoseOverlay from "./PoseOverlay";
import LivePoseCanvas from "./LivePoseCanvas";
import {POSE_KEYS,type PoseGeometry,type PoseJoints} from "@/lib/pose-match";
import type {PoseFrame} from "@/lib/rig";
import ArtworkPanel from "./ArtworkPanel";
import { DEFAULT_SETTINGS, IMAGE_MODELS, type Settings, type Run, type Recipe, type Stage, type Connections } from "@/lib/defaults";

const ModelViewer=dynamic(()=>import("./ModelViewer"),{ssr:false,loading:()=> <div className="viewer-message">Opening viewer…</div>});
const recipeNames:Record<Recipe,string>={fast:"Fast pose → image → 3D",guided:"Sketch + interpretation → image → 3D",image:"Sketch → image → 3D",direct:"Sketch → 3D"};
const stageNames:Record<Stage,string>={interpret:"Reading pose",image:"Creating reference image",model:"Building 3D reference"};

async function api<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch(url,body===undefined?{cache:"no-store"}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"This request could not be completed.");return result;
}
async function asDataURL(url:string){if(url.startsWith("data:"))return url;const response=await fetch(url);if(!response.ok)throw new Error("The image could not be loaded.");return blobData(await response.blob());}
function blobData(file:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("This image could not be read."));reader.readAsDataURL(file);});}
async function imageFile(file:File){
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Choose a PNG, JPEG, or WebP image.");
  if(file.size>10_000_000)throw new Error("Choose an image smaller than 10 MB.");
  return blobData(file);
}
function download(url:string,name:string){const a=document.createElement("a");a.href=url;a.download=name;a.click();}

export default function Studio(){
  const canvas=useRef<CanvasHandle>(null);const viewer=useRef<ViewerHandle>(null);
  const sketchInput=useRef<HTMLInputElement>(null);const referenceInput=useRef<HTMLInputElement>(null);const imageInput=useRef<HTMLInputElement>(null);
  const [tool,setTool]=useState<Tool>("pen");const [hasDrawing,setHasDrawing]=useState(false);const [undo,setUndo]=useState(false);const [redo,setRedo]=useState(false);const [zoom,setZoom]=useState(100);
  const [reference,setReference]=useState("/body-reference.png");const [settings,setSettings]=useState<Settings>(DEFAULT_SETTINGS);
  const [recipe,setRecipe]=useState<Recipe>("fast");const [pause,setPause]=useState(false);
  const [drawer,setDrawer]=useState<"inspect"|"history"|"connections"|null>(null);
  const [connections,setConnections]=useState<Connections>({gemini:false,fal:false});
  const [run,setRun]=useState<Run|null>(null);const runRef=useRef<Run|null>(null);runRef.current=run;
  const [runs,setRuns]=useState<Run[]>([]);const [description,setDescription]=useState("");const [dirty,setDirty]=useState(false);
  const [displayModel,setDisplayModel]=useState<string|null>(null);const [displayImage,setDisplayImage]=useState<string|null>(null);
  const [lightingOpen,setLightingOpen]=useState(false);
  const [live,setLive]=useState(false);const liveRef=useRef(false);liveRef.current=live;
  const [poseFrame,setPoseFrame]=useState<PoseFrame|null>(null);const [poseEdited,setPoseEdited]=useState(false);const [rigError,setRigError]=useState('');
  const poseChanged=useCallback(()=>setPoseEdited(true),[]);
  const poseFramed=useCallback((frame:PoseFrame)=>setPoseFrame(frame),[]);
  const rigFailed=useCallback((message:string)=>setRigError(message),[]);
  useEffect(()=>{setPoseEdited(false);setRigError('');setPoseFrame(null);setHasRig(false);},[displayModel]);
  const [sketchDirty,setSketchDirty]=useState(false);
  const [annotation,setAnnotation]=useState<string|null>(null);
  const annotationRef=useRef<string|null>(null);annotationRef.current=annotation;
  const [displayRun,setDisplayRun]=useState<Run|null>(null);
  const [artRun,setArtRun]=useState<string|null>(null);
  const [artInput,setArtInput]=useState<{image?:string;pose?:PoseGeometry}>({});const [artRevision,setArtRevision]=useState(0);
  const [tab,setTab]=useState<"model"|"image"|"art">("model");const [hasRig,setHasRig]=useState(false);
  const [busy,setBusy]=useState<Stage|"preparing"|null>(null);const [elapsed,setElapsed]=useState(0);const busyRef=useRef(false);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const [geminiKey,setGeminiKey]=useState("");const [falKey,setFalKey]=useState("");const [saving,setSaving]=useState(false);
  const [loaded,setLoaded]=useState(false);

  const refreshRuns=useCallback(async()=>{setRuns(await api<Run[]>("/api/runs"));},[]);
  useEffect(()=>{
    void api<Connections>("/api/connections").then(setConnections).catch(()=>setError("The local server is not responding."));
    void refreshRuns().catch(()=>{});
    try{
      const s=localStorage.getItem("poser-settings");if(s){const saved=JSON.parse(s);setSettings({...DEFAULT_SETTINGS,...saved,...(!localStorage.getItem("poser-v2-fast-2")?{imageModel:DEFAULT_SETTINGS.imageModel,geminiModel:DEFAULT_SETTINGS.geminiModel}:{})});}
      localStorage.setItem("poser-v2-fast-2","1");
      const r=localStorage.getItem("poser-reference");if(r!==null)setReference(r);
      const activeId=localStorage.getItem("poser-active-run");
      const wasDirty=localStorage.getItem("poser-dirty")==="true";
      if(activeId)void api<Run>(`/api/runs/${activeId}`).then(saved=>{
        setRun(saved);setDescription(saved.description);setDirty(wasDirty);setSketchDirty(localStorage.getItem("poser-sketch-dirty")==="true");
        if(saved.generatedImage)setDisplayImage(saved.generatedImage);
        if(saved.model){setDisplayModel(saved.model);setDisplayRun(saved);setTab("model");}else{const goodId=localStorage.getItem("poser-display-run");if(goodId)void api<Run>(`/api/runs/${goodId}`).then(good=>{if(good.model){setDisplayModel(good.model);setDisplayRun(good);setDisplayImage(saved.generatedImage||good.generatedImage||null);}}).catch(()=>{});}
        if(saved.error)setError(saved.error);
      }).catch(()=>{});
    }catch{}
    setLoaded(true);
  },[refreshRuns]);
  useEffect(()=>{if(loaded)try{localStorage.setItem("poser-settings",JSON.stringify(settings));}catch{}},[settings,loaded]);
  useEffect(()=>{if(loaded)try{localStorage.setItem("poser-reference",reference);}catch{}},[reference,loaded]);
  useEffect(()=>{if(loaded&&run)try{localStorage.setItem("poser-dirty",String(dirty));localStorage.setItem("poser-sketch-dirty",String(sketchDirty));}catch{}},[dirty,sketchDirty,loaded,run]);
  useEffect(()=>{if(!busy){setElapsed(0);return;}const start=Date.now();const t=setInterval(()=>setElapsed(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(t);},[!!busy]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),5000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.key==="Escape")setDrawer(null);
      if((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")||busyRef.current||annotationRef.current)return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();if(liveRef.current){if(e.shiftKey)viewer.current?.redoPose();else viewer.current?.undoPose();}else if(e.shiftKey)canvas.current?.redo();else canvas.current?.undo();}
      else if(e.key.toLowerCase()==="b")setTool("pen");else if(e.key.toLowerCase()==="e")setTool("eraser");else if(e.key.toLowerCase()==="h")setTool("hand");
    };
    const paste=(e:ClipboardEvent)=>{if((e.target as HTMLElement).closest("input,textarea")||busyRef.current||annotationRef.current)return;const file=Array.from(e.clipboardData?.files||[]).find(f=>f.type.startsWith("image/"));if(file){e.preventDefault();void imageFile(file).then(url=>canvas.current?.load(url)).catch(e=>setError(e.message));}};
    window.addEventListener("keydown",key);window.addEventListener("paste",paste);return()=>{window.removeEventListener("keydown",key);window.removeEventListener("paste",paste);};
  },[]);
  const drawingChanged=useCallback((has:boolean,edited=true)=>{setHasDrawing(has);if(edited&&runRef.current){setDirty(true);setSketchDirty(true);}},[]);
  const historyChanged=useCallback((u:boolean,r:boolean)=>{setUndo(u);setRedo(r);},[]);
  const rigChanged=useCallback((rig:boolean)=>setHasRig(rig),[]);
  const updateSetting=<K extends keyof Settings>(key:K,value:Settings[K])=>{setSettings(s=>({...s,[key]:value}));if(run)setDirty(true);};
  const showError=(e:unknown)=>setError(e instanceof Error?e.message:"Something went wrong.");
  async function applyRun(next:Run){
    try{localStorage.setItem("poser-active-run",next.id);}catch{}
    setRun(next);setDescription(next.description);setReference(next.reference||"");setAnnotation(null);setLive(false);
    if(next.model){setDisplayModel(next.model);setDisplayRun(next);try{localStorage.setItem("poser-display-run",next.id);}catch{}setTab("model");}else{setDisplayModel(null);setDisplayRun(null);setTab(next.generatedImage?"image":"model");}
    setDisplayImage(next.generatedImage||null);setError(next.error||"");
    await canvas.current?.load(next.sketch);setDirty(false);setSketchDirty(false);setDrawer("inspect");
  }
  function acceptRun(next:Run){try{localStorage.setItem("poser-active-run",next.id);}catch{}setRun(next);if(next.description)setDescription(next.description);if(next.generatedImage)setDisplayImage(next.generatedImage);if(next.model){setDisplayModel(next.model);setDisplayRun(next);try{localStorage.setItem("poser-display-run",next.id);}catch{}setTab("model");}setDirty(false);}
  async function execute(current:Run,stage:Stage){setBusy(stage);const next=await api<Run>(`/api/runs/${current.id}/stage`,{stage});acceptRun(next);return next;}
  async function build(start:"all"|"image"|"model"="all",uploadedImage?:string,overlay?:{marked:string;instruction:string}){
    if(busyRef.current)return;
    setError("");
    const sketch=canvas.current?.export();if(!sketch){setError("Draw a pose or load the sample first.");return;}
    const requiredGemini=!!overlay||(start==="all"&&(recipe==="guided"||recipe==="fast"))||(start!=="model"&&recipe!=="direct"&&settings.imageModel.startsWith("gemini-"));
    if((requiredGemini&&!connections.gemini)||!connections.fal){setDrawer("connections");setNotice("Connect the models to start a live experiment.");return;}
    if(start==="model"&&!uploadedImage&&!displayImage&&recipe!=="direct"){setError("Create or upload a reference image first.");return;}
    if(start==="model"&&dirty&&!uploadedImage&&recipe!=="direct"){setError("The inputs have changed. Rerun the image step before rebuilding 3D.");return;}
    busyRef.current=true;setBusy("preparing");let current:Run|null=null;
    const editParent=displayRun?.generatedImage?displayRun:null;
    const edit=overlay&&annotation?{mode:"overlay",clean:annotation,marked:overlay.marked,instruction:overlay.instruction}:start==="all"&&sketchDirty&&editParent?{mode:"sketch"}:undefined;
    try{
      const workRecipe=edit?.mode==="sketch"?"fast":edit?"image":recipe;
      const body=reference?await asDataURL(reference):undefined;
      const existingImage=start==="model"?(uploadedImage||(displayImage?await asDataURL(displayImage):undefined)):undefined;
      current=await api<Run>("/api/runs",{sketch:overlay&&editParent&&!sketchDirty?await asDataURL(editParent.sketch):sketch,reference:body,settings,recipe:workRecipe,description:start!=="all"?description:"",image:existingImage,parentId:edit?editParent?.id:run?.id,edit});
      acceptRun(current);
      if(start==="all"&&(workRecipe==="guided"||workRecipe==="fast")&&edit?.mode!=="overlay"){
        current=await execute(current,"interpret");
        if(pause&&recipe==="guided"){setDrawer("inspect");setNotice("Pose read. Edit the description, then continue to the image.");return;}
      }
      if(start!=="model"&&workRecipe!=="direct"){current=await execute(current,"image");setTab("image");}
      current=await execute(current,"model");
      setAnnotation(null);setSketchDirty(false);
    }catch(e){showError(e);if(current){try{setRun(await api<Run>(`/api/runs/${current.id}`));}catch{}}}
    finally{setBusy(null);busyRef.current=false;void refreshRuns();}
  }
  async function readOnly(){
    if(busyRef.current)return;const sketch=canvas.current?.export();if(!sketch){setError("Draw a pose first.");return;}
    if(!connections.gemini){setDrawer("connections");return;}
    busyRef.current=true;setBusy("preparing");setError("");let current:Run|null=null;
    try{current=await api<Run>("/api/runs",{sketch,reference:reference?await asDataURL(reference):undefined,settings,recipe:"guided",parentId:run?.id});acceptRun(current);await execute(current,"interpret");setDrawer("inspect");}
    catch(e){showError(e);if(current)try{setRun(await api<Run>(`/api/runs/${current.id}`));}catch{}}
    finally{setBusy(null);busyRef.current=false;void refreshRuns();}
  }
  async function saveKeys(){setSaving(true);setError("");try{const next=await api<Connections>("/api/connections",{gemini:geminiKey,fal:falKey});setConnections(next);setGeminiKey("");setFalKey("");setNotice("Connections saved on this computer. They will be checked on the first run.");setDrawer(null);}catch(e){showError(e);}finally{setSaving(false);}}
  async function chooseFile(event:React.ChangeEvent<HTMLInputElement>,kind:"sketch"|"reference"|"image"){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    try{const data=await imageFile(file);setLive(false);if(kind==="sketch")await canvas.current?.load(data);else if(kind==="reference"){setReference(data);if(run)setDirty(true);}else{setDisplayImage(data);setTab("image");setNotice("Reference image loaded. Use Build 3D from this image in Inspect steps.");setDirty(false);}}catch(e){showError(e);}
  }
  function openArt(){
    if(!displayRun)return;
    const frame=viewer.current?.getFrame(),image=viewer.current?.capture();
    if(poseEdited&&frame&&image){const joints:PoseJoints={};for(const name of POSE_KEYS){const p=frame.points[name];if(p&&p.every(n=>n>=0&&n<=1))joints[name]=[p[0],p[1],1];}
      if(Object.keys(joints).length<12){setError('Frame the whole figure before comparing it with artworks.');return;}setArtInput({image,pose:{joints,aspect:frame.width/frame.height}});
    }else setArtInput({});
    setArtRevision(v=>v+1);setArtRun(displayRun.id);setTab('art');
  }
  const connected=connections.gemini&&connections.fal;
  const stages:Stage[]=recipe==="direct"?["model"]:recipe==="image"?["image","model"]:["interpret","image","model"];
  const stale=dirty||!!(displayModel&&run&&!run.model)||!!(displayImage&&run&&!run.generatedImage);
  return <main className="studio">
    <header className="topbar">
      <div className="brand"><span>Poser 2.0</span></div>
      <nav aria-label="Workspace controls">
        <button className={`icon-button connection-button ${connected?"connected":""}`} aria-label={connected?"Models connected":"Connect models"} title={connected?"Models connected":"Connect models"} onClick={()=>setDrawer(drawer==="connections"?null:"connections")}><Icon name="link"/></button>
        <button className="icon-button" title="Experiment history" aria-label="Experiment history" onClick={()=>{void refreshRuns();setDrawer(drawer==="history"?null:"history");}}><Icon name="history"/></button>
        <button className={`icon-button inspect-button ${drawer==="inspect"?"selected":""}`} aria-label="Inspect steps" title="Inspect steps" onClick={()=>setDrawer(drawer==="inspect"?null:"inspect")}><Icon name="settings"/></button>
      </nav>
    </header>
    <div className="workspace">
      <section className="drawing-panel" aria-label="Drawing workspace">
        <div className="panel-top"><button className="icon-button" aria-label="Upload sketch" title="Upload sketch" disabled={!!busy||!!annotation} onClick={()=>sketchInput.current?.click()}><Icon name="upload"/></button></div>
        <DrawingCanvas ref={canvas} tool={tool} onChange={drawingChanged} onHistory={historyChanged} onZoom={setZoom} disabled={!!busy||!!annotation}/>
        {live&&poseFrame&&hasRig&&<LivePoseCanvas frame={poseFrame} viewer={viewer} tool={tool}/>}
        {!hasDrawing&&<button className="sample-button icon-button" title="Load sample sketch" aria-label="Load sample sketch" disabled={!!busy||!!annotation} onClick={()=>{void canvas.current?.load("/sample-sketch.png").catch(showError);}}><Icon name="sample"/></button>}
        <div className="canvas-tools" role="toolbar" aria-label="Drawing tools">
          {([['pen',live?'Redraw limb (B)':'Draw (B)'],['eraser',live?'Reset limb (E)':'Erase (E)'],['hand',live?'Move joints (H)':'Pan (H or hold Space)']] as [Tool,string][]).map(([t,label])=><button key={t} disabled={!!busy||!!annotation} className={`tool-button ${tool===t?"active":""}`} aria-label={label} aria-pressed={tool===t} title={label} onClick={()=>setTool(t)}><Icon name={t} size={20}/></button>)}
          <button className="tool-button" aria-label="Undo" title="Undo (⌘Z)" disabled={!(live?poseFrame?.canUndo:undo)||!!busy||!!annotation} onClick={()=>live?viewer.current?.undoPose():canvas.current?.undo()}><Icon name="undo"/></button>
          <button className="tool-button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!(live?poseFrame?.canRedo:redo)||!!busy||!!annotation} onClick={()=>live?viewer.current?.redoPose():canvas.current?.redo()}><Icon name="redo"/></button>
        </div>
        <div className="canvas-bottom">{!live&&<div className="zoom-controls"><button className="icon-button" aria-label="Zoom out drawing" onClick={()=>canvas.current?.zoom(.85)}><Icon name="minus" size={14}/></button><button className="zoom-value" title="Reset canvas view" onClick={()=>canvas.current?.resetView()}>{zoom}%</button><button className="icon-button" aria-label="Zoom in drawing" onClick={()=>canvas.current?.zoom(1.15)}><Icon name="plus" size={14}/></button></div>}<button className="icon-button" title={live?"Reset live pose":"Clear canvas"} aria-label={live?"Reset live pose":"Clear canvas"} disabled={!hasDrawing||!!busy||!!annotation} onClick={()=>live?viewer.current?.resetPose():canvas.current?.clear()}><Icon name="trash"/></button></div>
      </section>
      <section className="reference-panel" aria-label="Generated reference">
        <div className="panel-top"><div className="view-tabs" aria-label="Reference view"><button disabled={!!annotation} aria-label="Image" title="Image" aria-pressed={tab==="image"} onClick={()=>setTab("image")}><Icon name="image"/></button><button disabled={!!annotation} aria-label="3D" title="3D" aria-pressed={tab==="model"} onClick={()=>setTab("model")}><Icon name="cube"/></button>{displayRun?.model&&<button disabled={!!busy||!!annotation} aria-label="Historical precedents" title="Historical precedents" aria-pressed={tab==="art"} onClick={openArt}><Icon name="museum"/></button>}</div></div>
        {displayModel&&<div className="model-layer" style={{visibility:tab==="model"&&!annotation?"visible":"hidden"}}><ModelViewer ref={viewer} url={displayModel} onRig={rigChanged} lightingOpen={lightingOpen} live={live} onFrame={poseFramed} onPoseChange={poseChanged} onRigError={rigFailed}/></div>}
        {live&&hasRig&&poseFrame&&tab==='model'&&!annotation&&<><LivePoseCanvas frame={poseFrame} viewer={viewer} tool={tool} transparent/><span className="live-status" title={`Edits run locally on the MHR skeleton. Last measured event-to-render time: ${poseFrame.frameMs.toFixed(1)} ms.`}><i/>Live</span></>}
        {tab==="image"&&displayImage&&!annotation&&<div className="image-view"><img src={displayImage} alt="Intermediate pose reference"/></div>}
        {artRun&&<div className="art-layer" hidden={tab!=="art"}><ArtworkPanel key={artRun+artRevision} runId={artRun} input={artInput}/></div>}
        {annotation&&<PoseOverlay image={annotation} busy={!!busy} onCancel={()=>setAnnotation(null)} onApply={(marked,instruction)=>void build("all",undefined,{marked,instruction})}/>}

        {stale&&(displayModel||displayImage)&&<div className="stale-label" role="status" aria-label="Inputs changed; showing previous result" title="Inputs changed; showing previous result"><Icon name="info" size={16}/></div>}
        {busy&&<div className={`generation-progress ${displayImage||displayModel?"over-result":""}`} role="status"><span className="spinner"/><div><strong>{busy==="preparing"?"Preparing your sketch":stageNames[busy]}</strong><span>{elapsed}s</span></div></div>}
        <div className="viewer-bottom">{displayModel&&tab==="model"&&!annotation&&<div className="viewer-actions"><button className="icon-button" disabled={!!busy||!hasRig} aria-pressed={live} title={rigError||'Live pose · move joints or redraw limbs in either panel'} aria-label="Live pose editing" onClick={()=>{setLive(v=>!v);setLightingOpen(false);setTool('hand');}}><Icon name="pose"/></button><button className="icon-button" disabled={!!busy||!hasRig} title="Redraw a limb from its shoulder or hip" aria-label="Redraw limb live" aria-pressed={live&&tool==='pen'} onClick={()=>{setLive(true);setTool('pen');setLightingOpen(false);}}><Icon name="pen"/></button><button className="icon-button" title="Lighting" aria-label="Lighting" aria-expanded={lightingOpen} aria-controls="lighting-controls" onClick={()=>setLightingOpen(v=>!v)}><Icon name="bulb" size={18}/></button><button className="icon-button" title="Reset view" aria-label="Reset 3D view" onClick={()=>viewer.current?.reset()}><Icon name="reset" size={17}/></button><button className="icon-button" title="Save view" aria-label="Save 3D view as image" onClick={()=>viewer.current?.save()}><Icon name="download" size={17}/></button></div>}</div>
      </section>
    </div>
    <footer className="actionbar">
      <div className="body-reference"><button className="reference-thumb" disabled={!!busy||!!annotation} aria-label="Change body reference" title="Change body reference" onClick={()=>referenceInput.current?.click()}>{reference?<img src={reference} alt="Body proportions reference"/>:<Icon name="plus"/>}</button></div>
      <div className="action-right"><button className="generate-button" disabled={!hasDrawing||!!busy||!!annotation} onClick={()=>live?setLive(false):void build()}>{busy?<><span className="spinner light"/>Generating</>:<>{live?"Done":displayModel&&(dirty||sketchDirty)?"Update pose":"Generate"}<Icon name="arrow" size={18}/></>}</button></div>
    </footer>
    <input ref={sketchInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void chooseFile(e,"sketch")}/>
    <input ref={referenceInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void chooseFile(e,"reference")}/>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void chooseFile(e,"image")}/>
    {notice&&<div className="toast" role="status"><Icon name="check" size={16}/>{notice}</div>}
    {error&&<div className="error-toast" role="alert"><Icon name="info"/><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError("")}><Icon name="close" size={15}/></button></div>}
    {drawer&&<>
      <button className="drawer-backdrop" aria-label="Close panel" onClick={()=>setDrawer(null)}/>
      <aside className="drawer" aria-label={drawer==="inspect"?"Inspect steps":drawer==="connections"?"Model connections":"Experiment history"}>
        <div className="drawer-header"><div><h2>{drawer==="inspect"?"Inspect steps":drawer==="connections"?"Connect your models":"Your experiments"}</h2></div><button className="icon-button" aria-label="Close panel" onClick={()=>setDrawer(null)}><Icon name="close" size={20}/></button></div>
        <div className="drawer-content">
          {drawer==="connections"&&<>
            <p className="drawer-intro">The workspace lives on your computer. When you run an experiment, your selected images are sent to Google and fal.</p>
            <div className="connection-card"><div className="connection-title"><span className="number">01</span><div><h3>Gemini</h3><p>Reads the sketch and generates reference images.</p></div><span className={`connection-state ${connections.gemini?"yes":""}`}>{connections.gemini?"Key saved":"Not connected"}</span></div><a className="setup-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a Gemini API key<Icon name="external" size={13}/></a><label className="field-label" htmlFor="gemini-key">Gemini API key</label><input id="gemini-key" type="password" autoComplete="off" spellCheck={false} value={geminiKey} onChange={e=>setGeminiKey(e.target.value)} placeholder={connections.gemini?"Leave blank to keep saved key":"Paste your key here"}/></div>
            <div className="connection-card"><div className="connection-title"><span className="number">02</span><div><h3>fal</h3><p>Runs SAM 3D Body and optional FLUX images.</p></div><span className={`connection-state ${connections.fal?"yes":""}`}>{connections.fal?"Key saved":"Not connected"}</span></div><a className="setup-link" href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer">Get a fal API key<Icon name="external" size={13}/></a><label className="field-label" htmlFor="fal-key">fal API key</label><input id="fal-key" type="password" autoComplete="off" spellCheck={false} value={falKey} onChange={e=>setFalKey(e.target.value)} placeholder={connections.fal?"Leave blank to keep saved key":"Paste your key here"}/></div>
            <p className="fine-print">Keys are saved in <code>.local/connections.json</code> inside this project, excluded from Git and readable only by your user. Keys are never included in saved experiments. Provider billing or credits may be required. Saving checks the format; the first model call checks access.</p>
            <button className="primary full" disabled={saving||(!geminiKey.trim()&&!falKey.trim())} onClick={()=>void saveKeys()}>{saving?"Saving…":"Save connections on this computer"}<Icon name="arrow" size={16}/></button>
          </>}
          {drawer==="history"&&<>

            {runs.length===0?<div className="empty-history"><Icon name="history" size={28}/><h3>A fresh page.</h3><p>Your first experiment will appear here.</p></div>:runs.map((r,i)=><button className="history-card" key={r.id} disabled={!!busy||!!annotation} onClick={()=>void applyRun(r).catch(showError)}><img src={r.generatedImage||r.sketch} alt="Experiment preview"/><div><strong>Pose study {String(runs.length-i).padStart(2,"0")}</strong><span>{new Date(r.createdAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span><small>{r.status==="complete"?"3D ready":r.status==="error"?"Needs attention":r.status==="paused"?"Pose read":r.status}</small></div><Icon name="chevron" size={16}/></button>)}
          </>}
          {drawer==="inspect"&&<>
            <label className="pause-option"><input type="checkbox" checked={pause} onChange={e=>setPause(e.target.checked)} disabled={!!busy||recipe!=="guided"}/><span>Review pose before generating</span></label>
            <label className="field-label" htmlFor="recipe">Workflow</label><select id="recipe" value={recipe} disabled={!!busy||!!annotation} onChange={e=>{setRecipe(e.target.value as Recipe);if(run)setDirty(true);}}>{Object.entries(recipeNames).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>
            <div className="pipeline">{stages.map((stage,i)=><div className={busy===stage?"current":run?.stages.some(s=>s.stage===stage&&s.status==="complete")?"done":""} key={stage}><span>{run?.stages.some(s=>s.stage===stage&&s.status==="complete")?<Icon name="check" size={12}/>:i+1}</span>{stage==="interpret"?"Interpret":stage==="image"?"Image":"3D"}</div>)}</div>
            <details className="step-section" open><summary><span><span className="step-index">01</span>Read the pose</span><Icon name="chevron" size={15}/></summary><div className="step-content">
              <label className="field-label" htmlFor="gemini-model">Gemini model</label><input id="gemini-model" value={settings.geminiModel} disabled={!!busy||!!annotation} onChange={e=>updateSetting("geminiModel",e.target.value)}/>
              <details className="prompt-details"><summary>{recipe==="fast"?"Fast pose instructions":"Animator instructions"}<Icon name="settings" size={14}/></summary><textarea aria-label="VLM animator instructions" rows={12} value={recipe==="fast"?settings.fastPrompt:settings.vlmPrompt} disabled={!!busy||!!annotation} onChange={e=>updateSetting(recipe==="fast"?"fastPrompt":"vlmPrompt",e.target.value)}/><button className="text-button" disabled={!!busy||!!annotation} onClick={()=>updateSetting(recipe==="fast"?"fastPrompt":"vlmPrompt",recipe==="fast"?DEFAULT_SETTINGS.fastPrompt:DEFAULT_SETTINGS.vlmPrompt)}>Restore your approved prompt</button></details>
              <label className="field-label" htmlFor="description">Pose description <span>editable</span></label><textarea id="description" placeholder="The animator’s reading of your sketch will appear here. You can also write your own." rows={7} value={description} disabled={!!busy||!!annotation} onChange={e=>{setDescription(e.target.value);if(run)setDirty(true);}}/>
              <button className="secondary full" disabled={!hasDrawing||!!busy||!!annotation} onClick={()=>void readOnly()}><Icon name="reset" size={15}/>{description?"Reread sketch":"Read sketch only"}</button>
              {description&&<button className="primary full" disabled={!!busy||!!annotation} onClick={()=>void build("image")}>Use description & continue<Icon name="arrow" size={16}/></button>}
            </div></details>
            <details className="step-section" open><summary><span><span className="step-index">02</span>Create the reference image</span><Icon name="chevron" size={15}/></summary><div className="step-content">
              <label className="field-label" htmlFor="image-model">Image model</label><select id="image-model" value={settings.imageModel} disabled={!!busy||!!annotation} onChange={e=>updateSetting("imageModel",e.target.value)}>{Object.entries(IMAGE_MODELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
              <details className="prompt-details"><summary>Image-generation instructions<Icon name="settings" size={14}/></summary><textarea aria-label="Image-generation instructions" rows={10} value={settings.imagePrompt} disabled={!!busy||!!annotation} onChange={e=>updateSetting("imagePrompt",e.target.value)}/>{!settings.imageModel.startsWith("gemini-")&&<><label className="field-label" htmlFor="seed">Seed</label><input id="seed" type="number" min="0" max="2147483647" value={settings.seed} disabled={!!busy||!!annotation} onChange={e=>updateSetting("seed",Number(e.target.value))}/></>}<p className="fine-print">New pose: sketch, body reference and pose description. Sketch corrections use the revised sketch, previous render and a brief comparison of the old/new drawings. Model corrections use the clean and annotated view. Exact requests are saved in Run details.</p></details>
              {displayImage?<button className="image-preview" onClick={()=>{setTab("image");setDrawer(null);}}><img src={displayImage} alt="Generated or uploaded reference"/><span>Open image<Icon name="arrow" size={13}/></span></button>:<div className="image-placeholder"><Icon name="image" size={24}/><span>The intermediate image will appear here.</span></div>}
              <div className="button-row"><button className="secondary" disabled={!hasDrawing||!!busy||!!annotation} onClick={()=>void build("image")}><Icon name="reset" size={14}/>Rerun from image</button><button className="secondary" disabled={!!busy||!!annotation} onClick={()=>imageInput.current?.click()}><Icon name="upload" size={14}/>Use my image</button></div>
            </div></details>
            <details className="step-section" open><summary><span><span className="step-index">03</span>Build the 3D reference</span><Icon name="chevron" size={15}/></summary><div className="step-content"><div className="model-label">SAM 3D Body <span>via fal</span></div><p className="fine-print">SAM reconstructs the body once. The matching MHR skeleton and native skin weights enable instant local edits in either panel. AI redraw remains available for larger changes; it generates a new mesh.</p>
              <button className="secondary full" disabled={!!busy||(!displayImage&&recipe!=="direct")||!hasDrawing} onClick={()=>void build("model")}><Icon name="cube" size={15}/>Build 3D from {recipe==="direct"?"sketch":"this image"}</button>
              {displayModel&&<><div className="result-state"><Icon name="check" size={15}/>{hasRig?"MHR skeleton · live editing available":"Viewable mesh · live rig unavailable"}</div>{hasRig&&<button className="text-button" onClick={()=>void viewer.current?.exportRig().catch(showError)}><Icon name="download" size={14}/>Download current pose with editable rig</button>}<button className="text-button" onClick={()=>{const image=viewer.current?.capture();if(image){setLive(false);setDrawer(null);setLightingOpen(false);setAnnotation(image);}}}><Icon name="pen" size={14}/>AI redraw correction</button>{poseEdited&&<p className="fine-print">Local pose edits are saved automatically. The Image tab shows the original generated image; save the current 3D view for an updated reference.</p>}{rigError&&<p className="fine-print">{rigError}</p>}<button className="text-button" onClick={()=>download(displayModel,"poser-reference.glb")}><Icon name="download" size={14}/>Download GLB</button></>}
            </div></details>
            {run&&<details className="step-section"><summary><span>Run details</span><Icon name="chevron" size={15}/></summary><div className="step-content"><p className="fine-print">{new Date(run.createdAt).toLocaleString()}<br/>ID: <code>{run.id}</code>{run.parentId&&<><br/>Branched from: <code>{run.parentId}</code></>}</p><div className="input-thumbnails"><a href={run.sketch} target="_blank" rel="noreferrer"><img src={run.sketch} alt="Exact sketch sent"/><span>Sketch sent</span></a>{run.edit?.marked&&<a href={run.edit.marked} target="_blank" rel="noreferrer"><img src={run.edit.marked} alt="Pose correction sent"/><span>Correction sent</span></a>}{run.reference&&<a href={run.reference} target="_blank" rel="noreferrer"><img src={run.reference} alt="Exact body reference sent"/><span>Body sent</span></a>}</div>{run.stages.map((s,i)=><div className="stage-record" key={i}><strong>{stageNames[s.stage]}</strong><span>{s.status} {s.durationMs?`· ${(s.durationMs/1000).toFixed(1)}s`:""}</span><code>{s.model}</code>{s.requestId&&<small>Request: {s.requestId}</small>}{s.error&&<p>{s.error}</p>}{s.status==="complete"&&<a href={`/api/assets/${run.id}/${s.stage}-output.json`} target="_blank" rel="noreferrer">Provider response<Icon name="external" size={12}/></a>}<a href={`/api/assets/${run.id}/${s.stage}-input.json`} target="_blank" rel="noreferrer">Exact model instructions<Icon name="external" size={12}/></a></div>)}<button className="text-button" onClick={()=>download(`/api/runs/${run.id}`,`poser-${run.id}.json`)}><Icon name="download" size={14}/>Save experiment record</button></div></details>}
            <details className="step-section"><summary><span>How the sandbox works</span><Icon name="chevron" size={15}/></summary><div className="step-content"><p className="fine-print">Next.js runs the interface and API on localhost. Fast mode uses a brief Gemini pose reading and Flash Lite image generation. Guided mode retains your full animator prompt. Your selected image model—Gemini or FLUX.2 Edit—receives the sketch, description, and optional body reference. SAM 3D Body reconstructs the resulting image. Three.js displays the saved GLB.</p><p className="fine-print">Experiments and provider responses are saved in <code>.local/runs/</code>. No training is involved. Re-running creates a new experiment and may incur provider charges. Input images leave this computer only when you run a model.</p><button className="text-button" onClick={()=>setDrawer("connections")}>Manage connections<Icon name="arrow" size={14}/></button></div></details>
          </>}
        </div>
      </aside>
    </>}
  </main>;
}

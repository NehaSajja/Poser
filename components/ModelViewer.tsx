"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import Icon from "./Icon";
import {attachRig,HANDLES,POINT_BONES,type HandleId,type PoseFrame,type LiveRig,type RigAsset,type RigPose,type SamMetadata} from "@/lib/rig";
import {GLTFExporter} from "three/addons/exporters/GLTFExporter.js";

export type ViewerHandle={reset:()=>void;save:()=>void;capture:()=>string|null;begin:(id:HandleId,x:number,y:number)=>void;move:(x:number,y:number,pole?:[number,number])=>void;end:()=>void;undoPose:()=>void;redoPose:()=>void;resetPose:()=>void;resetLimb:(id:HandleId)=>void;getFrame:()=>PoseFrame|null;exportRig:()=>Promise<void>;};
let rigAssetPromise:Promise<RigAsset>|undefined;
const rigAsset=()=>rigAssetPromise??=fetch('/mhr-rig.json').then(r=>{if(!r.ok)throw new Error('The local rig asset could not be loaded.');return r.json();}).catch(e=>{rigAssetPromise=undefined;throw e;});
const ModelViewer=forwardRef<ViewerHandle,{url:string;onRig:(rig:boolean)=>void;lightingOpen:boolean;live:boolean;onFrame:(frame:PoseFrame)=>void;onPoseChange:()=>void;onRigError:(message:string)=>void}>(function ModelViewer({url,onRig,lightingOpen,live,onFrame,onPoseChange,onRigError},ref){
  const latestFrame=useRef<PoseFrame|null>(null);
  const callbacks=useRef({live,onFrame,onPoseChange,onRigError});callbacks.current={live,onFrame,onPoseChange,onRigError};
  const poseActions=useRef<Partial<ViewerHandle>>({});
  const host=useRef<HTMLDivElement>(null);
  const bulb=useRef<HTMLButtonElement>(null);
  const lightActions=useRef<{start:(x:number,y:number)=>void;move:(x:number,y:number)=>void;end:()=>void;nudge:(x:number,y:number)=>void;intensity:(value:number)=>void;reset:()=>void}|null>(null);
  const [intensity,setIntensity]=useState(3);
  const controls=useRef<OrbitControls|null>(null);const renderer=useRef<THREE.WebGLRenderer|null>(null);
  const [state,setState]=useState("Loading 3D reference…");
  useImperativeHandle(ref,()=>({getFrame:()=>poseActions.current.getFrame?.()||null,begin:(...a)=>poseActions.current.begin?.(...a),move:(...a)=>poseActions.current.move?.(...a),end:()=>poseActions.current.end?.(),undoPose:()=>poseActions.current.undoPose?.(),redoPose:()=>poseActions.current.redoPose?.(),resetPose:()=>poseActions.current.resetPose?.(),resetLimb:id=>poseActions.current.resetLimb?.(id),exportRig:async()=>{await poseActions.current.exportRig?.();},reset:()=>controls.current?.reset(),capture:()=>state?null:renderer.current?.domElement.toDataURL("image/png")||null,save:()=>{if(!renderer.current)return;const a=document.createElement("a");a.download="poser-view.png";a.href=renderer.current.domElement.toDataURL("image/png");a.click();}}));
  useEffect(()=>{
    const element=host.current;if(!element)return;
    let rig:LiveRig|null=null;let rootObject:THREE.Group|null=null;let revision=0;let pendingMs=0;let editStarted=0;let lastFrame=0;let lastProjection="";let changed=false;
    const past:RigPose[]=[],future:RigPose[]=[];
    let poseDrag:{id:HandleId;plane:THREE.Plane}|null=null;
    let disposed=false;let frame=0;let gl:THREE.WebGLRenderer;
    try {gl=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}catch{setState("This browser could not start the 3D viewer. You can still download the model.");return;}
    renderer.current=gl;gl.setPixelRatio(Math.min(devicePixelRatio,2));gl.setClearColor(0xf7f7f5);gl.shadowMap.enabled=true;gl.shadowMap.type=THREE.PCFSoftShadowMap;
    gl.domElement.setAttribute("aria-label","Interactive 3D reference. Drag to orbit, shift-drag to pan, scroll to zoom.");gl.domElement.tabIndex=0;
    element.appendChild(gl.domElement);
    const scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff,0xbab8b2,.75));
    const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,6,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.bias=-.001;scene.add(key);
    // A subtle ambient fill keeps the unlit side readable; only the key light is editable.
    const defaultPosition=new THREE.Vector3(3,6,4).normalize().multiplyScalar(1.8);
    const lightPosition=defaultPosition.clone();
    try {
      const saved=JSON.parse(localStorage.getItem("poser-lighting")||"null");
      if(saved && Array.isArray(saved.position) && saved.position.length===3 && saved.position.every((v:unknown)=>typeof v==="number"&&Number.isFinite(v)) && typeof saved.intensity==="number" && Number.isFinite(saved.intensity)){
        const p=new THREE.Vector3().fromArray(saved.position);
        if(p.length()>.2 && p.length()<=10){lightPosition.copy(p);key.intensity=THREE.MathUtils.clamp(saved.intensity,0,6);}
      }
    } catch {}
    setIntensity(key.intensity);
    const saveLighting=()=>{try{localStorage.setItem("poser-lighting",JSON.stringify({position:lightPosition.toArray(),intensity:key.intensity}));}catch{}};
    const camera=new THREE.PerspectiveCamera(35,1,.01,100);
    camera.position.set(0,1,5);
    const orbit=new OrbitControls(camera,gl.domElement);controls.current=orbit;orbit.enableDamping=true;orbit.dampingFactor=.075;orbit.maxDistance=20;orbit.minDistance=.3;orbit.maxPolarAngle=Math.PI*.98;orbit.enablePan=true;orbit.listenToKeyEvents(gl.domElement);
    const raycaster=new THREE.Raycaster();
    const projectFrame=()=>{
      if(!rig)return;
      const points:Record<string,[number,number]>={};
      for(const [name,bone] of Object.entries(POINT_BONES)){const p=rig.world(bone).project(camera);points[name]=[(p.x+1)/2,(1-p.y)/2];}
      const signature=JSON.stringify([points,revision,element.clientWidth,element.clientHeight,past.length,future.length]);if(signature===lastProjection)return;lastProjection=signature;
      latestFrame.current={width:element.clientWidth,height:element.clientHeight,points,revision,frameMs:pendingMs,canUndo:past.length>0,canRedo:future.length>0};callbacks.current.onFrame(latestFrame.current);
    };
    const checkpoint=()=>{if(!rig)return;past.push(rig.snapshot());if(past.length>60)past.shift();future.length=0;};
    const persist=()=>{if(!rig)return;try{localStorage.setItem('poser-live:'+url,JSON.stringify(rig.snapshot()));}catch{}callbacks.current.onPoseChange();projectFrame();};
    const planePoint=(x:number,y:number)=>{raycaster.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);return poseDrag?raycaster.ray.intersectPlane(poseDrag.plane,new THREE.Vector3()):null;};
    poseActions.current={
      getFrame:()=>{projectFrame();return latestFrame.current;},
      begin:(id)=>{if(!rig||!HANDLES[id])return;checkpoint();camera.updateMatrixWorld();poseDrag={id,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),rig.world(HANDLES[id].bone))};orbit.enabled=false;},
      move:(x,y,pole)=>{if(!rig||!poseDrag)return;const target=planePoint(x,y);if(!target)return;editStarted=performance.now();rig.move(poseDrag.id,target,pole?planePoint(...pole)||undefined:undefined);revision++;changed=true;},
      end:()=>{if(!poseDrag)return;poseDrag=null;orbit.enabled=true;persist();},
      undoPose:()=>{if(!rig)return;const previous=past.pop();if(previous){future.push(rig.snapshot());rig.restore(previous);revision++;persist();}},
      redoPose:()=>{if(!rig)return;const next=future.pop();if(next){past.push(rig.snapshot());rig.restore(next);revision++;persist();}},
      resetPose:()=>{if(!rig)return;checkpoint();rig.restore(rig.initial);revision++;persist();},
      resetLimb:id=>{if(!rig)return;checkpoint();const h=HANDLES[id];const names=new Set<string>([h.bone,...h.chain]);for(const name of names){const i=rig.bones.indexOf(rig.named[name]);rig.named[name].quaternion.fromArray(rig.initial.rotations[i]);}rootObject?.updateMatrixWorld(true);revision++;persist();},
      exportRig:async()=>{if(!rootObject||!rig)return;const buffer=await new GLTFExporter().parseAsync(rootObject,{binary:true});const blob=new Blob([buffer as ArrayBuffer],{type:'model/gltf-binary'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download='poser-editable-pose.glb';a.click();setTimeout(()=>URL.revokeObjectURL(href),5000);},
    };
    let dragging=false;
    const lastPointer=new THREE.Vector2();
    const dragRight=new THREE.Vector3(),dragUp=new THREE.Vector3();
    let unitsPerPixel=0;
    const prepareDrag=()=>{
      camera.updateMatrixWorld();
      dragRight.setFromMatrixColumn(camera.matrixWorld,0);dragUp.setFromMatrixColumn(camera.matrixWorld,1);
      const depth=Math.max(.2,-lightPosition.clone().applyMatrix4(camera.matrixWorldInverse).z);
      unitsPerPixel=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(element.clientHeight,1);
    };
    const moveLight=(dx:number,dy:number)=>{
      const next=lightPosition.clone().addScaledVector(dragRight,dx*unitsPerPixel).addScaledVector(dragUp,-dy*unitsPerPixel);
      if(next.length()>.2 && next.length()<=10)lightPosition.copy(next);
    };
    lightActions.current={
      start:(x,y)=>{prepareDrag();lastPointer.set(x,y);dragging=true;orbit.enabled=false;},
      move:(x,y)=>{if(!dragging)return;moveLight(x-lastPointer.x,y-lastPointer.y);lastPointer.set(x,y);},
      end:()=>{dragging=false;orbit.enabled=true;saveLighting();},
      nudge:(x,y)=>{prepareDrag();moveLight(x,y);saveLighting();},
      intensity:value=>{key.intensity=value;setIntensity(value);saveLighting();},
      reset:()=>{lightPosition.copy(defaultPosition);key.intensity=3;setIntensity(3);saveLighting();},
    };
    const resize=()=>{const {width,height}=element.getBoundingClientRect();gl.setSize(width,height);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    const projected=new THREE.Vector3(),figureProjected=new THREE.Vector3();
    const animate=()=>{
      if(disposed)return;
      if(!dragging)orbit.update();
      // Direction stays fixed in model space when the camera moves.
      key.position.copy(lightPosition).normalize().multiplyScalar(8);
      gl.render(scene,camera);
      if(changed){pendingMs=performance.now()-editStarted;changed=false;}
      if(rig&&callbacks.current.live&&performance.now()-lastFrame>15){lastFrame=performance.now();projectFrame();}
      if(bulb.current){
        projected.copy(lightPosition).project(camera);
        const w=element.clientWidth,h=element.clientHeight;
        const x=THREE.MathUtils.clamp((projected.x+1)*w/2,26,w-26);
        const y=THREE.MathUtils.clamp((1-projected.y)*h/2,65,h-120);
        bulb.current.style.left=`${x}px`;bulb.current.style.top=`${y}px`;
        // Shade away from the figure's projected center, including after camera orbit/pan.
        figureProjected.set(0,0,0).project(camera);
        const dx=(figureProjected.x+1)*w/2-x,dy=(1-figureProjected.y)*h/2-y;
        // Fade the directional offset near the center to avoid a sudden flip across it.
        const distance=Math.sqrt(dx*dx+dy*dy+40*40);
        const towardX=dx/distance,towardY=dy/distance;
        bulb.current.style.setProperty("--light-highlight-x",`${50+towardX*24}%`);
        bulb.current.style.setProperty("--light-highlight-y",`${50+towardY*24}%`);
        bulb.current.style.setProperty("--light-shadow-x",`${-towardX*5}px`);
        bulb.current.style.setProperty("--light-shadow-y",`${-towardY*5}px`);
      }
      frame=requestAnimationFrame(animate);
    };animate();
    setState("Loading 3D reference…");
    const manager=new THREE.LoadingManager();
    manager.setURLModifier(resource=>{if(resource.startsWith("blob:")||resource.startsWith("data:"))return resource;const u=new URL(resource,location.href);if(u.origin!==location.origin)throw new Error("External model assets are not supported.");return u.href;});
    new GLTFLoader(manager).load(url,async gltf=>{
      if(disposed){gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});return;}
      const root=gltf.scene;rootObject=root;let detectedRig=false;
      root.traverse(object=>{
        if(object instanceof THREE.Mesh){
          object.castShadow=true;object.receiveShadow=true;
          // SAM GLBs omit a material; glTF's metallic default obscures the anatomy.
          const surfaceMaterials=Array.isArray(object.material)?object.material:[object.material];
          for(const material of surfaceMaterials)if(material instanceof THREE.MeshStandardMaterial){material.metalness=0;material.roughness=.8;}
          // SAM's mesh may omit normals. Smooth the lighting without changing geometry.
          if(!object.geometry.getAttribute("normal")){
            object.geometry.computeVertexNormals();
            const materials=Array.isArray(object.material)?object.material:[object.material];
            for(const material of materials)if(material instanceof THREE.MeshStandardMaterial){material.flatShading=false;material.needsUpdate=true;}
          }
        }
      });
      try{
        const metadataUrl=url.replace(/[^/]+$/, 'model-output.json');
        const [asset,response]=await Promise.all([rigAsset(),fetch(metadataUrl)]);
        if(!response.ok)throw new Error('This model has no saved joint data.');
        const data=await response.json() as SamMetadata;if(disposed)return;
        rig=attachRig(root,asset,data);detectedRig=true;
      }catch(e){callbacks.current.onRigError(e instanceof Error?e.message:'Live rig could not be prepared.');}
      if(disposed)return;onRig(detectedRig);
      const box=new THREE.Box3().setFromObject(root);const center=box.getCenter(new THREE.Vector3());const dimensions=box.getSize(new THREE.Vector3());
      if(!Number.isFinite(dimensions.length())||dimensions.length()===0){setState("The model contains no visible geometry.");return;}
      const scale=2.6/Math.max(dimensions.x,dimensions.y,dimensions.z);root.scale.multiplyScalar(scale);root.position.sub(center.multiplyScalar(scale));scene.add(root);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.12}));floor.rotation.x=-Math.PI/2;floor.position.y=-dimensions.y*scale/2-.008;floor.receiveShadow=true;scene.add(floor);
      orbit.target.set(0,0,0);
      const distance=1.6/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(1,1/camera.aspect);
      camera.position.set(0,.15,distance);orbit.update();orbit.saveState();
      if(rig){try{const saved=JSON.parse(localStorage.getItem('poser-live:'+url)||'null');if(saved&&rig.restore(saved)){revision++;callbacks.current.onPoseChange();}}catch{}projectFrame();}
      setState("");
    },undefined,()=>{if(!disposed)setState("The model could not be displayed. Try downloading it from Inspect steps.");});
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();orbit.dispose();lightActions.current=null;poseActions.current={};rig?.skeleton.dispose();key.shadow.map?.dispose();scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const mats=Array.isArray(object.material)?object.material:[object.material];mats.forEach(m=>{for(const v of Object.values(m))if(v instanceof THREE.Texture)v.dispose();m.dispose();});}});gl.dispose();gl.domElement.remove();renderer.current=null;controls.current=null;};
  },[url,onRig]);
  return <div className="model-viewer"><div className="model-surface" ref={host}/>{state?<div className="viewer-message">{state}</div>:null}
    {lightingOpen&&!state&&<>
      <button ref={bulb} className="light-handle" aria-label="Move light" title="Drag to move light. Orbit the view to position it in depth. Arrow keys also move the light."
        onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);lightActions.current?.start(e.clientX,e.clientY);}}
        onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))lightActions.current?.move(e.clientX,e.clientY);}}
        onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);lightActions.current?.end();}}
        onPointerCancel={()=>lightActions.current?.end()} onLostPointerCapture={()=>lightActions.current?.end()}
        onKeyDown={e=>{const delta:Record<string,[number,number]>={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};if(delta[e.key]){e.preventDefault();e.stopPropagation();lightActions.current?.nudge(...delta[e.key]);}}}
      />
      <div id="lighting-controls" className="lighting-controls" role="group" aria-label="Lighting controls">
        <Icon name="sun" size={17}/><input type="range" aria-label="Light intensity" title="Light intensity" min="0" max="6" step="0.05" value={intensity} onChange={e=>lightActions.current?.intensity(Number(e.target.value))}/>
        <button className="icon-button" aria-label="Reset lighting" title="Reset lighting" onClick={()=>lightActions.current?.reset()}><Icon name="reset" size={16}/></button>
      </div>
    </>}
  </div>;
});
export default ModelViewer;

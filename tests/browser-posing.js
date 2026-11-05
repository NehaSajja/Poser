import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createMhrRig,createMhrHistory} from '../src/poser2/mhrRig.js';
import {createMhrJointControls} from '../src/poser2/mhrJointControls.js';
import poses from '../server/experiments/mhr-poses.json';
import './browser-posing.css';
const $=s=>document.querySelector(s),status=$('.status'),views=[],measurements=JSON.parse(sessionStorage.getItem('poser-browser-measurements')||'[]');
$('#measurements').textContent=JSON.stringify(measurements,null,2);
const labels={'2013':'Seated · knees raised','1351':'Seated fold','201':'Kneeling','1010':'Squat','1176':'Standing','2933':'Hands at head'};
for(const pose of poses.poses){const o=document.createElement('option');o.value=pose.id;o.textContent=labels[pose.id]||pose.id;$('#pose').append(o);}
const shape=()=>({silhouette:$('#body').value==='masculine'?-1:1,fullness:$('#body').value==='full'?2:-.8,height:1});
let blocked=false,syncing=false,loading=false,replaying=false;
const summary=(events,type)=>events.filter(e=>e.type===type).map(e=>e.ms);
const median=values=>values.length?[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]:null;
const format=n=>n==null?'—':`${n<10?n.toFixed(1):Math.round(n)} ms`;
function metrics(view){const events=view.events,correction=events.filter(e=>e.type==='correction').at(-1);
 const values=[['Input → rendered frame',format(median(summary(events,view.hybrid?'input-frame':'response-frame')))],['Browser pose calculation',format(median(summary(events,'preview')))],['Correction round trip',format(median(summary(events,'network')))],['Rendered pose updates',String(events.filter(e=>e.type===(view.hybrid?'input-frame':'response-frame')).length)],['Correction requests',String(events.filter(e=>e.type==='request').length)],['Last skin correction',correction?`${correction.rmsMm.toFixed(2)} mm RMS / ${correction.maxMm.toFixed(1)} mm max`:'—']];
 view.stats.replaceChildren(...values.flatMap(([a,b])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=a;dd.textContent=b;return[dt,dd];}));
}
async function makeView(hybrid){
 const id=hybrid?'browser':'server',host=$(`#${id}-view`),scene=new THREE.Scene();scene.background=new THREE.Color('#eceff2');
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100),orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=false;
 scene.add(new THREE.HemisphereLight(0xffffff,0x73777d,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,5,4);scene.add(light);
 const rig=await createMhrRig(new THREE.MeshStandardMaterial({color:'#b7b7b7',roughness:.8}),{browserNative:hybrid});scene.add(rig.root);
 const grid=new THREE.GridHelper(6,40,0xb8bec5,0xd2d6db);grid.material.transparent=true;grid.material.opacity=.35;scene.add(grid);
 const view={hybrid,host,scene,renderer,camera,orbit,rig,grid,events:[],stats:$(`#${id}-metrics`)};views.push(view);
 const evaluate=rig.mhr.evaluate.bind(rig.mhr);
 rig.mhr.evaluate=async(body,signal)=>{const delay=Number($('#delay').value);if(blocked){await new Promise(r=>setTimeout(r,delay||300));throw new Error('Corrections blocked for this experiment. Browser posing still works.');}
  const packet=await evaluate(body,signal);if(delay)await new Promise(r=>setTimeout(r,delay));return packet;};
 rig.mhr.metric=event=>{view.events.push({...event,time:performance.now()});metrics(view);};
 function paint(){view.controls?.update();renderer.render(scene,camera);}
 view.paint=paint;
 orbit.addEventListener('change',()=>{paint();if(syncing)return;syncing=true;for(const other of views)if(other!==view){other.camera.position.copy(camera.position);other.camera.quaternion.copy(camera.quaternion);other.camera.zoom=camera.zoom;other.camera.updateProjectionMatrix();other.orbit.target.copy(orbit.target);other.orbit.update();other.paint();}syncing=false;});
 const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height,false);camera.left=-view.span*width/height/2;camera.right=view.span*width/height/2;camera.top=view.span/2;camera.bottom=-view.span/2;camera.updateProjectionMatrix();paint();});view.span=2;resize.observe(host);view.resize=resize;
 return view;
}
async function load(){if(loading)return;loading=true;$('#replay').disabled=$('#torso').disabled=true;status.textContent='Loading corrected pose from the live MHR server…';
 try{const pose=poses.poses.find(p=>p.id===$('#pose').value),body={params:pose.params,shape:shape()};
  for(const view of views){await view.controls?.finish();view.controls?.dispose();view.controls=null;}
  const packet=await views[0].rig.mhr.evaluate(body);
  for(const view of views){view.rig.mhr.apply(packet);view.base=pose.params.slice();view.events=[];
   const box=new THREE.Box3().setFromObject(view.rig.root,true),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());view.span=Math.max(size.y,size.x)*1.45;view.camera.position.copy(center).add(new THREE.Vector3(.1,.12,3));view.orbit.target.copy(center);view.camera.zoom=1;
   const {width,height}=view.host.getBoundingClientRect();Object.assign(view.camera,{left:-view.span*width/height/2,right:view.span*width/height/2,top:view.span/2,bottom:-view.span/2});view.camera.updateProjectionMatrix();view.orbit.update();view.grid.position.y=box.min.y-.005;
   view.controls=createMhrJointControls({rig:view.rig,camera:view.camera,container:view.host,orbit:view.orbit,invalidate:view.paint,onEdit:()=>{},onCommit:()=>{},history:createMhrHistory(view.rig.mhr.state)});view.controls.setEnabled(true);view.paint();metrics(view);
  }
  $('#torso').value=0;status.textContent='Ready · real Fly corrections, no paid AI generation calls.';
 }catch(e){status.textContent=e.message;}finally{loading=false;$('#replay').disabled=$('#torso').disabled=false;}
}
function updateTorso(degrees){for(const view of views){const params=view.gestureBase.slice();for(const name of ['spine_bend0','spine_bend1']){const i=view.rig.mhr.meta.names.indexOf(name),[lo,hi]=view.rig.mhr.meta.limits[i];params[i]=Math.max(lo,Math.min(hi,params[i]+degrees*Math.PI/180));}view.controls.updateParams(params);}}
function begin(){for(const v of views){v.gestureBase=v.rig.mhr.params.slice();v.controls.beginGesture();}}
function end(){for(const v of views)v.controls.endGesture();}
$('#torso').addEventListener('pointerdown',begin);$('#torso').addEventListener('keydown',e=>{if(!e.repeat)begin();});$('#torso').addEventListener('input',()=>updateTorso(Number($('#torso').value)));$('#torso').addEventListener('change',end);
$('#pose').addEventListener('change',load);$('#body').addEventListener('change',load);
$('#offline').addEventListener('click',()=>{blocked=!blocked;$('#offline').setAttribute('aria-pressed',String(blocked));status.textContent=blocked?'Corrections blocked. Try moving the browser-side joints.':'Corrections re-enabled. Move a joint to request a fresh correction.';});
$('#replay').addEventListener('click',async()=>{
 if(replaying||loading)return;replaying=true;$('#replay').disabled=true;for(const v of views){await v.controls.finish();v.events=[];}
 begin();status.textContent='Replaying the same 1.5-second torso drag in both panels…';const started=performance.now();let inputs=0;
 await new Promise(resolve=>{function tick(now){const t=Math.min(1,(now-started)/1500);updateTorso(12*t);$('#torso').value=12*t;inputs++;if(t<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});end();
 await Promise.all(views.map(v=>v.controls.finish()));
 const a=views[0].rig.mhr.capture(),b=views[1].rig.mhr.capture(),n=views[0].rig.mhr.meta.vertexCount*3;let max=0;for(let i=0;i<n;i+=3)max=Math.max(max,Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]));
 const record={at:new Date().toISOString(),pose:$('#pose').value,extraDelayMs:Number($('#delay').value),blocked,inputs,finalMaxDifferenceMm:max*1000,views:views.map(v=>({mode:v.hybrid?'browser':'server',events:v.events}))};measurements.push(record);sessionStorage.setItem('poser-browser-measurements',JSON.stringify(measurements));$('#measurements').textContent=JSON.stringify(measurements,null,2);
 $('#report').textContent=`Final body difference: ${(max*1000).toFixed(4)} mm. ${inputs} shared input frames. ${blocked?'Corrections were blocked.':max<.00003?'Both bodies settled to the same requested MHR pose.':'Bodies differ: inspect the comparison before accepting this result.'}`;
 status.textContent='Comparison complete. Switch pose or connection delay and try again.';replaying=false;$('#replay').disabled=false;
});
$('#download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(measurements,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='poser-browser-posing-measurements.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
try{await makeView(false);await makeView(true);await load();}catch(e){status.textContent=e.message;}

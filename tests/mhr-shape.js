import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './skinning.css';
import './mhr.css';
import './mhr-shape.css';

const api = '/mhr-experiment/api';
const fields = [['torso','Torso tilt',-30,30],['lean','Torso lean',-25,25],['nod','Head nod',-35,35],['turn','Head turn',-60,60],['left','Left shoulder',-15,25],['right','Right shoulder',-15,25]];
const defaults = Object.fromEntries(fields.map(([id])=>[id,0]));
let syncing=false;
let offsets={...defaults}, pose='neutral', meta, skeleton, loadedPose, busy=false, pending=false, desiredVersion=0, disposed=false;
let shape={silhouette:1,fullness:-.8,height:1};
const shapeFieldset=document.querySelector('#shape-controls');
const shapeInputs=new Map();
const views=[], handles=[], inputs=new Map(), status=document.querySelector('.status');
const labels={'2013':'Seated · knees up','1351':'Seated fold','201':'Kneeling','1010':'Squat','1176':'Standing','2933':'Holding head'};
const fieldset=document.querySelector('#controls');
for(const [id,label,min,max] of fields){
 const el=document.createElement('label'); el.textContent=label;
 const out=document.createElement('output'); out.value='0°';
 const input=document.createElement('input'); Object.assign(input,{type:'range',min,max,step:1,value:0}); input.setAttribute('aria-label',label);
 input.addEventListener('input',()=>{offsets[id]=Number(input.value); updateInputs(); requestUpdate();});
 el.append(out,input);fieldset.append(el);inputs.set(id,{input,out,min,max});
}
const reset=document.createElement('button');reset.textContent='Reset pose';reset.addEventListener('click',()=>{offsets={...defaults};updateInputs();requestUpdate();});fieldset.append(reset);
const shapeFields=[['silhouette','Masculine ↔ feminine',-2,1.41,.01,1],['fullness','Slender ↔ fuller',-1.67,3,.01,-.8],['height','Height',.85,1.15,.01,1]];
for(const [id,label,min,max,step,value] of shapeFields){
 const el=document.createElement('label');el.textContent=label;
 const out=document.createElement('output');const input=document.createElement('input');
 Object.assign(input,{type:'range',min,max,step,value});input.setAttribute('aria-label',label);
 input.addEventListener('input',()=>{shape[id]=Number(input.value);syncShape();requestUpdate();});
 el.append(out,input);shapeFieldset.append(el);shapeInputs.set(id,{input,out});
}
const presets=[['Masculine',{silhouette:-1,fullness:-.8,height:1}],['Feminine',{silhouette:1,fullness:-.8,height:1}]];
for(const [label,values] of presets){const b=document.createElement('button');b.textContent=label;b.disabled=true;b.addEventListener('click',()=>{shape={...values};syncShape();requestUpdate();});document.querySelector('#presets').append(b);}
function syncShape(){
 for(const [id,{input,out}]of shapeInputs){input.value=shape[id];out.value=id==='height'?`${Math.round(shape[id]*100)}%`:`${shape[id]>0?'+':''}${shape[id].toFixed(2)}`;}
 for(const [i,b]of [...document.querySelector('#presets').children].entries())b.setAttribute('aria-pressed',String(Object.keys(shape).every(k=>shape[k]===presets[i][1][k])));
}
syncShape();
function updateInputs(){for(const[id,{input,out}]of inputs){input.value=offsets[id];out.value=`${Math.round(offsets[id])}°`;}}
function fail(error){status.textContent=`MHR unavailable: ${error.message}. Start the local MHR service and reload.`;}
async function checked(url,options){const r=await fetch(url,options);if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);return r;}
function createView(host,indices){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e9ebee');
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(35,1,.01,100);camera.position.set(2,1.4,3);
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=false;
 scene.add(new THREE.HemisphereLight(0xffffff,0x888888,1));
 const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-2,4,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:12});light.shadow.bias=-.0005;scene.add(light);
 const geometry=new THREE.BufferGeometry();geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(meta.vertexCount*3),3));
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xb8b8b8,roughness:.85}));mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.16,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const grid=new THREE.GridHelper(6,30,0xb9bec6,0xd2d6dc);grid.material.transparent=true;grid.material.opacity=.12;scene.add(grid);
 const view={host,scene,renderer,camera,orbit,mesh,floor,grid,home:null};views.push(view);
 const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();});resize.observe(host);view.resize=resize;
 orbit.addEventListener('change',()=>{if(syncing)return;syncing=true;for(const other of views){if(other===view)continue;other.camera.position.copy(camera.position);other.camera.quaternion.copy(camera.quaternion);other.orbit.target.copy(orbit.target);other.orbit.update();}syncing=false;});
 return view;
}
function addHandles(view){
 for(const [id,label,joint]of [['torso','Torso','c_spine3'],['head','Head','c_head'],['left','Left shoulder','l_uparm'],['right','Right shoulder','r_uparm']]){
  const dot=document.createElement('button');dot.className=`joint-dot ${id}`;dot.setAttribute('aria-label',`Adjust ${label}`);dot.title=id==='head'?'Head: drag up/down to nod, left/right to turn':id==='torso'?'Torso: drag up/down to tilt, left/right to lean':`${label}: drag up/down to raise or lower`;
  view.host.append(dot);handles.push({dot,view,joint:meta.jointNames.indexOf(joint),id});
  let drag;
  dot.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();dot.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,offsets:{...offsets}};views.forEach(v=>v.orbit.enabled=false);dot.classList.add('dragging');});
  dot.addEventListener('pointermove',e=>{if(!drag)return;e.stopPropagation();const dx=e.clientX-drag.x,dy=drag.y-e.clientY;
   const set=(key,value)=>{const {min,max}=inputs.get(key);offsets[key]=Math.max(min,Math.min(max,value));};
   if(id==='head'){set('nod',drag.offsets.nod+dy*.45);set('turn',drag.offsets.turn+dx*.45);}
   else if(id==='torso'){set('torso',drag.offsets.torso-dy*.3);set('lean',drag.offsets.lean+dx*.3);}
   else set(id,drag.offsets[id]+dy*.25);
   updateInputs();requestUpdate();
  });
  const release=()=>{drag=null;views.forEach(v=>v.orbit.enabled=true);dot.classList.remove('dragging');};
  dot.addEventListener('pointerup',release);dot.addEventListener('pointercancel',release);dot.addEventListener('lostpointercapture',release);
  dot.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();let key=id==='head'?(e.key.includes('Left')||e.key.includes('Right')?'turn':'nod'):id==='torso'?(e.key.includes('Left')||e.key.includes('Right')?'lean':'torso'):id;
   let sign=['ArrowUp','ArrowRight'].includes(e.key)?1:-1;if(key==='torso')sign=-sign;const {min,max}=inputs.get(key);offsets[key]=Math.max(min,Math.min(max,offsets[key]+sign*2));updateInputs();requestUpdate();});
 }
}
function frame(){
 const box=new THREE.Box3().setFromObject(views[0].mesh).union(new THREE.Box3().setFromObject(views[1].mesh)),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const aspect=Math.min(...views.map(v=>v.camera.aspect));
 const distance=Math.max(size.y,size.x/aspect,size.z)/(2*Math.tan(THREE.MathUtils.degToRad(35/2)))*1.35;
 for(const view of views){view.orbit.target.copy(center);view.camera.position.copy(center).add(new THREE.Vector3(.18,.1,1).normalize().multiplyScalar(distance));view.orbit.update();view.floor.position.y=box.min.y-.006;view.grid.position.y=box.min.y-.004;view.home={position:view.camera.position.clone(),target:center.clone()};}
}
function requestUpdate(){desiredVersion++;pending=true;if(!busy)void flush();}
async function flush(){
 if(!meta||busy||disposed)return;busy=true;
 while(pending&&!disposed){
  pending=false;const version=desiredVersion,requestPose=pose,requestOffsets={...offsets},requestShape={...shape};const start=performance.now();
  try{
   const r=await checked(`${api}/shape`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pose:requestPose,offsets:requestOffsets,shape:requestShape})});
   const data=new Float32Array(await r.arrayBuffer());if(requestPose!==pose)continue;
   const n=meta.vertexCount*3;if(data.length!==n*2+meta.jointNames.length*6)throw new Error('Unexpected mesh response');
   for(let i=0;i<2;i++){const geometry=views[i].mesh.geometry;geometry.attributes.position.array.set(data.subarray(i*n,(i+1)*n));geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();}
   skeleton=[data.slice(n*2,n*2+meta.jointNames.length*3),data.slice(n*2+meta.jointNames.length*3)];
   if(loadedPose!==pose){loadedPose=pose;frame();}
   const clamped=r.headers.get('X-MHR-Clamped');status.textContent=clamped?`Native joint limit reached: ${clamped}. Reduce the adjustment to continue in that direction.`:'Both bodies use MHR corrections. Orbit either view; drag the dots to test the same upper-body adjustment on both.';
   document.querySelector('#fit').textContent=`Expanded shape range · extremes may distort or intersect · presets retain their original proportions`;
   document.querySelector('#timing').textContent=`Surface update ${r.headers.get('X-MHR-MS')} ms · browser round trip + normals ${Math.round(performance.now()-start)} ms`;
   document.querySelector('.comparison').setAttribute('aria-busy','false');fieldset.disabled=false;shapeFieldset.disabled=false;document.querySelectorAll('#presets button').forEach(b=>b.disabled=false);
   // Render every completed edit rather than discarding all frames during a drag.
   if(version!==desiredVersion)pending=true;
  }catch(error){fail(error);}
 }
 busy=false;
}
function animate(){if(disposed)return;requestAnimationFrame(animate);views.forEach(v=>{v.orbit.update();v.renderer.render(v.scene,v.camera);});
 if(!skeleton)return;
 for(const {dot,view,joint}of handles){const p=new THREE.Vector3().fromArray(skeleton[views.indexOf(view)],joint*3).project(view.camera);dot.style.left=`${(p.x*.5+.5)*view.host.clientWidth}px`;dot.style.top=`${(-p.y*.5+.5)*view.host.clientHeight}px`;dot.hidden=p.z>1||p.z< -1;}
}
async function init(){
 try{meta=await(await checked(`${api}/meta`)).json();const indices=new Uint32Array(await(await checked(`${api}/topology`)).arrayBuffer());
  const select=document.querySelector('#pose');select.add(new Option('Neutral · body proportions','neutral'));for(const p of meta.poses){const option=new Option(labels[p.id]||p.name,p.id);select.add(option);}select.value=pose;
  select.addEventListener('change',()=>{pose=select.value;offsets={...defaults};updateInputs();fieldset.disabled=true;document.querySelector('.comparison').setAttribute('aria-busy','true');requestUpdate();});
  createView(document.querySelector('#raw'),indices);createView(document.querySelector('#corrected'),indices);views.forEach(addHandles);
  document.querySelector('#view').addEventListener('click',frame);
  animate();requestUpdate();
 }catch(error){fail(error);}
}
window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;for(const v of views){v.resize.disconnect();v.orbit.dispose();v.renderer.dispose();v.scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}});
init();

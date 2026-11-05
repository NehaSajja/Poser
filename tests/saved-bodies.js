import {createPoseRenderer} from '../src/poser2/poseRenderer.js';
import {BODY_PRESETS} from '../src/poser2/bodyShape.js';
import '../src/poser2/thumbnails.css';
const $=s=>document.querySelector(s),originalFetch=window.fetch.bind(window),requests=[];
const poses=[['2013','Seated · knees raised'],['1351','Seated fold'],['201','Kneeling'],['1010','Squat'],['1176','Standing'],['2933','Hands at head']];
window.fetch=async(url,options)=>{
 const path=String(url);if(path.startsWith('/mhr-experiment/')){requests.push({path,blocked:$('#block').checked});report();if($('#block').checked)return new Response('MHR intentionally blocked',{status:503});}
 if(path.startsWith('/experiments/')){const delay=Number($('#delay').value);if(delay)await new Promise(r=>setTimeout(r,delay));}
 return originalFetch(url,options);
};
let renderer,mounted,controller,loading=false,measurements=[];
const savedSettings=JSON.parse(sessionStorage.getItem('saved-body-bench-settings')||'null');
if(savedSettings){$('#block').checked=savedSettings.blocked;$('#delay').value=String(savedSettings.delay);}
function report(){ $('#details').textContent=JSON.stringify({initialResults:measurements,mhrRequests:requests},null,2); }
async function select(item){await mounted?.finishPoseEdit();mounted?.dispose();const host=$('#viewer');mounted=renderer.mount(item,host,()=>({left:0,top:0,width:host.clientWidth,height:host.clientHeight}),state=>{$('#undo').disabled=!state.canUndo;$('#redo').disabled=!state.canRedo;},{animate:false});mounted.setRigging(true);}
async function load(){if(loading)return;loading=true;$('.status').textContent='Loading six saved bodies…';$('#load').disabled=true;mounted?.dispose();mounted=null;renderer?.dispose();controller?.abort();controller=new AbortController();renderer=createPoseRenderer();requests.length=0;measurements=[];$('.previews').replaceChildren();const started=performance.now();
 try{for(const [id,name] of poses){const canvas=document.createElement('canvas'),button=document.createElement('button'),label=document.createElement('span'),item={key:`${id}-authored`};label.textContent=name;button.append(canvas,label);$('.previews').append(button);const t=performance.now();const result=await renderer.render(item,canvas,280,controller.signal);measurements.push({id,ms:Math.round(performance.now()-t),warning:result.modelWarning||null});button.onclick=()=>select(item);report();}
 const warnings=measurements.filter(m=>m.warning).length;$('.status').textContent=`Six poses ready in ${((performance.now()-started)/1000).toFixed(2)} s · ${requests.length} MHR requests · ${warnings} fallback bodies`;await select({key:'2013-authored'});
 }catch(e){$('.status').textContent=e.message;}finally{loading=false;$('#load').disabled=false;report();}}
$('#load').onclick=()=>{sessionStorage.setItem('saved-body-bench-settings',JSON.stringify({blocked:$('#block').checked,delay:Number($('#delay').value)}));location.reload();};$('#undo').onclick=()=>mounted?.undo();$('#redo').onclick=()=>mounted?.redo();
for(const key of ['feminine','masculine'])$('#'+key).onclick=async()=>{try{await mounted?.setBodyShape(BODY_PRESETS[key],true);}catch(e){$('.status').textContent=e.message;}};
load();

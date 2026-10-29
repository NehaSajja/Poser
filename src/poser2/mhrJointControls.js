import {Plane,Raycaster,Vector2,Vector3} from 'three';
import {createJointDrag} from './jointDrag';

// Native parameters keep MHR pose correctives active. Updates are coalesced;
// history commits only after the final surface for a gesture has arrived.
export function createMhrJointControls({rig,camera,container,orbit,invalidate,onEdit,onCommit,history,onControlsChange}){
 const native=rig.mhr,overlay=document.createElement('div');overlay.className='poser2-joints';overlay.setAttribute('role','group');overlay.setAttribute('aria-label','MHR pose joints');overlay.inert=true;container.append(overlay);
 const status=document.createElement('div');status.className='poser2-mhr-status';status.setAttribute('role','status');container.append(status);
 let enabled=false,disposed=false,pending=null,running=null,commitWhenIdle=false,version=0;
 const abort=new AbortController();
 const actions=()=>onControlsChange?.({canUndo:history.canUndo,canRedo:history.canRedo});
 const repaint=()=>{onEdit();invalidate();};
 async function flush(){
   while(pending&&!disposed){const {body,token,notice}=pending;pending=null;
    try{const packet=await native.evaluate(body,abort.signal);if(disposed)break;
      // A new gesture/reset invalidates previous requests, but intermediate frames
      // within the same drag still render so long drags never starve the viewer.
      if(token===version){native.apply(packet);status.textContent=notice;repaint();}
    }catch(error){if(!disposed){pending=null;commitWhenIdle=false;status.textContent=error.message;}}
   }
   running=null;
   if(commitWhenIdle&&!disposed){commitWhenIdle=false;history.commit(native.params);onCommit();actions();}
 }
 function queue(body,notice=''){pending={body,token:version,notice};if(!running)running=flush();}
 function commit(){commitWhenIdle=true;if(!running){commitWhenIdle=false;history.commit(native.params);onCommit();actions();}}
 const ray=new Raycaster(),plane=new Plane(),point=new Vector3();
 const hit=e=>{const b=container.getBoundingClientRect();ray.setFromCamera(new Vector2((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2),camera);return ray.ray.intersectPlane(plane,point);};
 const position=h=>rig.joints.get(h.role).getWorldPosition(new Vector3());
 const upper=(h,params,dx,dy)=>{
   const next=[...params];let clamped=false;
   const change=(name,degrees)=>{const i=native.meta.names.indexOf(name),desired=next[i]+degrees*Math.PI/180,[lo,hi]=native.meta.limits[i];next[i]=Math.max(lo,Math.min(hi,desired));clamped||=Math.abs(next[i]-desired)>1e-6;};
   if(h.kind==='head'){change('head_bend',-dy*.45);change('head_twist',dx*.45);}
   else if(h.kind==='torso'){for(const i of [0,1]){change(`spine_bend${i}`,-dy*.3);change(`spine_lean${i}`,dx*.3);}}
   else change(h.role.startsWith('Left')?'l_clavicle_ry':'r_clavicle_ry',dy*.25);
   return {params:next,notice:clamped?'Native joint limit reached. Move back to continue adjusting.':''};
 };
 const specs=[...['Left','Right'].flatMap(side=>[['ForeArm','elbow'],['Hand','wrist'],['Leg','knee'],['Foot','ankle']].map(([part,label])=>({role:side+part,kind:'limb',label:`${side} ${label}`}))),
  {role:'Spine2',kind:'torso',label:'Torso tilt'},{role:'Head',kind:'head',label:'Head turn and nod'},
  {role:'LeftArm',kind:'shoulder',label:'Left shoulder'},{role:'RightArm',kind:'shoulder',label:'Right shoulder'}];
 const drag=createJointDrag({surface:container,
  begin(e,h){if(!enabled)return null;version++;commitWhenIdle=false;pending=null;
   h.button.focus({preventScroll:true});camera.updateMatrixWorld();
   const start=position(h);plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()),start);const p=hit(e);if(!p)return null;
   const orbitEnabled=orbit.enabled;orbit.enabled=false;h.button.dataset.dragging='true';
   return {...h,params:[...native.params],packet:native.capture(),startX:e.clientX,startY:e.clientY,offset:start.sub(p),orbitEnabled};
  },
  move(a,e){if(a.kind==='limb'){const p=hit(e);if(!p)return;const local=rig.root.worldToLocal(p.clone().add(a.offset));queue({params:a.params,limb:{role:a.role,target:local.toArray()}});}
   else {const next=upper(a,a.params,e.clientX-a.startX,a.startY-e.clientY);queue({params:next.params},next.notice);}
  },
  end(a,reason){a.button.removeAttribute('data-dragging');orbit.enabled=a.orbitEnabled;
   if(reason==='escape'){version++;pending=null;commitWhenIdle=false;native.apply(a.packet);repaint();actions();}
   else if(reason!=='dispose')commit();
  }
 });
 const handles=specs.map(h=>{const b=document.createElement('button');h.button=b;b.type='button';b.className='poser2-joint';b.dataset.joint=h.kind;b.setAttribute('aria-label',h.label);b.title=h.label;
  b.addEventListener('pointerdown',e=>drag.start(e,h));
  b.addEventListener('keydown',e=>{
   const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};if(!enabled||!dirs[e.key]||drag.active)return;
   e.preventDefault();e.stopPropagation();const [x,y]=dirs[e.key],step=e.shiftKey?16:4;version++;
   if(h.kind==='limb'){const scale=(camera.top-camera.bottom)/camera.zoom/container.clientHeight;const target=position(h).add(new Vector3(x*step*scale,y*step*scale,0).applyQuaternion(camera.quaternion));queue({params:native.params,limb:{role:h.role,target:rig.root.worldToLocal(target).toArray()}});}
   else {const next=upper(h,native.params,x*step,y*step);queue({params:next.params},next.notice);}commit();
  });overlay.append(b);return h;
 });
 const finish=async()=>{drag.finish('commit');if(running)await running;};
 const navigate=async(direction)=>{await finish();if(disposed)return;const state=history[direction]();if(!state)return;version++;queue({params:state});await running;if(!disposed){onCommit();actions();}};
 const key=e=>{if(e.key==='Escape'&&drag.active){e.preventDefault();e.stopPropagation();drag.finish('escape');}else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();void navigate(e.shiftKey?'redo':'undo');}};
 container.addEventListener('keydown',key);actions();
 return {finish,cancelPending(){version++;pending=null;commitWhenIdle=false;},undo:()=>navigate('undo'),redo:()=>navigate('redo'),
  setEnabled(value){if(!value)drag.finish('hide');enabled=value;overlay.inert=!value;overlay.dataset.visible=String(value);},
  update(){camera.updateMatrixWorld();const {width,height}=container.getBoundingClientRect();for(const h of handles){const p=position(h).project(camera);h.button.style.visibility=Math.abs(p.x)>1||Math.abs(p.y)>1||Math.abs(p.z)>1?'hidden':'visible';h.button.style.left=`${(p.x+1)*width/2}px`;h.button.style.top=`${(1-p.y)*height/2}px`;h.button.style.zIndex=String(2+Math.round((1-p.z)*100));}},
  dispose(){disposed=true;version++;pending=null;abort.abort();drag.dispose();overlay.remove();status.remove();container.removeEventListener('keydown',key);}
 };
}

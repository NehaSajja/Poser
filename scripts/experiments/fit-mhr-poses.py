"""Fit native MHR pose parameters to the existing six comparison skeletons.
No images, SAM calls, or body-identity optimization. Uses the official native
parameter limits; records residual error rather than claiming identical anatomy.
Run export-pose-targets.mjs first, then this script in .local/mhr-env.
"""
import json, time
from pathlib import Path
import numpy as np
import torch
from scipy.spatial.transform import Rotation

torch.set_num_threads(2)
root = Path(__file__).resolve().parents[2]
model = torch.jit.load(str(root / '.local/mhr/assets/mhr_model.pt'), map_location='cpu').eval()
names = list(model.get_parameter_names()); joints = list(model.get_joint_names())
count = len(names) - 45
limits = model.get_parameter_limits()[:count]
# Body articulation only. Fingers retain MHR's neutral hand for this first test.
active = [i for i,n in enumerate(names[:68]) if i >= 3 and limits[i,1] > limits[i,0]]
indices = torch.tensor(active)
low, high = limits[indices,0], limits[indices,1]
mapping = {'Hips':'root','Spine':'c_spine0','Spine1':'c_spine1','Spine2':'c_spine3','Neck':'c_neck','Head':'c_head'}
for side, prefix in [('Left','l'),('Right','r')]:
 for role, native in [('Shoulder','clavicle'),('Arm','uparm'),('ForeArm','lowarm'),('Hand','wrist'),('UpLeg','upleg'),('Leg','lowleg'),('Foot','foot'),('ToeBase','ball')]:
  mapping[side+role]=prefix+'_'+native
roles=list(mapping); joint_indices=torch.tensor([joints.index(mapping[r]) for r in roles])
def skeleton(params):
 full=torch.cat([params,torch.zeros(45)]).unsqueeze(0)
 return model.character_torch.joint_parameters_to_skeleton_state(model.character_torch.model_parameters_to_joint_parameters(full))[0]
rest=skeleton(torch.zeros(count)).detach()
def point(s,r): return s[joints.index(mapping[r]),:3]
stature=(point(rest,'LeftLeg')-point(rest,'LeftUpLeg')).norm()+(point(rest,'LeftFoot')-point(rest,'LeftLeg')).norm()+(point(rest,'Head')-point(rest,'Hips')).norm()
edges=[('Hips','Head'),('LeftUpLeg','RightUpLeg')]+[(side+a,side+b) for side in ['Left','Right'] for a,b in [('Arm','ForeArm'),('ForeArm','Hand'),('UpLeg','Leg'),('Leg','Foot'),('Foot','ToeBase')]]
aidx=torch.tensor([roles.index(a) for a,b in edges]); bidx=torch.tensor([roles.index(b) for a,b in edges])
orient_roles=['Hips','Head','LeftHand','RightHand','LeftFoot','RightFoot']
orient_idx=torch.tensor([joints.index(mapping[r]) for r in orient_roles])
results=[]
for row in json.loads((root/'.local/mhr-pose-targets.json').read_text()):
 started=time.perf_counter()
 targets=torch.tensor([row['positions'][r] for r in roles])
 dirs=torch.nn.functional.normalize(targets[bidx]-targets[aidx],dim=-1)
 desired=[]
 for role in orient_roles:
  delta=Rotation.from_quat(row['orientations'][role]); bind=Rotation.from_quat(rest[joints.index(mapping[role]),3:7].numpy())
  desired.append((delta*bind).as_quat())
 desired=torch.tensor(np.array(desired),dtype=torch.float32)
 seed=torch.zeros(count)
 seed[3:6]=torch.tensor(Rotation.from_quat(row['orientations']['Hips']).as_euler('xyz'),dtype=torch.float32)
 x=torch.nn.Parameter(seed[indices].clone())
 optimizer=torch.optim.LBFGS([x],lr=.8,max_iter=220,tolerance_grad=1e-7,tolerance_change=1e-9,line_search_fn='strong_wolfe')
 def closure():
  optimizer.zero_grad()
  bounded=torch.maximum(low,torch.minimum(high,x))
  params=torch.zeros(count).index_copy(0,indices,bounded)
  s=skeleton(params); points=(s[joint_indices,:3]-s[joints.index('root'),:3])/stature
  directions=torch.nn.functional.normalize(points[bidx]-points[aidx],dim=-1)
  orientation=1-(s[orient_idx,3:7]*desired).sum(-1).square()
  loss=(points-targets).square().sum()+.13*(directions-dirs).square().sum()+.04*orientation.sum()+.0001*bounded[3:].square().sum()+10*(x-bounded).square().sum()
  loss.backward();return loss
 optimizer.step(closure)
 with torch.no_grad():
  params=torch.zeros(count).index_copy(0,indices,torch.maximum(low,torch.minimum(high,x)))
  s=skeleton(params); points=(s[joint_indices,:3]-s[joints.index('root'),:3])/stature
  errors=(points-targets).norm(dim=-1)
  directions=torch.nn.functional.normalize(points[bidx]-points[aidx],dim=-1)
  angles=torch.acos(torch.clamp((directions*dirs).sum(-1),-1,1))*180/torch.pi
 result={'id':row['id'],'name':row['name'],'params':params.tolist(),'meanJointErrorPercent':float(errors.mean()*100),'maxJointErrorPercent':float(errors.max()*100),'maxDirectionErrorDegrees':float(angles.max()),'seconds':time.perf_counter()-started}
 print(row['id'], {k:round(v,3) for k,v in result.items() if isinstance(v,float)},flush=True)
 results.append(result)
(root/'server/experiments/mhr-poses.json').write_text(json.dumps({'source':'Six bundled PMA skeletons fitted to MHR v1.0.1 native articulation; fixed identity; hands neutral.','poses':results},indent=2)+'\n')

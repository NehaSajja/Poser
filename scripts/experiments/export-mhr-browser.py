"""Export only MHR's rig math/weights for the browser preview, never the corrective network.
The full Torch model remains the authoritative correction reference.
"""
from pathlib import Path
import sys, json, shutil
import numpy as np
import torch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'server/experiments'))
import mhr_server as m
c=m.MODEL.character_torch
transform=c.parameter_transform.parameter_transform[:,:204]
rows=[]
for row in transform:
 ids=row.nonzero().flatten().tolist(); rows.append([[i,float(row[i])] for i in ids])
lbs=c.linear_blend_skinning
runtime={'version':1,'source':'Meta MHR v1.0.1; Apache-2.0','vertexCount':18439,
 'parents':c.skeleton.joint_parents.tolist(),'names':m.NAMES,'jointNames':m.JOINTS,'mapping':m.MAPPING,
 'offsets':c.skeleton.joint_translation_offsets.tolist(),'preRotations':c.skeleton.joint_prerotations.tolist(),
 'transform':rows,'limits':m.LIMITS.tolist(),'inverseBind':lbs.inverse_bind_pose.tolist(),
 'skinJoints':lbs.skin_indices_flattened.tolist(),'skinWeights':lbs.skin_weights_flattened.tolist(),
 'skinVertices':lbs.vert_indices_flattened.tolist()}
out=ROOT/'public/experiments';out.mkdir(exist_ok=True)
(out/'mhr-browser-rig.json').write_text(json.dumps(runtime,separators=(',',':')))
shutil.copyfile(ROOT/'.local/mhr/LICENSE',out/'MHR-LICENSE.txt')
fixtures=ROOT/'.local/mhr-browser-fixtures';fixtures.mkdir(exist_ok=True)
cases=[]
for index,p in enumerate(m.POSES.values()):
 for shape in [{'silhouette':1,'fullness':-.8,'height':1},{'silhouette':-2,'fullness':3,'height':.85}]:
  params=torch.tensor(p['params']);identity,shaped=m.shape_parameters(params,shape)
  packet=m.surface_packet(params,shape)
  name=f"{p['id']}-{len(cases)}"
  (fixtures/(name+'.bin')).write_bytes(packet)
  cases.append({'name':name,'pose':p['id'],'params':params.tolist(),'shape':shape})
(fixtures/'cases.json').write_text(json.dumps(cases))
print('Browser rig bytes:',(out/'mhr-browser-rig.json').stat().st_size,'fixtures:',len(cases))

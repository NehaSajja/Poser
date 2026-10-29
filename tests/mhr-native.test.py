"""Run in the isolated MHR environment; exercises the actual model, no network."""
import importlib.util
import json
from pathlib import Path
import time
import unittest
import numpy as np
import torch

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mhr_server',root/'server/experiments/mhr_server.py')
service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)

def skeleton(pose, offsets):
 params,_=service.parameters(pose,offsets)
 with torch.inference_mode():
  full=torch.cat([params,torch.zeros(45)])[None]
  return service.MODEL.character_torch.joint_parameters_to_skeleton_state(service.MODEL.character_torch.model_parameters_to_joint_parameters(full))[0].numpy()

def joint(s,name):return s[service.JOINTS.index(name)]
def same(a,b,names):
 for name in names:np.testing.assert_allclose(joint(a,name),joint(b,name),atol=1e-5)

def changed(a,b,name, rotation=False):
 start=3 if rotation else 0;end=7 if rotation else 3
 assert np.linalg.norm(joint(a,name)[start:end]-joint(b,name)[start:end])>1e-3, name

class NativeMHRTests(unittest.TestCase):
 def test_all_poses_and_upper_controls(self):
  for pose in service.POSES:
   with self.subTest(pose=pose):
    base=skeleton(pose,{})
    torso=skeleton(pose,{'torso':10})
    same(base,torso,['root','l_upleg','r_upleg','l_foot','r_foot'])
    for name in ['c_head','l_wrist','r_wrist']:changed(base,torso,name)
    for control in ['nod','turn']:
     head=skeleton(pose,{control:15})
     same(base,head,['root','c_spine3','l_wrist','r_wrist','l_foot','r_foot'])
     changed(base,head,'c_head',rotation=True)
    for control,side,other in [('left','l','r'),('right','r','l')]:
     # Start these checks from neutral clavicle so a fitted upper limit doesn't mask movement.
     modified=skeleton(pose,{control:-10});raised=skeleton(pose,{control:10})
     same(modified,raised,['root','c_head',other+'_wrist','l_foot','r_foot'])
     changed(modified,raised,side+'_wrist')
    for offsets in [{},{'torso':20,'nod':20,'turn':30,'left':10,'right':-10}, {'torso':-25,'lean':20,'nod':-20,'turn':-30,'left':-10,'right':15}]:
     payload,ms,clamped=service.evaluate(pose,offsets)
     data=np.frombuffer(payload,dtype='<f4');n=18439*3
     self.assertEqual(len(data),n*2+len(service.JOINTS)*3)
     self.assertTrue(np.isfinite(data).all())
     # The corrective path must actually change the surface.
     self.assertGreater(np.linalg.norm(data[:n]-data[n:n*2]),.001)
     faces=service.MODEL.character_torch.mesh.faces.numpy()
     for part in [data[:n],data[n:n*2]]:
      vertices=part.reshape(-1,3);tri=vertices[faces]
      areas=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
      self.assertTrue(np.isfinite(areas).all())
      self.assertLess(float(areas.max()),.1) # no exploding triangles in a metre-scale body

 def test_stateless_reset_and_limits(self):
  base,_,_=service.evaluate('2013',{})
  service.evaluate('2013',{'torso':30,'turn':60,'left':25})
  reset,_,_=service.evaluate('2013',{})
  self.assertEqual(base,reset)
  params,clamped=service.parameters('2013',{'turn':60,'left':25})
  self.assertTrue(clamped)
  self.assertTrue(torch.all(params>=service.LIMITS[:,0]-1e-5))
  self.assertTrue(torch.all(params<=service.LIMITS[:,1]+1e-5))

 def test_local_api_contract(self):
  client=service.app.test_client()
  self.assertEqual(client.get('/api/meta').status_code,200)
  self.assertEqual(client.post('/api/evaluate',json={'pose':'unknown'}).status_code,400)
  self.assertEqual(client.post('/api/evaluate',json={'pose':'2013','offsets':{'turn':999}}).status_code,400)
  self.assertEqual(client.post('/api/evaluate',json={'pose':'2013','offsets':{'turn':True}}).status_code,400)
  self.assertEqual(client.post('/api/evaluate',json={'pose':'2013'},headers={'Origin':'https://example.com'}).status_code,403)
  response=client.post('/api/evaluate',json={'pose':'2013','offsets':{'nod':10}})
  self.assertEqual(response.status_code,200)
  self.assertEqual(response.mimetype,'application/octet-stream')

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(NativeMHRTests)
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 if result.wasSuccessful():
  samples=[service.evaluate('2013',{'torso':i%20})[1] for i in range(30)]
  report={'passes':result.testsRun,'poses':len(service.POSES),'pairedSurfaceMedianMs':float(np.median(samples)),'pairedSurfaceP95Ms':float(np.percentile(samples,95)),'scope':'CPU local MHR corrections off+on; excludes browser/network; fixed identity, no SAM'}
  (root/'.local/mhr-validation.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report,indent=2))
 raise SystemExit(not result.wasSuccessful())

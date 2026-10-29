"""Actual local model checks for the isolated body-shape bench."""
import importlib.util
from pathlib import Path
import unittest
import itertools
import numpy as np
import torch

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mhr_server',root/'server/experiments/mhr_server.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
N=18439*3

def unpack(payload):
 a=np.frombuffer(payload,dtype='<f4')
 return a[:N].reshape(-1,3),a[N:2*N].reshape(-1,3),a[2*N:].reshape(2,-1,3)

class ShapeTests(unittest.TestCase):
 def test_baseline_exact_and_no_shared_mutation(self):
  before=s.surface_packet(s.parameters('2013',{})[0])
  for pose in ['neutral', *s.POSES]:
   a,b,sk=unpack(s.evaluate_shape(pose,{}, {})[0]);np.testing.assert_array_equal(a,b);np.testing.assert_array_equal(sk[0],sk[1])
  s.evaluate_shape('2013',{'torso':20},{'silhouette':1,'fullness':1.2,'height':1.15})
  self.assertEqual(before,s.surface_packet(s.parameters('2013',{})[0]))
  self.assertEqual(float(s.IDENTITY.abs().sum()),0)

 def test_all_pose_shape_extremes_and_controls(self):
  faces=s.MODEL.character_torch.mesh.faces.numpy()
  for pose,appearance,fullness,height in itertools.product(['neutral', *s.POSES],[-1,1],[-.8,1.2],[.85,1.15]):
   with self.subTest(pose=pose,appearance=appearance,fullness=fullness,height=height):
    a,b,sk=unpack(s.evaluate_shape(pose,{'torso':10,'nod':15,'turn':20,'left':8,'right':-8},{'silhouette':appearance,'fullness':fullness,'height':height})[0])
    self.assertTrue(np.isfinite(b).all());self.assertTrue(np.isfinite(sk).all())
    self.assertAlmostEqual(float(b[:,1].min()),0,places=6)
    self.assertGreater(float(np.linalg.norm(a-b)),.1)
    tri=b[faces];area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
    self.assertLess(float(area.max()),.1)

 def test_uniform_height_and_handle_alignment(self):
  _,b,sk=unpack(s.evaluate_shape('1176',{}, {})[0])
  _,scaled,sk_scaled=unpack(s.evaluate_shape('1176',{}, {'height':1.15})[0])
  np.testing.assert_allclose(scaled,b*1.15,atol=3e-7)
  np.testing.assert_allclose(sk_scaled[1],sk[1]*1.15,atol=3e-7)
  for control,joint,rotation in [('torso','l_wrist',False),('left','l_wrist',False),('right','r_wrist',False),('nod','c_head',True),('turn','c_head',True)]:
   p,_=s.parameters('1176',{});p2,_=s.parameters('1176',{control:10})
   values=s.shape_inputs({'silhouette':1,'fullness':1})
   identity,p=s.shape_parameters(p,values);_,p2=s.shape_parameters(p2,values)
   with torch.inference_mode():
    _,one=s.MODEL(identity,p[None],s.EXPRESSION,apply_correctives=True)
    _,two=s.MODEL(identity,p2[None],s.EXPRESSION,apply_correctives=True)
   j=s.JOINTS.index(joint);sl=slice(3,7) if rotation else slice(0,3)
   self.assertGreater(float(torch.linalg.norm(one[0,j,sl]-two[0,j,sl])),1e-4)

 def test_api_rejects_invalid_shape(self):
  client=s.app.test_client()
  for body in [None,[],{'pose':'unknown'},{'pose':'2013','shape':{'height':0}},{'pose':'2013','shape':{'fullness':True}},{'pose':'2013','shape':{'silhouette':99}},{'pose':'2013','shape':{'extra':1}}]:
   self.assertEqual(client.post('/api/shape',json=body).status_code,400)
  self.assertEqual(client.post('/api/shape',json={'pose':'2013'},headers={'Origin':'https://example.com'}).status_code,403)
  response=client.post('/api/shape',json={'pose':'2013','shape':{'fullness':.5}})
  self.assertEqual(response.status_code,200)
  self.assertEqual(len(response.data)//4,2*N+len(s.JOINTS)*6)

if __name__=='__main__':unittest.main(verbosity=2)

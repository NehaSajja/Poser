"""Native Poser flow: arbitrary source fitting, isolated limb edits, packet contract."""
import importlib.util
import json
from pathlib import Path
import unittest
import numpy as np
import torch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mhr_flow_service',ROOT/'server/experiments/mhr_server.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)

class FlowTests(unittest.TestCase):
 def test_source_fit_and_packet_for_all_source_fixtures(self):
  source=json.loads((ROOT/'.local/mhr-pose-targets.json').read_text())
  for row in source:
   with self.subTest(pose=row['id']):
    params,error=s.fit_source(row)
    self.assertLess(error,7)
    self.assertTrue(torch.isfinite(params).all())
    data=np.frombuffer(s.surface_packet(params),dtype='<f4')
    self.assertEqual(len(data),18439*3+127*8+204)
    self.assertTrue(np.isfinite(data).all())
    np.testing.assert_allclose(data[-204:],params.numpy())
    repeated,repeated_error=s.fit_source(row)
    np.testing.assert_array_equal(repeated.numpy(),params.numpy())
    self.assertEqual(error,repeated_error)

 def test_each_limb_moves_toward_target_without_moving_others(self):
  for pose in ['2013','1351','1010']:
   for role in ['LeftForeArm','RightForeArm','LeftHand','RightHand','LeftLeg','RightLeg','LeftFoot','RightFoot']:
    with self.subTest(pose=pose,role=role):
     params=torch.tensor(s.POSES[pose]['params']);base=s.fk(params).detach()
     ji=s.JOINTS.index(s.MAPPING[role]);target=base[ji,:3].numpy()/100+np.array([.04,.03,0])
     fitted=s.solve_native_limb(params,{'role':role,'target':target.tolist()})
     after=s.fk(fitted).detach();before_error=np.linalg.norm(base[ji,:3].numpy()/100-target);after_error=np.linalg.norm(after[ji,:3].numpy()/100-target)
     self.assertLess(after_error,before_error)
     for unchanged in ['root','c_head']+[('r_' if role.startswith('Left') else 'l_')+part for part in ['wrist','foot']]:
      idx=s.JOINTS.index(unchanged);np.testing.assert_allclose(base[idx],after[idx],atol=1e-5)
     self.assertTrue(torch.all(fitted>=s.LIMITS[:,0]-1e-5));self.assertTrue(torch.all(fitted<=s.LIMITS[:,1]+1e-5))

 def test_flow_api_and_bounded_fixed_body(self):
  client=s.app.test_client();meta=client.get('/api/flow-meta').json
  self.assertEqual(meta['protocol'],1);self.assertEqual(len(meta['parents']),127)
  params=s.POSES['2013']['params']
  response=client.post('/api/flow',json={'params':params});self.assertEqual(response.status_code,200)
  self.assertEqual(response.mimetype,'application/octet-stream')
  for bad in [{'params':[0]},{'params':params,'limb':{'role':'other','target':[0,0,0]}},{'source':{}}, {'params':[float('nan')]*204}]:
   self.assertEqual(client.post('/api/flow',json=bad).status_code,400)
  changed=list(params);changed[150]=.2
  self.assertEqual(client.post('/api/flow',json={'params':changed}).status_code,400)

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(FlowTests))
 if result.wasSuccessful():
  client=s.app.test_client()
  (ROOT/'.local/mhr-flow-meta.json').write_text(json.dumps(client.get('/api/flow-meta').json))
  (ROOT/'.local/mhr-flow-topology.bin').write_bytes(client.get('/api/topology').data)
  (ROOT/'.local/mhr-flow-pose.bin').write_bytes(s.surface_packet(torch.tensor(s.POSES['2013']['params'])))
 raise SystemExit(not result.wasSuccessful())

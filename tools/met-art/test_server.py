import json,tempfile,threading,time,unittest,urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
import server

class JobsTests(unittest.TestCase):
    def setUp(self):
        server.JOBS.clear()
        self.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.thread.join();server.JOBS.clear()
    def post(self,pose):
        request=urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}/api/search',json.dumps({'pose':pose,'view':'authored'}).encode(),{'Content-Type':'application/json'})
        return json.load(urllib.request.urlopen(request))
    def test_same_running_query_reuses_job(self):
        server.JOBS['existing']={'status':'running','query':('1321','authored','hybrid')}
        self.assertEqual(self.post('1321'),{'id':'existing'})
    def test_four_uncached_poses_run_concurrently(self):
        release=threading.Event();started=set();lock=threading.Lock()
        def compare(pose,*args):
            with lock:started.add(pose)
            release.wait(3)
            return {'warning':None,'results':[]}
        with patch.object(server.search,'cached_result',return_value=None),patch.object(server.search,'search',side_effect=compare):
            ids=[self.post(pose)['id'] for pose in ['1321','1010','201','1343']]
            deadline=time.monotonic()+2
            while len(started)<4 and time.monotonic()<deadline:time.sleep(.01)
            try:self.assertEqual(len(started),4)
            finally:release.set()
            while any(server.JOBS[id]['status']!='done' for id in ids) and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(all(server.JOBS[id]['status']=='done' for id in ids))
    def test_cached_pose_loads_while_another_query_runs_and_prunes_old_jobs(self):
        server.JOBS['active']={'status':'running','query':('1010','authored','hybrid')}
        for i in range(35):server.JOBS[str(i)]={'status':'error','error':'old'}
        with tempfile.TemporaryDirectory() as temp,patch.object(server.search,'CACHE',Path(temp)):
            (Path(temp)/f'{server.search.VERSION}-1321-authored-hybrid.json').write_text(json.dumps({'results':[],'warning':None}))
            job=server.JOBS[self.post('1321')['id']]
            self.assertEqual(job['status'],'done');self.assertTrue(job['result']['cached'])
            self.assertIn('active',server.JOBS);self.assertLessEqual(len(server.JOBS),32)
if __name__=='__main__':unittest.main()

import json,tempfile,unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from usage import DailyQuota

class QuotaTests(unittest.TestCase):
    def test_threads_restart_rollover_and_corruption(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'quota.json';day=['2026-10-21']
            quota=DailyQuota(path,3,lambda:day[0])
            def call(_):
                try:quota.reserve();return True
                except RuntimeError:return False
            with ThreadPoolExecutor(max_workers=8) as pool:
                self.assertEqual(sum(pool.map(call,range(20))),3)
            restarted=DailyQuota(path,3,lambda:day[0])
            with self.assertRaises(RuntimeError):restarted.reserve()
            day[0]='2026-10-22';restarted.reserve()
            self.assertEqual(json.loads(path.read_text())['used'],1)
            path.write_text('broken')
            with self.assertRaises(ValueError):DailyQuota(path,3)
    def test_zero_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(RuntimeError):DailyQuota(Path(d)/'quota.json',0).reserve()
    def test_total_survives_rollover_restart_and_concurrency(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'quota.json';day=['2026-10-21']
            quota=DailyQuota(path,10,lambda:day[0],total_limit=2)
            def call(_):
                try:quota.reserve();return True
                except RuntimeError:return False
            with ThreadPoolExecutor(max_workers=8) as pool:
                self.assertEqual(sum(pool.map(call,range(20))),2)
            day[0]='2026-10-22'
            with self.assertRaisesRegex(RuntimeError,'overall demo allowance'):
                DailyQuota(path,10,lambda:day[0],total_limit=2).reserve()
            path.write_text(json.dumps({'day':day[0],'used':1,'total':-1}))
            with self.assertRaises(ValueError):DailyQuota(path,10,total_limit=2)

if __name__=='__main__':unittest.main()

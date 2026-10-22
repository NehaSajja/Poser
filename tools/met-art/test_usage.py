import json,tempfile,unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from usage import DailyQuota, quota_limit

class QuotaTests(unittest.TestCase):
    def test_explicit_unlimited_retains_counts_across_restart(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'quota.json';day='2026-10-22'
            path.write_text(json.dumps({'day':day,'used':340,'total':340}))
            for _ in range(2):
                quota=DailyQuota(path,quota_limit('unlimited'),lambda:day,total_limit=quota_limit('unlimited'))
                with ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(lambda _:quota.reserve(),range(20)))
            self.assertEqual(json.loads(path.read_text()),{'day':day,'used':380,'total':380})
            with self.assertRaisesRegex(RuntimeError,'overall demo allowance'):
                DailyQuota(path,1000,lambda:day,total_limit=380).reserve()
    def test_limit_configuration_rejects_typos(self):
        self.assertEqual(quota_limit('0'),0)
        self.assertEqual(quota_limit('340'),340)
        for value in ('','Unlimited','-1','none','1.5',None):
            with self.assertRaises(ValueError):quota_limit(value)
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

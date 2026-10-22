import io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock,patch
import search

class SearchTests(unittest.TestCase):
    def test_comparison_retries_transient_errors_with_bounded_backoff(self):
        responses=[Mock(status_code=503),Mock(status_code=503),Mock(status_code=200)]
        with patch.object(search.requests,'post',side_effect=responses) as post,patch.object(search.time,'sleep') as sleep:
            self.assertIs(search.comparison_request('https://example.test'),responses[-1])
            self.assertEqual(post.call_count,3)
            self.assertEqual([call.args[0] for call in sleep.call_args_list],[1,2])
        with patch.object(search.requests,'post',return_value=responses[0]) as post,patch.object(search.time,'sleep'):
            self.assertIs(search.comparison_request('https://example.test'),responses[0])
            self.assertEqual(post.call_count,3)
        with patch.object(search.requests,'post',return_value=Mock(status_code=401)) as post:
            search.comparison_request('https://example.test')
            self.assertEqual(post.call_count,1)
    def test_invalid_query_is_rejected_before_loading_model(self):
        for args in [('unknown',),('1010','side'),('1010','authored','unsupported')]:
            with self.assertRaises(ValueError):search.search(*args)
    def test_cache_is_separate_for_pose_view_and_mode(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(search,'CACHE',Path(tmp)):
            for pose,view,mode in [('1010','authored','hybrid'),('1010','front','hybrid'),('1010','authored','image'),('1321','authored','hybrid')]:
                marker=f'{pose}-{view}-{mode}'
                (Path(tmp)/f'{search.VERSION}-{marker}.json').write_text(json.dumps({'marker':marker}))
            for pose,view,mode in [('1010','authored','hybrid'),('1010','front','hybrid'),('1010','authored','image'),('1321','authored','hybrid')]:
                r=search.search(pose,view,mode);self.assertTrue(r['cached']);self.assertEqual(r['marker'],f'{pose}-{view}-{mode}')
    def test_visual_judgments_cannot_introduce_unknown_artworks(self):
        rows=[{'objectID':1,'primaryImage':'https://images.metmuseum.org/a.jpg','retrievalScore':.2},{'objectID':2,'primaryImage':'https://images.metmuseum.org/b.jpg','retrievalScore':.1}]
        judgment={'results':[{'id':999,'poseScore':100},{'id':1,'poseScore':50,'reason':'partial'},{'id':2,'poseScore':80,'reason':'closer'}]}
        with patch.object(search,'image_bytes',return_value=b'image'),patch.object(search,'gemini',return_value=judgment):
            result=search.rerank(b'query',rows,lambda _:None)
        self.assertEqual([r['objectID'] for r in result],[2,1])
    def test_isolated_fragments_are_removed_by_individual_audit(self):
        rows=[{'objectID':1,'primaryImage':'https://images.metmuseum.org/a.jpg','retrievalScore':.2}]
        judgment={'results':[{'id':1,'poseScore':90,'visibleBody':False,'reason':'isolated arm','difference':'body absent'}]}
        with patch.object(search,'image_bytes',return_value=b'image'),patch.object(search,'gemini',return_value=judgment):
            self.assertEqual(search.rerank(b'query',rows,lambda _:None),[])
    def test_drawings_beat_comparable_abstract_sculpture(self):
        drawing={'classification':'Drawings','poseScore':74,'naturalism':85,'retrievalScore':.01}
        abstract={'classification':'Sculpture','poseScore':82,'naturalism':20,'retrievalScore':.02}
        self.assertGreater(search.reference_rank(drawing),search.reference_rank(abstract))
        self.assertEqual(drawing['poseScore'],74)
    def test_naturalistic_sculpture_is_preferred_at_equal_pose_similarity(self):
        base={'classification':'Sculpture','poseScore':80,'retrievalScore':.01}
        self.assertGreater(search.reference_rank({**base,'naturalism':90}),search.reference_rank({**base,'naturalism':25}))
    def test_style_cannot_rescue_unrelated_pose(self):
        weak={'classification':'Drawings','poseScore':20,'naturalism':100}
        close={'classification':'Sculpture','poseScore':90,'naturalism':90}
        self.assertEqual(search.reference_rank(weak),20)
        self.assertGreater(search.reference_rank(close),search.reference_rank(weak))
    def test_study_title_does_not_misclassify_sculpture_as_drawing(self):
        self.assertEqual(search.reference_medium({'title':'Study of a leg','classification':'Sculpture','medium':'Bronze'}),'sculpture')
    def test_highlight_boost_is_modest_and_does_not_change_pose_label(self):
        row={'classification':'Paintings','poseScore':70,'naturalism':90}
        self.assertEqual(search.reference_rank({**row,'isHighlight':True})-search.reference_rank(row),8)
        self.assertEqual(row['poseScore'],70)
        self.assertEqual(search.reference_rank({**row,'poseScore':20,'isHighlight':True}),20)
    def test_up_to_thirty_verified_results_with_replacements_for_failed_audits(self):
        import re
        rows=[{'objectID':i,'primaryImage':'https://images.metmuseum.org/a.jpg','retrievalScore':1/i} for i in range(1,51)]
        def judge(parts):
            ids=[int(id) for part in parts for id in re.findall(r'Artwork ID (\d+)',part.get('text',''))]
            return {'results':[{'id':id,'poseScore':30 if len(ids)==1 and id<=10 else 70,'visibleBody':True,'naturalism':90,'reason':'test','difference':'test'} for id in ids]}
        with patch.object(search,'image_bytes',return_value=b'image'),patch.object(search,'gemini',side_effect=judge):
            results=search.rerank(b'query',rows,lambda _:None)
        self.assertEqual(len(results),30)
        self.assertTrue(all(row['objectID']>10 and row['poseScore']>=40 for row in results))
    def test_downloaded_artworks_are_reused_from_disk(self):
        from PIL import Image
        data=io.BytesIO();Image.new('RGB',(900,900),'white').save(data,'PNG')
        response=Mock(content=data.getvalue())
        with tempfile.TemporaryDirectory() as tmp,patch.object(search,'IMAGE_CACHE',Path(tmp)),patch.object(search.requests,'get',return_value=response) as get:
            first=search.image_bytes('https://images.metmuseum.org/shared.jpg')
            second=search.image_bytes('https://images.metmuseum.org/shared.jpg')
            self.assertEqual(first,second)
            self.assertEqual(get.call_count,1)
            self.assertEqual(Image.open(io.BytesIO(first)).size,(600,600))
    def test_previous_audited_results_are_reused_without_new_comparisons(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(search,'CACHE',Path(tmp)):
            (Path(tmp)/f'{search.LEGACY_VERSION}-1321-authored-hybrid.json').write_text(json.dumps({'marker':'verified legacy'}))
            self.assertEqual(search.cached_result('1321','authored','hybrid')['marker'],'verified legacy')
            self.assertIsNone(search.cached_result('1321','front','hybrid'))
    def test_remote_images_are_restricted_to_the_museum(self):
        with self.assertRaises(ValueError):search.image_bytes('http://127.0.0.1/private')
    def test_fast_rerank_uses_ten_batches_and_ten_audits(self):
        import re
        rows=[{'objectID':i,'primaryImage':'https://images.metmuseum.org/a.jpg','retrievalScore':1/i} for i in range(1,61)]
        def judge(parts):
            ids=[int(id) for part in parts for id in re.findall(r'Artwork ID (\d+)',part.get('text',''))]
            return {'results':[{'id':id,'poseScore':70,'visibleBody':True,'naturalism':90} for id in ids]}
        with patch.object(search,'AUDIT_LIMIT',10),patch.object(search,'image_bytes',return_value=b'image'),patch.object(search,'gemini',side_effect=judge) as model:
            result=search.rerank(b'query',rows,lambda _:None)
        self.assertEqual(len(result),10)
        sizes=[sum('Artwork ID' in part.get('text','') for part in call.args[0]) for call in model.call_args_list]
        self.assertEqual(sizes.count(6),10)
        self.assertEqual(sizes.count(1),10)
    def test_fast_profile_configuration_and_cache_isolation(self):
        import os,subprocess,sys
        with tempfile.TemporaryDirectory() as tmp:
            cache=Path(tmp)/'met-art/results';cache.mkdir(parents=True)
            for version in ('met-mobileclip-v6-compact-parallel',search.LEGACY_VERSION):
                (cache/f'{version}-1321-authored-hybrid.json').write_text('{"marker":"full"}')
            env={**os.environ,'MET_REFERENCE_PROFILE':'fast','POSER_DATA_DIR':tmp,'NODE_ENV':'test'}
            code='import search,json;print(json.dumps([search.CANDIDATE_LIMIT,search.AUDIT_LIMIT,search.cached_result("1321","authored","hybrid"),search.VERSION]))'
            run=subprocess.run([sys.executable,'-c',code],cwd=Path(__file__).parent,env=env,capture_output=True,text=True,check=True)
            self.assertEqual(json.loads(run.stdout),[60,10,None,'met-mobileclip-v6-compact-parallel-fast-60-10'])
            env['MET_REFERENCE_PROFILE']='invalid'
            run=subprocess.run([sys.executable,'-c','import search'],cwd=Path(__file__).parent,env=env,capture_output=True,text=True)
            self.assertNotEqual(run.returncode,0)
if __name__=='__main__':unittest.main()

"""Live comparisons against saved v5 baselines. Use --all-four for concurrent prefetch."""
import argparse,json,time
from concurrent.futures import ThreadPoolExecutor,as_completed
import search
parser=argparse.ArgumentParser()
parser.add_argument('--all-four',action='store_true')
args=parser.parse_args()
search.load()
report=[]
def record(id,r):
    old=json.loads((search.CACHE/f'{search.LEGACY_VERSION}-{id}-authored-hybrid.json').read_text())
    row={'pose':id,'seconds':r['seconds'],'oldSeconds':old['seconds'],'speedup':round(old['seconds']/r['seconds'],2),'timings':r.get('timings'),'count':len(r['results']),'warning':r['warning'],'top':[{'id':x['objectID'],'title':x['title'],'score':x['poseScore']} for x in r['results'][:6]]}
    report.append(row);print(json.dumps(row),flush=True)
start=time.monotonic()
if args.all_four:
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(search.search,id,refresh=True):id for id in ['1321','1010','201','2933']}
        for future in as_completed(jobs):record(jobs[future],future.result())
else:
    for id in ['1321','1010','1343']:record(id,search.search(id,refresh=True))
summary={'seconds':round(time.monotonic()-start,2),'oldSequentialSeconds':round(sum(r['oldSeconds'] for r in report),2),'results':report}
name='four-pose-benchmark' if args.all_four else 'fast-benchmark'
(search.CACHE/f'{name}.json').write_text(json.dumps(summary,indent=2))
print(json.dumps({key:value for key,value in summary.items() if key!='results'}),flush=True)

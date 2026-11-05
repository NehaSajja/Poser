"""Resumable offline library fitting, using the production fitter. No cloud calls.
Saves each fit atomically; changing source, fitter or weights invalidates it.
"""
from pathlib import Path
import sys,json,hashlib,time,math
from concurrent.futures import ProcessPoolExecutor,as_completed
ROOT=Path(__file__).resolve().parents[2]

def init():
 global m
 sys.path.insert(0,str(ROOT/'server/experiments'))
 import mhr_server as m
 m.torch.set_num_threads(1)

 # Bound pathological line searches only in this offline worker. Retain the
 # best finite iterate, rather than publishing the last unstable trial step.
 base=m.torch.optim.LBFGS
 class BoundedFit(base):
  def step(self,closure):
   global timed_out
   deadline=time.perf_counter()+20;best=None;best_loss=float('inf')
   def checked():
    nonlocal best,best_loss
    if time.perf_counter()>deadline:raise TimeoutError('Offline fit deadline')
    loss=closure();value=float(loss.detach())
    if math.isfinite(value) and value<best_loss:
     best_loss=value;best=[p.detach().clone() for g in self.param_groups for p in g['params']]
    return loss
   try:return super().step(checked)
   except TimeoutError:
    if best is None:raise
    timed_out=True
    with m.torch.no_grad():
     for p,v in zip([p for g in self.param_groups for p in g['params']],best):p.copy_(v)
    return m.torch.tensor(best_loss)
 m.torch.optim.LBFGS=BoundedFit

def fit(row):
 global timed_out
 timed_out=False
 start=time.perf_counter()
 source=dict(row['source'],orientations={k:(m.np.asarray(q)/m.np.linalg.norm(q)).tolist() for k,q in row['source']['orientations'].items()})
 try:params,error=m.fit_source(source)
 except Exception as exc:return dict(row,error=repr(exc))
 return dict(row,params=params.tolist(),meanJointErrorPercent=error,timeBounded=timed_out,fitMs=round((time.perf_counter()-start)*1000,2))

def main():
 rows=json.loads((ROOT/'.local/mhr-library-targets.json').read_text())
 weights=ROOT/'.local/mhr/assets/mhr_model.pt'
 h=hashlib.sha256()
 with weights.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 h.update((ROOT/'server/experiments/mhr_server.py').read_bytes());version=h.hexdigest()
 folder=ROOT/'.local/mhr-library-fits'/version;folder.mkdir(parents=True,exist_ok=True)
 results={};pending=[];failures=[]
 for row in rows:
  path=folder/(row['id']+'.json')
  if path.exists():
   saved=json.loads(path.read_text())
   if saved.get('sourceHash')==row['sourceHash']:results[row['id']]=saved;continue
  pending.append(row)
 print(f'{len(results)} saved, {len(pending)} to fit',flush=True)
 with ProcessPoolExecutor(max_workers=2,initializer=init) as pool:
  jobs={pool.submit(fit,row):row for row in pending}
  for job in as_completed(jobs):
   result=job.result()
   if 'error' in result:
    failures.append({'id':result['id'],'error':result['error']});print('FAILED',result['id'],result['error'],flush=True);continue
   path=folder/(result['id']+'.json');temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result));temp.replace(path);results[result['id']]=result
   if len(results)%25==0:print(f'{len(results)}/{len(rows)} fitted',flush=True)
 output={'version':1,'model':'MHR v1.0.1','fingerprint':version,'count':len(results),'failures':failures,'timeBoundedIds':[r['id'] for r in results.values() if r.get('timeBounded')],'ids':sorted(results)}
 folder_out=ROOT/'public/experiments/mhr-library';folder_out.mkdir(exist_ok=True)
 roles=['Hips','Spine','Spine1','Spine2','Neck','Head']+[side+part for side in ['Left','Right'] for part in ['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase']]
 for item in results.values():
  compact=dict(item,version=1,fingerprint=version,source={kind:{r:item['source'][kind][r] for r in roles} for kind in ['positions','orientations']})
  dest=folder_out/(item['id']+'.json');tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps(compact,separators=(',',':')));tmp.replace(dest)
 target=ROOT/'public/experiments/mhr-library-fits.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(output,separators=(',',':')));temp.replace(target)
 print(f'Saved: {len(results)} fits, {target.stat().st_size} manifest bytes',flush=True)
 if failures:raise SystemExit(f'{len(failures)} poses require attention; successful fits were preserved.')
if __name__=='__main__':main()

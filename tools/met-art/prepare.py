"""Download the published Met vectors and metadata columns only (no artwork corpus)."""
import io, json, os, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, numpy as np, pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[2]/'.local/met-art/data'; ROOT.mkdir(parents=True,exist_ok=True)
EMB='metmuseum/openaccess-embeddings-apple-mobileclip-ml-s1'
META='metmuseum/openaccess'

def get(url, **kw):
    for attempt in range(8):
        try:
            r=requests.get(url,timeout=90,**kw)
            if r.status_code==429:
                time.sleep(min(60,max(5,int(r.headers.get('Retry-After',30)))));continue
            r.raise_for_status();return r
        except Exception:
            if attempt==7:raise
            time.sleep(attempt+1)
    raise RuntimeError('Remote dataset is still rate-limited; rerun preparation to resume.')

def files(repo):
    return [f['rfilename'] for f in get('https://huggingface.co/api/datasets/'+repo).json()['siblings'] if f['rfilename'].endswith('.parquet')]

def vector_file(name):
    dst=ROOT/Path(name).name
    if not dst.exists() or dst.stat().st_size < 1000:
        data=get(f'https://huggingface.co/datasets/{EMB}/resolve/main/{name}?download=true').content
        dst.write_bytes(data)
    try: table=pq.read_table(dst)
    except Exception:
        dst.unlink(missing_ok=True);return vector_file(name)
    return np.array(table['objectID']),np.array(table['embedding'].to_pylist(),dtype=np.float32)

class RemoteFile(io.RawIOBase):
    def __init__(self,url):
        self.pos=0;self.url=url
        r=get(url,headers={'Range':'bytes=0-0'})
        if r.status_code!=206:raise RuntimeError('Range reads required')
        self.size=int(r.headers['Content-Range'].split('/')[-1]);self.url=r.url
    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,offset,whence=0):
        self.pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset
        return self.pos
    def read(self,n=-1):
        n=min(n if n>=0 else self.size,self.size-self.pos)
        if n<=0:return b''
        start=self.pos
        r=get(self.url,headers={'Range':f'bytes={start}-{start+n-1}'})
        if r.status_code!=206 or len(r.content)!=n:raise RuntimeError('Invalid range response')
        self.pos+=n;return r.content

FIELDS={'Object ID':'objectID','Title':'title','Artist Display Name':'artistDisplayName','Object Date':'objectDate','Classification':'classification','url':'primaryImage','Link Resource':'objectURL','Is Public Domain':'isPublicDomain','Department':'department','Medium':'medium','Credit Line':'creditLine'}
COLUMNS=list(FIELDS.values())+['primaryImageSmall']
def metadata_file(name):
    dst=ROOT/('meta-'+Path(name).stem+'.json')
    if dst.exists():return json.loads(dst.read_text())
    remote=RemoteFile(f'https://huggingface.co/datasets/{META}/resolve/main/{name}?download=true')
    parquet=pq.ParquetFile(remote,pre_buffer=True)
    columns=[c for c in COLUMNS if c in parquet.schema_arrow.names]
    if 'objectID' not in columns or 'primaryImage' not in columns:raise RuntimeError('Unexpected metadata schema')
    rows=[{k:v for k,v in row.items()} for row in parquet.read(columns=columns,use_threads=False).to_pylist()]
    dst.write_text(json.dumps(rows));return rows

if __name__=='__main__':
    names=files(EMB)
    for i,name in enumerate(names):
        out=ROOT/(Path(name).stem+'.npz')
        if not out.exists():
            ids,mat=vector_file(name)
            np.savez(out,ids=ids,vectors=mat.astype(np.float16))
        (ROOT/Path(name).name).unlink(missing_ok=True)
        print('vectors',i+1,'/',len(names),flush=True)
    names=[n for n in files(META) if 'openaccess-' in n]
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures=[ex.submit(metadata_file,n) for n in names]
        for i,f in enumerate(as_completed(futures)):
            f.result();print('metadata',i+1,'/',len(names),flush=True)

    model=ROOT.parent/'mobileclip-s1.safetensors'
    if not model.exists():
        from safetensors.torch import load,save_file
        data=get('https://huggingface.co/apple/MobileCLIP-S1-OpenCLIP/resolve/main/open_clip_model.safetensors').content
        state=load(data);del data
        save_file({k:v.half() if v.is_floating_point() else v for k,v in state.items()},str(model))
    print('READY',flush=True)

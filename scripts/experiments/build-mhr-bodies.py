"""Bake one default corrected MHR surface per saved library fit. No cloud calls.
Versioned gzip packets are generated assets; regenerate with npm run build:mhr-bodies.
"""
from pathlib import Path
import sys,json,hashlib,gzip,os,time
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'server/experiments'))
import mhr_server as m
shape=json.loads(os.environ['MHR_DEFAULT_SHAPE'])
shape=m.shape_inputs(shape)
fits=json.loads((ROOT/'public/experiments/mhr-library-fits.json').read_text())
rows=[json.loads((ROOT/f'public/experiments/mhr-library/{id}.json').read_text()) for id in fits['ids']]
fingerprint=hashlib.sha256(json.dumps({'format':1,'shape':shape,'fits':fits['fingerprint'],'params':[(r['id'],r['params']) for r in rows]},sort_keys=True).encode()).hexdigest()[:20]
base=ROOT/'public/experiments/mhr-bodies';out=base/fingerprint;out.mkdir(parents=True,exist_ok=True)
with m.app.test_request_context():meta=m.flow_meta().get_json()
(out/'meta.json').write_text(json.dumps(meta,separators=(',',':')))
(out/'topology.bin').write_bytes(m.MODEL.character_torch.mesh.faces.numpy().astype('<u4').tobytes())
manifest={'version':1,'revision':fingerprint,'fitFingerprint':fits['fingerprint'],'shape':shape,'vertexCount':meta['vertexCount'],'jointCount':len(meta['jointNames']),'parameterCount':204,'count':len(rows),'packetBytes':(meta['vertexCount']*3+len(meta['jointNames'])*8+204)*4,'bodies':{}}
started=time.perf_counter()
for i,row in enumerate(rows):
 params=m.validated_params(row['params']);packet=m.surface_packet(params,shape)
 assert len(packet)==manifest['packetBytes']
 digest=hashlib.sha256(packet).hexdigest();name=f"{row['id']}-{digest[:16]}.bin"
 path=out/(name+'.gz')
 compressed=gzip.compress(packet,compresslevel=6,mtime=0)
 if not path.exists() or path.read_bytes()!=compressed:
  temp=path.with_suffix('.tmp');temp.write_bytes(compressed);temp.replace(path)
 manifest['bodies'][row['id']]={'file':name,'sha256':digest,'compressedBytes':len(compressed)}
 if (i+1)%100==0:print(f'{i+1}/{len(rows)} bodies saved',flush=True)
manifest['totalRawBytes']=len(rows)*manifest['packetBytes'];manifest['totalCompressedBytes']=sum(v['compressedBytes'] for v in manifest['bodies'].values())
tmp=base/'manifest.tmp';tmp.write_text(json.dumps(manifest,separators=(',',':')));tmp.replace(base/'manifest.json')
print(json.dumps({k:v for k,v in manifest.items() if k!='bodies'}),flush=True)
print(f'Finished in {time.perf_counter()-started:.1f}s',flush=True)

"""Check query/index compatibility using artwork self-retrieval."""
import io,json
import numpy as np
import torch,open_clip
from PIL import Image
import search

def check():
    shards=[np.load(p) for p in sorted(search.DATA.glob('*.npz'))]
    ids=np.concatenate([z['ids'] for z in shards]);mat=np.concatenate([z['vectors'].astype('f4') for z in shards]);mat/=np.linalg.norm(mat,axis=1,keepdims=True)
    assert len(ids)==259561 and len(set(ids))==len(ids)
    assert np.isfinite(mat).all()
    model,_,pre=open_clip.create_model_and_transforms('MobileCLIP-S1',pretrained=str(search.APP/'.local/met-art/mobileclip-s1.safetensors'),image_mean=(0,0,0),image_std=(1,1,1),image_interpolation='bilinear');model.eval();torch.set_num_threads(4)
    rows=[]
    for p in sorted(search.DATA.glob('meta-*.json')):
        rows.extend(r for r in json.loads(p.read_text()) if r.get('primaryImage') and ('Sculpture' in (r.get('classification') or '') or 'Painting' in (r.get('classification') or '')))
    results=[]
    for row in rows[::max(1,len(rows)//3)][:3]:
        image=Image.open(io.BytesIO(search.image_bytes(row.get('primaryImageSmall') or row['primaryImage'])))
        with torch.inference_mode():v=model.encode_image(pre(image).unsqueeze(0),normalize=True).numpy()[0]
        scores=mat@v;idx=np.flatnonzero(ids==row['objectID'])[0];rank=int((scores>scores[idx]).sum()+1)
        result={'id':row['objectID'],'title':row['title'],'selfSimilarity':float(scores[idx]),'rank':rank};print(result,flush=True);results.append(result)
    (search.CACHE/'index-check.json').write_text(json.dumps(results,indent=2))
    assert len(results)==3 and all(r['rank']<=5 and r['selfSimilarity']>.9 for r in results),'Embedding compatibility check failed'
if __name__=='__main__':check()

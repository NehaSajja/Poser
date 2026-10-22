"""Exercise independent pose categories and write inspectable, cached results."""
import json,time
from concurrent.futures import ThreadPoolExecutor
import search
IDS=['1010','1321','201','1343','2273','2933']

def evaluate(id):
    r=search.search(id,progress=lambda m:print(id,m,flush=True))
    assert r['indexedArtworks']>10000
    assert len(r['candidates'])==search.CANDIDATE_LIMIT
    assert len(r['results'])<=min(search.REFERENCE_LIMIT,search.AUDIT_LIMIT) and all(a['poseScore']>=40 for a in r['results'])
    candidate_ids={a['objectID'] for a in r['candidates']}
    assert len(candidate_ids)==len(r['candidates'])
    assert all(a['objectID'] in candidate_ids and 0<=a['poseScore']<=100 for a in r['results'])
    row={'pose':id,'name':r['pose']['name'],'seconds':r['seconds'],'warning':r['warning'],'candidates':len(r['candidates']),'references':len(r['results']),'highlights':sum(bool(a.get('isHighlight')) for a in r['results']),'useful':sum(a['poseScore']>=65 for a in r['results']),'top':[{'id':a['objectID'],'title':a['title'],'score':a['poseScore'],'reason':a['reason'],'difference':a['difference']} for a in r['results'][:4]]}
    print(json.dumps(row),flush=True);return row
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=2) as ex:rows=list(ex.map(evaluate,IDS))
    (search.CACHE/'evaluation.json').write_text(json.dumps(rows,indent=2))

"""Fetch the Met's own popular/important-work flags, with complete pagination."""
import json,time
from datetime import datetime,timezone
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[2]/'.local/met-art/data'
ENDPOINT='https://collectionapi.metmuseum.org/public/collection/v1.1/search'

def fetch_highlights():
    ids=[];offset=0;total=None
    while total is None or offset<total:
        r=requests.get(ENDPOINT,params={'isHighlight':'true','q':'*','limit':500,'offset':offset},timeout=30)
        r.raise_for_status();page=r.json();total=page['total'];batch=page.get('objectIDs') or []
        if not batch:raise RuntimeError('Incomplete highlight pagination')
        ids.extend(batch);offset+=len(batch)
    if len(set(ids))!=total:raise RuntimeError('Highlight IDs changed during pagination; rerun')
    result={'source':ENDPOINT,'definition':'Met designation of a popular and important artwork; a proxy for prominence, not a popularity score.','fetchedAt':datetime.now(timezone.utc).isoformat(),'total':total,'objectIDs':sorted(set(ids))}
    ROOT.mkdir(parents=True,exist_ok=True)
    dst=ROOT/'highlights.json';tmp=dst.with_suffix('.tmp');tmp.write_text(json.dumps(result));tmp.replace(dst)
    print('Met highlights ready:',total,flush=True)
if __name__=='__main__':fetch_highlights()

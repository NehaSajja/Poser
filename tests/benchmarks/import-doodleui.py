"""Import a pinned sparse checkout. No downloaded dataset code is executed."""
import json,hashlib,shutil,sys
from pathlib import Path
source=Path(sys.argv[1]);dest=Path('tests/corpus/doodleui-full');dest.mkdir(parents=True,exist_ok=True)
commit='e38a92c7526742af4e20bdc3239eba8459cb6dab'
items=[];seen=set();duplicates=0
for category in ['checkbox','switch','dropDown','cancel','squiggle']:
 paths=list((source/'CorrectDrawings'/category).glob('*'))
 paths.sort(key=lambda p:hashlib.sha256(('sketch-eval-v1:'+p.relative_to(source).as_posix()).encode()).hexdigest())
 unique=[]
 for path in paths:
  raw=path.read_bytes();data=json.loads(raw)
  # Ignore point-repeat and translation/scale differences when detecting exact duplicate traces.
  points=[(x,y) for s in data for x,y in zip(s[0],s[1])]
  if not points:continue
  x0=min(x for x,y in points);y0=min(y for x,y in points);scale=max(max(x for x,y in points)-x0,max(y for x,y in points)-y0,1)
  normalized=[[[round((x-x0)/scale,5),round((y-y0)/scale,5)] for x,y in zip(s[0],s[1])] for s in data]
  key=hashlib.sha256(json.dumps(normalized).encode()).hexdigest()
  if key in seen:duplicates+=1;continue
  seen.add(key);unique.append((path,raw,key))
 if category in ['cancel','squiggle']:unique=unique[:200]
 cutoff=int(len(unique)*.7)
 for i,(path,raw,key) in enumerate(unique):
  path_name=path.relative_to(source).as_posix();item_id=category+'-'+path.name
  (dest/(item_id+'.json')).write_bytes(raw)
  items.append({'id':item_id,'category':category,'split':'dev' if i<cutoff else 'holdout','source':f'https://raw.githubusercontent.com/soumikmohianuta/DoodleUINet/{commit}/{path_name}','path':path_name,'sha256':hashlib.sha256(raw).hexdigest(),'traceHash':key})
shutil.copyfile(source/'LICENSE',dest/'LICENSE')
manifest={'repository':'https://github.com/soumikmohianuta/DoodleUINet','commit':commit,'selection':'All available supported-class CorrectDrawings; first 200 SHA256-ranked drawings each for cancel and squiggle. Per-class 70/30 split after trace deduplication, seed sketch-eval-v1.','scope':'Component class only. The source dataset does not label switch state.','duplicatesRemoved':duplicates,'samples':items}
(dest/'manifest.json').write_text(json.dumps(manifest,indent=2))
from collections import Counter
print('Imported',len(items),'recordings;',duplicates,'exact trace duplicates removed.');print(Counter(x['category'] for x in items));print(Counter(x['split'] for x in items))

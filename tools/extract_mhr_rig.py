"""Extract the Apache-2.0 MHR v1.0.1 LOD1 skin weights, hierarchy and topology.
Usage: python3 tools/extract_mhr_rig.py path/to/assets/lod1.fbx
No Torch/model execution is needed. mhr_fbx.py is from Meta's MHR project.
"""
from pathlib import Path
import sys,struct,json
import numpy as np
import mhr_fbx as f
with Path(sys.argv[1]).open('rb') as stream:
    assert stream.read(23)==f.FBX_HEADER
    version=struct.unpack('<I',stream.read(4))[0]; nodes=[]
    while (n:=f._read_node(stream,version)): nodes.append(n)
objects=next(n for n in nodes if n.name=='Objects').children
connections=[n.properties for n in next(n for n in nodes if n.name=='Connections').children]
joints=[n for n in objects if n.name=='Model' and n.properties[2] in ['LimbNode','Root']]
lookup={n.properties[0]:i for i,n in enumerate(joints)}
parents=[next((lookup[p] for kind,c,p,*_ in connections if kind=='OO' and c==n.properties[0] and p in lookup),-1) for n in joints]
assert len(joints)==127 and all(p<i for i,p in enumerate(parents))
geometry=next(n for n in objects if n.name=='Geometry' and n.properties[2]=='Mesh')
vertices=len(f._child(geometry,'Vertices').properties[0])//3
assert vertices==18439
weights=np.zeros((vertices,len(joints)))
for cluster in [n for n in objects if n.name=='Deformer' and n.properties[2]=='Cluster']:
    joint=next(lookup[c] for kind,c,p,*_ in connections if kind=='OO' and p==cluster.properties[0] and c in lookup)
    indices=f._child(cluster,'Indexes'); w=f._child(cluster,'Weights')
    if indices and w: weights[indices.properties[0],joint]=w.properties[0]
indices=np.argsort(-weights,axis=1)[:,:4]; selected=np.take_along_axis(weights,indices,axis=1)
assert (selected.sum(axis=1)>0).all()
selected/=selected.sum(axis=1,keepdims=True)
result={'version':1,'source':'facebookresearch/MHR v1.0.1, Apache-2.0','names':[n.properties[1].split('\x00')[0] for n in joints],'parents':parents,'vertexCount':vertices,'faces':f._triangulate(f._child(geometry,'PolygonVertexIndex').properties[0]).flatten().tolist(),'indices':indices.flatten().tolist(),'weights':np.round(selected,6).flatten().tolist()}
out=Path('public/mhr-rig.json');out.write_text(json.dumps(result,separators=(',',':')))
print(out, out.stat().st_size, 'bytes;',len(joints),'bones;',vertices,'vertices')
print(list(enumerate(result['names'])))

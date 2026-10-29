"""Loopback-only MHR comparison service. No cloud calls or uploaded input.
Start with .local/mhr-env/bin/python server/experiments/mhr_server.py.
The original application and production routes do not import this module.
"""
from pathlib import Path
import json
import math
import threading
import time
import numpy as np
import torch
from flask import Flask, Response, abort, jsonify, request

ROOT = Path(__file__).resolve().parents[2]
torch.set_num_threads(2)
MODEL = torch.jit.load(str(ROOT / '.local/mhr/assets/mhr_model.pt'), map_location='cpu').eval()
NAMES = list(MODEL.get_parameter_names())[:204]
JOINTS = list(MODEL.get_joint_names())
LIMITS = MODEL.get_parameter_limits()[:204]
POSES = {p['id']: p for p in json.loads((Path(__file__).with_name('mhr-poses.json')).read_text())['poses']}
IDENTITY, EXPRESSION = torch.zeros(1,45), torch.zeros(1,72)
LOCK = threading.Lock()
# UI offsets are in degrees, always applied to the saved pose (never accumulated).
CONTROLS = {
    'torso': [('spine_bend0', 1), ('spine_bend1', 1)],
    'lean': [('spine_lean0', 1), ('spine_lean1', 1)],
    'nod': [('head_bend', -1)], 'turn': [('head_twist', 1)],
    'left': [('l_clavicle_ry', 1)], 'right': [('r_clavicle_ry', 1)],
}
RANGES = {'torso': (-30,30), 'lean': (-25,25), 'nod': (-35,35), 'turn': (-60,60), 'left': (-15,25), 'right': (-15,25)}

def parameters(pose_id, offsets, *, neutral=False):
    if pose_id not in POSES or not isinstance(offsets, dict) or set(offsets) - set(CONTROLS):
        raise ValueError('Unknown pose or control')
    params = torch.zeros(204) if neutral else torch.tensor(POSES[pose_id]['params'])
    clamped = []
    for control, changes in CONTROLS.items():
        value = offsets.get(control, 0)
        if isinstance(value, bool) or not isinstance(value, (int,float)) or not math.isfinite(value):
            raise ValueError('Offsets must be finite numbers')
        lo, hi = RANGES[control]
        if not lo <= value <= hi:
            raise ValueError('Control offset outside experiment range')
        for name, sign in changes:
            i = NAMES.index(name)
            desired = float(params[i]) + math.radians(value) * sign
            params[i] = max(float(LIMITS[i,0]), min(float(LIMITS[i,1]), desired))
            if abs(float(params[i]) - desired) > 1e-6 and control not in clamped:
                clamped.append(control)
    return params, clamped

def evaluate(pose_id, offsets):
    params, clamped = parameters(pose_id, offsets)
    started = time.perf_counter()
    with LOCK, torch.inference_mode():
        raw, skeleton = MODEL(IDENTITY, params[None], EXPRESSION, apply_correctives=False)
        corrected, _ = MODEL(IDENTITY, params[None], EXPRESSION, apply_correctives=True)
    arrays = [raw[0].numpy()/100, corrected[0].numpy()/100, skeleton[0,:,:3].numpy()/100]
    if not all(np.isfinite(a).all() for a in arrays):
        raise RuntimeError('Model returned a non-finite surface')
    payload = b''.join(np.asarray(a, dtype='<f4').tobytes() for a in arrays)
    return payload, (time.perf_counter()-started)*1000, clamped

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 32768
@app.before_request
def local_only():
    origin = request.headers.get('Origin')
    if origin and origin not in ('http://127.0.0.1:4352','http://localhost:4352','http://127.0.0.1:4354'):
        abort(403)

@app.get('/api/meta')
def meta():
    return jsonify(vertexCount=18439, jointNames=JOINTS,
        poses=[{k:v for k,v in p.items() if k != 'params'} for p in POSES.values()],
        controls=RANGES, model='MHR v1.0.1', license='Apache-2.0')

@app.get('/api/topology')
def topology():
    return Response(MODEL.character_torch.mesh.faces.numpy().astype('<u4').tobytes(), mimetype='application/octet-stream')

@app.post('/api/evaluate')
def evaluate_route():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error='Expected JSON object'), 400
    try:
        payload, ms, clamped = evaluate(body.get('pose'), body.get('offsets', {}))
    except (ValueError, TypeError) as error:
        return jsonify(error=str(error)), 400
    return Response(payload, mimetype='application/octet-stream', headers={
        'X-MHR-MS': str(round(ms,2)), 'X-MHR-Clamped': ','.join(clamped), 'Cache-Control':'no-store'})

# Native flow endpoints: one corrected surface, complete skeleton, bounded pose parameters.
from scipy.spatial.transform import Rotation
from collections import OrderedDict
import hashlib

MAPPING = {'Hips':'root','Spine':'c_spine0','Spine1':'c_spine1','Spine2':'c_spine3','Neck':'c_neck','Head':'c_head'}
for side,prefix in [('Left','l'),('Right','r')]:
    for role,native in [('Shoulder','clavicle'),('Arm','uparm'),('ForeArm','lowarm'),('Hand','wrist'),('UpLeg','upleg'),('Leg','lowleg'),('Foot','foot'),('ToeBase','ball')]:
        MAPPING[side+role]=prefix+'_'+native

def fk(params):
    full=torch.cat([params,torch.zeros(45)])[None]
    return MODEL.character_torch.joint_parameters_to_skeleton_state(MODEL.character_torch.model_parameters_to_joint_parameters(full))[0]

REST=fk(torch.zeros(204)).detach()
ROLES=list(MAPPING)
ROLE_IDS=torch.tensor([JOINTS.index(MAPPING[r]) for r in ROLES])
def point(s,r):return s[JOINTS.index(MAPPING[r]),:3]
STATURE=float((point(REST,'LeftLeg')-point(REST,'LeftUpLeg')).norm()+(point(REST,'LeftFoot')-point(REST,'LeftLeg')).norm()+(point(REST,'Head')-point(REST,'Hips')).norm())
FIT_CACHE=OrderedDict()

def validated_params(value):
    a=np.asarray(value,dtype=np.float32)
    if a.shape!=(204,) or not np.isfinite(a).all():raise ValueError('Expected 204 finite pose parameters')
    # This experiment edits articulation only, with no body dimensions or shape parameters.
    if np.any(np.abs(a[124:])>1e-6):raise ValueError('Body shape is fixed in this experiment')
    return torch.maximum(LIMITS[:,0],torch.minimum(LIMITS[:,1],torch.tensor(a)))

def fit_source(body):
    targets=torch.tensor([body['positions'][r] for r in ROLES],dtype=torch.float32)
    if targets.shape!=(len(ROLES),3) or not torch.isfinite(targets).all() or targets.abs().max()>5:raise ValueError('Invalid source joints')
    orientations=body['orientations']
    orient_roles=['Hips','Head','LeftHand','RightHand','LeftFoot','RightFoot']
    orient_idx=torch.tensor([JOINTS.index(MAPPING[r]) for r in orient_roles])
    desired=[]
    for role in orient_roles:
        q=np.asarray(orientations[role],dtype=np.float32)
        if q.shape!=(4,) or not np.isfinite(q).all() or abs(np.linalg.norm(q)-1)>.01:raise ValueError('Invalid source orientation')
        desired.append((Rotation.from_quat(q)*Rotation.from_quat(REST[JOINTS.index(MAPPING[role]),3:7].numpy())).as_quat())
    desired=torch.tensor(np.array(desired),dtype=torch.float32)
    key=hashlib.sha256(json.dumps([targets.tolist(),desired.tolist()]).encode()).hexdigest()
    if key in FIT_CACHE:
        FIT_CACHE.move_to_end(key);return FIT_CACHE[key]
    edges=[('Hips','Head'),('LeftUpLeg','RightUpLeg')]+[(side+a,side+b) for side in ['Left','Right'] for a,b in [('Arm','ForeArm'),('ForeArm','Hand'),('UpLeg','Leg'),('Leg','Foot'),('Foot','ToeBase')]]
    ai=torch.tensor([ROLES.index(a) for a,b in edges]);bi=torch.tensor([ROLES.index(b) for a,b in edges])
    dirs=torch.nn.functional.normalize(targets[bi]-targets[ai],dim=-1)
    indices=torch.tensor([i for i in range(3,68) if LIMITS[i,1]>LIMITS[i,0]])
    lo,hi=LIMITS[indices,0],LIMITS[indices,1]
    seed=torch.zeros(204)
    seed[3:6]=torch.tensor(Rotation.from_quat(orientations['Hips']).as_euler('xyz'),dtype=torch.float32)
    x=torch.nn.Parameter(seed[indices].clone())
    optimizer=torch.optim.LBFGS([x],lr=.8,max_iter=220,tolerance_grad=1e-7,tolerance_change=1e-9,line_search_fn='strong_wolfe')
    def closure():
        optimizer.zero_grad();bounded=torch.maximum(lo,torch.minimum(hi,x));p=seed.index_copy(0,indices,bounded)
        s=fk(p);pts=(s[ROLE_IDS,:3]-s[JOINTS.index('root'),:3])/STATURE
        d=torch.nn.functional.normalize(pts[bi]-pts[ai],dim=-1)
        orientation=1-(s[orient_idx,3:7]*desired).sum(-1).square()
        loss=(pts-targets).square().sum()+.13*(d-dirs).square().sum()+.04*orientation.sum()+.0001*bounded[3:].square().sum()+10*(x-bounded).square().sum()
        loss.backward();return loss
    optimizer.step(closure)
    p=seed.index_copy(0,indices,torch.maximum(lo,torch.minimum(hi,x))).detach()
    with torch.no_grad():
        s=fk(p);error=float(((s[ROLE_IDS,:3]-s[JOINTS.index('root'),:3])/STATURE-targets).norm(dim=-1).mean()*100)
    FIT_CACHE[key]=(p,error)
    while len(FIT_CACHE)>128:FIT_CACHE.popitem(last=False)
    return p,error

def solve_native_limb(params, limb):
    role=limb.get('role');target=np.asarray(limb.get('target'),dtype=np.float32)
    allowed={side+part:(prefix,part) for side,prefix in [('Left','l'),('Right','r')] for part in ['ForeArm','Hand','Leg','Foot']}
    if role not in allowed or target.shape!=(3,) or not np.isfinite(target).all() or np.abs(target).max()>10:raise ValueError('Invalid limb target')
    prefix,part=allowed[role];arm=part in ['ForeArm','Hand'];tip=part in ['Hand','Foot'];base='uparm' if arm else 'upleg'
    names=[prefix+'_'+base+suffix for suffix in ['_twist','_ry','_rz']]
    if tip:names.append(prefix+('_elbow_bend' if arm else '_knee_bend'))
    indices=torch.tensor([NAMES.index(n) for n in names]);lo,hi=LIMITS[indices,0],LIMITS[indices,1]
    seed=params.clone();x=torch.nn.Parameter(seed[indices].clone());desired=torch.tensor(target*100)
    ji=JOINTS.index(MAPPING[role])
    # Only the chosen limb changes. A small rest preference selects a stable bend plane.
    opt=torch.optim.LBFGS([x],lr=.8,max_iter=24,tolerance_change=1e-8,line_search_fn='strong_wolfe')
    def closure():
        opt.zero_grad();bounded=torch.maximum(lo,torch.minimum(hi,x));s=fk(seed.index_copy(0,indices,bounded))
        loss=((s[ji,:3]-desired)/STATURE).square().sum()+.00002*(bounded-seed[indices]).square().sum()+10*(x-bounded).square().sum()
        loss.backward();return loss
    opt.step(closure)
    return seed.index_copy(0,indices,torch.maximum(lo,torch.minimum(hi,x))).detach()

def surface_packet(params):
    with torch.inference_mode():v,s=MODEL(IDENTITY,params[None],EXPRESSION,apply_correctives=True)
    s=s[0].clone();s[:,:3]/=100
    arrays=[v[0].numpy()/100,s.numpy(),params.numpy()]
    if not all(np.isfinite(a).all() for a in arrays):raise ValueError('Non-finite surface')
    return b''.join(np.asarray(a,dtype='<f4').tobytes() for a in arrays)

@app.get('/api/flow-meta')
def flow_meta():
    rest=REST.clone();rest[:,:3]/=100
    return jsonify(vertexCount=18439,jointNames=JOINTS,parents=MODEL.character_torch.skeleton.joint_parents.tolist(),
        mapping=MAPPING,rest=rest.tolist(),stature=STATURE/100,names=NAMES,limits=LIMITS.tolist(),protocol=1)

@app.post('/api/flow')
def flow():
    body=request.get_json(silent=True);started=time.perf_counter();error=None
    try:
        if not isinstance(body,dict):raise ValueError('Expected object')
        with LOCK:
            if 'source' in body:params,error=fit_source(body['source'])
            else:params=validated_params(body.get('params'))
            if 'limb' in body:params=solve_native_limb(params,body['limb'])
            payload=surface_packet(params)
    except (ValueError,TypeError,KeyError,IndexError) as exc:
        return jsonify(error=str(exc)),400
    headers={'X-MHR-MS':str(round((time.perf_counter()-started)*1000,2)),'Cache-Control':'no-store'}
    if error is not None:headers['X-MHR-Fit']=str(round(error,3))
    return Response(payload,mimetype='application/octet-stream',headers=headers)

# Separate body-shape bench. The Poser flow above continues to use fixed IDENTITY.
SHAPE_RANGES = {'fullness': (-0.8, 1.2), 'silhouette': (-1.0, 1.0), 'height': (0.85, 1.15)}

def shape_inputs(values):
    if not isinstance(values, dict) or set(values) - set(SHAPE_RANGES):
        raise ValueError('Unknown body control')
    result = {}
    for name, (lo, hi) in SHAPE_RANGES.items():
        value = values.get(name, 1.0 if name == 'height' else 0.0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi:
            raise ValueError('Body control outside experiment range: ' + name)
        result[name] = value
    return result

def shape_parameters(params, values):
    identity = IDENTITY.clone()
    identity[0, 0] = values['fullness']
    identity[0, 1] = values['silhouette'] * 1.5
    shaped = params.clone()
    # Art-directed silhouette, not a calibrated sex/gender or weight predictor.
    shaped[NAMES.index('scale_shoulder_width')] = -0.12 * values['silhouette']
    shaped[NAMES.index('scale_hip_width')] = 0.06 * values['silhouette']
    return identity, shaped

def evaluate_shape(pose_id, offsets, values):
    values = shape_inputs(values)
    params, clamped = parameters('1176' if pose_id == 'neutral' else pose_id, offsets, neutral=pose_id == 'neutral')
    identity, shaped = shape_parameters(params, values)
    started = time.perf_counter()
    with LOCK, torch.inference_mode():
        base, base_s = MODEL(IDENTITY, params[None], EXPRESSION, apply_correctives=True)
        variant, variant_s = MODEL(identity, shaped[None], EXPRESSION, apply_correctives=True)
    vertices = [base[0].numpy().copy()/100, variant[0].numpy().copy()/100 * values['height']]
    skeletons = [base_s[0,:,:3].numpy().copy()/100, variant_s[0,:,:3].numpy().copy()/100 * values['height']]
    # Ground each surface, keeping its skeleton in exactly the same coordinate frame.
    for v, skel in zip(vertices, skeletons):
        ground = float(v[:,1].min()); v[:,1] -= ground; skel[:,1] -= ground
    arrays = vertices + skeletons
    if not all(np.isfinite(a).all() for a in arrays):
        raise ValueError('Non-finite body surface')
    return b''.join(np.asarray(a, dtype='<f4').tobytes() for a in arrays), (time.perf_counter()-started)*1000, clamped

@app.post('/api/shape')
def shape_route():
    body = request.get_json(silent=True)
    try:
        if not isinstance(body, dict): raise ValueError('Expected object')
        payload, ms, clamped = evaluate_shape(body.get('pose'), body.get('offsets', {}), body.get('shape', {}))
    except (ValueError, TypeError) as error:
        return jsonify(error=str(error)), 400
    return Response(payload, mimetype='application/octet-stream', headers={
        'X-MHR-MS': str(round(ms,2)), 'X-MHR-Clamped': ','.join(clamped), 'Cache-Control':'no-store'})

if __name__ == '__main__':
    # Warm both execution paths before opening the local listener.
    evaluate('2013', {})
    app.run(host='127.0.0.1', port=4354, threaded=True, debug=False)

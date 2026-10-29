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

def parameters(pose_id, offsets):
    if pose_id not in POSES or not isinstance(offsets, dict) or set(offsets) - set(CONTROLS):
        raise ValueError('Unknown pose or control')
    params = torch.tensor(POSES[pose_id]['params'])
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
app.config['MAX_CONTENT_LENGTH'] = 4096
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

if __name__ == '__main__':
    # Warm both execution paths before opening the local listener.
    evaluate('2013', {})
    app.run(host='127.0.0.1', port=4354, threaded=True, debug=False)

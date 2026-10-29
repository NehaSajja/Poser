import test from 'node:test';
import assert from 'node:assert/strict';
import {BODY_FIELDS,BODY_PRESETS,bodyState,bodyRequest,bodyChoice} from '../src/poser2/bodyShape.js';
import {createMhrHistory} from '../src/poser2/mhrRig.js';
test('body and articulation share reversible state while presets remain unchanged',()=>{
 const params=Array(204).fill(0),initial=bodyState(params,BODY_PRESETS.feminine),history=createMhrHistory(initial);
 const changed=bodyState(params,{silhouette:1.41,fullness:3,height:1.15});history.commit(changed);
 const posed=[...changed];posed[29]=.3;history.commit(posed);
 assert.deepEqual(bodyRequest(history.undo()),bodyRequest(changed));
 assert.deepEqual(bodyRequest(history.undo()),{params,shape:BODY_PRESETS.feminine});
 assert.deepEqual(bodyRequest(history.redo()).shape,{silhouette:1.41,fullness:3,height:1.15});
 assert.equal(bodyChoice(BODY_PRESETS.masculine),'masculine');assert.equal(bodyChoice({silhouette:1.41,fullness:3,height:1.15}),'custom');
 assert.deepEqual(BODY_PRESETS.masculine,{silhouette:-1,fullness:-.8,height:1});
 const limits=Object.fromEntries(BODY_FIELDS.map(({id,min,max})=>[id,[min,max]]));
 assert.deepEqual(limits,{silhouette:[-2,1.41],height:[.85,1.15],fullness:[-1.67,3]});
});

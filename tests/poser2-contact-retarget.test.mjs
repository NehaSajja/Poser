import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { captureRig, applyLibraryPose } from '../src/poser/libraryPose.js';
import { prepareModelRig, transferPose } from '../src/poser2/modelRig.js';
import { retargetPose } from '../src/poser2/contactRetarget.js';
import { getAssetPath } from '../server/pose-library/skeleton.mjs';
import { loadRetrievalPreview } from '../server/pose-retrieval/preview.mjs';
import { DATA_ROOT } from '../server/pose-retrieval/search.mjs';

const load = async id => {
  const bytes = await fs.readFile(getAssetPath(id));
  return prepareModelRig(captureRig(new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')), id);
};
const position = bone => bone.getWorldPosition(new Vector3());
const pairs = ['Left', 'Right'].flatMap(side => [['Arm', 'ForeArm'], ['ForeArm', 'Hand'], ['UpLeg', 'Leg'], ['Leg', 'Foot']].map(pair => pair.map(part => side + part)));
const expected = { '1011': ['RightHand', 'RightUpLeg'], '1176': ['LeftHand', 'RightForeArm'],
  '1351': ['LeftHand', 'LeftFoot'], '1451': ['RightHand', 'RightUpLeg'], '1343': ['LeftHand', 'Head'],
  '2273': ['RightHand', 'Head'], '2599': ['LeftHand', 'Head'], '2933': ['RightHand', 'Head'] };

test('contact retargeting preserves anatomy and source contacts across fourteen distinct poses', async t => {
  const catalog = JSON.parse(await fs.readFile(DATA_ROOT + 'catalog.json', 'utf8'));
  const human = await load('human'), bots = { male: await load('male'), female: await load('female') };
  const lengths = pairs.map(([a, b]) => position(human.joints.get(a)).distanceTo(position(human.joints.get(b))));
  const offsets = new Map([...human.bones].map(([name, entry]) => [name, entry.object.position.toArray()]));
  const rows = [];
  for (const id of ['1010', '1011', '853', '1176', '1321', '1351', '201', '2013', '1338', '1451', '1343', '2273', '2599', '2933']) {
    const pose = catalog.find(row => row.id === id), preview = await loadRetrievalPreview({ pose, view: 'authored' });
    const source = bots[pose.model]; applyLibraryPose(source, preview.model);
    const sourceBefore = [...source.bones.values()].map(entry => entry.object.quaternion.toArray());
    const report = retargetPose(source, human);
    assert.deepEqual([...source.bones.values()].map(entry => entry.object.quaternion.toArray()), sourceBefore, `${id}: source was mutated`);
    const scale = human.root.getWorldScale(new Vector3()).x;
    pairs.forEach(([a, b], i) => assert.ok(Math.abs(position(human.joints.get(a)).distanceTo(position(human.joints.get(b))) / scale - lengths[i]) / lengths[i] < 1e-5, `${id}: stretched ${a}`));
    for (const [name, entry] of human.bones) assert.deepEqual(entry.object.position.toArray(), offsets.get(name), `${id}: changed bone offset`);
    if (expected[id]) assert.ok(report.contacts.some(c => c.role === expected[id][0] && c.bodyRole === expected[id][1]), `${id}: missed authored contact`);
    if (['1343', '2273'].includes(id)) {
      assert.ok(!report.contacts.some(c => c.kind === 'floor' && /Foot/.test(c.role)), `${id}: invented a planted foot`);
      if (id === '2273') assert.ok(report.contacts.some(c => c.kind === 'floor' && /ForeArm/.test(c.role)), `${id}: missed elbow support`);
      if (id === '1343') assert.ok(!report.contacts.some(c => c.kind === 'floor' && /ForeArm/.test(c.role)), `${id}: invented support for raised elbows`);
    }
    const before = report.before.reduce((sum, value) => sum + value, 0), after = report.after.reduce((sum, value) => sum + value, 0);
    assert.ok(after < before * .4, `${id}: contact error did not improve enough (${before} -> ${after})`);
    assert.ok(Math.max(...report.after) / report.height < .018, `${id}: excessive remaining contact error`);
    rows.push({ id, before, after, max: Math.max(...report.after) / report.height });
  }
  const sum = key => rows.reduce((total, row) => total + row[key], 0);
  t.diagnostic(`14 poses: aggregate contact error reduced ${(100 * (1 - sum('after') / sum('before'))).toFixed(1)}%; maximum remaining error ${(100 * Math.max(...rows.map(row => row.max))).toFixed(2)}% of rig stature.`);
});

test('retargeting a neutral pose does not invent hand contacts or bend free arms', async () => {
  const source = await load('male'), target = await load('human');
  transferPose(source, target);
  const baseline = new Map([...target.joints].map(([role, bone]) => [role, bone.quaternion.clone()]));
  const report = retargetPose(source, target);
  assert.ok(!report.contacts.some(contact => /Hand/.test(contact.role)));
  for (const role of ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']) {
    const bone = target.joints.get(role), rest = baseline.get(role);
    assert.ok(bone.quaternion.angleTo(rest) < .02, role);
  }
});

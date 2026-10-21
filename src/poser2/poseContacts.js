import { Vector3 } from 'three';
import { poseSurface } from './poseSurface.js';

const bodyRoles = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  ...['Left', 'Right'].flatMap(side => ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase'].map(part => side + part))];
const worldPosition = bone => bone.getWorldPosition(new Vector3());

function correspondingPoint(point, role, source, target) {
  const from = source.joints.get(role), to = target.joints.get(role);
  const local = from.worldToLocal(point.clone());
  // Uniform identity scale only; target bone lengths/skin never get overwritten.
  const child = [...source.joints].find(([name, bone]) => bone.parent === from && target.joints.get(name)?.parent === to)?.[0];
  const sourceLength = child ? source.restJoints.get(child).position.distanceTo(source.restJoints.get(role).position) : from.position.length();
  const targetLength = child ? target.restJoints.get(child).position.distanceTo(target.restJoints.get(role).position) : to.position.length();
  local.multiplyScalar(sourceLength > 1e-6 ? targetLength / sourceLength : target.stature / source.stature);
  return to.localToWorld(local);
}

// Contacts are inferred from the source mesh, never from target penetration.
// Nearby opposing surfaces are evidence of contact; ambiguous gaps stay FK.
export function detectPoseContacts(source, target) {
  const from = poseSurface(source), to = poseSurface(target);
  const height = source.stature * source.joints.get('Hips').getWorldScale(new Vector3()).x / source.restJoints.get('Hips').scale.x;
  const threshold = height * .025, spacing = height * .035;
  const contacts = [];
  for (const side of ['Left', 'Right']) {
    const role = `${side}Hand`;
    const candidates = bodyRoles.filter(part => ![`${side}Arm`, `${side}ForeArm`, role].includes(part));
    const matches = [];
    for (const hand of from.samples(role, 80)) {
      const body = from.nearest(hand.point, candidates, threshold);
      if (!body || hand.normal.dot(body.normal) > -.15) continue;
      matches.push({ hand, body });
    }
    matches.sort((a, b) => a.body.distance - b.body.distance);
    const chosen = [];
    for (const match of matches) {
      if (chosen.some(other => other.hand.point.distanceTo(match.hand.point) < spacing)) continue;
      chosen.push(match);
      if (chosen.length === 2) break;
    }
    for (const [index, { hand, body }] of chosen.entries()) {
      const effector = to.nearest(correspondingPoint(hand.point, hand.bone, source, target), [role], Infinity, hand.bone);
      const anchor = to.nearest(correspondingPoint(body.point, body.bone, source, target), [body.role], Infinity, body.bone);
      if (effector && anchor) contacts.push({ kind: 'body', role, bodyRole: body.role, effector, anchor, normalOnly: index > 0, gap: Math.max(0, hand.point.clone().sub(body.point).dot(body.normal)) + height * .0015 });
    }
    // Only feet that actually touch the source floor are planted. A flying or
    // lying pose does not acquire an invented two-foot stance.
    const footRoles = [`${side}Foot`, `${side}ToeBase`];
    const soles = footRoles.flatMap(part => from.samples(part, 100))
      .filter(sample => sample.point.y - from.bounds.min.y < height * .009)
      .sort((a, b) => a.point.y - b.point.y);
    const planted = [];
    for (const sole of soles) {
      if (planted.some(other => other.point.distanceTo(sole.point) < height * .05)) continue;
      const targetSole = to.nearest(correspondingPoint(sole.point, sole.bone, source, target), footRoles, Infinity, sole.bone);
      if (targetSole) {
        contacts.push({ kind: 'floor', role: `${side}Foot`, effector: targetSole, normalOnly: planted.length > 0,
          target: new Vector3(sole.point.x, from.bounds.min.y, sole.point.z), gap: 0 });
        planted.push(sole);
      }
      if (planted.length === 2) break;
    }
    // Hands on the floor use the same support test, excluding a hand already
    // assigned to a body surface so its intent is not double-constrained.
    if (!chosen.length) {
      const palm = from.samples(role, 100).sort((a, b) => a.point.y - b.point.y)[0];
      if (palm && palm.point.y - from.bounds.min.y < height * .009) {
        const effector = to.nearest(correspondingPoint(palm.point, palm.bone, source, target), [role], Infinity, palm.bone);
        if (effector) contacts.push({ kind: 'floor', role, effector,
          target: new Vector3(palm.point.x, from.bounds.min.y, palm.point.z), gap: 0 });
      }
    }
  }
  // Seated, kneeling, and prone poses can be supported by knees, pelvis, or
  // elbows instead of feet. Preserve their floor height without pinning x/z.
  for (const role of ['LeftForeArm', 'RightForeArm', 'LeftLeg', 'RightLeg', 'Hips', 'Spine', 'Spine1', 'Spine2']) {
    const support = from.samples(role, 60).sort((a, b) => a.point.y - b.point.y)[0];
    if (!support || support.point.y - from.bounds.min.y > height * .006) continue;
    const effector = to.nearest(correspondingPoint(support.point, support.bone, source, target), [role], Infinity, support.bone);
    if (effector) contacts.push({ kind: 'floor', role, effector, normalOnly: true,
      target: new Vector3(support.point.x, from.bounds.min.y, support.point.z), gap: 0 });
  }
  return { contacts, height, sourceFloor: from.bounds.min.y,
    sourceHips: worldPosition(source.joints.get('Hips')) };
}

// Unilateral clearance constraints belong inside the same solve as contacts.
// They may bend an elbow or share reach with the torso, but cannot independently
// shove a hand away from its intended support/contact point.
export function detectTargetIntersections(rig, height) {
  const surface = poseSurface(rig), intersections = [];
  for (const side of ['Left', 'Right']) for (const part of ['ForeArm', 'Hand']) {
    const role = side + part;
    const roles = bodyRoles.filter(candidate => ![side + 'Arm', side + 'ForeArm', side + 'Hand'].includes(candidate));
    const hits = [];
    for (const effector of surface.samples(role, 35)) {
      const anchor = surface.nearest(effector.point, roles, height * .06);
      if (!anchor) continue;
      const separation = effector.point.clone().sub(anchor.point).dot(anchor.normal);
      if (separation < -height * .0015) hits.push({ kind: 'clearance', role, bodyRole: anchor.role, effector, anchor,
        depth: -separation, gap: height * .001 });
    }
    hits.sort((a, b) => b.depth - a.depth);
    const chosen = [];
    for (const hit of hits) {
      if (chosen.some(other => other.effector.point.distanceTo(hit.effector.point) < height * .025)) continue;
      chosen.push(hit);
      if (chosen.length === 3) break;
    }
    intersections.push(...chosen);
  }
  return intersections;
}

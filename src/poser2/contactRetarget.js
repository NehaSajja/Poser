import { Box3, Quaternion, Vector3 } from 'three';
import { updateRigMatrices } from '../poser/libraryPose.js';
import { transferPose } from './modelRig.js';
import { detectPoseContacts, detectTargetIntersections } from './poseContacts.js';
import { sampleSurface } from './poseSurface.js';
import { captureLimb, limbChains } from './twoBoneIK.js';

const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const position = bone => bone.getWorldPosition(new Vector3());
const radians = degrees => degrees * Math.PI / 180;

function solveLinear(matrix, rhs) {
  const n = rhs.length, a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    if (Math.abs(a[i][i]) < 1e-12) return null;
    for (let j = i + 1; j < n; j++) {
      const factor = a[j][i] / a[i][i];
      for (let k = i; k <= n; k++) a[j][k] -= factor * a[i][k];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) x[i] = (a[i][n] - a[i].slice(i + 1, n).reduce((sum, value, j) => sum + value * x[i + 1 + j], 0)) / a[i][i];
  return x;
}

function solverVariables(rig) {
  const variables = [], groups = [];
  const joint = (bone, directions, limits, stiffness) => {
    const group = { bone, rest: bone.quaternion.clone(), variables: [] };
    directions.forEach((axis, i) => {
      const variable = { group, axis, min: limits[i][0], max: limits[i][1], stiffness, index: variables.length };
      variables.push(variable); group.variables.push(variable);
    });
    groups.push(group);
  };
  const ball = (role, degrees, stiffness) => {
    const bone = rig.joints.get(role);
    if (bone) joint(bone, axes, axes.map(() => [-radians(degrees), radians(degrees)]), stiffness);
  };
  // Soft posture priors distribute reach across the shoulders and trunk, rather
  // than forcing all compensation into a wrist or changing any bone length.
  for (const role of ['Spine', 'Spine1', 'Spine2']) ball(role, 10, .045);
  for (const side of ['Left', 'Right']) {
    ball(`${side}Shoulder`, 15, .04);
    ball(`${side}Arm`, 40, .025);
    ball(`${side}Hand`, 20, .035);
    ball(`${side}UpLeg`, 25, .045);
    ball(`${side}Foot`, 15, .04);
  }
  for (const chain of limbChains(rig)) {
    const limb = captureLimb(chain);
    const upper = limb.b.clone().sub(limb.a).normalize(), lower = limb.c.clone().sub(limb.b).normalize();
    const bend = Math.acos(Math.max(-1, Math.min(1, upper.dot(lower))));
    const axis = upper.clone().cross(lower);
    if (axis.lengthSq() < 1e-8) axis.copy(limb.direction).cross(limb.bend);
    axis.normalize().applyQuaternion(chain.mid.getWorldQuaternion(new Quaternion()).normalize().invert()).normalize();
    // Elbows/knees get a hinge DOF, bounded to avoid hyperextension or folding
    // beyond 155 degrees. Preserve an already more-flexed authored pose.
    const maxBend = Math.max(radians(155), bend);
    joint(chain.mid, [axis], [[Math.max(-radians(35), -bend), Math.min(radians(35), maxBend - bend)]], .025);
  }
  for (let i = 0; i < 3; i++) variables.push({ translation: i, min: -.05, max: .05, stiffness: .3, index: variables.length });
  return { variables, groups };
}

function* solvePoseContactSteps(rig, detected) {
  const { contacts, height } = detected;
  let collisions = detectTargetIntersections(rig, height);
  if (!contacts.length && !collisions.length) return { contacts: [], before: [], after: [], iterations: 0 };
  const root = rig.root.position.clone(), { variables, groups } = solverVariables(rig);
  const untouched = ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']
    .filter(role => !contacts.some(contact => contact.role === role))
    .map(role => ({ bone: rig.joints.get(role), point: position(rig.joints.get(role)).sub(position(rig.joints.get('Hips'))) }));
  const errors = () => contacts.map(contact => {
    const effector = sampleSurface(contact.effector).point;
    if (contact.kind === 'floor') {
      const error = effector.sub(contact.target);
      return contact.normalOnly ? error.set(0, error.y, 0) : error;
    }
    const anchor = sampleSurface(contact.anchor);
    const error = effector.sub(anchor.point.addScaledVector(anchor.normal, contact.gap));
    return contact.normalOnly ? anchor.normal.multiplyScalar(error.dot(anchor.normal)) : error;
  });
  const apply = values => {
    for (const group of groups) {
      group.bone.quaternion.copy(group.rest);
      for (const variable of group.variables) group.bone.quaternion.multiply(new Quaternion().setFromAxisAngle(variable.axis, values[variable.index]));
      group.bone.quaternion.normalize();
    }
    rig.root.position.copy(root);
    for (const variable of variables) if (variable.translation !== undefined) rig.root.position.setComponent(variable.translation,
      root.getComponent(variable.translation) + values[variable.index] * height);
    updateRigMatrices(rig);
  };
  const clearanceErrors = () => collisions.flatMap(contact => {
    const effector = sampleSurface(contact.effector).point, anchor = sampleSurface(contact.anchor);
    const separation = effector.sub(anchor.point).dot(anchor.normal) - contact.gap;
    return anchor.normal.multiplyScalar(Math.min(0, separation) / height).toArray();
  });
  const residual = () => [
    ...errors().flatMap((error, i) => error.multiplyScalar((contacts[i].kind === 'floor' ? 2 : 1) / height).toArray()),
    ...clearanceErrors(),
    ...untouched.flatMap(goal => position(goal.bone).sub(position(rig.joints.get('Hips'))).sub(goal.point).multiplyScalar(.2 / height).toArray()),
  ];
  const cost = (values, residuals) => residuals.reduce((sum, value) => sum + value * value, 0)
    + values.reduce((sum, value, i) => sum + (value * variables[i].stiffness) ** 2, 0);
  const before = errors().map(error => error.length());
  let values = variables.map(() => 0), iterations = 0;
  for (; iterations < 20; iterations++) {
    if (iterations === 7 || iterations === 14) collisions = detectTargetIntersections(rig, height);
    const base = residual(), columns = [];
    for (const variable of variables) {
      const perturbed = [...values], epsilon = .0005;
      perturbed[variable.index] += epsilon; apply(perturbed);
      columns.push(residual().map((value, i) => (value - base[i]) / epsilon));
    }
    apply(values);
    const matrix = variables.map((variable, i) => variables.map((_, j) =>
      columns[i].reduce((sum, value, k) => sum + value * columns[j][k], 0)
      + (i === j ? variable.stiffness ** 2 + .0002 : 0)));
    const rhs = variables.map((variable, i) => -columns[i].reduce((sum, value, k) => sum + value * base[k], 0)
      - variable.stiffness ** 2 * values[i]);
    const step = solveLinear(matrix, rhs);
    if (!step) break;
    const initialCost = cost(values, base);
    let accepted = false;
    for (const amount of [1, .5, .25, .125]) {
      const candidate = values.map((value, i) => {
        const variable = variables[i], limit = variable.translation !== undefined ? .01 : .15;
        return Math.max(variable.min, Math.min(variable.max, value + amount * Math.max(-limit, Math.min(limit, step[i]))));
      });
      apply(candidate);
      if (cost(candidate, residual()) < initialCost - 1e-10) { values = candidate; accepted = true; break; }
    }
    if (!accepted) { apply(values); break; }
    yield iterations;
  }
  apply(values);
  return { contacts: contacts.map(({ kind, role, bodyRole }) => ({ kind, role, bodyRole })), before,
    after: errors().map(error => error.length()), iterations };
}

function prepareRetarget(source, target) {
  transferPose(source, target);
  // Establish the common floor before solving support contacts. Moving the
  // whole model afterwards would undo the planted-foot constraints.
  target.root.position.y += new Box3().setFromObject(source.root, true).min.y
    - new Box3().setFromObject(target.root, true).min.y;
  updateRigMatrices(target);
  return detectPoseContacts(source, target);
}

export function solvePoseContacts(rig, detected) {
  const steps = solvePoseContactSteps(rig, detected);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function retargetPose(source, target) {
  const detected = prepareRetarget(source, target);
  return { ...solvePoseContacts(target, detected), height: detected.height, sourceFloor: detected.sourceFloor };
}

// Keep orbiting and toolbar feedback responsive while a new body is solved.
// Only the hidden target rig is modified; the visible model stays in place.
export async function retargetPoseAsync(source, target, shouldContinue) {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  await frame();
  if (!shouldContinue()) return null;
  const detected = prepareRetarget(source, target), steps = solvePoseContactSteps(target, detected);
  let step = steps.next(), count = 0;
  while (!step.done) {
    if (++count % 3 === 0) await frame();
    if (!shouldContinue()) { steps.return(); return null; }
    step = steps.next();
  }
  return { ...step.value, height: detected.height, sourceFloor: detected.sourceFloor };
}

import { Matrix4, Quaternion, Vector3 } from 'three';

// Isolated CPU comparison, not a replacement for the app's renderer. Based on
// approximate dual-quaternion blending (Kavan et al., 2008):
// https://users.cs.utah.edu/~ladislav/kavan08geometric/kavan08geometric.html
// Work in mesh-local space so FBX unit conversions/root scaling cancel out.
// Reject non-rigid joint transforms: silently discarding scale/shear would make
// this comparison misleading. No third-party implementation is bundled.
export function skinTransforms(mesh) {
  mesh.updateWorldMatrix(true, false);
  const inverseWorld = mesh.matrixWorld.clone().invert();
  const position = new Vector3(), scale = new Vector3();
  return mesh.skeleton.bones.map((bone, i) => {
    const matrix = new Matrix4().multiplyMatrices(inverseWorld, bone.matrixWorld)
      .multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix);
    const real = new Quaternion();
    matrix.decompose(position, real, scale);
    const rigid = new Matrix4().compose(position, real, new Vector3(1, 1, 1));
    const error = Math.max(...matrix.elements.map((value, j) => Math.abs(value - rigid.elements[j])));
    if (error > 1e-4) throw new Error('This pose contains joint scale or shear; the rigid skinning comparison cannot represent it.');
    const dual = new Quaternion(position.x, position.y, position.z, 0).multiply(real);
    dual.set(dual.x * .5, dual.y * .5, dual.z * .5, dual.w * .5);
    return { matrix, real, dual };
  });
}

export function blendDualQuaternion(transforms, indices, weights, rotation, translation) {
  let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0;
  let reference;
  for (let k = 0; k < 4; k++) {
    if (!weights[k]) continue;
    const { real: q, dual: d } = transforms[indices[k]];
    reference ??= q;
    // q and -q describe the same rotation; align hemispheres before blending.
    const w = weights[k] * (reference.dot(q) < 0 ? -1 : 1);
    rx += q.x * w; ry += q.y * w; rz += q.z * w; rw += q.w * w;
    dx += d.x * w; dy += d.y * w; dz += d.z * w; dw += d.w * w;
  }
  const length = Math.hypot(rx, ry, rz, rw);
  if (length < 1e-10) throw new Error('Invalid skin weights: blended rotation has zero length.');
  rx /= length; ry /= length; rz /= length; rw /= length;
  dx /= length; dy /= length; dz /= length; dw /= length;
  rotation.set(rx, ry, rz, rw);
  // Vector part of 2 * dual * conjugate(real). Orthogonalizing dual is not
  // needed here: its parallel component only contributes to the scalar part.
  translation.set(2 * (-dw * rx + dx * rw - dy * rz + dz * ry),
    2 * (-dw * ry + dx * rz + dy * rw - dz * rx),
    2 * (-dw * rz - dx * ry + dy * rx + dz * rw));
}

export function deformGeometry(mesh, output, method = 'linear', transforms = skinTransforms(mesh)) {
  const source = mesh.geometry.attributes, destination = output.attributes;
  const p = new Vector3(), n = new Vector3(), moved = new Vector3(), normal = new Vector3();
  const rotation = new Quaternion(), translation = new Vector3(), part = new Vector3();
  const indices = [0, 0, 0, 0], weights = [0, 0, 0, 0];
  for (let i = 0; i < source.position.count; i++) {
    p.fromBufferAttribute(source.position, i); n.fromBufferAttribute(source.normal, i);
    for (let k = 0; k < 4; k++) {
      indices[k] = source.skinIndex.getComponent(i, k); weights[k] = source.skinWeight.getComponent(i, k);
    }
    if (method === 'dual') {
      blendDualQuaternion(transforms, indices, weights, rotation, translation);
      moved.copy(p).applyQuaternion(rotation).add(translation);
      normal.copy(n).applyQuaternion(rotation);
    } else {
      moved.set(0, 0, 0); normal.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        if (!weights[k]) continue;
        const { matrix } = transforms[indices[k]], e = matrix.elements;
        moved.addScaledVector(part.copy(p).applyMatrix4(matrix), weights[k]);
        part.set(e[0] * n.x + e[4] * n.y + e[8] * n.z,
          e[1] * n.x + e[5] * n.y + e[9] * n.z, e[2] * n.x + e[6] * n.y + e[10] * n.z);
        normal.addScaledVector(part, weights[k]);
      }
    }
    destination.position.setXYZ(i, moved.x, moved.y, moved.z);
    normal.normalize(); destination.normal.setXYZ(i, normal.x, normal.y, normal.z);
  }
  destination.position.needsUpdate = destination.normal.needsUpdate = true;
  output.computeBoundingBox(); output.computeBoundingSphere();
}

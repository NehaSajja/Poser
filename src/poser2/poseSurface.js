import { Box3, Triangle, Vector3 } from 'three';

const boneRole = bone => bone.name.replaceAll(':', '').replaceAll('_', '').replace(/^mixamorig/i, '');
const region = role => role.replace(/Hand.*/, 'Hand');
const triangle = new Triangle();

// Keep barycentric surface anchors, not capsule offsets. An anchor follows the
// actual skinned triangle when the pelvis, torso, or limb changes orientation.
export function sampleSurface(anchor) {
  const { mesh, indices, barycentric } = anchor;
  const points = indices.map(i => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
  triangle.set(...points);
  const normal = triangle.getNormal(new Vector3());
  return { point: points[0].multiplyScalar(barycentric.x).addScaledVector(points[1], barycentric.y).addScaledVector(points[2], barycentric.z),
    normal };
}

export function poseSurface(rig) {
  const regions = new Map();
  const bounds = new Box3();
  rig.root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry, { skinIndex, skinWeight, position } = geometry.attributes;
    const vertices = Array.from({ length: position.count }, (_, i) => {
      const point = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(point);
      const weights = new Map();
      for (let j = 0; j < 4; j++) {
        const role = boneRole(mesh.skeleton.bones[skinIndex.getComponent(i, j)]);
        weights.set(role, (weights.get(role) || 0) + skinWeight.getComponent(i, j));
      }
      return { point, weights };
    });
    const count = geometry.index?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      const indices = [0, 1, 2].map(j => geometry.index ? geometry.index.getX(i + j) : i + j);
      const weights = new Map();
      for (const index of indices) for (const [role, weight] of vertices[index].weights) weights.set(role, (weights.get(role) || 0) + weight);
      const bone = [...weights].sort((a, b) => b[1] - a[1])[0][0], role = region(bone);
      const points = indices.map(index => vertices[index].point);
      const face = { mesh, indices, role, bone, points, center: points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3),
        normal: new Triangle(...points).getNormal(new Vector3()) };
      face.radius = Math.max(...points.map(point => point.distanceTo(face.center)));
      if (!regions.has(role)) regions.set(role, []);
      regions.get(role).push(face);
    }
  });
  return { bounds, regions,
    nearest(point, roles, maxDistance = Infinity, bone = null) {
      let best = null, distanceSq = maxDistance * maxDistance, distanceLimit = maxDistance;
      const closest = new Vector3();
      for (const role of roles) for (const face of regions.get(role) || []) {
        if (bone && face.bone !== bone) continue;
        if (point.distanceToSquared(face.center) > (distanceLimit + face.radius) ** 2) continue;
        triangle.set(...face.points);
        triangle.closestPointToPoint(point, closest);
        const distance = point.distanceToSquared(closest);
        if (distance >= distanceSq) continue;
        distanceSq = distance; distanceLimit = Math.sqrt(distance);
        best = { ...face, point: closest.clone(), barycentric: triangle.getBarycoord(closest, new Vector3()), distance: Math.sqrt(distance) };
      }
      return best;
    },
    samples(role, limit = 100) {
      const faces = regions.get(role) || [], step = Math.max(1, Math.floor(faces.length / limit));
      return faces.filter((_, i) => i % step === 0).map(face => ({ ...face, point: face.center, barycentric: new Vector3(1 / 3, 1 / 3, 1 / 3) }));
    },
  };
}

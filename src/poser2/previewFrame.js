// Expand the bitmap around the body, not the body inside the bitmap. This
// reserves all the floor's space without changing the displayed model size.
export function previewFrame(mesh, floor, size) {
  const side = Math.max(mesh.max.x - mesh.min.x, mesh.max.y - mesh.min.y) * 1.02;
  const centerX = (mesh.min.x + mesh.max.x) / 2;
  const centerY = (mesh.min.y + mesh.max.y) / 2;
  const modelLeft = centerX - side / 2, modelTop = centerY + side / 2;
  const margin = side * .025;
  const left = Math.min(modelLeft, floor.min.x - margin);
  const right = Math.max(centerX + side / 2, floor.max.x + margin);
  const top = Math.max(modelTop, floor.max.y + margin);
  const bottom = Math.min(centerY - side / 2, floor.min.y - margin);
  const width = Math.ceil((right - left) / side * size);
  const height = Math.ceil((top - bottom) / side * size);
  // Match the frustum to rounded pixel dimensions so X and Y use the same scale.
  return { side, left, right: left + width / size * side, top, bottom: top - height / size * side,
    width, height,
    body: { width: (mesh.max.x - mesh.min.x) / side, height: (mesh.max.y - mesh.min.y) / side },
    style: {
      width: `${width / size * 100}%`, height: `${height / size * 100}%`,
      left: `${(left - modelLeft) / side * 100}%`, top: `${(modelTop - top) / side * 100}%`,
    } };
}

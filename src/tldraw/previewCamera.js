export function panPreview(camera, dx, dy) {
  return { ...camera, x: camera.x + dx / camera.z, y: camera.y + dy / camera.z };
}

export function zoomPreview(camera, point, zoom) {
  const z = Math.max(.1, Math.min(8, zoom));
  return { x: camera.x + point.x / z - point.x / camera.z,
    y: camera.y + point.y / z - point.y / camera.z, z };
}

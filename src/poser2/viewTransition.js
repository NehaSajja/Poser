export function poseTransitionDuration(animate, reducedMotion) {
  return animate && !reducedMotion ? 280 : 0;
}

// Convert the displayed silhouette into camera scale, independent of PNG padding.
export function poseViewFit(body, panel, origin) {
  const initialScale = origin.height / body.height;
  const focusedScale = Math.min(panel.width * .78 / body.width, panel.height * .68 / body.height);
  return {
    initialScale,
    focusedScale,
    offsetX: (origin.left + origin.width / 2 - panel.width / 2) / initialScale,
    offsetY: (origin.top + origin.height / 2 - panel.height / 2) / initialScale,
  };
}

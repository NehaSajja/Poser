// Each staggered column repeats its own measured stack. Independent periods
// avoid a large blank strip when one column contains longer titles than another.
export function createReferenceLayout(heights, width = 224) {
  if (!heights.length) return { columns: [], width, period: 0 };
  const unit = width / 14, gap = 3.5 * unit, pitch = width + gap;
  const columns = Array.from({ length: 3 }, (_, column) => {
    const indices = heights.map((_, index) => index).filter(index => index % 3 === column);
    if (!indices.length) indices.push(column % heights.length);
    let y = 0;
    const cards = indices.map(index => {
      const card = { index, y, height: heights[index] };
      y += card.height + gap;
      return card;
    });
    return { x: column * pitch + [0, .75, -.5][column] * unit,
      y: [1.25, 10, 0][column] * unit, period: y, cards };
  });
  return { columns, width, period: pitch * 3 };
}

// Render only the viewport and a small surrounding buffer, regardless of how far
// the camera travels. Stable world coordinates prevent jumps at repeat seams.
export function visibleReferenceTiles(layout, camera, viewport, overscan = 160) {
  if (!layout.columns.length || !viewport.width || !viewport.height) return [];
  const left = -camera.x - overscan / camera.z;
  const top = -camera.y - overscan / camera.z;
  const right = -camera.x + (viewport.width + overscan) / camera.z;
  const bottom = -camera.y + (viewport.height + overscan) / camera.z;
  const tiles = [];
  for (let repeatX = Math.floor(left / layout.period) - 1; repeatX <= Math.floor(right / layout.period); repeatX++) {
    for (let column = 0; column < layout.columns.length; column++) {
      const stack = layout.columns[column], x = repeatX * layout.period + stack.x;
      if (x + layout.width < left || x > right) continue;
      for (let repeatY = Math.floor((top - stack.y) / stack.period); repeatY <= Math.floor((bottom - stack.y) / stack.period); repeatY++) {
        for (const card of stack.cards) {
          const y = repeatY * stack.period + stack.y + card.y;
          if (y + card.height < top || y > bottom) continue;
          tiles.push({ ...card, x, y, key: `${repeatX}:${column}:${repeatY}:${card.index}` });
        }
      }
    }
  }
  return tiles;
}

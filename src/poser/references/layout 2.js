// Staggered columns preserve rank order without overlapping neighboring cards.
export function referencePosition(index) {
  const column = index % 3, row = Math.floor(index / 3);
  return { x: column * 280 + [0, 12, -8][column], y: row * 360 + [20, 160, 0][column] };
}

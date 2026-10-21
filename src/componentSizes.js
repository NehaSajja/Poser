// Match the installed shadcn button's sm / default / lg variants.
// Inputs use the same heights so controls can sit together in a row.
const CONTROL_SIZES = [
  { name: 'md', height: 36, buttonSize: 'default', inputClass: 'h-9' },
  { name: 'sm', height: 32, buttonSize: 'sm', inputClass: 'h-8' },
  { name: 'lg', height: 40, buttonSize: 'lg', inputClass: 'h-10' },
];

export function getControlSize(kind, height = 36) {
  if (kind !== 'button' && kind !== 'input') return null;
  return CONTROL_SIZES.reduce((nearest, size) =>
    Math.abs(size.height - height) < Math.abs(nearest.height - height) ? size : nearest);
}

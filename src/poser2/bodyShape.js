// Shared behavior only; panel appearance is isolated in BodyShapePanel.css.
export const BODY_PRESETS = {
  feminine: { silhouette: 1, fullness: -.8, height: 1 },
  masculine: { silhouette: -1, fullness: -.8, height: 1 },
};
export const BODY_FIELDS = [
  { id: 'silhouette', label: 'Proportions', start: 'Masculine', end: 'Feminine', min: -2, max: 1.41, step: .01 },
  { id: 'height', label: 'Height', start: 'Shorter', end: 'Taller', min: .85, max: 1.15, step: .01 },
  { id: 'fullness', label: 'Build', start: 'Slender', end: 'Fuller', min: -1.67, max: 3, step: .01 },
];
export const bodyChoice = shape => Object.keys(BODY_PRESETS).find(key => BODY_FIELDS.every(({id}) => Math.abs(shape[id]-BODY_PRESETS[key][id])<1e-6)) || 'custom';
export const bodyState = (params,shape) => [...params,shape.silhouette,shape.fullness,shape.height];
export const bodyRequest = state => ({ params: state.slice(0,204), ...(state.length===207 ? {shape:{silhouette:state[204],fullness:state[205],height:state[206]}} : {}) });

export const MHR_FLOW_ENABLED = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_MHR_ENABLED === 'true');
export const MODEL_OPTIONS = [
  ...(MHR_FLOW_ENABLED ? [{ id: 'mhr', label: 'MHR · corrected', anatomical: true, native: true }] : []),
  { id: 'female', label: 'Female', url: '/api/pose-library/assets/female.fbx' },
  { id: 'male', label: 'Male', url: '/api/pose-library/assets/male.fbx' },
  { id: 'human', label: 'Realistic', anatomical: true, url: '/api/pose-library/assets/human.fbx' },
  { id: 'quaternius', label: 'Quaternius', anatomical: true, url: '/models/quaternius-male.fbx' },
  { id: 'mpfb', label: 'MakeHuman', anatomical: true, url: '/models/mpfb-neutral.fbx' },
];

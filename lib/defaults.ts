export const VLM_PROMPT = `You are a professional animator and figure-drawing instructor analyzing a rough gesture or stick-figure sketch.

Describe the intended pose precisely enough for another artist to construct an anatomically plausible figure while preserving the sketch’s gesture and composition.

Use the character’s anatomical left and right. When helpful, also identify screen-left and screen-right. If anatomical laterality cannot be determined, say so rather than silently assigning it.

Describe:

1. Overall action and gesture: standing, sitting, crouching, reaching, or another action; the main line of action.
2. Torso and pelvis: facing direction, forward/backward or sideways lean, twist, shoulder tilt, and relationship between rib cage and pelvis.
3. Left arm and right arm separately: shoulder position, upper-arm direction, elbow bend and placement, forearm direction, wrist/hand location, and any contact with the body or surroundings.
4. Left leg and right leg separately: hip position, thigh direction, knee bend and placement, lower-leg direction, and foot position. Describe apparent weight distribution and support, including any seated support.
5. Head and neck: tilt, turn, forward/backward position, and gaze direction if indicated.
6. Camera and depth: front/side/back or three-quarter view, viewing height, near and far limbs, overlap, and apparent foreshortening.

Return:

- A concise pose summary.
- The detailed breakdown above.
- A compact image-generation direction preserving the pose and viewing angle.

Do not add clothing, personality, scenery, or narrative details.
`;

export const IMAGE_PROMPT = `Create one full-body anatomical drawing reference from the supplied inputs.

Image 1 is the artist's gesture sketch. Preserve its pose, line of action, composition, torso lean, limb arrangement, viewing direction, and foreshortening.
Image 2, when supplied, is the body reference. Use its anatomy and proportions, but replace its pose with the pose from Image 1. Do not copy its neutral standing pose.

Use the pose description below to clarify spatial relationships. Render a single anatomically plausible adult mannequin with a plain, softly shaded gray surface, neutral lighting, and a clean off-white background. Keep the entire body visible with a little margin. Make the limbs and joints clearly readable. Use smooth shading rather than wireframe lines. No text, labels, panels, or additional figures.

Pose description:`;

export const FAST_POSE_PROMPT = `You are an animator reading a gesture sketch. Describe only visible pose geometry in at most 150 words. Use SCREEN-LEFT and SCREEN-RIGHT, never ambiguous anatomical left/right. State head facing, torso lean, shoulder and pelvis orientation, each arm's shoulder-elbow-wrist path, each leg's hip-knee-foot path, weight-bearing foot, camera angle and foreshortening. Distinguish a bent knee pointing screen-right from a foot pointing screen-right. Preserve deliberately asymmetric poses. Do not invent hidden limbs or interpret an upraised arm as a leg. No preamble.`;

export const IMAGE_MODELS: Record<string, string> = {
  "gemini-3.1-flash-lite-image": "Gemini · Flash Lite (fast)",
  "gemini-nano-banana-2.1": "Gemini · Nano Banana 2.1",
  "fal-ai/flux-2/edit": "FLUX.2 Edit",
};
export const DEFAULT_SETTINGS = {
  vlmPrompt: VLM_PROMPT,
  fastPrompt: FAST_POSE_PROMPT,
  imagePrompt: IMAGE_PROMPT,
  geminiModel: "gemini-3.1-flash-lite",
  imageModel: "gemini-3.1-flash-lite-image",
  bodyModel: "fal-ai/sam-3/3d-body",
  seed: 42,
};
export type Settings = typeof DEFAULT_SETTINGS;
export type Stage = "interpret" | "image" | "model";
export type Recipe = "fast" | "guided" | "image" | "direct";
export type StageRecord = {
  stage: Stage; model: string; startedAt: string; finishedAt?: string;
  durationMs?: number; requestId?: string; error?: string;
  status: "running" | "complete" | "error";
};
export type Run = {
  id: string; createdAt: string; updatedAt: string; parentId?: string;
  recipe: Recipe; settings: Settings; sketch: string; reference?: string;
  description: string; generatedImage?: string; model?: string; visualization?: string;
  descriptionSource?: "model" | "edited"; imageSource?: "generated" | "uploaded";
  status: "ready" | "interpreting" | "imaging" | "modeling" | "paused" | "complete" | "error";
  error?: string; stages: StageRecord[]; notes?: string;
  edit?: { mode: "sketch" | "overlay"; clean?: string; marked?: string; instruction?: string };
};
export type Connections = { gemini: boolean; fal: boolean };

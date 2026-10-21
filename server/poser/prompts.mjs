// Adapted from Poser's default fast recipe. The drawing surface remains tldraw.
export const POSE_PROMPT = `You are an animator reading a gesture sketch. Describe only visible pose geometry in at most 150 words. Use SCREEN-LEFT and SCREEN-RIGHT, never ambiguous anatomical left/right. State head facing, torso lean, shoulder and pelvis orientation, each arm's shoulder-elbow-wrist path, each leg's hip-knee-foot path, weight-bearing foot, camera angle and foreshortening. Distinguish a bent knee pointing screen-right from a foot pointing screen-right. Preserve deliberately asymmetric poses. Do not invent hidden limbs or interpret an upraised arm as a leg. No preamble.`;

export function mannequinPrompt(description) {
  return `Create one full-body anatomical drawing reference from the supplied inputs.

Image 1 is the artist's gesture sketch. Preserve its pose, line of action, composition, torso lean, limb arrangement, viewing direction, and foreshortening.
Image 2 is the body reference. Use its anatomy and proportions, but replace its pose with the pose from Image 1. Do not copy its neutral standing pose.

Use the pose description below to clarify spatial relationships. Render a single anatomically plausible adult mannequin with a plain, softly shaded gray surface, neutral lighting, and a clean off-white background. Keep the entire body visible with a little margin. Make the limbs and joints clearly readable. Use smooth shading rather than wireframe lines. No text, labels, panels, or additional figures.

Pose description:
${description}

Preserve screen-space geometry exactly: do not mirror or swap limbs, straighten bent legs, or turn a profile head toward the camera. The sketch and its description override any pose in the body reference. Render complete human anatomy, including TWO complete hands and TWO complete feet even if these are absent from the stick sketch. Never end limbs in stumps or omit extremities where sketch lines end. Keep the full figure comfortably inside the frame.`;
}

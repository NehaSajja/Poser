# Poser

A drawing reference sandbox: sketch a pose, generate a figure, and adjust its articulated 3D model. Includes local joint editing, adjustable lighting and historical artwork references.

This repository contains Poser 2.0. It runs locally at **http://127.0.0.1:3001**.

## Start

Node.js 22 or newer:

```sh
npm install
NEXT_TELEMETRY_DISABLED=1 npm run build
npm start
```

For development, use `npm run dev` instead. Keep the server running. It binds to loopback only.

## Use

- Draw on the left and choose **Generate**. The reference image appears while SAM reconstructs the body once.
- Click the **figure icon** below the 3D view for live editing. The left panel becomes a linked stick-figure guide. Drag a wrist, ankle, elbow, knee, head or torso in either panel; both update immediately. Hand/foot direction handles adjust those extremities. Orbit to a different angle to edit depth.
- Click the **pencil** to redraw a limb, starting at its shoulder or hip and ending at its wrist or ankle. The path supplies the bend direction. The eraser resets the selected limb to its reconstructed pose. Undo/redo and the reset icon work on the rig. **Done** returns to the original freehand drawing, which is preserved.
- Local rig edits autosave in this browser. Inspect → **Download current pose with editable rig** exports the posed, skinned GLB. Save view exports the current camera image. The Image tab retains the original generated image.
- Arbitrary freehand revisions still use **Update pose**. Inspect → **AI redraw correction** retains the previous red-annotation workflow for major changes. These create a new image and mesh and take seconds; live rig edits make no API calls.
- Drag the model background to orbit, Shift-drag to pan, scroll to zoom. The bulb icon retains light direction and intensity controls.
- **Historical precedents:** click the museum icon after generation. A box identifies the matching person; the comparison strip shows your pose, that person's crop, body-part scores and specific differences. Click the crop to focus it, or the figure icon to reveal estimated joints. Browse with arrows or swipes; zoom/pan; hover or use the information icon for museum metadata and source links. The cube returns to 3D.
- After a local edit, a museum search uses the **current posed mesh and camera projection**, not the original generated image. Frame the entire figure before searching. Completed comparisons are cached by the reference image.

Shortcuts: B = pencil, E = eraser/reset limb, H = pan/move joints, Cmd/Ctrl+Z = undo, Shift+Cmd/Ctrl+Z = redo. Joint handles also accept arrow keys.

## Architecture

| Step | Implementation |
| --- | --- |
| App | Next.js 16.4.2 App Router + TypeScript; local server, no database or deployment. |
| Drawing | Canvas 2D + perfect-freehand, Lucide icons. Minimal split screen, inspired by tldraw's drawing interaction. |
| Fast interpretation | `gemini-3.1-flash-lite`, minimal thinking, at most 150 words describing screen-space pose geometry. Fast prompt is editable in Inspect steps. |
| Image | `gemini-3.1-flash-lite-image`, minimal thinking, image-only response. Receives sketch, body reference and compact pose description. Nano Banana 2.1 and FLUX.2 remain selectable. |
| Sketch update | Compare old/new sketches with the text model; send revised sketch + previous mannequin image + the identified changes to the image model. This avoids a full reinterpretation of unchanged limbs/camera. |
| 3D annotation update | Capture the actual Three.js camera view. Send clean + red-marked views and optional text directly to image editing. Keep the previous model until the replacement succeeds. |
| Reconstruction | `fal-ai/sam-3/3d-body`, exported GLB, retained MHR parameters. Queue polling reduced from 1.8 seconds to 0.6 seconds; no automatic paid resubmission. |
| Live rig | Native Meta MHR LOD1 skin weights and 127-bone hierarchy; exact topology validation against SAM's 18,439-vertex mesh. SAM joint positions establish the bind pose. Analytic two-bone IK moves wrists/ankles; CCD adjusts other handles. Three.js SkinnedMesh deforms locally on the GPU. |
| Viewing | Three.js GLTFLoader, OrbitControls, lighting; camera retained when switching to historical references. Local pose undo/redo, autosave and rigged GLB export. |
| Artwork discovery | Gemini Flash Lite describes the pose and proposes three catalogue terms. Search public-domain 2D works in the Met v1.1 API, Cleveland Open Access API, and Art Institute of Chicago API. Interleave sources and terms, download a bounded shortlist. |
| Figure detection | Gemini shortlists up to 8 of 30 museum works. SAM detects individual people and 2D keypoints, with up to 3 targeted region fallbacks for missed figures. Native detections are cached globally; up to 3 people per artwork continue to verification. |
| Match verification | Compare segment directions with aspect correction, translation/scale invariance and a mirrored alternative. Gemini 3.8 Flash audits original crops plus joint overlays with a strict response schema. Wrong/occluded joints lose evidence weight. Per-part scores take the lower of geometric and visual scores, then combine 35% arms, 40% legs, 25% torso, visibility and viewing angle. Best audited person wins per artwork. Scores are uncalibrated similarity, never probability. |
| Evidence UI | Full-artwork figure box, exact crop, target/crop side by side, optional skeletons, arms/legs/torso/view scores, similarities and differences. Museum metadata comes from the source APIs. |
| Local cache | Inputs, images, meshes, stage timings and exact requests in `.local/runs/<UUID>/`. Museum metadata cached for seven days; completed searches are reused. |

Provider adapters: `lib/server.ts`. Museum discovery/ranking: `lib/artworks.ts`, `artwork-pose.ts`, `pose-match.ts`. Live rig: `lib/rig.ts`, `components/LivePoseCanvas.tsx`. Drawing/3D/editing UI: `components/Studio.tsx`, `DrawingCanvas.tsx`, `ModelViewer.tsx`, `PoseOverlay.tsx`, `ArtworkPanel.tsx`.

Inspect steps exposes model choices, prompts, run history, timing, GLB downloads and links to **exact model instructions**. Guided mode preserves the original long animator prompt. Sketch corrections use a separate old/new comparison prompt, recorded in `interpret-input.json`; overlay corrections use their recorded image-edit prompt. No training or fine-tuning is involved.

## Limits

- The live path edits a **linked joint guide**, not arbitrary original freehand strokes. Freehand reinterpretation and new body generation still need the AI workflow. Local editing preserves the same mesh, proportions and limb lengths.
- This is linear blend skinning on the reconstructed pose. Extreme bends can distort the surface; there is no collision solver, ground-contact constraint or pose-dependent muscle correction. Fine finger articulation is not exposed. One supported MHR figure is required; unsupported topology falls back to a static viewer with an explanation.
- Ambiguous sketches can still produce mirrored views or incorrect limbs. Use Guided mode, a clearer sketch, a local rig correction or AI redraw. Body references guide proportions but do not guarantee exact shape.
- Museum discovery searches a bounded catalogue shortlist, **not an exhaustive pose index**. Title vocabulary limits recall. Some poses have only loose matches or none.
- Scores are uncalibrated similarity, not confidence probabilities. SAM and the visual auditor can both misread stylized, clothed or occluded figures. Visible joint overlays and specific mismatches make these failures inspectable; they do not certify anatomical accuracy.
- Keep the server open during inference. Queue request IDs are saved, so a timed-out pose-detection request resumes rather than being submitted and charged again.

## Connections and privacy

The link icon opens the local connection form. Existing keys are saved in `.local/connections.json` with user-only permissions, excluded from Git. Environment variables `GEMINI_API_KEY` / `GOOGLE_API_KEY` and `FAL_KEY` also work. The browser receives only connection-presence flags. Do not share `.local/` as source code.

Generation and artwork matching use Gemini and fal and may incur API charges. Check spending in the provider dashboards. Live rig editing runs locally without inference calls. There are no automatic paid retries.

Configure your own keys using the connection icon, or copy `.env.example` to `.env.local` and fill in the values. Keys and generated files are excluded from Git. This app is intended for local use; do not expose its server publicly without adding authentication and reviewing its storage and API routes.

Sketches/body references and correction images go to the selected image providers when you press Generate/Update. Museum search sends the current pose and public museum images/crops to Gemini, and public artwork images to SAM via fal for joint detection. Only public-domain/CC0 artwork images are retained, with original source links. Downloads are bounded and restricted to official museum image hosts; model-produced IDs/scores/boxes are validated.

## Check

```sh
npm run typecheck
npm test
NEXT_TELEMETRY_DISABLED=1 npm run build
```

Tests also cover native rig topology, identity skin binding, IK bone lengths, pose restore, geometric invariance, mirrored comparison and missing-joint penalties. Tests cover image validation, local-origin protection, provider/museum host restrictions, Gemini result extraction, and rejection of invented artwork IDs or invalid scores/boxes. Live quality requires visual checks; automated tests do not certify pose accuracy.

## Rig assets and attribution

`public/mhr-rig.json` is extracted from Meta's [MHR v1.0.1 release](https://github.com/facebookresearch/MHR/releases/tag/v1.0.1), licensed Apache 2.0. Copyright Meta Platforms, Inc. and affiliates. The license is retained in `public/licenses/MHR.txt`. `tools/extract_mhr_rig.py` reproduces the compact hierarchy/skin-weight asset from the official LOD1 FBX, using the attributed parser in `tools/mhr_fbx.py`. No training, fine-tuning, downloaded model runtime or new subscription is needed for local editing.

## References

- [Gemini Flash Lite image](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image)
- [Gemini Flash Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [SAM 3D Body via fal](https://fal.ai/models/fal-ai/sam-3/3d-body/api)
- [Met Collection API, including v1.1 migration](https://metmuseum.github.io/)
- [Cleveland Open Access API](https://openaccess-api.clevelandart.org/)
- [Art Institute of Chicago API](https://api.artic.edu/docs/)

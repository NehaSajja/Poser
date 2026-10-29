# Poser

A drawing workspace for finding and adjusting figure poses, exploring historical art references, and sketching interfaces. Built with React, tldraw, Three.js, and Vite.

The **Mediums** menu has two options:

- **Poser** — draw a figure, browse four matching poses, adjust a model in 3D, and explore related artwork.
- **Wireframe** — draw interface controls and turn them into editable canvas shapes with a live shadcn/ui preview.

Each medium keeps its own drawing page and camera. The expanded workspace uses a fixed 50/50 split. In Poser, choosing a model smoothly collapses the drawing into a thumbnail over the full-page model or references view. Click the thumbnail to return to the split view. Drawings persist locally in the browser; there is no account or cloud document sync.

## Deploy

See [the class-demo deployment guide](deployment/README.md) for the Docker configuration, persistent storage, request allowances, verification steps, and unresolved asset-license requirements. Deployment work is isolated on `deploy/fly` until the hosted build has been checked. Fly.io is the active target; the earlier Railway configuration is retained as a fallback.

## Run locally

Use Node.js 24, npm, and Python 3.11–3.13.

1. Clone the repository and install the app and reference-search dependencies:

   ```sh
   git clone https://github.com/NehaSajja/Poser.git
   cd Poser
   npm ci
   npm run setup
   ```

2. Open `.env.local`, which setup creates from `.env.example`. Add your own API keys:

   ```dotenv
   GEMINI_API_KEY=your_gemini_api_key
   OPENAI_API_KEY=your_openai_api_key
   DECISIONS_PROVIDER=openai
   DECISIONS_MODEL=gpt-6-luna
   PORT=4317
   ```

   Gemini enables Poser sketch search and historical reference comparisons. OpenAI enables Wireframe recognition; leave its value blank if you only need Poser. Basic drawing works without either API key.

   `VITE_TLDRAW_LICENSE_KEY` is optional on localhost. Only add it when preparing a licensed deployment. Keep real keys in `.env.local`, which Git ignores; never put them in `.env.example`. API keys stay on the server, while the tldraw license is included in the browser build.

3. Start the app:

   ```sh
   npm run dev
   ```

   Open [http://127.0.0.1:4317](http://127.0.0.1:4317). `/` opens Poser; `/?medium=ui` opens Wireframe. `/tldraw` opens the same application. Restart the server after changing `.env.local` or `.env`. Both are Git-ignored; `.env.local` takes precedence when a setting appears in both files.

`npm run setup` verifies the bundled assets, assembles MobileCLIP, creates `.venv`, installs pinned Python dependencies, and tests image/text encoding. The first run needs internet for Python packages. It creates `.env.local` only if the file is missing; rerunning setup preserves existing keys and repairs missing local weights.

The pose catalogue, previews, three character models, Met index, and MobileCLIP weights all come from Git. They need no API keys or separate downloads. Fresh reference searches need internet for Gemini and museum images. Vercel, Blob, FAL, and old pose-detector settings are not needed for the current app.

### Update an existing clone

From the repository directory, stop the running server and run:

```sh
git pull
npm ci
npm run setup
npm run dev
```

Keep your existing `.env.local`; do not overwrite it with the example. If your file predates the current setup, remove `FAL_KEY`, `POSE_DETECTOR_CALIBRATION`, `POSE_DETECTOR_COREML`, `POSE_DETECTOR_WEIGHTS`, `BLOB_READ_WRITE_TOKEN`, and `VERCEL_OIDC_TOKEN`. Keep your Gemini/OpenAI keys, provider/model settings, port, and any tldraw license.

After setup, daily startup only needs `npm run dev`.

### Local data requirements

**The pose data and three character models are included in the repository.** A normal clone or `git pull` downloads the runtime bundle; no zip, Git LFS, or external folder setup is needed. Add `GEMINI_API_KEY` to `.env.local` to enable pose search, then run `npm run dev`.

| Data | Location |
| --- | --- |
| Pose catalogue, search index, embeddings and previews | `data/cloud-retrieval/` |
| 1,361 pose scenes and Female, Male, Human models | `data/posemyart-library-final/` |
| Met index and highlights | `data/met-art/index/` |
| MobileCLIP model parts | `data/met-art/weights/` |
| Assembled model and generated caches | `.local/met-art/` (created locally) |

The bundled pose runtime is approximately 115 MiB. It excludes unused models, props, duplicate original scenes and research outputs. See [the asset README](data/README.md) for contents and provenance. The app defaults to these repository-relative paths on any machine. `POSE_LIBRARY_ROOT` is only needed to use a different library.

**Historical References is bundled too.** `npm run setup` prepares the included 99,117-artwork search index and local MobileCLIP model. No separate dataset download or folder copy is needed. The Met files add approximately 560 MiB to the checkout. Fresh searches use Gemini and download artwork thumbnails from the museum; these caches are created locally.

The Node server starts the project Python service on port `4318` when needed. Setup requires Python 3.11–3.13; choose a specific interpreter with `npm run setup -- --python /path/to/python3`. `MET_PYTHON` is an optional advanced runtime override, not required for a normal clone.

**Model license:** the bundled Apple MobileCLIP model is research-only and excludes commercial use and product development. Its complete license and attribution are in [the Met bundle](data/met-art/README.md). See [the Met service README](tools/met-art/README.md) for provenance and evaluation.

## Poser

Draw a full-body figure. Search runs automatically after an 800 ms drawing pause, and new strokes cancel stale searches. Gemini describes and embeds the sketch, then searches the prepared index of 1,361 library poses. The UI shows up to four distinct ranked matches.

### Models

- Swipe, scroll, or drag the horizontal carousel. Its toolbar provides backward/forward navigation and a checkmark to select the front model. Only the front model is directly clickable.
- Selection transitions into the existing 3D model. Drag to orbit, Shift-drag or right-drag to pan, and scroll to zoom.
- **Rig** reveals draggable joint points. Pose edits support undo and redo.
- **Light** reveals a draggable light-position orb. Orbit the view to adjust its position from another angle.
- **Model** switches between Female, Male, and Human. Camera and lighting are preserved while the posture is transferred between bodies.
- **Back** restores the original library pose and returns to the carousel.

The floor grid appears in the carousel once models have loaded. It is hidden in the selected-model view.

Body switching uses contact-aware retargeting: rest-pose-aligned rotations establish the posture, then a bounded IK solve preserves inferred hand/body contacts and floor support while retaining the target body's proportions. Contact intent is inferred from geometry. This is not a full-body physics or collision simulation; ambiguous poses can still need manual adjustment.

### References

The right panel has **Model** and **References** tabs. Reference searches start in the background for all four matches. The highest-ranked pose is used initially; confirming another model selects its prefetched references. The active tab stays selected as results change, and existing artwork remains visible during an update.

References appear as staggered cards on an infinite canvas. Drag or scroll to pan; pinch or Control-scroll to zoom. Each card shows its title and an AI-assessed pose similarity score out of 100. Click a card to open a larger image with museum metadata, image fullscreen/close controls, and previous/next navigation. Back remains available in References and returns to model selection.

Search covers 99,117 eligible artworks from the published Met MobileCLIP index. It retrieves up to 180 candidates, visually compares them with Gemini, individually checks up to 45 shortlisted works, and returns at most 30 passing references. Ranking favors drawings, prints, naturalistic sculpture, and relevant Met highlights. Similarity scores are judgments, not calibrated probabilities; references can be partial matches.

Results and downloaded comparison images are cached. Shared requests and four-pose prefetch make completed results immediately available when switching. Search uses the selected **library pose and camera**; manually editing joints does not launch a new art search. See [the service README](tools/met-art/README.md) for measured performance and its limits.

## Wireframe

Draw controls freehand. Supported marks are recognized as shadcn/ui components, while uncertain drawings remain ink.

| Control | Sketch |
| --- | --- |
| Rectangle | Empty rectangular outline |
| Input | Field with a left caret or low entry baseline |
| Button | Box with an action arrow |
| Checkbox | Square with a tick |
| Radio | Circle with a centered dot or smaller ring |
| Switch | Horizontal track with a thumb on the left or right |
| Select | Field with a chevron or triangle near the right edge |

Recognition groups related strokes, waits 120 ms for the group to settle, and sends a 512 × 512 crop to the Decisions API. A component is accepted only when its outcome ranks first and reaches the application's 0.70 threshold. That threshold is not a calibrated accuracy claim. Additional ink can refine a recognized control; stale responses cannot overwrite newer drawing revisions.

The right panel is a pannable, zoomable live preview. Desktop and Mobile frames organize the drawing, and frame labels can be renamed by double-clicking their pills. Recognition does not transcribe handwriting or automatically lay out a screen.

## Drawing tools and smartpen

The collapsible toolbar contains **Select**, **Draw**, **Eraser**, and **Frame**, followed by undo, redo, and Clear. Hold Space to pan the drawing canvas. Poser frames offer A4, A3, US Letter, and US Tabloid; Wireframe frames offer Desktop and Mobile.

Open the pencil menu to choose:

- **Virtual** — mouse, trackpad, or stylus input; the default on each load.
- **Physical** — a Neo smartpen connected through Web Bluetooth. Use the inline **+** to connect and **×** to disconnect.

For Physical input, use desktop Chrome or Edge, disconnect the pen from USB and other apps, and write on Ncode paper. **Start here** anchors the next pen position at the current canvas center. Switching back to Virtual disconnects the pen.

Physical ink uses the same tldraw input pipeline as virtual drawing, including pressure, stabilization, history, recognition, and pose search. The first point establishes a paper-relative anchor; changing paper or canvas page resets it. Mouse editing remains available.

## Development

```sh
npm test
npm run build
# Serve the built app locally:
npm start
```

Run the Python service tests with the environment created by setup (macOS/Linux):

```sh
.venv/bin/python -m unittest discover -s tools/met-art -p 'test_*.py'
```

On Windows, use `.venv\Scripts\python.exe` instead.

Browser fixtures are available through the development server:

| Page | Coverage |
| --- | --- |
| `/tests/poser2-carousel.html` | Pose carousel and selected-model interactions |
| `/tests/poser2-human-review.html` | Body retargeting across varied poses and viewing angles |
| `/tests/poser-references.html` | Reference cards, pose changes, prefetch, and persistent tabs |
| `/tests/smartpen-replay.html` | Recorded physical-pen strokes through the drawing pipeline |
| `/tests/tldraw-frames.html` | Frame presentation and editing |
| `/tests/tldraw-recognition.html` | Drawing recognition |

The Met playground runs separately at [http://127.0.0.1:4318](http://127.0.0.1:4318). Older benchmark files remain under `tests/`; their results should not be treated as measurements of the current app.

### Code map

| Directory | Responsibility |
| --- | --- |
| `src/tldraw/` | Drawing editor, toolbar, frames, recognition, and Wireframe preview |
| `src/poser/` | Pose retrieval, medium selection, tabs, and reference canvas |
| `src/poser2/` | Current Poser carousel, Three.js viewer, rigging, lighting, and retargeting |
| `src/smartpen/` | Bluetooth session and physical-pen input |
| `server/pose-retrieval/` | Gemini-backed pose search and preview data |
| `server/pose-library/` | Local rig and model assets |
| `server/art-references/` | Proxy and lifecycle management for the Python service |
| `tools/met-art/` | Met index preparation, search, playground, and evaluation |
| `src/components/ui/` | shadcn/ui components |

The visible mode is named **Poser**; `poser2` remains its internal identifier and directory name. The earlier generation backend under `server/poser/` is retained but is not connected to the current medium menu. Older Poser pages are migrated or archived to preserve existing drawings.

## Repository and deployment

This repository contains the current local Poser application. Environment files, assembled weights, caches, generated output, Python environments, and dependencies are excluded. Both pose and Met runtime assets are tracked under `data/`. Browser drawings use the local persistence key `sketch-ui-tldraw-v1`; they are not stored in Git.

The supported workflow is running the app locally; it depends on local files and the Python worker. A production build alone does not package those services or datasets.

A deployed canvas also needs a valid [tldraw license](https://tldraw.dev/community/license), supplied through `VITE_TLDRAW_LICENSE_KEY`. The installed SDK hides an unlicensed canvas after five seconds on a production domain. Localhost development is unaffected.

## Credits

- [tldraw](https://tldraw.dev/) powers the drawing canvas; [Three.js](https://threejs.org/) powers the model viewer.
- [Drawesome by Benji Taylor](https://github.com/benjitaylor/drawesome) supplies adapted toolbar icons and tooltip behavior. Its MIT license is retained in `src/tldraw/drawesome/LICENSE`.
- The tab-selector motion follows [Paul Stamatiou's site](https://paulstamatiou.com/about).
- [shadcn/ui](https://ui.shadcn.com/) and Radix provide interface components. The component sources retain their MIT license.
- Interface typography uses [GT Maru](https://www.gt-maru.com/). The Poser and Wireframe wordmarks use locally hosted Poppins ExtraBold; its SIL Open Font License is included in `public/fonts/poppins/OFL.txt`.
- The vendored [Neo Web SDK](https://github.com/NeoSmartpen/WEB-SDK2.0), commit `31e649a58311df0380f4bb68290b9196711426ba`, retains its GPL-3.0 license and upstream notice.
- Historical artwork uses the Met's published Open Access metadata and image-embedding index with Apple MobileCLIP. Dataset and model sources are documented in [the Met service README](tools/met-art/README.md).
- Pose scenes and character models come from the PoseMyArt library. The runtime subset is included under `data/`; its provenance and original collection notes are retained there.


## Experimental body comparison (local branch only)

The `experiment/upper-body` branch keeps all existing bodies and adds independent comparison tests.
Open [the experiment index](http://127.0.0.1:4352/tests/experiments.html) after `npm run dev:upper-body`.

- **A — independent rig:** `/tests/body-comparison.html` compares Realistic, MakeHuman and the CC0 Quaternius Superhero Male. Shared cameras and torso, head and shoulder controls allow direct checks of folds. Quaternius is also available in the original `/tests/upper-body.html` control playground, including undo/redo. Its stylized proportions are a limitation, not a proposed final anatomical style.
- **B — native MHR:** `/tests/mhr.html` compares one fixed MHR body with learned pose corrections disabled/enabled. The same native skeleton drives both. Drag torso, head and shoulder dots or use the sliders; reset returns to the fitted source pose. The bench remains available alongside the native integration in the experimental Poser flow.

MHR needs an additional local service. Setup is already complete on this workstation. On another checkout run `npm run setup:mhr` (requires uv or Python 3.12). `npm run dev:upper-body` starts the MHR service automatically; `npm run dev:mhr` remains available for running the bench separately. The service binds only `127.0.0.1:4354`, reached through the experimental Vite proxy. Model files and the Python environment stay under ignored `.local/`. The comparison benches do not use paid calls, SAM generation, image generation or credentials. The main Poser drawing flow continues to use its existing Gemini sketch search and historical-reference connection; MHR fitting and edits run locally. The original deployment is unchanged.

The MHR setup downloads the official ~190 MB release archive and retains the ~665 MB TorchScript model. The isolated Python dependencies take additional space. License, source checksums and experiment limitations are in `server/experiments/mhr-provenance.json`; Quaternius provenance is alongside its FBX in `public/models/`.

Six library skeletons were fitted to MHR native articulation with its joint limits, fixed identity and neutral fingers. Mean joint-position residual is 2.9–4.5% of stature; this is **not** the contact-gap measure shown in A. Hand/foot contacts and self-collisions are not guaranteed. Torso moves carry arms and head; shoulders carry their own arms; the head edits leave arms and legs unchanged. Native joint-limit clamping is reported in the UI. Body sliders were first evaluated in the separate C bench below and are now available in the experimental Model menu.

Validation: `npm run test:mhr` checks all six poses, upper-control isolation, finite surfaces, actual corrective displacement, deterministic reset and the local API. `node --test tests/poser2-quaternius.test.mjs` checks the alternative rig, transfer, controls, undo and body switching. The original skinning comparison is retained at `/tests/skinning.html`.

Measured on this workstation: both MHR surfaces together took ~15 ms median, ~16 ms p95 across 30 warm CPU samples, excluding browser work. Initial browser checks took roughly 28–40 ms including transfer and normal recomputation. These are local experiment timings, not deployment or SAM latency estimates.

### Native MHR in the experimental Poser flow

Run `npm run dev:upper-body` and open http://127.0.0.1:4352/. Corrected MHR is the default body for the retrieved carousel previews and selected pose. The experimental Model menu now offers Feminine, Masculine and Custom; the original bodies remain in the independent comparison pages and unchanged deployed version. The experiment flag (`VITE_MHR_ENABLED=true`) only enables the integration in Vite development; normal production builds do not enable it. No Fly configuration or deployed checkout is changed.

The existing sketch search still retrieves library poses. Their normalized joint positions and rest-relative orientations are fitted locally to MHR native articulation and cached. This supports arbitrary retrieved poses, not only the six bench fixtures. Torso/head/shoulder handles edit native parameters. Elbow/wrist/knee/ankle handles solve only the selected native limb; all subsequent surfaces use learned corrections. Camera, light, layout transition, model switching, and undo/redo use the existing interface. Returning to pose options discards the edit, as before; MHR edits are currently kept for the open editing session rather than persisted across page reloads.

Body switching preserves the authored edit as the transfer source. Switching to a different skeleton can introduce fitting differences; unchanged MHR poses can be restored from native parameters without repeatedly refitting. Body controls are now enabled in the experimental flow; fingers remain neutral, and native joint limits/contact inaccuracies still apply. On a service failure, previews fall back to original bodies with a visible message; the existing Model choices remain accessible.

`server/experiments/start-mhr.mjs` manages a loopback-only service when the experiment flag is enabled. `mhr_server.py` owns native fitting and deformation; `src/poser2/mhrRig.js` owns the corrected mesh and joint adapter; `mhrJointControls.js` owns local gesture coalescing, joint edits and native history. `poseRenderer.js` integrates those into the existing flow.

Validation: `npm run test:mhr-flow` exports bundled source poses, checks native fitting/limb isolation and packet validation, then verifies the browser-side joint adapter and native history with real model output. Existing upper-body/history tests and the application build also pass. Browser checks covered sketch → four MHR previews → selection, upper-body and wrist edits, undo/redo, old-body edits transferred back to MHR, and the existing lighting/layout controls.

### C — body-shape comparison (local experiment only)

Open http://127.0.0.1:4352/tests/mhr-shape.html after `npm run dev:upper-body`.
The left panel is the current corrected MHR body; the right panel is a shape variation. Both receive the same torso/head/shoulder edits. Cameras are synchronized. A neutral rest pose and the six fitted poses are available. Changing a pose resets articulation offsets while retaining body settings. The variation starts at **Feminine + slender** (silhouette +1, fullness -0.8, height 100%). The only presets are **Masculine** (-1, -0.8, 100%) and **Feminine** (+1, -0.8, 100%); all three sliders remain adjustable. **Reset pose** resets only articulation; **Reset view** reframes both surfaces. Bench edits are independent of Poser sessions and are not saved across reloads.

This is an explicitly provisional art-direction mapping, not a demographic classifier or a calibrated measurement system:

- Fullness drives body identity coefficient 0 in [-1.67, 3]. Inspection of neutral geometry showed increasing torso/hip depth and width.
- Masculine/feminine appearance is a silhouette trial: slider [-2,1.41] drives body coefficient 1 at 1.5× (reaching [-3,2.115]), shoulder-width scaling at -0.12× and hip-width scaling at 0.06×. Positive values broaden the hips relative to the upper body. These labels are review aids, not ground-truth attributes of MHR's coefficients. Head and hand identity stay unchanged.
- Height uniformly scales the corrected mesh **and skeleton** from 85–115%. It is overall stature scaling, not independent leg/torso length or a centimetre measurement. Camera zoom stays unchanged while sliding, so size remains visible. Each body's lowest surface point is placed at floor height.
- Learned pose corrections remain on for both. Contacts can drift, and larger bodies can intersect themselves in tight seated poses; there is no collision/contact solver here.

The isolated `/mhr-experiment/api/shape` endpoint validates bounded controls and uses fresh tensors. The `/api/flow` endpoint also accepts an optional bounded shape object; omitted shapes retain the original neutral body and binary packet layout. No cloud calls are made by this bench. `npm run test:mhr-shape` checks exact baseline/reset isolation, all seven poses at 8 combined slider extremes with upper-body edits, height/handle alignment, finite mesh triangles, and API validation. These tests do not certify anatomical quality or absence of self-intersection; visual review is still required.

### Body controls in experimental Poser

Select a pose, then **Model → Feminine / Masculine / Custom**. Previews and newly selected poses start with feminine/slender. The two presets preserve their approved settings: silhouette ±1, fullness -0.8, height 100%. Custom retains the current body and opens a non-modal panel from the right, with an inset track and raised grip. Controls respond while dragging; closing the panel keeps the result. Escape closes the panel while focused inside it. Reduced-motion settings disable its slide animation.

Current limits: proportions -2 to +1.41, build -1.67 to +3, height 85–115%. Model evaluation and limb solving use the same shape and height. Each slider gesture commits a single undo step; pose and shape share session history. Changes in shape retain the body's current floor contact height. As before, returning to options discards session edits. There is no persistent body preference, body measurement calibration or collision solver.

Design seams:
- `src/poser2/BodyShapePanel.jsx`: reusable accessible panel and native range inputs; no model calls.
- `src/poser2/BodyShapePanel.css`: scoped panel layout, motion, colors, slider track and knob styling. Replace this to change the visual language.
- `src/poser2/bodyShape.js`: preset values, slider definitions, history serialization.
- `InteractivePose.jsx`: menu/panel orchestration. `mhrJointControls.js`: coalesced local updates and undo. `mhrRig.js`: corrected mesh, skeleton and body state.
- `server/experiments/mhr_server.py`: matching bounds and deformation/IK, loopback-only.

The menu and panel are gated by the existing experimental dev flag. No deployment configuration or original checkout has changed. Validation includes 64 pose-editor JavaScript tests, 5 shape-model groups, 4 native-flow groups (including shaped limb IK), and a successful build. Browser review covers presets, panel opening, bounds, shape updates, undo and upper-body/wrist edits. Comparison/testing uses bundled poses without paid API calls.

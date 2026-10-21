# Poser

A drawing workspace for finding and adjusting figure poses, exploring historical art references, and sketching interfaces. Built with React, tldraw, Three.js, and Vite.

The **Mediums** menu has two options:

- **Poser** — draw a figure, browse four matching poses, adjust a model in 3D, and explore related artwork.
- **Wireframe** — draw interface controls and turn them into editable canvas shapes with a live shadcn/ui preview.

Each medium keeps its own drawing page and camera. The two panels are resizable, with a minimum width of 33% each. Drawings persist locally in the browser; there is no account or cloud document sync.

## Run locally

Use Node.js 24 and npm.

```sh
git clone https://github.com/ananmaysharan/poser.git
cd poser
npm ci
# Only on a new setup; do not overwrite an existing .env.local.
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). `/` opens Poser; `/?medium=ui` opens Wireframe. `/tldraw` opens the same application.

Configure the features you need in `.env.local`, then restart the server:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Pose retrieval and visual comparison of art references |
| `OPENAI_API_KEY` | Wireframe recognition through the OpenAI Decisions API |
| `DECISIONS_PROVIDER` | `openai` by default; `openrouter` is also supported |
| `DECISIONS_MODEL` | Defaults to `gpt-6-luna` with OpenAI |
| `OPENROUTER_API_KEY` | Required only when using the OpenRouter adapter |
| `POSE_LIBRARY_ROOT` | Location of the external pose library, including `models/` and `decoded-scenes/` |
| `MET_PYTHON` | Python executable with the reference-search dependencies installed |
| `PORT` | App port; defaults to `4317` |
| `VITE_TLDRAW_LICENSE_KEY` | Required at build time for a deployed tldraw canvas; not needed on localhost |

API credentials stay on the server. Basic drawing works without them. `FAL_KEY` in the example environment belongs to the retained legacy generation backend and is not needed by the current UI.

### Local data requirements

**A fresh clone does not include the pose library or search indexes.** Restore these separately to use Poser:

| Data | Expected location |
| --- | --- |
| Pose retrieval index | `../research/pose-retrieval/cloud-retrieval/`, relative to this repository |
| Pose scenes and models | `POSE_LIBRARY_ROOT`; otherwise the existing machine-specific path in `server/pose-library/skeleton.mjs` |
| Met index, model weights, highlights and caches | `.local/met-art/` |

The pose retrieval directory needs `catalog.json`, `index.json`, `protocol.json`, `embeddings/`, and `gallery/`. Its location is currently defined in `server/pose-retrieval/search.mjs`. The library supplies decoded scenes and the Female, Male, and Human FBX models; these assets are not bundled in Git.

Historical references also require Python with PyTorch, torchvision, OpenCLIP, NumPy, Pillow, and the supporting packages listed in [the Met service README](tools/met-art/README.md). That document covers dataset preparation, model weights, provenance, and evaluation. The Node server starts the Python service on port `4318` when needed, or reuses an already-running instance. Set `MET_PYTHON` on a new machine instead of relying on the existing local runtime detection.

## Poser

Draw a full-body figure. Search runs automatically after an 800 ms drawing pause, and new strokes cancel stale searches. Gemini describes and embeds the sketch, then searches the prepared index of 1,361 library poses. The UI shows up to four distinct ranked matches.

### Models

- Swipe, scroll, or drag the horizontal carousel. Its toolbar provides backward/forward navigation and a checkmark to select the front model. Only the front model is directly clickable.
- Selection transitions into the existing 3D model. Drag to orbit, Shift-drag or right-drag to pan, and scroll to zoom.
- **Rigging** reveals draggable joint points. Pose edits support undo and redo.
- **Light** reveals a draggable light-position orb. Orbit the view to adjust its position from another angle.
- **Model** switches between Female, Male, and Human. Camera and lighting are preserved while the posture is transferred between bodies.
- **Back** restores the original library pose and returns to the carousel.

The floor grid appears in the carousel once models have loaded. It is hidden in the selected-model view.

Body switching uses contact-aware retargeting: rest-pose-aligned rotations establish the posture, then a bounded IK solve preserves inferred hand/body contacts and floor support while retaining the target body's proportions. Contact intent is inferred from geometry. This is not a full-body physics or collision simulation; ambiguous poses can still need manual adjustment.

### References

The right panel has **Model** and **References** tabs. Reference searches start in the background for all four matches. The highest-ranked pose is used initially; confirming another model selects its prefetched references. The active tab stays selected as results change, and existing artwork remains visible during an update.

References appear as staggered cards on an infinite canvas. Drag or scroll to pan; pinch or Control-scroll to zoom. Each card shows its title and an AI-assessed pose similarity score out of 100. Click a card to open a larger image with museum metadata, a source link, expand/close controls, and previous/next navigation. Back remains available in References and returns to model selection.

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

Run the Python service tests with an environment containing its dependencies:

```sh
python3 -m unittest discover -s tools/met-art -p 'test_*.py'
```

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

This is a private GitHub repository. Environment files, local datasets, caches, generated output, and dependencies are excluded. Browser drawings use the local persistence key `sketch-ui-tldraw-v1`; they are not stored in Git.

There is currently no Vercel deployment, and automatic Vercel deployments are disconnected. The app still depends on local files and the Python worker. A production build alone does not package those services or datasets.

A deployed canvas also needs a valid [tldraw license](https://tldraw.dev/community/license), supplied through `VITE_TLDRAW_LICENSE_KEY`. The installed SDK hides an unlicensed canvas after five seconds on a production domain. Localhost development is unaffected.

## Credits

- [tldraw](https://tldraw.dev/) powers the drawing canvas; [Three.js](https://threejs.org/) powers the model viewer.
- [Drawesome by Benji Taylor](https://github.com/benjitaylor/drawesome) supplies adapted toolbar icons and tooltip behavior. Its MIT license is retained in `src/tldraw/drawesome/LICENSE`.
- The tab-selector motion follows [Paul Stamatiou's site](https://paulstamatiou.com/about).
- [shadcn/ui](https://ui.shadcn.com/) and Radix provide interface components. The component sources retain their MIT license.
- Typography uses [GT Maru](https://www.gt-maru.com/).
- The vendored [Neo Web SDK](https://github.com/NeoSmartpen/WEB-SDK2.0), commit `31e649a58311df0380f4bb68290b9196711426ba`, retains its GPL-3.0 license and upstream notice.
- Historical artwork uses the Met's published Open Access metadata and image-embedding index with Apple MobileCLIP. Dataset and model sources are documented in [the Met service README](tools/met-art/README.md).
- Pose scenes and character models come from the external local PoseMyArt library. Asset provenance is recorded in that library's metadata; the assets are not included in this repository.

# MHR deployment and rollback

The approved MHR flow adds corrected body surfaces, torso/head/shoulder controls,
and the compact horizontal Body panel to the existing class demo. Presets, slider
bounds, historical search settings, and the single 4-GB machine remain unchanged.

## Exact pre-MHR checkpoint

- Source tag: `checkpoint/live-before-mhr-2026-11-04` (`c1446c3`).
- Image: `registry.fly.io/poser-demo:deployment-01M5J5DBYHZF2MP6YS5HW0484C`.
- Config: `deployment/checkpoints/pre-mhr-2026-11-04.fly.toml`.
- Image digest, machine, volume and snapshot: `deployment/checkpoints/pre-mhr-2026-11-04.json`.
- Reviewed local UI checkpoint: `checkpoint/mhr-ready-2026-11-04`.

To restore the previous live app without rebuilding:

```sh
flyctl deploy --config deployment/checkpoints/pre-mhr-2026-11-04.fly.toml \
  --image registry.fly.io/poser-demo:deployment-01M5J5DBYHZF2MP6YS5HW0484C --ha=false
```

Keep the current data volume and secrets. Do not restore old quota ledgers during
an application rollback. The volume snapshot is disaster recovery only and has
five-day retention; reverting application code does not depend on that snapshot.

## Hosting

`VITE_MHR_ENABLED=true` enables the browser flow at build time. `MHR_ENABLED=true`
starts the CPU model service at runtime. The pinned official MHR v1.0.1 weights
are checksum-verified during the image build; the model and its Apache license
live under `/opt/poser`. No local environment files or API keys enter the build.

Node proxies only metadata, topology and body-flow endpoints through the app's
origin checks. Python listens on loopback, and comparison-only endpoints remain
unpublished. Requests are limited to 32 KiB and eight pending requests so an
interactive slider is not charged against the search request-per-minute limit.
The body evaluation itself makes no external API calls. The application health
check reports MHR readiness. During startup the interface is served immediately
and body requests wait for the model; health reports `warming: true` until ready. Missing weights or startup failure stop startup
instead of silently shipping the old body as the default.

Torso, head, shoulder and body changes are evaluated on the server, so interaction
latency depends on the visitor's network. The existing auto-stop behavior saves
hosting time but adds model-loading delay to the first visit after idle.

## Validation before rollout

- 74 Node checks: pose controls, native history, deployment and MHR proxy.
- 5 native shape test groups and 4 native flow groups, plus 2 browser-adapter checks.
- Local production build and same-origin real corrected-body packet smoke test.
- The Docker build evaluates a real corrected body using Linux CPU Torch before
  it can produce a deployable image.

## Verified live release

`registry.fly.io/poser-demo:mhr-2026-11-04` is live at
https://poser-demo.fly.dev/. Exact source and image digest are in
`checkpoints/mhr-live-2026-11-04.json`. The temporary remote builder was removed.

A real browser sketch produced pose choices, the corrected body loaded, body
sliders updated it, and head/torso/shoulder drags worked. Historical references
loaded and switching back retained the edits. The final build served the page
while MHR warmed; a pending metadata request completed after startup. An example
warm seated-body request took 0.47 seconds end to end (57 ms model evaluation);
this is one measurement, not a latency guarantee. With the warmed body service,
about 2.7 GiB of the existing 4-GB machine remained available before the reference
worker was restarted. No additional permanent machine was created.


## Browser posing release — November 5, 2026

Branch `experiment/browser-native-mhr` runs with `npm run dev:browser-pose`
on port 4358. The interface is local; MHR corrections use the existing Fly
service so network latency remains part of the experiment. Browser GPU posing
is immediate; the server supplies corrected surfaces after a pause or release.

`npm run build:mhr-library` exports the 1,361 existing library skeletons and
precomputes their native MHR parameters locally. It requires the installed MHR
weights/runtime and original pose-library assets. It makes no AI API calls.
Intermediate fits are resumable in `.local/mhr-library-fits/`; the committed
outputs are `public/experiments/mhr-library/*.json` and their manifest.
The build fingerprints the model and fitter, validates sources, normalizes
rotations, and reports failures rather than silently accepting an incomplete
library. An offline-only optimization time bound retains the best finite result
and records any bounded fits; none were needed for the completed library.

Only fits whose source positions and rotations still match are reused.
Edited poses fall back to the fitter. Body-shape evaluation and pose corrections
still use the server. The four preview images still appear together, and Gemini
caption/embedding search remains unchanged; this experiment removes fitting
from the initial library-preview requests, not all initial-search latency.

Initial bent-knee shading was incorrect because normals were recalculated on
an inverse-skinned mesh. The new adapter computes normals on the authoritative
corrected surface, then inverse-transforms those directions for Three's skin
shader. Surface vertices are unchanged. During motion the preview remains an
approximation until a correction arrives. Numerical tests compare shader-space
normals and vertices against MHR, including seated, kneeling and squat fixtures.


The browser-posing release is now live at https://poser-demo.fly.dev/ using
`registry.fly.io/poser-demo:browser-mhr-2026-11-05`. Source and image digest are
recorded in `checkpoints/browser-mhr-live-2026-11-05.json`. Both
`VITE_MHR_ENABLED` and `VITE_MHR_BROWSER_NATIVE` are enabled at build time.
The original experiment remains available at commit `54cf22d`.

To restore the previous server-driven MHR release:

```sh
flyctl deploy --config deployment/checkpoints/pre-browser-mhr-2026-11-05.fly.toml \
  --image registry.fly.io/poser-demo:mhr-2026-11-04 --ha=false
```

The pre-MHR tag and rollback image documented above remain available too.
The live check covered pose matches, head/shoulder edits, undo/redo, and artwork
references. Cold MHR startup after this deployment took approximately 55 seconds;
auto-stop settings are unchanged, so first-visit latency should be measured
separately from warm matching latency.

## Experimental saved initial bodies (2026-11-05, not deployed)

Branch `experiment/saved-mhr-bodies` starts from live checkpoint `2bc265f`.
Run `npm run build:mhr-bodies` once, with the existing local MHR Python environment
and weights installed, then `npm run dev:saved-bodies`. The separate experiment is
at `http://127.0.0.1:4360/`; `tests/saved-bodies.html` is its comparison bench.
The deployed app and its build flags remain unchanged.

The builder evaluates all 1,361 saved library fits at the existing feminine preset
(silhouette 1, fullness -0.8, height 1). Each packet contains the fully corrected
18,439-vertex surface, 127 joint transforms, and 204 pose parameters. Authored and
front camera views share a body. Rig initialization uses the same browser skinning
and corrected-normal path; selection, local posing, server corrections, undo/redo,
body shape changes, and root placement are unchanged. Modified source skeletons
and existing MHR edits do not get replaced by the default saved body.

Assets live under `public/experiments/mhr-bodies/<revision>/`. The generated packet
folders are ignored by Git; the generator and manifest are tracked. Preserve this
local folder or regenerate it before enabling `VITE_MHR_SAVED_BODIES=true` in a
future build. Do not enable the flag on a deployment without including the assets.
Vite copies them to dist; the Node static route serves gzip packets, so responses
arrive decoded as the existing float32 body protocol. Revisioned URLs are cached
for a year; the manifest is revalidated. The client verifies SHA-256, fit fingerprint,
shape and pose parameters and keeps at most 16 packet promises. A missing or invalid
individual body uses the existing MHR evaluation path rather than a different pose.

Storage: 307,787,428 raw bytes; 276,606,744 compressed packet bytes (about 203 KB per
pose). This is server/disk library size, not an initial browser download. Only the
requested matches plus shared metadata, topology and rig weights are loaded.

Validation: all 1,361 packets checked for checksum, size, finite data and matching
parameters. The real browser rig test loads a saved body with every MHR request
blocked, verifies corrected vertex positions within 0.03 mm, then checks local
posing, the subsequent correction request, and edited-source fallback. All 94
posing/deployment checks and the experimental production build passed. Browser
bench: six poses displayed in 1.25 seconds on this computer with MHR blocked,
zero MHR requests and zero fallback bodies. With an artificial 300 ms delay on
each asset fetch and fresh in-memory caches, six sequential previews took 5.49
seconds, again with zero MHR requests and zero fallbacks. The normal drawing flow also loaded
all four matches from saved bodies (individual preparation logs: 62–431 ms).
These are local observations, not hosted latency promises. Gemini interpretation,
retrieval ranking and historical artwork searches are unchanged.

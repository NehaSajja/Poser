# Poser class demo on Fly.io

This is a class demonstration and limited classmate test, not a commercial product launch. Fly.io is the active deployment target; the [Railway setup](railway.md) remains available as a fallback. The existing local app and main branch remain unchanged while the hosted build is tested.

## Architecture and configuration

`Dockerfile` packages Node, Python, CPU-only PyTorch, the web build, and the pose/artwork indexes. The builder downloads the public dataset from a pinned GitHub commit (`POSER_ASSET_REVISION`), avoiding a 710 MB laptop upload on every deploy. Update that revision when the committed dataset changes; local `data/` edits are excluded from the container build. Node serves the app and starts the Python search process on loopback. The browser renders the 3D models. `fly.toml` configures:

- One shared-CPU machine, 2 CPUs / 4 GB RAM, in Ashburn (`iad`). The Mac index verification peaked around 2.5 GiB; measure Linux memory during the hosted test.
- HTTPS with automatic start and stop when idle. First use after a stop can be slower. Active reference jobs are polled by the client; leaving the app may let an unfinished job stop, but no request is automatically resubmitted on restart.
- One persistent `poser_data` volume mounted at `/data`, initially 1 GB, for cached artwork/results and daily request allowances. Read-only indexes and weights are in the image outside the volume.
- A `/healthz` check. This checks the web process; the Docker build separately validates the real artwork index and local image/text encoder without paid API calls.
- Explicit origin validation for `https://${FLY_APP_NAME}.fly.dev`. Set `PUBLIC_ORIGIN` for an additional custom domain. `TRUST_PROXY=fly` uses the Fly edge's `Fly-Client-IP` header for per-visitor limits; do not expose this server directly with that setting.

Use **one machine/replica**. Jobs, request throttling, and quota counters are not distributed. Pass `--ha=false` to `fly deploy` to prevent creation of a standby machine.

## Account setup and first deployment

Install the official Fly CLI, then use `fly auth login` and approve the generated link in your own browser. The class demo can initially be tested on Fly's trial, subject to the account's eligibility and actual limits shown in the dashboard. The documented trial has 2 total VM hours / 7 days, up to 4 GB RAM, and automatically stops machines after 5 minutes. The trial stop also applies to the remote builder: an interrupted first build can be retried to reuse completed cached layers. This is for testing, not a promise of a permanently free URL.

1. Reserve an available app name in the signed-in user's organization and put that name in `fly.toml`. App creation does not itself start a machine.
2. Create one volume: `fly volumes create poser_data --region iad --size 1 --app APP_NAME`.
3. Store `GEMINI_API_KEY` as a **Fly runtime secret** using `fly secrets import --stage`. Supply secrets through stdin, not command-line arguments or committed files. No `FAL_KEY` is needed; old generation endpoints are disabled in production. `OPENAI_API_KEY` is optional and only needed for Wireframe.
4. Pass the browser-safe `VITE_TLDRAW_LICENSE_KEY` as a build argument. This license appears in the browser bundle; API keys must never be build arguments.
5. Deploy using `fly deploy --remote-only --depot=false --ha=false`. The Fly remote builder avoids requiring Docker on the user's Mac and opts out of Depot. Keep local credentials and caches excluded by `.dockerignore`.
6. Test drawing → matching poses → selection/orbit/rig/light → historical references. Check two visitors, startup after idle, and persistence after a restart. Inspect actual memory and provider usage before raising limits.

Do not purchase a paid plan, add payment details, or add extra machines without an agreed budget. If the trial ends, the app stops until billing is configured. Automatic stopping reduces runtime costs after billing is enabled; stored volumes and stopped-machine storage can still accrue charges. No infrastructure setting controls separate Gemini charges.

## Demo usage limits

- `DAILY_NODE_API_CALLS=250`: combined actual provider attempts for sketch captioning/embedding and optional Wireframe recognition. A normal uncached sketch uses two calls.
- `DAILY_REFERENCE_API_CALLS=100`: actual Gemini artwork-comparison attempts, including retries. One reference search can use several calls.
- `REQUESTS_PER_MINUTE=12`: submitted POST requests per visitor IP.
- One running reference search, at most four active/queued jobs, conservative image/comparison worker counts.

Counters reserve before calls and persist under `/data/usage`. They reset at UTC midnight, not on restart. Failed calls count. Invalid/corrupt ledgers fail closed. Cached historical results require no provider calls and remain available after the daily allowance is reached. These limits count requests, not dollars; they are **not a financial meter or guaranteed spending cap**. Zero stops new paid calls. Preserve the usage directory when managing caches. IP limits are coarse; shared networks share a limit. No IPs are persisted by the limiter.

## Validation

```sh
npm ci
npm run build
npm test
python3 tools/met-art/test_usage.py
node scripts/smoke-production.mjs
fly config validate --strict --app APP_NAME
```

The smoke script uses ports 4347/4348, serves the production build and real pose assets, tests origin checks, and disables paid requests. `MET_PYTHON`, `MET_MODEL_PATH`, and `MET_SMOKE_CACHE` can optionally point at an installed local interpreter/model and a cached result to also test the Python cache path.

Verified on 2026-10-21/22: 177 JavaScript tests, two Python quota tests, local production smoke checks, and the complete Fly Linux container build passed. The Linux build loaded 99,117 eligible artworks from 259,874 metadata records and verified real MobileCLIP image/text encoding. The final image was built as `sha256:a17a4c1d5a4b234be8d2015d2e5962b13b1c4810bcd8df0e8862524b1df42ec8`.

Deployment is not live yet: the trial repeatedly stopped builder `fly-builder-humming-pine-1206` after five minutes during the image upload. Completed build layers are cached, but the full registry upload did not finish. App `poser-neha-class-demo`, its 1 GB encrypted `poser_data` volume, and the explicitly approved Gemini runtime secret are prepared. No app Machine was launched. Resume the deploy after resolving the trial constraint, then perform live-provider/browser checks. Do not represent the reserved URL as working until those pass.

No Linux CI success is claimed: GitHub rejected the optional workflow upload because the existing OAuth login lacks workflow scope. The successful Linux verification ran on Fly's remote builder instead.

## Data and credentials

Drawings remain in each visitor's browser, with sketches sent to the configured provider during search. There is no account or cloud document sync. The Docker build excludes local environment files, drawings, result caches, and generated model history.

Retain bundled attributions and license notices. MobileCLIP has research-only restrictions, including exclusions for product development/commercial use; PoseMyArt asset redistribution is not granted by this repository. The owner specified class-demo use; that scope statement is not a legal conclusion or additional license grant. tldraw's license must cover the hosted domain, and the supplied webfonts must be licensed for the intended use.

Official references: [configuration](https://docs.fly.io/reference/configuration), [trial](https://docs.fly.io/about/free-trial), [pricing](https://docs.fly.io/about/pricing), [proxy headers](https://docs.fly.io/networking/request-headers).

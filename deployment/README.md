# Poser class demo on Fly.io

This is a class demonstration and limited classmate test, not a commercial product launch. Fly.io is the active deployment target; the [Railway setup](railway.md) remains available as a fallback. The existing local app and main branch remain unchanged while the hosted build is tested.

## Architecture and configuration

`Dockerfile` packages Node, Python, CPU-only PyTorch, the web build, and the pose/artwork indexes. The builder downloads the public dataset from a pinned GitHub commit (`POSER_ASSET_REVISION`), avoiding a 710 MB laptop upload on every deploy. Update that revision when the committed dataset changes; local `data/` edits are excluded from the container build. Node serves the app and starts the Python search process on loopback. The browser renders the 3D models. `fly.toml` configures:

- One shared-CPU machine, 2 CPUs / 4 GB RAM, in Ashburn (`iad`). The hosted Linux machine had roughly 2.1 GB available after warming the search model.
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

- `DAILY_NODE_API_CALLS=100`: combined actual provider attempts for sketch captioning/embedding and optional Wireframe recognition. A normal uncached sketch uses two calls.
- `DAILY_REFERENCE_API_CALLS=300`: actual Gemini artwork-comparison attempts, including retries. One reference search can use several calls.
- `TOTAL_NODE_API_CALLS=200` and `TOTAL_REFERENCE_API_CALLS=300`: overall allowances across days and restarts; only an intentional configuration change extends them.
- `REQUESTS_PER_MINUTE=12`: submitted POST requests per visitor IP.
- Historical searches start only when the visitor opens References for a pose. Automatic four-pose background searches are disabled. The active fast profile uses up to 10 six-artwork comparisons plus 10 individual audits (and bounded retries); existing cached results reuse that work. The saved full profile uses 30 batches plus 45 audits.
- One running reference search, at most four active/queued jobs, conservative image/comparison worker counts.

Counters reserve before calls and persist under `/data/usage`. Daily counters reset at UTC midnight, not on restart. Overall counters never reset automatically. Failed calls count. Invalid/corrupt ledgers fail closed. Cached historical results require no provider calls and remain available after the daily allowance is reached. These limits count requests, not dollars; they are **not a financial meter or guaranteed spending cap**. Zero stops new paid calls. Preserve the usage directory when managing caches. IP limits are coarse; shared networks share a limit. No IPs are persisted by the limiter.

## Cost controls

The one 2-CPU / 4-GB app in iad costs approximately $0.0353 per running hour ($25.39 per 30 days continuously running), plus $0.15/month for the 1-GB volume, stopped-machine rootfs storage, bandwidth, and separate Gemini charges. This is an estimate, not a budget cap. There is no metrics autoscaler or spare application machine. Shared IPv4 avoids a dedicated-IP charge. Auto-stop lowers idle compute costs but does not stop storage charges.

The temporary remote builder and its 50-GB cache were removed after verification. Remove any builder created by a future deployment after verifying it; otherwise that cache alone costs roughly $7.50/month. Never delete the application volume when cleaning the builder. To stop all further service use, disable automatic starts and stop the app, or destroy the app and its storage when no longer needed. Stopping it alone leaves storage charges.

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

Live URL: **https://poser-demo.fly.dev/** (renamed deployment). Verified on 2026-10-21/22: the JavaScript suite, three Python quota tests, local production smoke checks, and the complete Fly Linux container build passed. The Linux build loaded 99,117 eligible artworks from 259,874 metadata records and verified real MobileCLIP image/text encoding.

Live browser checks covered drawing, pose retrieval, selecting a rendered 3D model, and historical artwork results. Historical comparisons start on opening References, not on receiving pose choices. Cached artwork results survived deployment/restart. The first uncached reference search took about 96 seconds; this is not an instant search. Health, configured pose inventory (1,361 scenes), rejection of foreign origins, and disabled legacy generation routes were checked.

The reference service now retains its known live child process instead of spawning a duplicate when a health probe times out during model loading. A regression test covers slow requests without a duplicate process. The incremental repair image is `registry.fly.io/poser-neha-class-demo:deployment-01M5GSTJZ55KQHZ64GJYVBH2KC`; normal future builds use the root Dockerfile and include the fix from source.

After explicit owner approval, the daily reference allowance was raised from 100 to 300; the overall reference allowance remains 300. Existing counters were preserved. The latest deployment uses one 4-GB machine and one encrypted 1-GB volume, with auto-start, auto-stop, and no spare machine. Only the approved Gemini runtime secret is configured; optional OpenAI Wireframe recognition is not enabled.

No Linux CI success is claimed: GitHub rejected the optional workflow upload because the existing OAuth login lacks workflow scope. The successful Linux verification ran on Fly's remote builder instead.

## URL migration

Fly app names cannot be changed in place. `poser-demo` replaces `poser-neha-class-demo` using the same verified container image, machine size, and request allowances. The existing `/data` cache and quota ledgers are copied before enabling requests; migration must never reset the overall allowance. All 319 files were verified by SHA-256 after transfer. The old machine and duplicate volume were then removed; only the replacement machine and its 1-GB volume remain. A local rollback archive is stored outside version control at `.local/backups/poser-before-url-change.tgz`.

The existing Gemini key was copied into encrypted secrets for the new app with explicit owner approval. The new origin passes health/configuration checks and serves migrated cached references without paid comparisons. Search behavior is unchanged.

The old app namespace is retained as the source of the existing private registry image. Future source builds use `fly.toml` targeting `poser-demo`; no builder or second running server is required for the URL change.

## Reversible fast-reference experiment

`MET_REFERENCE_PROFILE=fast` selects 60 CLIP candidates and at most 10 individual Gemini audits. It returns at most 10 verified references. `MET_REFERENCE_PROFILE=full` restores 180 candidates, 45 audits, and at most 30 results. The scoring prompt, index, ranking preferences, model, concurrency, and overall call allowance are unchanged.

Fast results use a separate `met-mobileclip-v6-compact-parallel-fast-60-10` cache namespace; they never reuse full-profile cache entries. Full-profile results remain on the volume and become available again on rollback. This isolates actual new tests from cached results. Reload an open browser tab after changing profiles to clear its in-memory result store.

The incremental fast runtime is `registry.fly.io/poser-demo:deployment-01M5GV41S8SF87QED45HNK389Z`. Local validation passed 16 search tests, 3 quota tests, and 14 Node reference/deployment tests.

Rollback checkpoint: Git tag `checkpoint/references-180-45-2026-10-21` at `e7481eb`. A pre-experiment cache/counter backup is retained locally at `.local/backups/poser-before-fast-60-10.tgz`. To revert search quality, change only `MET_REFERENCE_PROFILE` to `full` in `fly.toml` and redeploy the current image. **Do not restore an older usage ledger**: experiment calls still count. The previous complete runtime image is `registry.fly.io/poser-neha-class-demo:deployment-01M5GSTJZ55KQHZ64GJYVBH2KC` if a code rollback is required.

## Data and credentials

Drawings remain in each visitor's browser, with sketches sent to the configured provider during search. There is no account or cloud document sync. The Docker build excludes local environment files, drawings, result caches, and generated model history.

Retain bundled attributions and license notices. MobileCLIP has research-only restrictions, including exclusions for product development/commercial use; PoseMyArt asset redistribution is not granted by this repository. The owner specified class-demo use; that scope statement is not a legal conclusion or additional license grant. tldraw's license must cover the hosted domain, and the supplied webfonts must be licensed for the intended use.

Official references: [configuration](https://docs.fly.io/reference/configuration), [trial](https://docs.fly.io/about/free-trial), [pricing](https://docs.fly.io/about/pricing), [proxy headers](https://docs.fly.io/networking/request-headers).

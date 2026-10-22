# Railway deployment

The deployment branch packages the existing app without changing its UI. Node serves the built React app and public API; the Python reference service stays on loopback inside the same container. Three.js renders on the visitor's device. Use **one replica**: jobs, request throttles, and file-based quota counters are not distributed.

## Current validation and release constraints

- Production web build and local production HTTP checks pass, including a real model, pose preview/index, and a cached historical result.
- The complete MobileCLIP/index check passes locally: 99,117 eligible artworks. macOS peak resident memory was about 2.5 GiB. Start the hosted test with a 4 GB memory ceiling; this is a starting estimate, not a Linux benchmark or a price quote.
- Docker is not installed on the preparation Mac. The first Linux image build and hosted end-to-end test remain required. The Docker build validates the real model/index without making paid API requests.
- The bundled MobileCLIP license explicitly excludes product development and commercial use. See `data/met-art/LICENSE-MOBILECLIP.txt`. A public product needs an appropriate license or a replacement model/index. No license entitlement is implied by deployment support.
- The bundled character meshes/poses originate from PoseMyArt; `data/README.md` does not grant redistribution rights. Confirm those rights for the intended public release. The GT Maru webfont and tldraw domain license also need to cover the deployed site.

## Account and service setup

1. Create/sign into Railway. Connect `NehaSajja/Poser` and select branch `deploy/railway` for the preview. Review the GitHub permission scope; grant access only to this repository where possible.
2. Railway detects `Dockerfile` and `railway.json`. Do not add an npm-only start command: the Docker command starts Node with Python installed alongside it.
3. Attach a persistent volume at **`/data`**, initially 1 GB. Keep one replica. The volume holds result/image caches and daily API attempt counters. Model weights and read-only indexes are baked into the image, outside this mount. Monitor disk use and expand or prune image caches as needed; preserve `/data/usage`.
4. Set the following variables in Railway. Keep all API keys out of Git and Docker build arguments.

| Variable | Value / purpose |
| --- | --- |
| `GEMINI_API_KEY` | Private runtime key for pose search and reference comparison |
| `VITE_TLDRAW_LICENSE_KEY` | Browser-safe license supplied at **build time**; rebuilding is required after changing it |
| `TRUST_RAILWAY_PROXY` | `true`, only when the public entry point is Railway's HTTP edge |
| `DAILY_NODE_API_CALLS` | Start at `250` actual attempts/day across Gemini sketch calls and optional Wireframe calls |
| `DAILY_REFERENCE_API_CALLS` | Start at `100` actual Gemini comparison attempts/day, including retries |
| `REQUESTS_PER_MINUTE` | `12` POST submissions/minute/client IP |
| `OPENAI_API_KEY` | Optional; only for Wireframe, unnecessary for Poser |
| `DECISIONS_PROVIDER`, `DECISIONS_MODEL` | Only needed for Wireframe; preserve approved working values |

The image supplies `NODE_ENV=production`, `HOST=0.0.0.0`, `POSER_DATA_DIR=/data`, `MET_MODEL_PATH`, `MET_PYTHON`, and conservative worker counts. Let Railway supply `PORT`. Do **not** add `FAL_KEY`: legacy generation endpoints are disabled in production.

5. Generate a Railway HTTPS domain. The API accepts the host from Railway's `RAILWAY_PUBLIC_DOMAIN` automatically. For a custom domain also set `PUBLIC_ORIGIN=https://your-domain.example` with no path. No wildcard origins. If Railway assigns the domain after the first build, redeploy so the runtime receives it.
6. Set a host spending limit and alert in Railway before sharing. Request allowances are not dollar estimates and do not control charges elsewhere. Configure provider-side quotas/budgets separately. Reaching a host spending limit can take the site offline. No recurring hosting subscription was purchased during preparation.
7. Keep the preview unshared until the license/asset questions and hosted checks are resolved. After validation, merge the deployment branch to `main` and switch Railway to that branch for subsequent deploys.

Railway references: [Docker](https://docs.railway.com/builds/dockerfiles), [volumes](https://docs.railway.com/volumes), [public networking](https://docs.railway.com/networking/public-networking), [cost control](https://docs.railway.com/pricing/cost-control).

## What the limits do

- Counters reserve an attempt **before** calling a paid provider. Failures and retries count. UTC midnight resets the allowance; restarting/redeploying does not reset it when `/data` persists. A corrupt ledger fails closed.
- Node's allowance covers both sketch captioning/embedding and optional Wireframe recognition. A normal uncached sketch uses two calls; an unreadable sketch may use one.
- The Python allowance counts each visual-comparison HTTP attempt. One artwork search can make multiple calls. Cached results need none and remain usable after the allowance is exhausted.
- At most one reference search runs at a time and at most four are active/queued. Visitor throttling covers POST submissions; model downloads and result polling remain available.
- IP throttling is a coarse demo protection, not authentication. Shared networks can share a limit. The persisted global allowances are the final limit even if clients change IPs.
- Lower allowances to zero to stop new paid calls. These are request counts, **not** a financial meter or guaranteed dollar spending cap. No IP addresses are stored on disk by the limiter.

## Checks

```sh
npm ci
npm run build
npm test
python3 tools/met-art/test_usage.py
node scripts/smoke-production.mjs
```

The smoke script starts a separate production server on ports 4347/4348, checks public-domain origin enforcement and real pose/model routes, blocks all paid calls, and cleans up. Set `SMOKE_PORT` if those ports are occupied. To also exercise the Python cache path, supply `MET_PYTHON`, `MET_MODEL_PATH`, and `MET_SMOKE_CACHE` pointing at a valid existing cached reference JSON. It never reads the normal app's API keys.

With Docker installed:

```sh
docker build --build-arg VITE_TLDRAW_LICENSE_KEY -t poser .
docker run --rm -p 8080:8080 --mount type=volume,src=poser-data,dst=/data \
  -e PUBLIC_ORIGIN=http://localhost:8080 -e GEMINI_API_KEY \
  -e DAILY_NODE_API_CALLS=250 -e DAILY_REFERENCE_API_CALLS=100 poser
```

Export the license/key in your own shell first; do not paste secrets into tracked files. API secrets are only supplied to the running container. `VITE_` variables are included in the public browser bundle.

After deployment, check `/healthz`, drawing-to-pose search, model selection/orbit/rig, historical results, two concurrent visitors, and a restart. The health endpoint checks the Node process; the Docker build validates the packaged index. It does not certify that an API key or provider billing works. Inspect actual Railway RAM/CPU and provider dashboards after the test before setting an ongoing budget.

Drawings stay in each visitor's browser. Sketches are sent to the configured model provider for search; the app has no account or cloud document sync. No existing private drawings, API keys, or local generated-model history are included in the Docker build.

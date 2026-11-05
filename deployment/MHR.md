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
check includes MHR readiness. Missing weights or startup failure stop startup
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

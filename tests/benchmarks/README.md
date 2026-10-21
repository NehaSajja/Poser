# Human drawing benchmark

The corpus contains 2,425 DoodleUI recordings: all 2,025 available checkbox, switch and dropdown recordings after exact-trace deduplication, plus 400 cancel/squiggle negatives. Provenance, hashes, license and the fixed 1,695/730 development/held-out split live in `../corpus/doodleui-full/`.

`doodleui.mjs` loads original strokes in source order, preserves aspect ratio, normalizes each class to a canvas-sized control, and filters tiny strokes using the app's minimum extent. `run.mjs` replays grouping and calls the actual Decisions recognizer after the final stroke. A positive passes only when it yields one resolved component of the expected kind; a negative passes only when no component is rendered. This includes grouping failures rather than scoring only a preselected crop.

## Run

Requires Node, ImageMagick, and the configured server-side API key. These runs make paid API calls, up to two per unresolved recording, with six concurrent workers by default. Unit/integrity tests do not use the network.

```sh
node --test tests/benchmarks/corpus.test.mjs
BENCH_IDS=tests/benchmarks/tuning-ids.json node tests/benchmarks/run.mjs dev my-tuning-run
node tests/benchmarks/run.mjs dev baseline-full
BENCH_WORKERS=3 node tests/benchmarks/run.mjs holdout baseline-full
# Change the recognizer using development results, then freeze the candidate.
node tests/benchmarks/run.mjs dev candidate-full
BENCH_WORKERS=3 node tests/benchmarks/run.mjs holdout candidate-full
node tests/benchmarks/report.mjs
```

Each new label snapshots the recognizer, grouping code and reference assets under `output/recognition-benchmark/snapshots/`. Reusing a label reuses that frozen code and successful cached rows; use a new label for a new implementation. Raw/candidate/context PNGs and per-case decisions are retained with results. Holdout runs print progress without scores. Read the report only once the candidate is fixed, and do not then tune to its held-out failures.

The initial `baseline` label used an SVG renderer that dropped polylines. Its output is marked invalid and excluded. `baseline-full` and `candidate-full` use directly rendered polylines. `baseline-v1` and candidate a/b/c were small development experiments, not full estimates. Six development recordings are explicit visual references; `build-human-references.mjs` rebuilds those assets and the integrity test verifies that none belongs to holdout.

## Limits

- These are isolated control sketches, not complete live canvas sessions. The evaluation replays stroke order but not real pen timing or intermediate recognition/auto-layout.
- No author identities are available, so the split cannot guarantee separation by writer. Exact normalized duplicates are removed; near-duplicate styles may remain.
- Switch state is not labeled and is not scored independently. The app still requires confidence in state before rendering a switch.
- Button, input, radio, rectangle and arbitrary unsupported categories are outside this human corpus; existing synthetic fixtures remain additional checks.
- The API is probabilistic. Before/after figures represent one paired run per recording, not a guarantee on repeated requests. Thresholds remain .70 winning probability and .20 margin.
- Latency includes shared worker scheduling and is unsuitable for an interactive latency claim.

The browsable report is `output/recognition-benchmark/report.html`; `comparison.json` contains counts and per-class scores. Output artifacts are local and ignored by Git. Source data remains under its BSD-3-Clause license.

## Measured result · October 16, 2026

Frozen `baseline-full` versus `candidate-full`, using OpenAI Decisions and unchanged acceptance thresholds:

| Split | Recordings | Before | After | Fixed | Regressed | API errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Development | 1,695 | 665 (39.2%) | 1,182 (69.7%) | 519 | 2 | 0 |
| Held out | 730 | 296 (40.5%) | 497 (68.1%) | 206 | 5 | 0 |

Held-out per-class results: checkbox 140/202 → 147/202; switch 37/207 → 120/207; select 0/201 → 112/201. Unsupported drawings preserved as ink: 119/120 → 118/120. Counting only the 610 supported controls, recognition rose from 29.0% to 62.1%. No changes were selected using held-out results.

The app's 42 unit tests, corpus-integrity check and build pass. Live synthetic raster fixtures passed 12/12; the 15 stroke replays passed 13/15 in one run, with left-thumb and nested switches unresolved. Repeating three switch cases three times found 6/9 candidate successes versus 7/9 baseline successes: the simple left-thumb case remains unreliable in both, and should not be described as fixed. Subsequent repeats are diagnostic, not replacements for the reported failures.

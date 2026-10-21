# Met historical-pose playground

Playground at http://127.0.0.1:4318 and shared reference service for Poser at http://127.0.0.1:4317.

## Run

Use Python with torch, torchvision, open_clip_torch, timm, ftfy, regex,
safetensors, huggingface_hub, numpy, pyarrow, requests and Pillow installed.
This machine's existing runtime is `/Users/ananmaysharan/.pyenv/versions/3.13.7/bin/python3`.

From sketch-ui:

```sh
/Users/ananmaysharan/.pyenv/versions/3.13.7/bin/python3 tools/met-art/server.py
```

The prepared index and model live in `.local/met-art/`. No dataset or model
weights should be committed. `prepare.py` downloads the published vector shards
and range-reads metadata columns without downloading the artwork image corpus.
It stores the vectors as float16; retrieval normalizes them in float32.

## Pipeline

1. Select any of the 1,361 existing poses and either rendered camera angle.
2. Encode the screenshot and existing pose description with MobileCLIP-S1,
   matching the Met index's embedding family. Image and text scores are combined
   using reciprocal-rank fusion; image-only and text-only modes are available.
3. Retrieve up to 180 distinct artwork/title-artist pairs from suitable media, reserving roughly half the candidate pool for drawings and prints. Text queries favor life drawing, figure sketches and naturalistic sculpture.
4. Gemini visually compares the query against those actual artwork images,
   assessing body configuration with compact score-only JSON. A separate, bounded ranking preference favors drawings and prints, boosts naturalistic sculpture, and lowers strongly abstract sculpture. Naturalism is assessed from visible anatomy, not culture, artist identity, or period. Displayed pose scores and match labels are unchanged by this preference. Up to 45 shortlisted candidates receive a second, individual image comparison; up to 30 passing references are shown. These checks help catch batch mix-ups. The scores are
   judgments, not calibrated confidence. Failed comparisons remain explicitly
   unverified; raw candidates are always inspectable.
5. Cache by pipeline version, pose, camera and retrieval mode.

`GEMINI_API_KEY` comes from the environment or the app's existing `.env.local`/
`.env`. It stays on the loopback server. The comparison sends the rendered pose
and retrieved public artwork images to Gemini. New searches use that API;
cache hits do not.

Run `evaluate.py` for six varied poses. Results and timings are saved in
`.local/met-art/results/evaluation.json`. This evaluates the prototype rather
than providing an independently labeled accuracy benchmark.

## Sources

- [Met image embedding index](https://huggingface.co/datasets/metmuseum/openaccess-embeddings-apple-mobileclip-ml-s1)
- [Met metadata](https://huggingface.co/datasets/metmuseum/openaccess)
- [Apple MobileCLIP-S1 OpenCLIP weights](https://huggingface.co/apple/MobileCLIP-S1-OpenCLIP)

The museum dataset is CC0. Model use is subject to Apple's model license.
Each result links to the original museum record. A future production version
should improve person-level retrieval and validate pose matching against human
judgments before describing results as exact matches.

## Prototype findings

The initial six-pose evaluation completed without API failures. Fresh searches took
34–56 seconds in this run; cached examples load immediately. Crossed-arm
standing and squatting produced useful historical references on visual review.
Seated-on-heels, prone, raised-leg reclining and hand-on-head crouching queries
mostly produced partial matches. The pipeline explicitly labels these limits.
Whole-image MobileCLIP is a useful discovery baseline, but this test does not
establish reliable exact-pose retrieval. These were the initial standalone results, before integration into Poser.

The initial fast-model batch comparison falsely interpreted an isolated arm as
a full figure. The final pipeline uses Gemini 3.8 Flash, smaller batches, and
individual verification of the shortlist, dropping isolated fragments.

Validation: twelve automated behavior tests; six end-to-end pose searches;
artwork self-retrieval checks; browser checks for filtering, cached pose changes,
raw candidates and partial-match warnings.

The drawing-focused rerun completed across the same six poses without failures.
Drawings/prints occupied 31 of the combined 36 top-six slots, versus 15 before.
The crossed-arm pose now leads with *Nude Study* and *Man with a Spade*; the
prone example also found a useful figure study. These are observed examples,
not a calibrated retrieval-accuracy benchmark. Cached results were versioned
and refreshed to avoid serving the previous ranking.

## Wider retrieval and prominence

The current version retrieves 180 candidates, individually audits up to 45
plausible matches, and returns at most 30 with pose scores of at least 40.
Displayed match labels remain based only on pose similarity.

Run `prepare_highlights.py` before starting the server to download the Met's
`isHighlight` flag through its paginated v1.1 search API. It validates complete,
duplicate-free pagination and saves the source and retrieval timestamp locally.
The Met defines this flag as a popular and important work. It is a modest
prominence proxy, not an estimated audience size or a claim of global fame.
Relevant highlighted works enter the candidate pool and receive an eight-point
ranking boost only after reaching the minimum pose threshold. Eligible results
are labeled “Met highlight.” The drawing/naturalistic-sculpture preference stays
in effect. Missing highlight status receives no boost, not a penalty.

Source: https://metmuseum.github.io/#object

Transient comparison-service errors (429/502/503/504) receive up to two retries
with a short backoff; persistent failures remain explicit and are not cached.

The wider six-pose evaluation returned 30 references for squatting, crossed-arm
standing and kneeling, 17 for raised-leg reclining, 29 for prone, and 24 for
hand-on-head crouching. Successful fresh runs took 107–128 seconds; cached
results load immediately. Two initial searches encountered HTTP 503 errors
and succeeded on rerun. All six final results passed count, score, candidate-ID
and highlight-source checks. These counts include partial matches, not only
close poses; the wider pool did not produce a strong raised-leg reclining match.

## Four-pose prefetch and latency (October 21)

Poser starts searches for all four retrieved poses, shares each request with the
foreground view, and keeps completed results in memory. The service runs up to
four jobs concurrently, with shared limits of 24 comparison and 32 image workers.
Identical running/queued queries share a job. Up to 12 uncached jobs are admitted;
cache hits remain available while those jobs run. Existing v5 audited result
caches remain valid and avoid paying for the same search again.

Downloaded artwork thumbnails are resized once and cached on disk. Gemini now
returns scores and body/naturalism flags, without generating prose per candidate.
The model, 180-candidate pool, individual audit of up to 45 shortlisted works,
minimum score and 30-result limit remain unchanged. Generated scores can vary;
these optimizations do not establish improved matching accuracy.

`benchmark_fast.py` forces fresh comparisons and records retrieval, download,
batch and audit timings. The index is warmed before timing. A three-pose run
(crossed arms, squat, raised-leg reclining) took 16.26, 16.10 and 14.20 seconds,
versus saved v5 baselines of 124.74, 121.91 and 107.00 seconds: approximately
7.5× faster. All returned successfully with 30, 30 and 16 checked references.
These are sequential-query timings, not a guarantee when four queries compete.
A 32-worker experiment took 13.5–20.3 seconds and was not consistently faster,
so the shipped limit is 24. Speculative early audits were also tested and removed
because they added requests without improving latency. A sustained 10× reduction
in uncached search time has not been demonstrated; external inference remains
the largest cost. The live app proxy returned all four already-cached result sets
in 56 ms total in a local check, and prefetched UI switches showed no spinner.

Card details use museum-provided title, artist, date, medium and credit, and link
to the original record. The similarity bar is labeled out of 100, not as a
calibrated confidence percentage. No fabricated museum description is added.

A subsequent **four-query concurrent** fresh run completed all four poses in
44.61 seconds (first result at 29.14 s), returning 30/30/30/26 references without
errors. The corresponding saved v5 individual timings sum to 491.40 seconds,
which the previous single-worker service would have processed sequentially.
This is about **11× faster to complete the entire four-pose set**, not an 11×
first-result improvement. Reproduce with `benchmark_fast.py --all-four`.
The index is warmed before these measurements; first startup also loads it.

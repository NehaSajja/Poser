# DoodleUI recognition corpus

2,425 original pen-stroke recordings from https://github.com/soumikmohianuta/DoodleUINet, pinned at commit `e38a92c7526742af4e20bdc3239eba8459cb6dab`. BSD-3-Clause license and copyright are retained in LICENSE.

Includes all available CorrectDrawings for checkbox (671), switch (687), and dropDown (667), plus 200 cancel and 200 squiggle recordings as unsupported controls. Source class names map to our `checkbox`, `switch`, `select`, and `unknown` expectations. Switch state is not annotated by the dataset and is not scored.

The manifest records original source URLs, byte hashes, normalized trace hashes, and a fixed 70/30 per-class development/holdout split. One exact normalized duplicate was removed before splitting. Source author identities are unavailable; the split is not guaranteed to be writer-disjoint. There is no cross-source or live-session accuracy claim.

Rebuild from a sparse checkout:

```sh
git clone --filter=blob:none --sparse https://github.com/soumikmohianuta/DoodleUINet.git /tmp/doodleui
git -C /tmp/doodleui checkout e38a92c7526742af4e20bdc3239eba8459cb6dab
git -C /tmp/doodleui sparse-checkout set CorrectDrawings/checkbox CorrectDrawings/switch CorrectDrawings/dropDown CorrectDrawings/cancel CorrectDrawings/squiggle
python3 tests/benchmarks/import-doodleui.py /tmp/doodleui
```

Run `node --test tests/benchmarks/corpus.test.mjs` to check source integrity, split separation and development-only prompt references. The importer and benchmark use only JSON stroke data; no downloaded dataset code is executed.

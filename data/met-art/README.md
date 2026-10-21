# Bundled Met reference search

This directory contains the complete prepared Met metadata/vector index, highlight IDs, and MobileCLIP-S1 weights used by References. Everything is tracked in ordinary Git. `npm run setup` verifies every file against `manifest.json`, assembles the weights under `.local/met-art/`, installs the project Python environment, and checks real image/text encoding against the index.

The model is stored in ordered parts of at most 40 MiB to keep every Git object below GitHub's file-size limit. Do not concatenate files manually or edit the parts. Setup validates both part checksums and the assembled model checksum. It is safe to rerun and repairs incomplete local weights.

The index has 259,561 vectors and 52 metadata shards. The app's existing media/image filters search 99,117 eligible artworks. The metadata and vectors are unchanged copies of the local prepared index; no artwork candidates were removed for packaging. Runtime artwork downloads and generated search-result caches remain under ignored `.local/` directories and populate as needed.

## Sources and license

- Metadata: https://huggingface.co/datasets/metmuseum/openaccess
- Embeddings: https://huggingface.co/datasets/metmuseum/openaccess-embeddings-apple-mobileclip-ml-s1
- Highlights: https://metmuseum.github.io/
- Model: https://huggingface.co/apple/MobileCLIP-S1-OpenCLIP
- Model license snapshot: https://huggingface.co/apple/MobileCLIP-S1-OpenCLIP/blob/59d35241939f6942255489b83c9068e48ebf57f8/LICENSE

Met Open Access metadata is CC0. The model is research-only under the included `LICENSE-MOBILECLIP.txt`; that license excludes commercial use and product development. Bundling it does not change those terms.

Apple Machine Learning Research Model is licensed under the Apple Machine Learning Research Model License Agreement.

Local model modification: floating-point tensors were converted to float16 by `tools/met-art/prepare.py` before packaging. No retraining, fine-tuning, or architecture change was performed. The part files reconstruct that exact local checkpoint.

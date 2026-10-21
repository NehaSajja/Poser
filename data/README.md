# Pose runtime assets

These files are included in ordinary Git. Cloning or pulling this private repository downloads everything needed for pose retrieval and the 3D model viewer. No Git LFS, release download, extraction, or external folder setup is required.

- `cloud-retrieval/`: the complete 1,361-pose catalogue, search index, protocol, embeddings, and preview images referenced by the index.
- `posemyart-library-final/decoded-scenes/`: the 1,361 decoded scenes referenced by the catalogue.
- `posemyart-library-final/models/`: Female, Male, and Human FBX meshes and rigs used by the app.
- `SHA256SUMS.txt`: checksums of the bundled assets, relative to this directory.

The scene/model files are unchanged copies from the local PoseMyArt collection of October 18, 2026. `UPSTREAM-README.txt` describes that original collection; this runtime subset does not include its unused models, props, duplicate raw scenes, or research files. Asset provenance remains PoseMyArt; inclusion here does not grant a separate redistribution license.

The Met historical-art index and MobileCLIP weight parts are included in `met-art/`. Run `npm run setup` to assemble the weights and prepare the Python environment. See `met-art/README.md` for the model license and bundle details. API keys belong in `.env.local`, never in this directory.

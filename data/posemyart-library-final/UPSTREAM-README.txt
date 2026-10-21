PoseMyArt scene library
Collected October 18, 2026

Contents
  5,543 original PMA scenes and decoded JSON copies
  47 referenced character FBX files
  393 referenced prop FBX files
  37 unique custom OBJ props extracted from scene data
  6 generated basic-shape OBJ props, with original construction parameters

Folders
  scenes/             Original downloaded .pma files, prefixed with catalog scene ID.
  decoded-scenes/     The same scene data decoded into JSON; originals are unchanged.
  models/             Character meshes and rigs in FBX format, prefixed with model ID.
  props/              Prop FBX files, prefixed with prop ID.
  props/embedded/     Deduplicated custom OBJ geometry embedded in scene files.
  props/procedural/   Generated basic shapes. Geometry parameters are recorded;
                      their triangulation may differ from the app's implementation.
  metadata/           Catalog, ID-to-file mappings, dependency lists and validation.

Start with metadata/scene-catalog.json to look up a scene by name or description.
metadata/scene-downloads.json links each catalog ID to its local PMA and JSON files.
metadata/asset-downloads.json maps each model/prop ID to its local FBX file.
metadata/embedded-assets.json maps custom objects to their extracted OBJ files.

Recreating scenes
This is the source library, not 5,543 preassembled Blender/GLB files or an offline app.
Load the referenced models/props and apply the saved scene and bone transforms,
object groups, colors and camera settings. Saved bone transforms are local to the
rig; they are not a ready-made table of world-space joint coordinates.
The scene's bones array corresponds to its skinned meshes. Preserve their ordering.
The app uses the first child of a loaded FBX group for ordinary props.

Some saved scenes use older bone endpoint names that differ from the current FBX
assets. metadata/reconstruction-notes.json records these differences for a future
importer. No source scene or rig has been modified to guess a fix.
Custom OBJ files sometimes declare MTL filenames. The original app loads these OBJ
strings without MTL files; the full embedded geometry is included here.

Verification
All original downloads have SHA-256 hashes in their manifests and SHA256SUMS.txt.
Scene JSON decoding, model/prop reference coverage and FBX structure were checked.
Missing or invalid downloads: 0.
Scene-by-scene visual reconstruction has not been tested.

Source catalog
https://posemyart3.nyc3.cdn.digitaloceanspaces.com/scenes/premade_scenes_list.json

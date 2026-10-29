"""Export the fixed MakeHuman comparison body with MPFB 2.0.18 / Blender 4.5.

Run with factory startup in an isolated Blender profile:
  blender --background --factory-startup --python scripts/assets/export-mpfb.py -- MPFB_SOURCE OUTPUT_DIRECTORY
The MPFB checkout is build tooling only; the exported mesh/rig use its CC0 assets.
"""
import sys
from pathlib import Path
import bpy

source, output = map(lambda p: Path(p).resolve(), sys.argv[sys.argv.index('--') + 1:])
output.mkdir(parents=True, exist_ok=True)
profile = source.parent / 'mpfb-export-profile'
profile.mkdir(exist_ok=True)
sys.path.insert(0, str(source / 'src'))
# Headless source checkout (not an installed Blender extension). Keep all MPFB
# data local to this build, without touching the user's Blender preferences.
original_extension_path = bpy.utils.extension_path_user
bpy.utils.extension_path_user = lambda package, *args, **kwargs: str(profile) if package == 'mpfb' else original_extension_path(package, *args, **kwargs)
bpy.context.preferences.addons.new().module = 'mpfb'
import mpfb
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
macros = TargetService.get_default_macro_info_dict()
body = HumanService.create_human(scale=0.1, macro_detail_dict=macros)
body.name = 'MakeHuman Neutral'
rig = HumanService.add_builtin_rig(body, 'mixamo', import_weights=True)
rig.name = 'MakeHuman Rig'
bpy.ops.wm.save_as_mainfile(filepath=str(source.parent / 'mpfb-neutral-source.blend'))
# Keep the editable macro targets in the source .blend, but bake this fixed body.
TargetService.bake_targets(body)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.mpfb.delete_helpers()
# Web renderers support four weights per vertex. Remove unused groups first so
# helper groups cannot displace actual bone influences during limiting.
bone_names = {b.name for b in rig.data.bones}
for group in list(body.vertex_groups):
    if group.name not in bone_names:
        body.vertex_groups.remove(group)
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
for polygon in body.data.polygons:
    polygon.use_smooth = True
body.data.materials.clear()
material = bpy.data.materials.new('Neutral clay')
material.diffuse_color = (0.65, 0.65, 0.65, 1)
body.data.materials.append(material)
rig.select_set(True)
bpy.ops.export_scene.fbx(
    filepath=str(output / 'mpfb-neutral.fbx'), use_selection=True,
    object_types={'ARMATURE', 'MESH'}, add_leaf_bones=False, bake_anim=False,
    axis_forward='-Z', axis_up='Y', use_mesh_modifiers=True,
    mesh_smooth_type='FACE', use_armature_deform_only=True,
)
print('POSER_EXPORT', len(body.data.vertices), 'vertices;', len(rig.data.bones), 'bones')

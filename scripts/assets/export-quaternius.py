"""Convert the official CC0 Quaternius male body to Poser's bone naming convention.

Blender 4.5: blender --background --python scripts/assets/export-quaternius.py -- \
  .local/quaternius/Superhero_Male_FullBody.gltf public/models/quaternius-male.fbx
Geometry and bind pose are retained; weights use the strongest four influences. Textures are intentionally
removed for a same-material comparison; no shape or skin-weight repair is made.
"""
import bpy, sys, pathlib
source, destination = map(lambda p: pathlib.Path(p).resolve(), sys.argv[sys.argv.index('--')+1:])
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
roles = {'pelvis':'Hips', 'spine_01':'Spine', 'spine_02':'Spine1', 'spine_03':'Spine2', 'neck_01':'Neck', 'Head':'Head'}
for side, suffix in [('Left','l'), ('Right','r')]:
    for name, role in [('clavicle','Shoulder'),('upperarm','Arm'),('lowerarm','ForeArm'),('hand','Hand'),('thigh','UpLeg'),('calf','Leg'),('foot','Foot'),('ball','ToeBase')]:
        roles[f'{name}_{suffix}'] = side+role
    for finger in ['thumb','index','middle','ring','pinky']:
        for i in range(1,4): roles[f'{finger}_{i:02d}_{suffix}'] = f'{side}Hand{finger.title()}{i}'
for name,role in roles.items(): armature.data.bones[name].name='mixamorig:'+role
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH': continue
    obj.data.materials.clear()
    for polygon in obj.data.polygons: polygon.use_smooth = True
# One skinned mesh prevents FBXLoader from duplicating bones for separate eye/eyebrow skins.
bpy.ops.object.select_all(action='DESELECT')
meshes=[o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in meshes: obj.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in meshes if 'SuperHero' in o.name)
bpy.ops.object.join()
# Browser FBX skinning supports four influences. Keep the strongest authored
# influences, then normalize; otherwise the loader silently truncates them.
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(destination), use_selection=True, object_types={'ARMATURE','MESH'},
  add_leaf_bones=False, bake_anim=False, use_mesh_modifiers=True, axis_forward='-Z', axis_up='Y',
  apply_scale_options='FBX_SCALE_NONE', path_mode='AUTO', embed_textures=False)
print('Exported',destination)

"""
Packshots of finished kits, to judge them the way a shopper will.

    blender --background --python scripts/blender/preview_kit.py -- <jerseydir> <publicdir> <outdir>

Renders a few kit, angle and shape combinations from jersey_finished.blend. Also
the source of the store's jersey material for build_store.py.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import add_camera, orbit_points, script_args, studio, use_gpu  # noqa: E402


def kit_material(public, slug, size_suffix="-4k"):
    """Principled cloth with the kit, the seam relief and a little sheen."""
    name = f"Kit_{slug}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Sheen Weight"].default_value = 0.35
    bsdf.inputs["Sheen Roughness"].default_value = 0.55

    albedo = tree.nodes.new("ShaderNodeTexImage")
    albedo.image = bpy.data.images.load(os.path.join(public, "kits", f"{slug}{size_suffix}.webp"), check_existing=True)
    tree.links.new(albedo.outputs["Color"], bsdf.inputs["Base Color"])

    relief = tree.nodes.new("ShaderNodeTexImage")
    relief.image = bpy.data.images.load(os.path.join(public, "jersey-normal.webp"), check_existing=True)
    relief.image.colorspace_settings.name = "Non-Color"
    normal = tree.nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 1.0
    tree.links.new(relief.outputs["Color"], normal.inputs["Color"])
    tree.links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def main():
    args = script_args()
    jersey_dir, public, out = (os.path.abspath(a) for a in args[:3])
    os.makedirs(out, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=os.path.join(jersey_dir, "jersey_finished.blend"))
    scene = bpy.context.scene
    for obj in list(bpy.data.objects):
        if obj.name not in ("Jersey", "Rig"):
            bpy.data.objects.remove(obj)
    jersey = bpy.data.objects["Jersey"]
    keys = jersey.data.shape_keys.key_blocks

    centre = (0, 0, 0.38)
    studio(scene, centre=centre, strength=0.55)
    use_gpu(scene, samples=96)
    scene.render.resolution_x = 620
    scene.render.resolution_y = 760
    scene.render.image_settings.file_format = "PNG"

    shots = [
        ("barcelona", 0, 0.0, 0.25),
        ("real-madrid", 28, 0.0, 0.25),
        ("juventus", 180, 0.0, 0.25),
        ("milan", 0, 1.0, 0.1),
    ]
    for slug, degree, hung, lift in shots:
        jersey.data.materials.clear()
        jersey.data.materials.append(kit_material(public, slug))
        keys["Hung"].value = hung
        (position,) = orbit_points(centre, 1.75, lift, (degree,))
        add_camera(scene, position, centre, lens=58, name=f"Camera_{slug}")
        scene.render.filepath = os.path.join(out, f"kit_{slug}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

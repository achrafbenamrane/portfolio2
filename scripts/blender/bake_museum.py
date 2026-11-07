"""
Lights the museum once, in Cycles, and exports what the page needs.

    blender --background <builddir>/museum.blend --python scripts/blender/bake_museum.py -- <builddir> <publicdir> [samples]

Writes, to <builddir>:   walls.npy floor.npy props.npy framewood.npy poster.npy
Writes, to <publicdir>:  museum.glb frame.glb

Then run scripts/museum_bake_post.py, which turns the linear .npy files into textures.
"""

import os
import shutil
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    add_area,
    bake_diffuse,
    render_linear,
    script_args,
    select_only,
    unwrap,
    use_gpu,
)

args = script_args()
BUILD = os.path.abspath(args[0])
PUBLIC = os.path.abspath(args[1])
SAMPLES = int(args[2]) if len(args) > 2 else 256


def unwrap_floor(obj):
    """A rectangle needs no unwrapping: its texture is its plan."""
    mesh = obj.data
    layer = mesh.uv_layers.new(name="Bake")
    mesh.uv_layers.active = layer
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for polygon in mesh.polygons:
        for vertex, loop in zip(polygon.vertices, polygon.loop_indices):
            co = mesh.vertices[vertex].co
            layer.data[loop].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))


def bake_frame(scene):
    """
    The box, on its own, lit only by its LED bar and a pale print.

    All six share this one texture, so it can't hold any one frame's colour: the page
    tints it for each. It has to be baked alone, or it would pick up its neighbours.
    """
    wood = bpy.data.objects["FrameWood_camaro"]
    keep = {wood, bpy.data.objects["FrameBar_camaro"], bpy.data.objects["FrameLamp_camaro"]}
    plate = bpy.data.objects["Plate_camaro"]
    keep.add(plate)

    hidden = []
    for obj in scene.objects:
        if obj not in keep and not obj.hide_render:
            obj.hide_render = True
            hidden.append(obj)

    original = plate.data.materials[0]
    pale = bpy.data.materials.new("PalePrint")
    pale.use_nodes = True
    tree = pale.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    light = tree.nodes.new("ShaderNodeEmission")
    light.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
    light.inputs["Strength"].default_value = 0.8
    tree.links.new(light.outputs[0], output.inputs["Surface"])
    plate.data.materials[0] = pale

    # A soft light from the room, or the front of the box is a black hole with no grain.
    fill = add_area(
        scene,
        "FrontFill",
        (wood.location.x - 1.0, wood.location.y - 4.0, wood.location.z + 1.6),
        wood.location,
        3.0,
        120,
    )

    unwrap(wood)
    bake_diffuse(wood, 2048, BUILD)
    shutil.move(os.path.join(BUILD, "framewood_camaro.npy"), os.path.join(BUILD, "framewood.npy"))

    bpy.data.objects.remove(fill)
    plate.data.materials[0] = original
    for obj in hidden:
        obj.hide_render = False


def export_frame(scene):
    """The box, at the origin, for the page to set up six times over."""
    placed = []
    for name, source in (
        ("Wood", "FrameWood_camaro"),
        ("Bar", "FrameBar_camaro"),
        ("Lamp", "FrameLamp_camaro"),
    ):
        obj = bpy.data.objects.new(name, bpy.data.objects[source].data)
        scene.collection.objects.link(obj)
        placed.append(obj)
    select_only(*placed)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(PUBLIC, "frame.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="NONE",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )
    for obj in placed:
        bpy.data.objects.remove(obj)


def export_hall(objects):
    select_only(*objects)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(PUBLIC, "museum.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="NONE",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )


def main():
    os.makedirs(PUBLIC, exist_ok=True)
    scene = bpy.context.scene
    use_gpu(scene, samples=SAMPLES, denoise=False)
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 2
    scene.cycles.sample_clamp_indirect = 8.0

    bake_frame(scene)

    walls = bpy.data.objects["Walls"]
    floor = bpy.data.objects["Floor"]
    props = bpy.data.objects["Props"]
    unwrap(walls)
    unwrap(props)
    unwrap_floor(floor)
    for obj, size in ((floor, 2048), (props, 2048), (walls, 4096)):
        bake_diffuse(obj, size, BUILD)

    scene.cycles.use_adaptive_sampling = True
    scene.camera = bpy.data.objects["Hero"]
    render_linear(scene, "poster", BUILD, 1920, 1080, 320)

    export_frame(scene)
    export_hall([walls, floor, props, bpy.data.objects["Glow"]])
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, "museum_baked.blend"))
    print("bake finished", flush=True)


main()

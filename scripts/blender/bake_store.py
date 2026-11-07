"""
Lights the store once, in Cycles, and exports what the web page needs.

    blender --background <storedir>/store.blend --python scripts/blender/bake_store.py -- <storedir> <publicdir> [samples]

A browser cannot path-trace a room sixty times a second, but the room never moves,
so it does not have to. Every surface's light, soft shadows and colour bleed are
worked out here and written into textures, and the page just draws them. That is
what makes this run on a phone and still look rendered.

Writes, to <storedir>:   walls.npy floor.npy props.npy poster.npy (linear light)
Writes, to <publicdir>:  store.glb env.hdr

scripts/store_bake_post.py then tone-maps the .npy files into web textures. They
are kept linear so exposure can be retuned without baking again.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    add_camera,
    bake_diffuse,
    render_linear,
    script_args,
    select_only,
    unwrap,
    use_gpu,
)

args = script_args()
STORE_DIR = os.path.abspath(args[0])
PUBLIC = os.path.abspath(args[1])
SAMPLES = int(args[2]) if len(args) > 2 else 256

SIZES = {"Floor": 2048, "Props": 2048, "Walls": 4096}


def join_props():
    props = bpy.data.objects["Props"]
    extras = [o for o in bpy.data.objects if o.name.startswith("Ball") or o.name == "Logo"]
    select_only(props, *extras)
    bpy.context.view_layer.objects.active = props
    bpy.ops.object.join()
    return props


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


def pin_ball_texture():
    """The ball's own map must keep reading its own UVs while Bake is active."""
    material = bpy.data.materials["Ball"]
    tree = material.node_tree
    node = next(n for n in tree.nodes if n.type == "TEX_IMAGE")
    coords = tree.nodes.new("ShaderNodeUVMap")
    coords.uv_map = "UVMap"
    tree.links.new(coords.outputs["UV"], node.inputs["Vector"])


def panorama(scene):
    """The room as seen from its middle, for chrome and cloth to reflect."""
    camera = add_camera(scene, (0.4, -0.3, 1.45), (1.4, -0.3, 1.45), name="Pano")
    camera.data.type = "PANO"
    camera.data.panorama_type = "EQUIRECTANGULAR"
    use_gpu(scene, samples=96)
    scene.render.resolution_x = 768
    scene.render.resolution_y = 384
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "HDR"
    scene.render.filepath = os.path.join(PUBLIC, "env.hdr")
    bpy.ops.render.render(write_still=True)


def shirt_lod(scene):
    """The rail shirts: one cheap mesh in the hung shape, instanced by the page."""
    source = bpy.data.objects["Shirt_barcelona"]
    evaluated = source.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    mesh.materials.clear()
    lod = bpy.data.objects.new("ShirtLOD", mesh)
    scene.collection.objects.link(lod)
    select_only(lod)
    decimate = lod.modifiers.new("Decimate", "DECIMATE")
    decimate.ratio = 0.13
    bpy.ops.object.modifier_apply(modifier="Decimate")
    print("shirt lod tris:", sum(len(p.vertices) - 2 for p in lod.data.polygons), flush=True)
    return lod


def export(objects):
    select_only(*objects)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(PUBLIC, "store.glb"),
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
    scene = bpy.context.scene
    use_gpu(scene, samples=SAMPLES, denoise=False)
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 2
    scene.cycles.sample_clamp_indirect = 8.0

    pin_ball_texture()
    props = join_props()
    walls = bpy.data.objects["Walls"]
    floor = bpy.data.objects["Floor"]
    unwrap(walls)
    unwrap(props)
    unwrap_floor(floor)

    for obj in (floor, props, walls):
        bake_diffuse(obj, SIZES[obj.name], STORE_DIR)

    cctv = bpy.data.objects["CCTV"]
    scene.camera = cctv
    scene.cycles.use_adaptive_sampling = True
    render_linear(scene, "poster", STORE_DIR, 1920, 1080, 220)
    panorama(scene)
    scene.camera = cctv

    lod = shirt_lod(scene)
    props.data.uv_layers.remove(props.data.uv_layers["UVMap"])
    export([walls, floor, props, bpy.data.objects["Chrome"], bpy.data.objects["Glow"], lod])

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(STORE_DIR, "store_baked.blend"))
    print("bake finished", flush=True)


main()

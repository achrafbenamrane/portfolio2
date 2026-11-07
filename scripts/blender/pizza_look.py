"""
Renders the simulated pizza the way a food photographer would: one big soft window
behind it, a low camera on a long lens, and a shallow focus.

    B --background --factory-startup --python scripts/blender/pizza_look.py -- \
        <repo root> <out.png> [width] [height] [samples] [mesh size] [room turn] [close|show|bake|stamps] [map folder]

`bake` looks straight down instead and writes the light for the page: everything but the
reflections, which the page draws live so they can move. `stamps` does the same for a
sheet of toppings, under a soft overhead light, because the page turns them as it lays
them down and a directional light would turn with them. `show` saves the scene to <out>
instead of rendering it, for opening in Blender with pizza_window.py.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import add_area, add_camera, render_linear, script_args, use_gpu  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
OUT = os.path.abspath(args[1])
WIDTH = int(args[2]) if len(args) > 2 else 1280
HEIGHT = int(args[3]) if len(args) > 3 else 800
SAMPLES = int(args[4]) if len(args) > 4 else 128
MESH = int(args[5]) if len(args) > 5 else 1400
ROOM_TURN = float(args[6]) if len(args) > 6 else 200
CLOSE = len(args) > 7 and args[7] == "close"
STAMPS = len(args) > 7 and args[7] == "stamps"
BAKE = STAMPS or (len(args) > 7 and args[7] == "bake")
SHOW = len(args) > 7 and args[7] == "show"
STAGE = args[8] if len(args) > 8 else "hero"

MAPS = os.path.join(ROOT, "assets-source/pizza/maps", STAGE)
SIZE = 0.38 * (320 * 6 / 2048) if STAMPS else 0.38

scene = bpy.context.scene
for thing in list(bpy.data.objects):
    bpy.data.objects.remove(thing)


def load_map(name):
    return np.load(os.path.join(MAPS, f"{name}.npy"))


def float_image(name, data):
    """A float image, kept linear. Rows run the other way up in Blender."""
    h, w = data.shape[:2]
    rgba = np.ones((h, w, 4), np.float32)
    if data.ndim == 2:
        rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = data
    else:
        rgba[..., :3] = data
    image = bpy.data.images.new(name, w, h, alpha=False, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


height = load_map("height")
albedo = load_map("albedo")
rough = load_map("rough")
scatter = load_map("scatter")
gloss = load_map("gloss")


def build_pizza():
    """A grid over the height field, skipping everything past the edge of the dough."""
    n = height.shape[0]
    step = (n - 1) / (MESH - 1)
    index = np.minimum((np.arange(MESH) * step).round().astype(int), n - 1)
    sampled = height[np.ix_(index, index)]
    coords = (index + 0.5) / n * SIZE - SIZE / 2
    gx, gy = np.meshgrid(coords, coords)

    alive = sampled > 1e-5
    quad = alive[:-1, :-1] & alive[1:, :-1] & alive[:-1, 1:] & alive[1:, 1:]
    i, j = np.nonzero(quad)
    a = i * MESH + j
    faces = np.stack([a, a + 1, a + MESH + 1, a + MESH], axis=1)

    used = np.unique(faces)
    remap = np.full(MESH * MESH, -1, np.int64)
    remap[used] = np.arange(len(used))
    faces = remap[faces]
    verts = np.stack([gx.ravel()[used], gy.ravel()[used], sampled.ravel()[used]], axis=1)

    mesh = bpy.data.meshes.new("Pizza")
    mesh.vertices.add(len(verts))
    mesh.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    mesh.loops.add(faces.size)
    mesh.loops.foreach_set("vertex_index", faces.astype(np.int32).ravel())
    mesh.polygons.add(len(faces))
    mesh.polygons.foreach_set("loop_start", (np.arange(len(faces)) * 4).astype(np.int32))
    mesh.update(calc_edges=True)
    mesh.validate()
    mesh.shade_smooth()

    pizza = bpy.data.objects.new("Pizza", mesh)
    pizza.location.z = 0.0022  # a dark line of shadow under the foot of the crust
    scene.collection.objects.link(pizza)
    return pizza


def pizza_material():
    material = bpy.data.materials.new("Pizza")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]

    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / SIZE, 1 / SIZE, 1)
    mapping.inputs["Location"].default_value = (0.5, 0.5, 0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])

    def texture(name, data):
        node = nodes.new("ShaderNodeTexImage")
        node.image = float_image(name, data)
        node.extension = "EXTEND"
        node.interpolation = "Cubic"
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    links.new(texture("Albedo", albedo).outputs["Color"], shader.inputs["Base Color"])
    links.new(texture("Rough", rough).outputs["Color"], shader.inputs["Roughness"])
    links.new(texture("Scatter", scatter).outputs["Color"], shader.inputs["Subsurface Weight"])
    if BAKE:
        shader.inputs["Specular IOR Level"].default_value = 0
    else:
        links.new(texture("Gloss", gloss).outputs["Color"], shader.inputs["Coat Weight"])

    shader.inputs["Subsurface Radius"].default_value = (1.0, 0.42, 0.16)
    shader.inputs["Subsurface Scale"].default_value = 0.0045
    shader.inputs["Coat Roughness"].default_value = 0.14
    shader.inputs["IOR"].default_value = 1.46

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = 1.0
    bump.inputs["Strength"].default_value = 1.0
    links.new(texture("Height", height).outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def table():
    """Dark wood, so the pizza is the only bright thing in the picture."""
    bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0, -0.0005))
    plane = bpy.context.object
    material = bpy.data.materials.new("Table")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.1, 1.1, 1)
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(90))
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])

    def wood(name, colour_space):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(os.path.join(ROOT, f"assets-source/pizza/polyhaven/dark_wood_{name}_2k.jpg"))
        node.image.colorspace_settings.name = colour_space
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    darker = nodes.new("ShaderNodeHueSaturation")
    darker.inputs["Saturation"].default_value = 0.42
    darker.inputs["Value"].default_value = 0.2
    links.new(wood("diff", "sRGB").outputs["Color"], darker.inputs["Color"])
    links.new(darker.outputs["Color"], shader.inputs["Base Color"])
    links.new(wood("rough", "Non-Color").outputs["Color"], shader.inputs["Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(wood("nor", "Non-Color").outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    plane.data.materials.append(material)
    return plane


pizza = build_pizza()
pizza.data.materials.append(pizza_material())
board = table()

world = bpy.data.worlds.new("World")
world.use_nodes = True
nodes, links = world.node_tree.nodes, world.node_tree.links
room = nodes.new("ShaderNodeTexEnvironment")
room.image = bpy.data.images.load(os.path.join(ROOT, "assets-source/pizza/polyhaven/comfy_cafe_2k.hdr"))
spin = nodes.new("ShaderNodeMapping")
spin.inputs["Rotation"].default_value = (0, 0, math.radians(ROOM_TURN))
coords = nodes.new("ShaderNodeTexCoord")
links.new(coords.outputs["Generated"], spin.inputs["Vector"])
links.new(spin.outputs["Vector"], room.inputs["Vector"])
links.new(room.outputs["Color"], nodes["Background"].inputs["Color"])
nodes["Background"].inputs["Strength"].default_value = 0.55
scene.world = world

# The window: big, soft and behind the food, so every bubble gets a rim of light and the
# oil picks up a long highlight. A low white card in front keeps the shadows open.
add_area(scene, "Window", (-1.0, 0.42, 0.82), (0, 0, 0), 0.75, 42, (1.0, 0.94, 0.86))
add_area(scene, "Card", (0.5, -0.7, 0.28), (0, 0, 0.02), 1.2, 1.6, (1.0, 0.93, 0.84))

if BAKE:
    out_dir = os.path.dirname(OUT)
    os.makedirs(out_dir, exist_ok=True)
    camera = add_camera(scene, (0, 0, 1.0), (0, 0, 0), name="Above")
    camera.rotation_euler = (0, 0, 0)
    camera.data.type = "ORTHO"
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"

    # The stage alone, then, for the baked pizza, the table with the shadow it leaves.
    board.visible_camera = False
    camera.data.ortho_scale = SIZE
    if STAMPS:
        board.hide_render = True
        bpy.data.objects["Window"].hide_render = True
        bpy.data.objects["Card"].hide_render = True
        add_area(scene, "Overhead", (0, 0, 1.2), (0, 0, 0), 2.2, 30, (1.0, 0.96, 0.9))
    render_linear(scene, STAGE, out_dir, WIDTH, WIDTH, SAMPLES)
    if STAGE == "baked":
        board.visible_camera = True
        pizza.visible_camera = False
        camera.data.ortho_scale = 2.0
        render_linear(scene, "table", out_dir, 2048, 2048, 96)
    print("Baked", out_dir)
    sys.exit(0)

if CLOSE:
    camera = add_camera(scene, (0.06, -0.36, 0.17), (0.02, -0.075, 0.012), lens=100, name="Close")
else:
    camera = add_camera(scene, (0.03, -0.6, 0.38), (0.0, -0.012, 0.012), lens=85, name="Hero")
camera.data.sensor_width = 36
camera.data.dof.use_dof = True
camera.data.dof.focus_distance = math.dist(camera.location, (0.02, -0.095, 0.012) if CLOSE else (0.0, -0.075, 0.012))
camera.data.dof.aperture_fstop = 4.0 if CLOSE else 7.1

use_gpu(scene, SAMPLES)
scene.cycles.max_bounces = 8
scene.cycles.sample_clamp_indirect = 8
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Punchy"
scene.view_settings.exposure = 0.75
scene.render.resolution_x = WIDTH
scene.render.resolution_y = HEIGHT
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT

if SHOW:
    scene.cycles.preview_samples = 96
    scene.cycles.use_preview_denoising = True
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print("Saved", OUT)
    sys.exit(0)

bpy.ops.render.render(write_still=True)
print("Rendered", OUT)

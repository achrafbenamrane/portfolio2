"""
The inside of a wood-fired oven, as seen by a pizza: a brick dome, a stone floor, and a
fire burning at the back. The page draws the flames live; everything they light is baked
here, and flickers with them.

    B --background --factory-startup --python scripts/blender/build_oven.py -- \
        <repo root> [preview <out.png> | bake]
"""

import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import add_camera, script_args, select_only, to_array, unwrap, use_gpu  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "preview"
OUT = os.path.abspath(args[2]) if len(args) > 2 else ""
ASSETS = os.path.join(ROOT, "assets-source/pizza")
BAKE_DIR = os.path.join(ASSETS, "bake")
PUBLIC = os.path.join(ROOT, "public/pizza")

DOME_RADIUS = 0.84
DOME_HEIGHT = 0.46
DOME_CENTRE = (0.0, 0.2, 0.0)
FIRE = Vector((-0.42, 0.62, 0.0))

random.seed(11)
scene = bpy.context.scene
for thing in list(bpy.data.objects):
    bpy.data.objects.remove(thing)


def image_node(nodes, links, name, vector, colour_space="sRGB"):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(os.path.join(ASSETS, "polyhaven", name))
    node.image.colorspace_settings.name = colour_space
    node.projection = "BOX"
    node.projection_blend = 0.3
    links.new(vector, node.inputs["Vector"])
    return node


def surface(name, picture, tiles):
    """A photographed surface wrapped over anything, and a node tree ready to add to."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (tiles, tiles, tiles)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    photo = image_node(nodes, links, picture, mapping.outputs["Vector"])
    shader = nodes["Principled BSDF"]
    shader.inputs["Specular IOR Level"].default_value = 0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = 0.012
    bump.inputs["Strength"].default_value = 0.9
    links.new(photo.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material, nodes, links, coords, photo, shader


def mix_colour(nodes, links, a, b, factor, blend="MIX"):
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = blend
    links.new(factor, mix.inputs["Factor"])
    if isinstance(a, tuple):
        mix.inputs["A"].default_value = a
    else:
        links.new(a, mix.inputs["A"])
    if isinstance(b, tuple):
        mix.inputs["B"].default_value = b
    else:
        links.new(b, mix.inputs["B"])
    return mix.outputs["Result"]


def dome():
    """Firebrick. Soot sits low and at the sides; right over the fire it burns clean."""
    mesh = bpy.data.meshes.new("Dome")
    build = bmesh.new()
    bmesh.ops.create_uvsphere(build, u_segments=128, v_segments=64, radius=1)
    bmesh.ops.delete(build, geom=[v for v in build.verts if v.co.z < -0.001], context="VERTS")
    for vert in build.verts:
        vert.co.x *= DOME_RADIUS
        vert.co.y *= DOME_RADIUS
        vert.co.z *= DOME_HEIGHT
    bmesh.ops.reverse_faces(build, faces=build.faces)
    build.to_mesh(mesh)
    build.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new("Dome", mesh)
    obj.location = DOME_CENTRE
    scene.collection.objects.link(obj)

    material, nodes, links, coords, photo, shader = surface("Dome", "large_red_bricks_diff_2k.jpg", 3.1)
    grime = nodes.new("ShaderNodeTexNoise")
    grime.inputs["Scale"].default_value = 7
    grime.inputs["Detail"].default_value = 11
    grime.inputs["Roughness"].default_value = 0.62
    links.new(coords.outputs["Object"], grime.inputs["Vector"])

    # Distance from the fire's column, measured in the object's own space.
    from_fire = nodes.new("ShaderNodeVectorMath")
    from_fire.operation = "DISTANCE"
    from_fire.inputs[1].default_value = (FIRE.x - DOME_CENTRE[0], FIRE.y - DOME_CENTRE[1], 0.3)
    links.new(coords.outputs["Object"], from_fire.inputs[0])
    clean = nodes.new("ShaderNodeMapRange")
    clean.inputs["From Min"].default_value = 0.16
    clean.inputs["From Max"].default_value = 0.5
    clean.inputs["To Min"].default_value = 0.1
    clean.inputs["To Max"].default_value = 1.0
    links.new(from_fire.outputs["Value"], clean.inputs["Value"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.74
    ramp.color_ramp.elements[1].color = (0.42, 0.42, 0.42, 1)
    links.new(grime.outputs["Fac"], ramp.inputs["Fac"])

    soot_amount = nodes.new("ShaderNodeMath")
    soot_amount.operation = "MULTIPLY"
    links.new(clean.outputs["Result"], soot_amount.inputs[0])
    links.new(ramp.outputs["Color"], soot_amount.inputs[1])

    pale = nodes.new("ShaderNodeHueSaturation")
    pale.inputs["Saturation"].default_value = 0.62
    pale.inputs["Value"].default_value = 0.46
    links.new(photo.outputs["Color"], pale.inputs["Color"])
    colour = mix_colour(nodes, links, pale.outputs["Color"], (0.009, 0.007, 0.006, 1), soot_amount.outputs[0])
    links.new(colour, shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.8
    obj.data.materials.append(material)
    return obj


def floor():
    """Stone tiles, swept but never clean: ash in the seams, and a grey drift by the fire."""
    bpy.ops.mesh.primitive_circle_add(vertices=192, radius=DOME_RADIUS + 0.06, fill_type="NGON", location=DOME_CENTRE)
    obj = bpy.context.object
    obj.name = "Floor"
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.poke()
    bpy.ops.object.mode_set(mode="OBJECT")

    material, nodes, links, coords, photo, shader = surface("Floor", "brick_floor_003_diff_2k.jpg", 2.3)
    warm = nodes.new("ShaderNodeHueSaturation")
    warm.inputs["Saturation"].default_value = 0.3
    warm.inputs["Value"].default_value = 0.34
    links.new(photo.outputs["Color"], warm.inputs["Color"])

    drift = nodes.new("ShaderNodeTexNoise")
    drift.inputs["Scale"].default_value = 5
    drift.inputs["Detail"].default_value = 12
    drift.inputs["Roughness"].default_value = 0.66
    links.new(coords.outputs["Object"], drift.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (0.75, 0.75, 0.75, 1)
    links.new(drift.outputs["Fac"], ramp.inputs["Fac"])
    colour = mix_colour(nodes, links, warm.outputs["Color"], (0.13, 0.12, 0.11, 1), ramp.outputs["Color"])
    links.new(colour, shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.72
    obj.data.materials.append(material)
    return obj


def burning(name, crack_scale, glow):
    """Charred black with fire showing through the cracks."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (0.012, 0.01, 0.009, 1)
    shader.inputs["Roughness"].default_value = 0.85
    shader.inputs["Specular IOR Level"].default_value = 0

    coords = nodes.new("ShaderNodeTexCoord")
    field = nodes.new("ShaderNodeTexNoise")
    field.inputs["Scale"].default_value = crack_scale
    field.inputs["Detail"].default_value = 9
    field.inputs["Roughness"].default_value = 0.58
    links.new(coords.outputs["Object"], field.inputs["Vector"])
    centred = nodes.new("ShaderNodeMath")
    centred.operation = "SUBTRACT"
    centred.inputs[1].default_value = 0.5
    links.new(field.outputs["Fac"], centred.inputs[0])
    cracks = nodes.new("ShaderNodeMath")
    cracks.operation = "ABSOLUTE"
    links.new(centred.outputs[0], cracks.inputs[0])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (1, 0.2, 0.02, 1)
    ramp.color_ramp.elements[1].position = 0.014
    ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
    links.new(cracks.outputs[0], ramp.inputs["Fac"])

    level = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], level.inputs[0])
    low = nodes.new("ShaderNodeMapRange")
    low.inputs["From Min"].default_value = 0.03
    low.inputs["From Max"].default_value = 0.17
    low.inputs["To Min"].default_value = 1.0
    low.inputs["To Max"].default_value = 0.06
    links.new(level.outputs["Z"], low.inputs["Value"])
    patches = nodes.new("ShaderNodeTexNoise")
    patches.inputs["Scale"].default_value = 16
    patches.inputs["Detail"].default_value = 5
    links.new(coords.outputs["Object"], patches.inputs["Vector"])
    patchy = nodes.new("ShaderNodeMapRange")
    patchy.inputs["From Min"].default_value = 0.42
    patchy.inputs["From Max"].default_value = 0.6
    links.new(patches.outputs["Fac"], patchy.inputs["Value"])
    amount = nodes.new("ShaderNodeMath")
    amount.operation = "MULTIPLY"
    links.new(low.outputs["Result"], amount.inputs[0])
    links.new(patchy.outputs["Result"], amount.inputs[1])
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = glow
    links.new(amount.outputs[0], strength.inputs[0])

    links.new(ramp.outputs["Color"], shader.inputs["Emission Color"])
    links.new(strength.outputs[0], shader.inputs["Emission Strength"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = 0.008
    links.new(field.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def bed():
    """Logs across a heap of coals, as one mesh."""
    mesh = bpy.data.meshes.new("Bed")
    build = bmesh.new()

    for _ in range(190):
        distance = 0.27 * math.sqrt(random.random())
        angle = random.uniform(0, 6.283)
        centre = FIRE + Vector((math.cos(angle) * distance * 1.1, math.sin(angle) * distance * 0.8, 0))
        size = random.uniform(0.012, 0.03)
        made = bmesh.ops.create_icosphere(build, subdivisions=2, radius=size)
        for vert in made["verts"]:
            bump = 1 + 0.4 * noise.noise(vert.co * 90 + centre * 7)
            vert.co = vert.co * bump + centre + Vector((0, 0, size * 0.5 + (0.27 - distance) * 0.09))

    logs = [
        ((-0.12, 0.0, 0.05), 0.15, 0.043),
        ((0.13, 0.06, 0.05), -0.32, 0.05),
        ((-0.02, 0.1, 0.13), 0.62, 0.04),
        ((0.03, -0.09, 0.11), -0.9, 0.036),
    ]
    for offset, turn, radius in logs:
        before = set(build.verts)
        place = (
            Matrix.Translation(FIRE + Vector(offset))
            @ Matrix.Rotation(turn, 4, "Z")
            @ Matrix.Rotation(math.pi / 2, 4, "Y")
        )
        made = bmesh.ops.create_cone(
            build, cap_ends=True, segments=48, radius1=radius, radius2=radius * 0.9, depth=0.42, matrix=place
        )
        long_edges = {edge for vert in made["verts"] for edge in vert.link_edges if edge.calc_length() > 0.2}
        bmesh.ops.subdivide_edges(build, edges=list(long_edges), cuts=16)
        middle = FIRE + Vector(offset)
        for vert in [vert for vert in build.verts if vert not in before]:
            vert.co += (vert.co - middle).normalized() * radius * 0.2 * noise.noise(vert.co * 34)

    build.to_mesh(mesh)
    build.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new("Bed", mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(burning("Bed", 30, 9))
    return obj


def point(name, location, power, colour):
    data = bpy.data.lights.new(name, "POINT")
    data.energy = power
    data.color = colour
    data.shadow_soft_size = 0.09
    light = bpy.data.objects.new(name, data)
    light.location = location
    scene.collection.objects.link(light)


dome_object = dome()
floor_object = floor()
bed_object = bed()

# The fire's light. The flames themselves are drawn by the page.
FLAME = (1.0, 0.42, 0.11)
point("Flame low", FIRE + Vector((0.02, -0.05, 0.13)), 17, FLAME)
point("Flame mid", FIRE + Vector((0.06, -0.02, 0.24)), 12, FLAME)
point("Flame tip", FIRE + Vector((0.14, -0.06, 0.32)), 7, (1.0, 0.54, 0.2))

world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
scene.world = world

# A little daylight comes in through the mouth, behind the camera.
data = bpy.data.lights.new("Mouth", "AREA")
data.size = 0.5
data.energy = 2.6
data.color = (1.0, 0.86, 0.72)
mouth = bpy.data.objects.new("Mouth", data)
mouth.location = (0.05, -0.54, 0.2)
mouth.rotation_euler = (math.radians(100), 0, 0)
scene.collection.objects.link(mouth)


if MODE == "preview":
    camera = add_camera(scene, (0.05, -0.47, 0.25), (-0.03, 0.14, 0.05), lens=20, name="Inside")
    use_gpu(scene, 96)
    scene.cycles.max_bounces = 6
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    scene.view_settings.exposure = 0.75
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("Rendered", OUT)
    sys.exit(0)


def bake(obj, size, samples):
    """Light, reflected and glowing, without any shine: the page adds that if it wants it."""
    scene.cycles.samples = samples
    unwrap(obj)
    # The exporter would otherwise send whichever map the mesh was born with.
    for layer in list(obj.data.uv_layers):
        if layer.name != "Bake":
            obj.data.uv_layers.remove(layer)
    image = bpy.data.images.new(f"Bake_{obj.name}", size, size, alpha=False, float_buffer=True)
    tree = obj.material_slots[0].material.node_tree
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    tree.nodes.active = node
    select_only(obj)
    print(f"baking {obj.name} at {size}", flush=True)
    bpy.ops.object.bake(
        type="COMBINED",
        pass_filter={"EMIT", "DIRECT", "INDIRECT", "DIFFUSE"},
        margin=12,
        margin_type="EXTEND",
        use_clear=True,
        uv_layer="Bake",
    )
    np.save(os.path.join(BAKE_DIR, f"oven-{obj.name.lower()}.npy"), to_array(image).astype(np.float16))
    tree.nodes.remove(node)
    bpy.data.images.remove(image)


use_gpu(scene, 192, denoise=False)
scene.cycles.max_bounces = 6
scene.render.bake.use_selected_to_active = False
bake(dome_object, 2048, 192)
bake(floor_object, 2048, 192)
bake(bed_object, 1024, 128)

for obj in (dome_object, floor_object, bed_object):
    mesh = obj.data
    mesh.uv_layers.active = mesh.uv_layers["Bake"]
select_only(dome_object, floor_object, bed_object)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(PUBLIC, "oven.glb"),
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
print("Baked oven")

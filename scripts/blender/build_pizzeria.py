"""
Wolfexo Fast Food: the whole restaurant, seen first from a corner, like the sports store.

A sunlit trattoria. Terracotta underfoot, clay plaster and dark green panelling on the
walls, a brick oven at the back under a copper flue, checked cloths on the tables. All of
it is baked: nothing here moves but the people and the fire, and those the page draws.

    B --background --factory-startup --python scripts/blender/build_pizzeria.py -- \
        <repo root> [preview <out.png> [camera] | bake [samples]
                     | film <shot> <out folder> <frames> [samples] | film <shot> track | film meet card [samples]
                     | film serve cover [samples]]

`film` brings the chef in from chef.blend and renders him here, in the room's real light.
`track` writes what the page needs to lay the visitor's pizza over the film: the camera, and
where the peel's blade is on every frame. `card` cuts him out, as the corner camera sees him.
`cover` is the still for the /3d page.
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector, geometry, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Group, add_camera, look_at, script_args, select_only, to_array, unwrap, use_gpu  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "preview"
OUT = os.path.abspath(args[2]) if MODE == "preview" and len(args) > 2 else ""
ASSETS = os.path.join(ROOT, "assets-source/pizza")
BAKE_DIR = os.path.join(ASSETS, "bake")
PUBLIC = os.path.join(ROOT, "public/pizza")
LAYOUT = os.path.join(ROOT, "src/content/pizzeria-layout.json")

W = 5.0  # half width
D = 4.0  # half depth
H = 3.5
PANEL = 1.05

OVEN_X = -1.3
OVEN_FRONT = 2.62
MOUTH_Z = 1.06
MOUTH_W = 0.42
MOUTH_H = 0.46

HERO_TABLE = (1.45, -1.05)
TABLES = [(-2.75, -1.75), (-2.75, 0.75), (1.75, 1.2), (-0.55, -2.75)]
TABLE_TOP = 0.76
TABLE_R = 0.52

random.seed(21)
scene = bpy.context.scene
for thing in list(bpy.data.objects):
    bpy.data.objects.remove(thing)


# Materials ----------------------------------------------------------------------------


def flat(name, colour, roughness=0.6, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*colour, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def glowing(name, colour, strength):
    material = flat(name, colour)
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Emission Color"].default_value = (*colour, 1)
    shader.inputs["Emission Strength"].default_value = strength
    return material


def photo(name, picture, tiles, saturation=1.0, value=1.0, roughness=0.7, bump=0.0, blend=0.25):
    """A photographed surface, wrapped round anything without needing UVs."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (tiles, tiles, tiles)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(os.path.join(ASSETS, "polyhaven", picture))
    image.projection = "BOX"
    image.projection_blend = blend
    links.new(mapping.outputs["Vector"], image.inputs["Vector"])
    tone = nodes.new("ShaderNodeHueSaturation")
    tone.inputs["Saturation"].default_value = saturation
    tone.inputs["Value"].default_value = value
    links.new(image.outputs["Color"], tone.inputs["Color"])
    links.new(tone.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = roughness
    if bump:
        height = nodes.new("ShaderNodeBump")
        height.inputs["Distance"].default_value = bump
        links.new(image.outputs["Color"], height.inputs["Height"])
        links.new(height.outputs["Normal"], shader.inputs["Normal"])
    return material


def checked(name, scale):
    """Tablecloth: red and white, in big checks."""
    material = flat(name, (1, 1, 1), 0.8)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    board = nodes.new("ShaderNodeTexChecker")
    board.inputs["Scale"].default_value = scale
    board.inputs["Color1"].default_value = (0.55, 0.026, 0.03, 1)
    board.inputs["Color2"].default_value = (0.86, 0.83, 0.78, 1)
    links.new(coords.outputs["Object"], board.inputs["Vector"])
    links.new(board.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return material


M = {
    "Floor": photo("Floor", "terracotta_floor_tiles_diff_2k.jpg", 0.42, 1.0, 0.9, 0.45, 0.01, 0.0),
    "Plaster": photo("Plaster", "clay_plaster_diff_2k.jpg", 0.5, 0.72, 1.3, 0.85, 0.02),
    "Panel": flat("Panel", (0.022, 0.078, 0.052), 0.42),
    "Cream": flat("Cream", (0.82, 0.74, 0.6), 0.7),
    "Brick": photo("Brick", "large_red_bricks_diff_2k.jpg", 0.9, 0.9, 0.82, 0.8, 0.02),
    "DomeBrick": photo("DomeBrick", "large_red_bricks_diff_2k.jpg", 1.7, 0.86, 0.74, 0.8, 0.012),
    "Stone": photo("Stone", "clay_plaster_diff_2k.jpg", 1.6, 0.34, 1.9, 0.72, 0.03),
    "Beam": photo("Beam", "wood_table_worn_diff_2k.jpg", 0.5, 0.8, 0.8, 0.55),
    "Oak": photo("Oak", "oak_veneer_01_diff_2k.jpg", 0.8, 0.9, 0.62, 0.4),
    "Bentwood": flat("Bentwood", (0.1, 0.05, 0.022), 0.34),
    "Marble": photo("Marble", "marble_01_diff_2k.jpg", 0.7, 0.8, 1.1, 0.22),
    "Copper": flat("Copper", (0.72, 0.36, 0.17), 0.26, 1.0),
    "Brass": flat("Brass", (0.8, 0.6, 0.26), 0.3, 1.0),
    "Chrome": flat("Chrome", (0.8, 0.8, 0.8), 0.14, 1.0),
    "Iron": flat("Iron", (0.02, 0.02, 0.022), 0.45, 0.7),
    "Shutter": flat("Shutter", (0.03, 0.14, 0.085), 0.45),
    "Cloth": checked("Cloth", 16),
    "HeroCloth": checked("HeroCloth", 16),
    "Enamel": flat("Enamel", (0.03, 0.1, 0.066), 0.28),
    "Bulb": glowing("Bulb", (1.0, 0.82, 0.56), 26),
    "Wax": flat("Wax", (0.86, 0.8, 0.68), 0.5),
    "Plate": flat("Plate", (0.86, 0.85, 0.8), 0.18),
    "PlateWell": flat("PlateWell", (0.8, 0.79, 0.74), 0.2),
    "Napkin": flat("Napkin", (0.02, 0.2, 0.09), 0.8),
    "Flame": glowing("Flame", (1.0, 0.62, 0.24), 34),
    "Straw": flat("Straw", (0.5, 0.33, 0.12), 0.8),
    "BottleGreen": flat("BottleGreen", (0.012, 0.09, 0.04), 0.14),
    "BottleAmber": flat("BottleAmber", (0.24, 0.09, 0.016), 0.14),
    "BottleClear": flat("BottleClear", (0.5, 0.55, 0.45), 0.1),
    "Label": flat("Label", (0.8, 0.74, 0.6), 0.6),
    "Red": flat("Red", (0.5, 0.012, 0.02), 0.45),
    "White": flat("White", (0.84, 0.82, 0.77), 0.55),
    "Green": flat("Green", (0.012, 0.22, 0.09), 0.5),
    "Tomato": flat("Tomato", (0.56, 0.03, 0.016), 0.26),
    "Leaf": flat("Leaf", (0.03, 0.15, 0.03), 0.5),
    "Terracotta": flat("Terracotta", (0.46, 0.17, 0.08), 0.7),
    "Sack": flat("Sack", (0.62, 0.52, 0.36), 0.9),
    "Log": photo("Log", "wood_table_worn_diff_2k.jpg", 2.6, 0.7, 0.34, 0.8),
    "LogEnd": photo("LogEnd", "oak_veneer_01_diff_2k.jpg", 7, 0.82, 0.62, 0.8),
    "Dark": flat("Dark", (0.008, 0.007, 0.006), 0.8),
    "Chalk": flat("Chalk", (0.02, 0.024, 0.024), 0.8),
    "ChalkText": flat("ChalkText", (0.84, 0.82, 0.76), 0.8),
    "Gold": flat("Gold", (0.86, 0.62, 0.24), 0.28, 1.0),
    "OvenMouth": flat("OvenMouth", (0.01, 0.006, 0.004), 0.9),
    "Canvas1": flat("Canvas1", (0.5, 0.2, 0.08), 0.7),
    "Canvas2": flat("Canvas2", (0.1, 0.2, 0.26), 0.7),
    "Canvas3": flat("Canvas3", (0.56, 0.42, 0.14), 0.7),
    "PosterRed": flat("PosterRed", (0.42, 0.03, 0.03), 0.7),
}


def heat_the_mouth():
    material = M["OvenMouth"]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    coords = nodes.new("ShaderNodeTexCoord")
    level = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], level.inputs[0])
    hot = nodes.new("ShaderNodeMapRange")
    hot.inputs["From Min"].default_value = MOUTH_Z
    hot.inputs["From Max"].default_value = MOUTH_Z + MOUTH_H
    hot.inputs["To Min"].default_value = 1.5
    hot.inputs["To Max"].default_value = 0.04
    links.new(level.outputs["Z"], hot.inputs["Value"])
    links.new(hot.outputs["Result"], shader.inputs["Emission Strength"])
    shader.inputs["Emission Color"].default_value = (1.0, 0.3, 0.05, 1)


heat_the_mouth()


# The room -----------------------------------------------------------------------------

floor = Group("Floor")
floor.quad([(-W, -D, 0), (W, -D, 0), (W, D, 0), (-W, D, 0)], "Floor")

walls = Group("Walls")
props = Group("Props")
hero = Group("Hero")
oven = Group("Oven")

WINDOWS = [-2.6, 0.0, 2.6]  # along the left wall
WINDOW_HALF = 0.62
WINDOW_LOW = 1.0
WINDOW_HIGH = 2.75
THICK = 0.3


def left_wall():
    """The sunny wall: solid piers between real openings, so the light is real too."""
    x0, x1 = -W - THICK, -W
    edges = [-D, *[edge for y in WINDOWS for edge in (y - WINDOW_HALF, y + WINDOW_HALF)], D]
    for a, b in zip(edges[0::2], edges[1::2]):
        walls.box((x0, a, 0), (x1, b, H), "Plaster")
    for y in WINDOWS:
        walls.box((x0, y - WINDOW_HALF, 0), (x1, y + WINDOW_HALF, WINDOW_LOW), "Plaster")
        walls.box((x0, y - WINDOW_HALF, WINDOW_HIGH), (x1, y + WINDOW_HALF, H), "Plaster")
        # Frame, glazing bars, and the shutters folded back outside.
        props.box((x1 - 0.05, y - WINDOW_HALF - 0.05, WINDOW_LOW - 0.08), (x1 + 0.05, y + WINDOW_HALF + 0.05, WINDOW_LOW), "White")
        props.box((x1 - 0.1, y - WINDOW_HALF, WINDOW_LOW - 0.03), (x1 + 0.09, y + WINDOW_HALF, WINDOW_LOW + 0.015), "White")
        for bar_y in (y - WINDOW_HALF, y, y + WINDOW_HALF - 0.03):
            props.box((x0 + 0.1, bar_y, WINDOW_LOW), (x0 + 0.14, bar_y + 0.03, WINDOW_HIGH), "White")
        for bar_z in (WINDOW_LOW + 0.58, WINDOW_LOW + 1.16):
            props.box((x0 + 0.1, y - WINDOW_HALF, bar_z), (x0 + 0.14, y + WINDOW_HALF, bar_z + 0.03), "White")
        for sign in (-1, 1):
            hinge = y + sign * (WINDOW_HALF + 0.02)
            for slat in range(22):
                z = WINDOW_LOW + slat * 0.08
                props.box((x0 - 0.06, hinge, z), (x0 - 0.03, hinge + sign * 0.6, z + 0.055), "Shutter")


def plain_walls():
    walls.box((W, -D, 0), (W + THICK, D, H), "Plaster")
    walls.box((-W, D, 0), (W, D + THICK, H), "Plaster")
    walls.box((-W, -D - THICK, 0), (W, -D, H), "Plaster")
    walls.box((-W - THICK, -D - THICK, H), (W + THICK, D + THICK, H + 0.2), "Cream")

    # Dark green panelling round the room, with a brass-bright rail on top.
    props.box((W - 0.04, -D, 0), (W, D, PANEL), "Panel")
    props.box((-W, -D, 0), (W, -D + 0.04, PANEL), "Panel")
    props.box((-W, D - 0.04, 0), (OVEN_X - 1.7, D, PANEL), "Panel")
    props.box((OVEN_X + 1.7, D - 0.04, 0), (W, D, PANEL), "Panel")
    props.box((W - 0.06, -D, PANEL), (W, D, PANEL + 0.035), "Oak")
    props.box((-W, -D, PANEL), (W, -D + 0.06, PANEL + 0.035), "Oak")
    for y in np.arange(-D + 0.35, D, 0.8):
        props.box((W - 0.055, y, 0.12), (W - 0.04, y + 0.62, PANEL - 0.12), "Panel")
    for x in np.arange(-W + 0.35, W, 0.8):
        props.box((x, -D + 0.04, 0.12), (x + 0.62, -D + 0.055, PANEL - 0.12), "Panel")

    # Old beams.
    for y in np.arange(-D + 0.45, D, 1.15):
        props.box((-W, y, H - 0.2), (W, y + 0.2, H), "Beam")
    for x in (-3.2, 0.0, 3.2):
        props.box((x, -D, H - 0.3), (x + 0.26, D, H - 0.2), "Beam")


# The oven -----------------------------------------------------------------------------


def dome_mesh():
    """Half an ellipsoid, built into the back wall, with its bricks following the curve."""
    mesh = bpy.data.meshes.new("OvenDome")
    build = bmesh.new()
    bmesh.ops.create_uvsphere(build, u_segments=96, v_segments=48, radius=1)
    bmesh.ops.delete(build, geom=[v for v in build.verts if v.co.z < -0.001], context="VERTS")
    for vert in build.verts:
        vert.co.x *= 1.62
        vert.co.y *= 1.32
        vert.co.z *= 1.28
    build.to_mesh(mesh)
    build.free()
    mesh.shade_smooth()
    mesh.materials.append(M["DomeBrick"])
    dome = bpy.data.objects.new("OvenDomeMesh", mesh)
    dome.location = (OVEN_X, 3.92, 1.02)
    scene.collection.objects.link(dome)
    bpy.context.view_layer.update()
    select_only(dome)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return dome


def arch(group, colour, half, rise, inner, outer, y0, y1, centre_z, pieces=20):
    """Voussoirs: a real arch of cut stones round the mouth."""
    for i in range(pieces):
        a0 = math.pi * i / pieces + 0.012
        a1 = math.pi * (i + 1) / pieces - 0.012
        ring = []
        for radius, angle in ((inner, a0), (outer, a0), (outer, a1), (inner, a1)):
            ring.append((OVEN_X + math.cos(angle) * radius * half, math.sin(angle) * radius * rise + centre_z))
        # One closed block per stone, sharing its corners. Loose quads have no inside, so
        # working out which way they face is a coin toss, and the bake goes black on the losers.
        front = [group.bm.verts.new((x, y0, z)) for x, z in ring]
        back = [group.bm.verts.new((x, y1, z)) for x, z in ring]
        faces = [group.bm.faces.new(front), group.bm.faces.new(back[::-1])]
        for k in range(4):
            a, b = k, (k + 1) % 4
            faces.append(group.bm.faces.new((front[a], back[a], back[b], front[b])))
        group._finish(faces, colour)


def sack(group, x, y, wide, deep, tall, turn):
    """A paper sack of flour, slumped on the floor: a soft block, not a ball."""
    made = bmesh.ops.create_icosphere(group.bm, subdivisions=4, radius=1)
    place = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(turn, 4, "Z")
    for vert in made["verts"]:
        way = vert.co.normalized()
        block = way / (abs(way.x) ** 5 + abs(way.y) ** 5 + abs(way.z) ** 5) ** 0.2
        rise = block.z * 0.5 + 0.5
        spread = 1.14 - 0.3 * rise**2
        slump = noise.noise(block * 1.7 + Vector((x, y, 0))) * 0.05
        vert.co = place @ Vector(
            (
                block.x * wide / 2 * spread + slump,
                block.y * deep / 2 * (1.16 - 0.5 * rise**3) + slump,
                rise * tall + slump * rise,
            )
        )
    faces = list({f for v in made["verts"] for f in v.link_faces})
    group._finish(faces, "Sack", smooth=True)


def build_oven():
    # The plinth, with its log store.
    oven.box((OVEN_X - 1.75, 2.72, 0), (OVEN_X + 1.75, 4.0, 1.02), "Brick")
    oven.box((OVEN_X - 1.82, 2.62, 0.96), (OVEN_X + 1.82, 4.0, 1.04), "Stone")
    oven.box((OVEN_X - 1.2, 2.7, 0.08), (OVEN_X + 1.2, 2.74, 0.82), "Dark")

    # The mouth: a glowing arch in the dome, framed in stone.
    centre_z = MOUTH_Z + 0.08
    plane_y = OVEN_FRONT - 0.038
    verts = [(OVEN_X - MOUTH_W, plane_y, MOUTH_Z), (OVEN_X + MOUTH_W, plane_y, MOUTH_Z)]
    for i in range(1, 24):
        angle = math.pi * i / 24
        verts.append((OVEN_X + math.cos(angle) * MOUTH_W, plane_y, centre_z + math.sin(angle) * (MOUTH_H - 0.08)))
    built = [oven.bm.verts.new(v) for v in verts]
    face = oven.bm.faces.new(built)
    face.material_index = oven.slot("OvenMouth")
    arch(oven, "Stone", MOUTH_W / 0.95, (MOUTH_H - 0.08) / 0.95, 0.96, 1.26, OVEN_FRONT - 0.06, OVEN_FRONT + 0.2, centre_z)
    oven.box((OVEN_X - MOUTH_W - 0.3, OVEN_FRONT - 0.06, MOUTH_Z - 0.04), (OVEN_X - MOUTH_W, OVEN_FRONT + 0.2, centre_z), "Stone")
    oven.box((OVEN_X + MOUTH_W, OVEN_FRONT - 0.06, MOUTH_Z - 0.04), (OVEN_X + MOUTH_W + 0.3, OVEN_FRONT + 0.2, centre_z), "Stone")

    # The copper flue, up through the ceiling.
    flue_x = OVEN_X + 1.62
    oven.cylinder((flue_x, 3.62, 1.04), (flue_x, 3.62, H), 0.15, "Copper", sides=28)
    for z in (1.5, 2.1, 2.7, 3.2):
        oven.cylinder((flue_x, 3.62, z), (flue_x, 3.62, z + 0.03), 0.162, "Brass", sides=28)

    # Firewood, stacked in the store.
    for row in range(5):
        for i in range(18 - row):
            x = OVEN_X - 1.1 + i * 0.128 + row * 0.064
            z = 0.14 + row * 0.115
            depth = random.uniform(-0.02, 0.05)
            radius = random.uniform(0.05, 0.062)
            oven.cylinder((x, 2.62 + depth, z), (x, 2.72, z), radius, "Log", sides=22)
            oven.cylinder((x, 2.617 + depth, z), (x, 2.62 + depth, z), radius * 0.93, "LogEnd", sides=22)

    # Flour and a crate of tomatoes by the oven.
    for x, y, turn in ((OVEN_X + 2.1, 3.5, 0.2), (OVEN_X + 2.62, 3.55, -0.25), (OVEN_X + 2.36, 3.08, 0.08)):
        sack(oven, x, y, 0.46, 0.3, 0.68, turn)


# Furniture ----------------------------------------------------------------------------


def chair(group, x, y, facing):
    """A bentwood café chair."""
    c, s = math.cos(facing), math.sin(facing)

    def at(px, py, pz):
        return (x + px * c - py * s, y + px * s + py * c, pz)

    group.cylinder(at(0, 0, 0.45), at(0, 0, 0.475), 0.2, "Bentwood", sides=20)
    for px, py in ((-0.15, -0.14), (0.15, -0.14), (-0.13, 0.15), (0.13, 0.15)):
        group.cylinder(at(px * 1.15, py * 1.15, 0.0), at(px, py, 0.45), 0.014, "Bentwood", sides=8)
    hoop = []
    for i in range(17):
        angle = math.pi * i / 16
        hoop.append(at(math.cos(angle) * 0.17, 0.17 + math.sin(angle) * 0.018, 0.47 + math.sin(angle) * 0.42))
    group.polyline(hoop, 0.012, "Bentwood", sides=8)
    inner = []
    for i in range(13):
        angle = math.pi * i / 12
        inner.append(at(math.cos(angle) * 0.105, 0.17 + math.sin(angle) * 0.014, 0.47 + math.sin(angle) * 0.29))
    group.polyline(inner, 0.009, "Bentwood", sides=8)


def cloth(group, x, y, colour):
    """A round table under a cloth that falls in folds."""
    rings = 18
    around = 132
    grid = []
    for i in range(rings + 1):
        t = i / rings
        row = []
        for j in range(around):
            angle = 2 * math.pi * j / around
            if t < 0.5:
                r = TABLE_R * t * 2
                z = TABLE_TOP
            else:
                fall = (t - 0.5) * 2
                wave = abs(math.sin(angle * 5.5 + x)) ** 1.6 * 0.07 + math.sin(angle * 13 + y) * 0.012
                r = TABLE_R + 0.012 + (0.022 + wave) * fall**1.1
                z = TABLE_TOP - fall * 0.5 + 0.02 * math.sin(angle * 5.5 + x) * fall
            row.append(group.bm.verts.new((x + math.cos(angle) * r, y + math.sin(angle) * r, z)))
        grid.append(row)
    index = group.slot(colour)
    for i in range(rings):
        for j in range(around):
            k = (j + 1) % around
            face = group.bm.faces.new([grid[i + 1][j], grid[i + 1][k], grid[i][k], grid[i][j]])
            face.material_index = index
            face.smooth = True
    group.cylinder((x, y, 0), (x, y, 0.02), 0.26, "Iron", sides=20)


def fiasco(group, x, y):
    """A Chianti flask in its straw, with a candle burnt down in the neck."""
    z = TABLE_TOP
    group.cylinder((x, y, z), (x, y, z + 0.1), 0.066, "Straw", sides=20)
    group.sphere((x, y, z + 0.1), 0.066, "BottleGreen", subdivisions=3)
    group.cylinder((x, y, z + 0.15), (x, y, z + 0.26), 0.017, "BottleGreen", sides=12)
    group.cylinder((x, y, z + 0.26), (x, y, z + 0.33), 0.012, "Wax", sides=12)
    group.sphere((x, y, z + 0.345), 0.009, "Flame", subdivisions=2)


def pendant(x, y, drop=1.28):
    z = H - drop
    props.cylinder((x, y, H - 0.2), (x, y, z + 0.24), 0.005, "Iron", sides=6)
    cone = bmesh.ops.create_cone(
        props.bm,
        cap_ends=False,
        segments=32,
        radius1=0.2,
        radius2=0.05,
        depth=0.2,
        matrix=Matrix.Translation((x, y, z + 0.12)),
    )
    faces = list({f for v in cone["verts"] for f in v.link_faces})
    props._finish(faces, "Enamel", smooth=True)
    props.sphere((x, y, z + 0.05), 0.05, "Bulb", subdivisions=2)
    light = bpy.data.lights.new("Pendant", "POINT")
    light.energy = 80
    light.color = (1.0, 0.76, 0.5)
    light.shadow_soft_size = 0.08
    lamp = bpy.data.objects.new("Pendant", light)
    lamp.location = (x, y, z + 0.0)
    scene.collection.objects.link(lamp)


def bunting():
    """Italian flags, across the room from beam to beam."""
    colours = ["Green", "White", "Red"]
    for y, sag, end in ((-1.9, 0.14, W - 0.2), (0.4, 0.09, 0.1)):
        start = -W + 0.2
        count = int((end - start) / 0.215)
        for i in range(count):
            t = i / (count - 1)
            x = start + t * (end - start)
            z = H - 0.34 - sag * (1 - (2 * t - 1) ** 2)
            props.quad([(x - 0.075, y, z), (x + 0.075, y, z), (x, y, z - 0.17)], colours[i % 3])
        points = []
        for i in range(24):
            t = i / 23
            points.append((start + t * (end - start), y, H - 0.34 - sag * (1 - (2 * t - 1) ** 2)))
        props.polyline(points, 0.004, "Iron", sides=5)


def bar():
    """A marble-topped bar on the right, with the bottles behind it."""
    x0, x1 = 1.15, 4.65
    props.box((x0, 2.72, 0), (x1, 3.3, 1.02), "Oak")
    for x in np.arange(x0 + 0.1, x1 - 0.2, 0.58):
        props.box((x, 2.705, 0.14), (x + 0.48, 2.72, 0.9), "Panel")
    props.box((x0 - 0.06, 2.66, 1.02), (x1 + 0.06, 3.36, 1.07), "Marble")

    # Shelves up the wall behind.
    for z in (1.5, 1.92, 2.34):
        props.box((x0 + 0.1, 3.7, z), (x1 - 0.1, D, z + 0.04), "Oak")
        x = x0 + 0.2
        while x < x1 - 0.2:
            kind = random.choice(["BottleGreen", "BottleAmber", "BottleClear", "BottleGreen"])
            tall = random.uniform(0.2, 0.28)
            y = random.uniform(3.8, 3.9)
            props.cylinder((x, y, z + 0.04), (x, y, z + 0.04 + tall), 0.036, kind, sides=12)
            props.cylinder((x, y, z + 0.04 + tall), (x, y, z + 0.1 + tall), 0.013, kind, sides=10)
            if random.random() < 0.6:
                props.box((x - 0.03, y - 0.038, z + 0.08), (x + 0.03, y - 0.03, z + 0.15), "Label")
            x += random.uniform(0.1, 0.17)

    # An espresso machine, and a crate of tomatoes.
    props.box((3.5, 2.84, 1.07), (4.2, 3.22, 1.42), "Chrome", bevel=0.02)
    props.box((3.46, 2.8, 1.42), (4.24, 3.26, 1.46), "Brass")
    for x in (3.68, 4.02):
        props.cylinder((x, 2.8, 1.25), (x, 2.8, 1.17), 0.03, "Iron", sides=12)
    props.box((1.5, 2.84, 1.07), (2.02, 3.2, 1.16), "Oak")
    for i in range(38):
        props.sphere(
            (random.uniform(1.56, 1.96), random.uniform(2.9, 3.14), random.uniform(1.16, 1.21)),
            random.uniform(0.032, 0.042),
            "Tomato",
            subdivisions=2,
        )


def pots():
    """Basil on the window sills."""
    for y in WINDOWS:
        for offset in (-0.32, 0.32):
            x, z = -W + 0.02, WINDOW_LOW + 0.015
            props.cylinder((x, y + offset, z), (x, y + offset, z + 0.13), 0.072, "Terracotta", sides=16)
            for _ in range(24):
                props.sphere(
                    (x + random.uniform(-0.08, 0.08), y + offset + random.uniform(-0.08, 0.08), z + random.uniform(0.15, 0.27)),
                    random.uniform(0.026, 0.04),
                    "Leaf",
                    subdivisions=1,
                )


POSTERS = {
    -2.7: ("NAPOLI", "dal 1889"),
    -1.5: ("FORNO", "a legna"),
    -0.3: ("POMODORO", "San Marzano"),
    0.95: ("VESUVIO", "Campania"),
}


def printed(y, z, wide, tall, canvas):
    """Old travel posters: a sun and a mountain, or a tomato, over the name."""
    face = W - 0.0615
    sun = "PosterRed" if canvas == "Canvas3" else "Cream"
    props.cylinder((face, y, z + tall * 0.13), (W - 0.06, y, z + tall * 0.13), wide * 0.3, sun, sides=48)
    if canvas != "Canvas3":
        low = z - tall * 0.12
        peak = z + tall * 0.1
        half = wide / 2
        ground = "Panel" if canvas == "Canvas2" else "PosterRed"
        props.quad(
            [(face - 0.001, y + half, low), (face - 0.001, y - half, low), (face - 0.001, y - 0.07, peak), (face - 0.001, y + 0.05, peak)],
            ground,
        )


def pictures():
    """Framed along the right wall, above the panelling."""
    for y, tall, canvas in ((-2.7, 0.74, "Canvas1"), (-1.5, 0.92, "Canvas2"), (-0.3, 0.74, "Canvas3"), (0.95, 0.92, "Canvas1")):
        wide = 0.58
        z = 2.05
        props.box((W - 0.05, y - wide / 2 - 0.045, z - tall / 2 - 0.045), (W, y + wide / 2 + 0.045, z + tall / 2 + 0.045), "Gold")
        props.box((W - 0.06, y - wide / 2, z - tall / 2), (W - 0.05, y + wide / 2, z + tall / 2), canvas)
        printed(y, z, wide, tall, canvas)


def lettering(text, size, location, rotation, material, extrude=0.012, name="Letters"):
    font = bpy.data.fonts.load("C:/Windows/Fonts/BOD_B.TTF")
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = text
    curve.font = font
    curve.size = size
    curve.extrude = extrude
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    letters = bpy.data.objects.new(name, curve)
    letters.location = location
    letters.rotation_euler = rotation
    scene.collection.objects.link(letters)
    select_only(letters)
    bpy.ops.object.convert(target="MESH")
    letters = bpy.context.object
    letters.data.materials.clear()
    letters.data.materials.append(material)
    return letters


# Build it ------------------------------------------------------------------------------

left_wall()
plain_walls()
build_oven()
bar()
pots()
pictures()
bunting()

for x, y in TABLES:
    cloth(props, x, y, "Cloth")
    fiasco(props, x + 0.04, y - 0.02)
    for turn in (0.5, 2.1, 3.64, 5.2):
        chair(props, x + math.cos(turn) * 0.84, y + math.sin(turn) * 0.84, turn - math.pi / 2)
    pendant(x, y)

hx, hy = HERO_TABLE
cloth(hero, hx, hy, "HeroCloth")
fiasco(hero, hx + 0.3, hy + 0.22)
for turn in (1.1, 2.7, 4.3, 5.9):
    chair(hero, hx + math.cos(turn) * 0.84, hy + math.sin(turn) * 0.84, turn - math.pi / 2)
pendant(hx, hy)
SEAT = (hx - 0.1, hy - 0.2)
hero.cylinder((SEAT[0], SEAT[1], TABLE_TOP + 0.002), (SEAT[0], SEAT[1], TABLE_TOP + 0.014), 0.135, "Plate", sides=48)
hero.cylinder((SEAT[0], SEAT[1], TABLE_TOP + 0.014), (SEAT[0], SEAT[1], TABLE_TOP + 0.017), 0.098, "PlateWell", sides=48)
hero.box((SEAT[0] - 0.205, SEAT[1] - 0.09, TABLE_TOP + 0.003), (SEAT[0] - 0.19, SEAT[1] + 0.1, TABLE_TOP + 0.007), "Chrome")
hero.box((SEAT[0] - 0.215, SEAT[1] + 0.1, TABLE_TOP + 0.003), (SEAT[0] - 0.18, SEAT[1] + 0.16, TABLE_TOP + 0.007), "Chrome")
hero.box((SEAT[0] + 0.185, SEAT[1] - 0.1, TABLE_TOP + 0.003), (SEAT[0] + 0.2, SEAT[1] + 0.16, TABLE_TOP + 0.007), "Chrome")
hero.box((SEAT[0] + 0.215, SEAT[1] - 0.08, TABLE_TOP + 0.003), (SEAT[0] + 0.3, SEAT[1] + 0.12, TABLE_TOP + 0.013), "Napkin", bevel=0.004)

# Chalkboard, between the oven and the bar.
props.box((-W + 0.0, 3.92, 1.4), (-W + 1.2, 3.96, 2.6), "Oak")
props.box((-W + 0.06, 3.9, 1.46), (-W + 1.14, 3.92, 2.54), "Chalk")

floor_object = floor.build(scene.collection, M)
walls_object = walls.build(scene.collection, M)
props_object = props.build(scene.collection, M)
hero_object = hero.build(scene.collection, M)
bmesh.ops.recalc_face_normals(oven.bm, faces=list(oven.bm.faces))
oven_object = oven.build(scene.collection, M)
dome_object = dome_mesh()

poster_words = []
for y, (word, line) in POSTERS.items():
    turned = (math.radians(90), 0, math.radians(-90))
    size = 0.128 if len(word) < 7 else 0.09
    tall = 0.92 if y in (-1.5, 0.95) else 0.74
    poster_words.append(lettering(word, size, (W - 0.066, y, 2.05 - tall * 0.27), turned, M["Cream"], 0.001, "PosterWord"))
    poster_words.append(lettering(line, 0.044, (W - 0.066, y, 2.05 - tall * 0.385), turned, M["Cream"], 0.001, "PosterLine"))

SIGN_Y = 3.965
title = lettering("WOLFEXO", 0.46, (OVEN_X, SIGN_Y - 0.06, 2.74), (math.radians(90), 0, 0), M["Gold"], 0.02, "Sign")
under = lettering("FAST FOOD", 0.15, (OVEN_X, SIGN_Y - 0.06, 2.46), (math.radians(90), 0, 0), M["Gold"], 0.012, "SignSmall")
board_lines = [
    ("MENU", 0.13, 2.36),
    ("Margherita", 0.07, 2.16),
    ("Diavola", 0.07, 2.04),
    ("Funghi", 0.07, 1.92),
    ("Ortolana", 0.07, 1.8),
    ("Della casa", 0.07, 1.68),
]
board = [
    lettering(text, size, (-W + 0.6, 3.895, z), (math.radians(90), 0, 0), M["ChalkText"], 0.001, f"Board{i}")
    for i, (text, size, z) in enumerate(board_lines)
]

# Tricolore stripe under the sign.
stripe = Group("Stripe")
for i, colour in enumerate(("Green", "White", "Red")):
    stripe.box((OVEN_X - 0.96 + i * 0.64, 3.94, 3.0), (OVEN_X - 0.32 + i * 0.64, 3.97, 3.03), colour)
stripe_object = stripe.build(scene.collection, M)

# The light -----------------------------------------------------------------------------

world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.74, 0.92, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.5
scene.world = world

sun_data = bpy.data.lights.new("Sun", "SUN")
sun_data.energy = 8.5
sun_data.color = (1.0, 0.84, 0.62)
sun_data.angle = math.radians(1.6)
sun = bpy.data.objects.new("Sun", sun_data)
sun.rotation_euler = (math.radians(62), math.radians(-34), math.radians(-72))
look_at(sun, (0, 0, 0))
sun.location = (-9, -1.4, 5.4)
look_at(sun, (0.3, 0.3, 0.1))
scene.collection.objects.link(sun)

bounce_data = bpy.data.lights.new("Bounce", "AREA")
bounce_data.shape = "RECTANGLE"
bounce_data.size = 9
bounce_data.size_y = 7
bounce_data.energy = 340
bounce_data.color = (1.0, 0.86, 0.68)
bounce = bpy.data.objects.new("Bounce", bounce_data)
bounce.location = (0, 0, H - 0.34)
scene.collection.objects.link(bounce)

glow_data = bpy.data.lights.new("OvenGlow", "POINT")
glow_data.energy = 46
glow_data.color = (1.0, 0.4, 0.1)
glow_data.shadow_soft_size = 0.25
glow = bpy.data.objects.new("OvenGlow", glow_data)
glow.location = (OVEN_X, OVEN_FRONT - 0.32, MOUTH_Z + 0.2)
scene.collection.objects.link(glow)

bar_data = bpy.data.lights.new("BarLight", "AREA")
bar_data.size = 3.0
bar_data.size_y = 0.2
bar_data.shape = "RECTANGLE"
bar_data.energy = 90
bar_data.color = (1.0, 0.78, 0.52)
bar_light = bpy.data.objects.new("BarLight", bar_data)
bar_light.location = (2.9, 3.55, 2.86)
scene.collection.objects.link(bar_light)

SHOTS = {
    "corner": dict(at=(4.8, -3.8, 3.05), to=(-1.0, 1.0, 0.9), lens=17),
    "table": dict(at=(2.5, -2.5, 1.95), to=(1.33, -1.2, 0.74), lens=36),
    "oven": dict(at=(1.05, 0.5, 1.5), to=(-1.1, 2.7, 1.12), lens=32),
}

FILMS = {
    # He stands to one side of the mouth and works across it, the way they do: the fire and
    # his face are in the same shot.
    "serve": dict(at=(OVEN_X - 1.5, 1.05, 1.5), to=(OVEN_X + 0.42, 2.0, 1.2), lens=24, clip="Serve", spot=(OVEN_X + 1.14, 1.5), turn=math.pi + 0.7),
    # Turned towards his oven, with his head brought back to look at you.
    "meet": dict(at=(OVEN_X + 0.1, -0.1, 1.55), to=(OVEN_X - 0.8, 2.05, 1.4), lens=37, clip="Idle", spot=(OVEN_X - 1.02, 2.05), turn=0.75, key=13),
}

def open_the_oven(period):
    """
    For the film only: the glowing card comes out of the mouth, and behind it is a chamber
    with a fire burning. Returns what moves it along, frame by frame.
    """

    def in_the_mouth(face):
        # An arch's shape, a little wider than the opening: the stones cover its ragged edge.
        middle = face.calc_center_median()
        across = (middle.x - OVEN_X) / 0.5
        up = max(middle.z - (MOUTH_Z + 0.08), 0) / 0.44
        return across**2 + up**2 < 1 and middle.y < OVEN_FRONT + 0.55

    mesh = oven_object.data
    build = bmesh.new()
    build.from_mesh(mesh)
    card = [material.name for material in mesh.materials].index("OvenMouth")
    bmesh.ops.delete(build, geom=[face for face in build.faces if face.material_index == card], context="FACES")
    build.to_mesh(mesh)
    build.free()

    mesh = dome_object.data
    build = bmesh.new()
    build.from_mesh(mesh)
    bmesh.ops.delete(build, geom=[face for face in build.faces if in_the_mouth(face)], context="FACES")
    build.to_mesh(mesh)
    build.free()

    # The chamber: a low dome of sooted firebrick, facing in.
    build = bmesh.new()
    bmesh.ops.create_uvsphere(build, u_segments=72, v_segments=36, radius=1)
    bmesh.ops.delete(build, geom=[vert for vert in build.verts if vert.co.z < -0.001], context="VERTS")
    for vert in build.verts:
        vert.co = Vector((OVEN_X + vert.co.x * 0.98, 3.34 + vert.co.y * 0.66, 1.046 + vert.co.z * 0.62))
    bmesh.ops.delete(build, geom=[face for face in build.faces if in_the_mouth(face)], context="FACES")
    bmesh.ops.reverse_faces(build, faces=list(build.faces))
    mesh = bpy.data.meshes.new("Chamber")
    build.to_mesh(mesh)
    build.free()
    mesh.shade_smooth()
    mesh.materials.append(photo("Soot", "large_red_bricks_diff_2k.jpg", 2.4, 0.5, 0.3, 0.85, 0.01))
    scene.collection.objects.link(bpy.data.objects.new("Chamber", mesh))

    # The floor, the embers, and the wood on them, off to the side as a working oven has it.
    fire_x, fire_y = OVEN_X + 0.45, 3.3
    hearth = {"Hearth": photo("Hearth", "brick_floor_003_diff_2k.jpg", 3, 0.5, 0.42, 0.75, 0.008), "Char": embers(), "Burnt": flat("Burnt", (0.012, 0.01, 0.009), 0.9)}
    inside = Group("Inside")
    inside.box((OVEN_X - 1.0, 2.6, 1.04), (OVEN_X + 1.0, 4.0, 1.047), "Hearth")
    for index in range(46):
        turn = random.uniform(0, math.tau)
        reach = random.uniform(0, 1) ** 0.5
        inside.sphere((fire_x + math.cos(turn) * reach * 0.34, fire_y + math.sin(turn) * reach * 0.22, 1.05), random.uniform(0.02, 0.05), "Char", subdivisions=2)
    for a, b, radius in (
        ((-0.26, -0.08, 0.07), (0.24, 0.1, 0.09), 0.05),
        ((-0.2, 0.12, 0.07), (0.28, -0.08, 0.08), 0.046),
        ((-0.08, -0.16, 0.15), (0.06, 0.18, 0.17), 0.042),
    ):
        inside.cylinder((fire_x + a[0], fire_y + a[1], 1.04 + a[2]), (fire_x + b[0], fire_y + b[1], 1.04 + b[2]), radius, "Burnt", sides=14)
    inside.build(scene.collection, hearth)

    # The flames: glowing air, shaped by noise rising through it. Two noises crossfade over
    # the length of the shot, so a clip that loops has no jump in its fire.
    flame = bpy.data.materials.new("Flames")
    flame.use_nodes = True
    nodes, links = flame.node_tree.nodes, flame.node_tree.links
    nodes.remove(nodes["Principled BSDF"])
    coords = nodes.new("ShaderNodeTexCoord")
    parts = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], parts.inputs[0])

    def stream():
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (4.6, 4.6, 2.3)
        links.new(coords.outputs["Object"], mapping.inputs["Vector"])
        cloud = nodes.new("ShaderNodeTexNoise")
        cloud.noise_dimensions = "4D"
        cloud.inputs["Detail"].default_value = 5
        cloud.inputs["Roughness"].default_value = 0.56
        cloud.inputs["Distortion"].default_value = 0.8
        links.new(mapping.outputs["Vector"], cloud.inputs["Vector"])
        return mapping, cloud

    first, second = stream(), stream()
    blend = nodes.new("ShaderNodeMix")
    links.new(first[1].outputs["Fac"], blend.inputs["A"])
    links.new(second[1].outputs["Fac"], blend.inputs["B"])

    def maths(operation, a, b=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = operation
        for socket, value in ((node.inputs[0], a), (node.inputs[1], b)):
            if isinstance(value, (int, float)):
                socket.default_value = value
            elif value is not None:
                links.new(value, socket)
        return node.outputs[0]

    rise = nodes.new("ShaderNodeMapRange")
    rise.inputs["From Min"].default_value = 1.05
    rise.inputs["From Max"].default_value = 1.58
    links.new(parts.outputs["Z"], rise.inputs["Value"])
    width = maths("SQRT", maths("ADD", maths("POWER", maths("MULTIPLY", maths("SUBTRACT", parts.outputs["X"], fire_x), 2.2), 2), maths("POWER", maths("MULTIPLY", maths("SUBTRACT", parts.outputs["Y"], fire_y), 3.1), 2)))
    field = maths("SUBTRACT", maths("SUBTRACT", maths("MULTIPLY", blend.outputs[0], 1.7), maths("MULTIPLY", rise.outputs[0], 0.92)), maths("MULTIPLY", width, 0.62))
    heat = nodes.new("ShaderNodeMapRange")
    heat.interpolation_type = "SMOOTHSTEP"
    heat.inputs["From Min"].default_value = 0.16
    heat.inputs["From Max"].default_value = 0.5
    links.new(field, heat.inputs["Value"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (1.0, 0.1, 0.01, 1)
    ramp.color_ramp.elements[1].color = (1.0, 0.56, 0.12, 1)
    links.new(heat.outputs[0], ramp.inputs["Fac"])
    glow = nodes.new("ShaderNodeEmission")
    links.new(ramp.outputs["Color"], glow.inputs["Color"])
    links.new(maths("MULTIPLY", heat.outputs[0], 7.0), glow.inputs["Strength"])
    output = nodes["Material Output"]
    links.new(glow.outputs[0], output.inputs["Volume"])
    for link in list(output.inputs["Surface"].links):
        links.remove(link)

    air = Group("Air")
    air.box((fire_x - 0.5, fire_y - 0.34, 1.05), (fire_x + 0.46, fire_y + 0.34, 1.58), "Flames")
    air.build(scene.collection, {"Flames": flame})

    data = bpy.data.lights.new("FireLight", "POINT")
    data.color = (1.0, 0.42, 0.13)
    data.shadow_soft_size = 0.16
    light = bpy.data.objects.new("FireLight", data)
    light.location = (fire_x - 0.1, fire_y - 0.1, 1.3)
    scene.collection.objects.link(light)

    def burn(frame):
        t = frame / 24
        fade = (frame % period) / period
        for (mapping, cloud), age in ((first, t), (second, t - period / 24)):
            mapping.inputs["Location"].default_value = (0, 0, -age * 1.5)
            cloud.inputs["W"].default_value = age * 0.7
        blend.inputs["Factor"].default_value = fade
        loop = t * math.tau / (period / 24)
        data.energy = 110 * (1 + 0.14 * math.sin(loop * 3) + 0.09 * math.sin(loop * 7 + 1) + 0.05 * math.sin(loop * 13 + 2))

    return burn


def embers():
    """Charcoal with the heat showing through its cracks."""
    material = flat("Char", (0.02, 0.015, 0.012), 0.9)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    coords = nodes.new("ShaderNodeTexCoord")
    cracks = nodes.new("ShaderNodeTexNoise")
    cracks.inputs["Scale"].default_value = 42
    cracks.inputs["Detail"].default_value = 4
    links.new(coords.outputs["Object"], cracks.inputs["Vector"])
    hot = nodes.new("ShaderNodeMapRange")
    hot.inputs["From Min"].default_value = 0.5
    hot.inputs["From Max"].default_value = 0.64
    hot.inputs["To Max"].default_value = 11
    links.new(cracks.outputs["Fac"], hot.inputs["Value"])
    links.new(hot.outputs[0], shader.inputs["Emission Strength"])
    shader.inputs["Emission Color"].default_value = (1.0, 0.2, 0.03, 1)
    return material


# In the wide view he's out on the open floor in front of the oven, turned to the door: by
# the arch, where he stands to be filmed, he'd be behind a lamp and no bigger than a bottle.
CARD = dict(spot=(OVEN_X + 0.55, 1.55), turn=0.85)
# Pixels of room left round him in the picture, for his shadow to fall in.
CARD_MARGIN = 80

# `half` is half the width of the menu's picture of a pizza, for it to come out 30 cm across.
COVER = dict(frame=42, lens=26, to=(OVEN_X + 0.38, 2.08, 1.16), size=(2240, 1260), half=0.192)

# Along the peel from the end of its handle: the middle of the blade.
BLADE_MIDDLE = 1.54
BLADE_TOP = 0.009
# The frame the peel is as far in as it goes. It comes back without the pizza.
LET_GO = 84
FILM_NOTES = os.path.join(ROOT, "src/content/pizza-film.json")


def noted(key, value):
    notes = {}
    if os.path.exists(FILM_NOTES):
        with open(FILM_NOTES, encoding="utf-8") as file:
            notes = json.load(file)
    notes["fps"] = 24
    notes["size"] = [1280, 720]
    notes[key] = value
    with open(FILM_NOTES, "w", encoding="utf-8") as file:
        json.dump(notes, file, indent=1)
        file.write("\n")


if MODE == "film":
    film = FILMS[args[2]]
    task = args[3]
    if task == "card":
        film = {**film, **CARD}

    with bpy.data.libraries.load(os.path.join(ASSETS, "chef/chef.blend"), link=False) as (source, loaded):
        loaded.objects = list(source.objects)
        loaded.actions = list(source.actions)
    for obj in loaded.objects:
        scene.collection.objects.link(obj)
    rig = bpy.data.objects["ChefRig"]
    rig.location = (film["spot"][0], film["spot"][1], 0)
    rig.rotation_euler = (0, 0, film["turn"])
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions[film["clip"]]
    length = int(bpy.data.actions[film["clip"]].frame_range[1])

    peel_bone = rig.pose.bones["Peel"]
    peel_rest = rig.data.bones["Peel"].matrix_local.inverted()

    def blade():
        """Where a pizza rides on the peel."""
        return rig.matrix_world @ peel_bone.matrix @ peel_rest @ Matrix.Translation((0, BLADE_MIDDLE, BLADE_TOP))

    if task == "track":
        # Blender's Z up to the page's Y up.
        to_page = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
        track = []
        for frame in range(1, length + 1):
            scene.frame_set(min(frame, LET_GO))
            bpy.context.view_layer.update()
            seat = blade()
            turn = (to_page @ seat.to_3x3()).to_quaternion()
            track.append([round(item, 4) for item in (*seat.translation, turn.x, turn.y, turn.z, turn.w)])
        note = dict(at=list(film["at"]), to=list(film["to"]), lens=film["lens"], frames=length if args[2] == "serve" else length - 1)
        if args[2] == "serve":
            note.update(letGo=LET_GO, track=track)
        noted(args[2], note)
        print("Tracked", args[2], flush=True)
        sys.exit(0)

    chef_parts = {obj.name for obj in loaded.objects}
    burn = open_the_oven(length - 1)

    # A soft light from beside the camera, as anyone filming a person in a room would bring.
    key_data = bpy.data.lights.new("Key", "AREA")
    key_data.shape = "DISK"
    key_data.size = 1.3
    key_data.color = (1.0, 0.92, 0.82)
    key_data.energy = film.get("key", 20)
    key = bpy.data.objects.new("Key", key_data)
    middle = Vector(film["at"]).lerp(Vector((film["spot"][0], film["spot"][1], 1.65)), 0.42) + Vector((0, 0, 0.5))
    key.location = middle
    key.rotation_euler = (Vector((film["spot"][0], film["spot"][1], 1.5)) - middle).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(key)

    if task == "card":
        # Everything but the chef is cut out. Saved the way the room's bake is, as light and
        # not as a finished picture, so the page grades both the same way. pizza_film.py gives
        # him his shadow: a shadow catcher here picks up every shadow in the room.
        samples = int(args[4]) if len(args) > 4 else 96
        corner = SHOTS["corner"]
        camera = add_camera(scene, corner["at"], corner["to"], lens=corner["lens"], name="Card")
        use_gpu(scene, samples)
        scene.cycles.max_bounces = 6
        for obj in scene.objects:
            if obj.type == "MESH" and obj.name not in chef_parts:
                obj.is_holdout = True
        scene.render.film_transparent = True
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.view_settings.exposure = -1
        scene.render.resolution_x = 3200
        scene.render.resolution_y = 2000
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"

        # Only the part of the frame he can be in is worth the rendering.
        scene.camera = camera
        bpy.context.view_layer.update()
        reach = [
            world_to_camera_view(scene, camera, Vector((film["spot"][0] + across, film["spot"][1] + along, up)))
            for across in (-1.1, 1.1)
            for along in (-1.1, 1.1)
            for up in (0, 2.4)
        ]
        scene.render.use_border = True
        scene.render.use_crop_to_border = False
        scene.render.border_min_x = max(min(point.x for point in reach), 0)
        scene.render.border_max_x = min(max(point.x for point in reach), 1)
        scene.render.border_min_y = max(min(point.y for point in reach), 0)
        scene.render.border_max_y = min(max(point.y for point in reach), 1)

        path = os.path.join(ASSETS, "renders/chef-card.png")
        scene.frame_set(1)
        burn(1)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

        picture = bpy.data.images.load(path)
        high, wide = picture.size[1], picture.size[0]
        solid = np.array(picture.pixels[:], dtype=np.float32).reshape(high, wide, 4)[::-1, :, 3] > 0.01
        rows = np.flatnonzero(solid.any(axis=1))
        columns = np.flatnonzero(solid.any(axis=0))
        box = [
            max(int(columns[0]) - CARD_MARGIN, 0),
            max(int(rows[0]) - CARD_MARGIN, 0),
            min(int(columns[-1]) + 1 + CARD_MARGIN, wide),
            min(int(rows[-1]) + 1 + CARD_MARGIN, high),
        ]

        # That box, stood up facing the camera, with its bottom edge on the floor: his shadow
        # is drawn below his feet, and the floor mustn't cut it off.
        view = [camera.matrix_world @ corner_point for corner_point in camera.data.view_frame(scene=scene)]
        top_right, _, bottom_left, top_left = view
        eye = camera.matrix_world.translation
        feet = Vector((film["spot"][0], film["spot"][1], 0))
        facing = (eye - feet) * Vector((1, 1, 0))
        middle_u = (box[0] + box[2]) / 2 / wide
        hem = top_left + (top_right - top_left) * middle_u + (bottom_left - top_left) * (box[3] / high)
        feet = geometry.intersect_line_plane(eye, hem, Vector((0, 0, 0)), Vector((0, 0, 1)))
        corners = []
        for u, v in ((box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])):
            aim = top_left + (top_right - top_left) * (u / wide) + (bottom_left - top_left) * (v / high)
            hit = geometry.intersect_line_plane(eye, aim, feet, facing.normalized())
            corners.append([round(item, 4) for item in hit])
        noted("card", dict(box=box, corners=corners, pin=[film["spot"][0], film["spot"][1], 2.34]))
        print("Card", box, flush=True)
        sys.exit(0)

    if task == "cover":
        # The serve, a little closer and much sharper. With no page here to lay the visitor's
        # pizza over it, it carries one of the menu's.
        samples = int(args[4]) if len(args) > 4 else 96
        scene.frame_set(COVER["frame"])
        bpy.context.view_layer.update()
        seat = blade()
        base = Group("CoverBase")
        base.cylinder((0, 0, 0), (0, 0, 0.013), 0.143, "Crust", sides=64)
        base.build(scene.collection, {"Crust": flat("Crust", (0.62, 0.36, 0.14), 0.6)}).matrix_world = seat

        reach = COVER["half"]
        mesh = bpy.data.meshes.new("CoverPizza")
        mesh.from_pydata([(-reach, -reach, 0.014), (reach, -reach, 0.014), (reach, reach, 0.014), (-reach, reach, 0.014)], [], [(0, 1, 2, 3)])
        mesh.uv_layers.new(name="UVMap").uv.foreach_set("vector", [0, 0, 1, 0, 1, 1, 0, 1])
        top = flat("CoverPizza", (1, 1, 1), 0.5)
        nodes, links = top.node_tree.nodes, top.node_tree.links
        picture = nodes.new("ShaderNodeTexImage")
        picture.image = bpy.data.images.load(os.path.join(ROOT, "public/pizza/menu-diavola.webp"))
        links.new(picture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
        links.new(picture.outputs["Alpha"], nodes["Principled BSDF"].inputs["Alpha"])
        mesh.materials.append(top)
        pizza = bpy.data.objects.new("CoverPizza", mesh)
        scene.collection.objects.link(pizza)
        pizza.matrix_world = seat

        add_camera(scene, film["at"], COVER["to"], lens=COVER["lens"], name="Cover")
        use_gpu(scene, samples)
        scene.cycles.max_bounces = 6
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Punchy"
        scene.view_settings.exposure = 0.5
        scene.render.resolution_x, scene.render.resolution_y = COVER["size"]
        scene.render.image_settings.file_format = "PNG"
        scene.render.filepath = os.path.join(ASSETS, "renders/cover.png")
        burn(COVER["frame"])
        bpy.ops.render.render(write_still=True)
        print("Cover done", flush=True)
        sys.exit(0)

    folder = os.path.abspath(task)
    os.makedirs(folder, exist_ok=True)
    if "-" in args[4]:
        first, last = (int(item) for item in args[4].split("-"))
        wanted = list(range(first, last + 1))
    else:
        wanted = [int(item) for item in args[4].split(",")]
    samples = int(args[5]) if len(args) > 5 else 96

    # A stand-in for the visitor's pizza, smaller than any size of it: the page lays the real
    # one over it, and this is what puts its shadow on the peel and the fire's light under it.
    stand_in = None
    if args[2] == "serve":
        dough = Group("StandIn")
        dough.cylinder((0, 0, 0), (0, 0, 0.014), 0.12, "Dough", sides=48)
        stand_in = dough.build(scene.collection, {"Dough": flat("Dough", (0.62, 0.4, 0.2), 0.6)})

    add_camera(scene, film["at"], film["to"], lens=film["lens"], name="Film")
    use_gpu(scene, samples)
    scene.cycles.max_bounces = 6
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    scene.view_settings.exposure = 0.5
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    for frame in wanted:
        path = os.path.join(folder, f"f{frame:04d}.png")
        if os.path.exists(path):
            continue
        if stand_in:
            scene.frame_set(min(frame, LET_GO))
            bpy.context.view_layer.update()
            stand_in.matrix_world = blade()
        scene.frame_set(frame)
        burn(frame)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print("frame", frame, flush=True)
    print("Filmed", folder, flush=True)
    sys.exit(0)

if MODE == "preview":
    shot = SHOTS[args[3] if len(args) > 3 else "corner"]
    add_camera(scene, shot["at"], shot["to"], lens=shot["lens"], name="Preview")
    use_gpu(scene, 64)
    scene.cycles.max_bounces = 6
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    scene.view_settings.exposure = 0.5
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("Rendered room", OUT)
    sys.exit(0)


# The bake ------------------------------------------------------------------------------

SAMPLES = int(args[2]) if len(args) > 2 else 128


def merge(into, *others):
    bpy.context.view_layer.update()
    select_only(into, *others)
    bpy.context.view_layer.objects.active = into
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def plan_unwrap(obj):
    """A floor needs no unwrapping: its texture is its plan."""
    mesh = obj.data
    layer = mesh.uv_layers.new(name="Bake")
    mesh.uv_layers.active = layer
    for polygon in mesh.polygons:
        for vertex, loop in zip(polygon.vertices, polygon.loop_indices):
            co = mesh.vertices[vertex].co
            layer.uv[loop].vector = ((co.x + W) / (2 * W), (co.y + D) / (2 * D))


def bake(obj, size, samples):
    """Everything but shine: sun, lamps, bounce and glow, in one map."""
    scene.cycles.samples = samples
    if "Bake" not in obj.data.uv_layers:
        unwrap(obj)
    for layer in list(obj.data.uv_layers):
        if layer.name != "Bake":
            obj.data.uv_layers.remove(layer)
    image = bpy.data.images.new(f"Bake_{obj.name}", size, size, alpha=False, float_buffer=True)
    added = []
    for slot in obj.material_slots:
        tree = slot.material.node_tree
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        tree.nodes.active = node
        added.append((tree, node))
    select_only(obj)
    print(f"baking {obj.name} at {size}", flush=True)
    bpy.ops.object.bake(
        type="COMBINED",
        pass_filter={"EMIT", "DIRECT", "INDIRECT", "DIFFUSE"},
        margin=10,
        margin_type="EXTEND",
        use_clear=True,
        uv_layer="Bake",
    )
    np.save(os.path.join(BAKE_DIR, f"room-{obj.name.lower()}.npy"), to_array(image).astype(np.float16))
    for tree, node in added:
        tree.nodes.remove(node)
    bpy.data.images.remove(image)


stripe_object.name = "Stripe"
props_object = merge(props_object, title, under, stripe_object, *board, *poster_words)
props_object.name = "Props"
oven_object = merge(oven_object, dome_object)
oven_object.name = "Oven"

use_gpu(scene, SAMPLES, denoise=False)
scene.cycles.max_bounces = 6
scene.render.bake.use_selected_to_active = False

poster = add_camera(scene, SHOTS["corner"]["at"], SHOTS["corner"]["to"], lens=SHOTS["corner"]["lens"], name="Poster")
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Punchy"
scene.view_settings.exposure = 0.5
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = os.path.join(ASSETS, "renders/room-poster.png")
scene.cycles.use_denoising = True
scene.cycles.samples = 256
bpy.ops.render.render(write_still=True)
print("poster done", flush=True)
scene.cycles.use_denoising = False
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0

for material in bpy.data.materials:
    shader = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
    if shader and shader.inputs["Metallic"].default_value > 0.5:
        shader.inputs["Metallic"].default_value = 0

plan_unwrap(floor_object)
bake(floor_object, 2048, SAMPLES)
bake(hero_object, 2048, SAMPLES + 64)
bake(oven_object, 2048, SAMPLES + 64)
bake(walls_object, 4096, SAMPLES)
bake(props_object, 4096, SAMPLES)

objects = [floor_object, walls_object, props_object, hero_object, oven_object]
select_only(*objects)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(PUBLIC, "pizzeria.glb"),
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

with open(LAYOUT, "w", encoding="utf-8") as out:
    json.dump(
        {
            "room": {"halfWidth": W, "halfDepth": D, "height": H},
            "heroTable": {"x": HERO_TABLE[0], "y": HERO_TABLE[1], "top": TABLE_TOP},
            "seat": {"x": SEAT[0], "y": SEAT[1]},
            "ovenMouth": {"x": OVEN_X, "y": OVEN_FRONT, "z": MOUTH_Z, "halfWidth": MOUTH_W, "height": MOUTH_H},
            "windows": {"low": WINDOW_LOW, "high": WINDOW_HIGH, "halfWidth": WINDOW_HALF, "along": WINDOWS},
            "shots": SHOTS,
        },
        out,
        indent=2,
    )
    out.write("\n")
print("Baked room", flush=True)

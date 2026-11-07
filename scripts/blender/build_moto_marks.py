"""
The two monuments of the ride, at their real positions, sizes and footprints.

Maqam Echahid: the start, 92 m, three concrete palm fronds that sweep down and splay far apart at
the ground, with a slim tower rising between them, on a great round esplanade. Djamaa El Djazair:
the finish, the great mosque with its 265 m minaret, built from its real plan on the map: the U of
arcades round the minaret, the courtyard, and the square prayer hall under its dome.

Also the Grande Poste on the way through the centre, and Notre-Dame d'Afrique and Ketchaoua for the
skyline.

    blender --background --python scripts/blender/build_moto_marks.py -- <repo root> [preview <out.png>]

Positions are in the same metres as scripts/moto_route.py: x east, y north, z up.
"""

import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import add_camera, script_args, use_gpu  # noqa: E402
from moto_kit import Part, lathe, loft, triangulate, tube  # noqa: E402
from moto_paint import plain  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "export"
BUILD = os.path.join(ROOT, "assets-source/moto/build")

bpy.ops.wm.read_factory_settings(use_empty=True)
collection = bpy.context.scene.collection
NAMES = ("Stone", "Arcade", "Hall", "Lattice", "Dome", "Leaf", "Tower", "Gold", "Beacon", "Flood", "Flame", "Paving", "Poste", "PosteDome", "Crown", "Square")
M = {name: plain(name, (0.8, 0.78, 0.72), rough=0.6) for name in NAMES}

BASES = json.load(open(os.path.join(BUILD, "mark-bases.json")))
PLAN = json.load(open(os.path.join(BUILD, "mosque.json")))
MAQAM = (-1808.0, -2147.0)
MINARET = (4276.0, -3252.0)
POSTE = (-2809.0, 835.0)


def prism(part, material, outline, low, high, holes=()):
    """A footprint raised from one height to another, with a flat top."""
    outline = np.asarray(outline, float)
    area = 0.5 * np.sum(outline[:, 0] * np.roll(outline[:, 1], -1) - outline[:, 1] * np.roll(outline[:, 0], -1))
    if area < 0:
        outline = outline[::-1]
    verts, faces = triangulate(outline, [np.asarray(h, float)[::-1] for h in holes])
    top = np.column_stack([verts, np.full(len(verts), high)])
    part.add(material, top, [tuple(f) for f in faces.tolist()])
    for loop in [outline, *[np.asarray(h, float) for h in holes]]:
        n = len(loop)
        walls = []
        for ring in (low, high):
            walls.append(np.column_stack([loop, np.full(n, ring)]))
        verts3 = np.vstack(walls)
        wall_faces = [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
        part.add(material, verts3, wall_faces)


def square(centre, half, turn):
    c, s = math.cos(turn), math.sin(turn)
    return [(centre[0] + (x * c - y * s) * half, centre[1] + (x * s + y * c) * half) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def mosque(part):
    base = BASES["hall"]
    # The plan's walls run about sixteen degrees off the compass.
    turn = math.radians(-16)
    outers = [p["pts"] for p in PLAN["mosque"] if p["role"] == "outer"]
    inner = [p["pts"] for p in PLAN["mosque"] if p["role"] == "inner"][0]
    # Sorted west to east: the U of arcades, the courtyard, the prayer hall.
    outers.sort(key=lambda pts: float(np.mean([p[0] for p in pts])))
    prism(part, "Arcade", outers[0], base, base + 11)
    prism(part, "Arcade", outers[1], base, base + 13, holes=[inner])
    prism(part, "Paving", inner, base, base + 0.4)
    hall = outers[2]
    prism(part, "Hall", hall, base, base + 30)
    centre = np.mean(np.array(hall), axis=0)
    # A stepped drum, then the dome on it: 50 m across, its crown 70 m up.
    prism(part, "Hall", square(centre, 42, turn), base + 30, base + 35)
    lathe(part, "Stone", [(0, 42), (27.5, 42), (27.5, 35)], (centre[0], centre[1], base), (0, 0, 1), segments=48)
    dome = [(27, 0)]
    for t in np.linspace(0, 1, 16)[1:]:
        a = t * math.pi / 2
        dome.append((27 * math.cos(a) ** 0.9, 26 * math.sin(a) ** 1.05))
    lathe(part, "Dome", dome, (centre[0], centre[1], base + 42), (0, 0, 1), segments=56)
    lathe(part, "Beacon", [(0.9, 25.8), (0.6, 33), (1.3, 33.5), (0, 36)], (centre[0], centre[1], base + 42), (0, 0, 1), segments=10)

    # The minaret: a square shaft of 27 m, 265 m to the top of its lantern.
    x, y = MINARET
    foot = BASES["minaret"]
    prism(part, "Stone", square((x, y), 21, turn), foot, foot + 9)
    prism(part, "Lattice", square((x, y), 13.6, turn), foot + 9, foot + 232)
    prism(part, "Stone", square((x, y), 14.8, turn), foot + 232, foot + 236)
    prism(part, "Crown", square((x, y), 14.2, turn), foot + 236, foot + 262)
    prism(part, "Stone", square((x, y), 14.8, turn), foot + 262, foot + 265)
    lathe(part, "Gold", [(0, 20), (2.4, 19), (5, 15), (6.6, 9), (6.8, 2), (6.8, 0)], (x, y, foot + 238), (0, 0, 1), segments=20)


def maqam(part):
    x, y = MAQAM
    base = BASES["maqam"]
    height = 92.0

    # Reach from the axis and half-width of a frond, up its height. The first is what makes the
    # shape: far out at the ground, sweeping in, then nearly straight up, flicking out at the tip.
    stations = [
        (0.0, 33.0, 2.6),
        (0.05, 25.0, 4.4),
        (0.11, 18.0, 6.2),
        (0.2, 11.2, 8.2),
        (0.3, 6.9, 9.0),
        (0.4, 4.4, 8.6),
        (0.5, 3.3, 7.6),
        (0.62, 2.9, 6.3),
        (0.75, 3.0, 5.4),
        (0.86, 3.4, 4.8),
        (0.94, 4.0, 4.4),
        (1.0, 4.6, 4.0),
    ]
    table = np.array(stations)

    def cut(t, u):
        return -2.6 * u * max(t - 0.9, 0) / 0.1

    for k in range(3):
        bearing = math.radians(90 + k * 120)
        out = np.array([math.cos(bearing), math.sin(bearing)])
        across = np.array([-out[1], out[0]])
        rings = []
        columns = 13
        for t in np.linspace(0, 1, 44):
            reach = float(np.interp(t, table[:, 0], table[:, 1]))
            half = float(np.interp(t, table[:, 0], table[:, 2]))
            ring = []
            # Round the shell's outer face: a keel down the middle, falling away to two sharp edges.
            for u in np.linspace(-1, 1, columns):
                keel = (1 - abs(u) ** 1.3) * min(half * 0.3, 2.5)
                pos = out * (reach + keel) + across * (u * half)
                ring.append((x + pos[0], y + pos[1], base + t * height + cut(t, u)))
            # And back along the inner face, a thin shell away.
            for u in np.linspace(1, -1, columns)[1:-1]:
                keel = (1 - abs(u) ** 1.3) * min(half * 0.3, 2.5) - 0.9 * (1 - t * 0.6)
                pos = out * (reach + keel) + across * (u * half * 0.97)
                ring.append((x + pos[0], y + pos[1], base + t * height + cut(t, u)))
            rings.append(ring)
        loft(part, "Leaf", rings, cap=False)

    # The tower between the fronds: a slim shaft, with its lantern and spire above the shells.
    tube(part, "Tower", [(x, y, base), (x, y, base + 70)], 2.4, sides=12, smooth=False)
    lathe(part, "Tower", [(2.4, 0), (3.6, 1.2), (3.6, 5.4), (2.2, 6.4), (2.2, 22), (0.8, 24), (0.3, 36), (0, 38)], (x, y, base + 68), (0, 0, 1), segments=12)
    lathe(part, "Beacon", [(3.7, 1.6), (3.7, 4.8)], (x, y, base + 68), (0, 0, 1), segments=12)

    # The esplanade, the eternal flame at the heart of it, and the floods that light the shells.
    lathe(part, "Paving", [(0, -0.2), (226, -0.2), (232, -4.0)], (x, y, base), (0, 0, 1), segments=96)
    lathe(part, "Stone", [(0, 1.1), (7.5, 1.1), (8.4, -0.1)], (x, y, base), (0, 0, 1), segments=32)
    lathe(part, "Flame", [(0.1, 1.1), (1.1, 2.0), (0.8, 3.3), (0, 5.0)], (x, y, base), (0, 0, 1), segments=12)
    for k in range(3):
        bearing = math.radians(90 + k * 120)
        for spread in (-1, 1):
            a = bearing + math.radians(60) + spread * 0.34
            at = (x + math.cos(a) * 30, y + math.sin(a) * 30, base - 0.1)
            lathe(part, "Flood", [(0, 0), (1.0, 0), (1.0, 0.5), (0, 0.5)], at, (0, 0, 1), segments=10)


def grande_poste(part):
    """The neo-Moorish post office of 1910: a white block, a drum and dome at each front corner."""
    x, y = POSTE
    base = BASES["poste"]
    # Its front looks north-east, across the boulevard.
    turn = math.atan2(0.74, 0.56) - math.pi / 2
    c, s_ = math.cos(turn), math.sin(turn)

    def place(u, v):
        return (x + u * c - v * s_, y + u * s_ + v * c)

    lathe(part, "Square", [(0, 0.08), (64, 0.08), (66, -6.0)], (x, y, base), (0, 0, 1), segments=64)
    wide, deep, tall = 33.0, 22.0, 24.0
    outline = [place(u, v) for u, v in ((-wide, -deep), (wide, -deep), (wide, deep), (-wide, deep))]
    prism(part, "Poste", outline, base, base + tall)
    # The crenellated parapet.
    for k in range(-16, 17):
        u = k * 2.0
        prism(part, "Poste", [place(u - 0.7, deep - 0.5), place(u + 0.7, deep - 0.5), place(u + 0.7, deep + 0.05), place(u - 0.7, deep + 0.05)], base + tall, base + tall + 1.4)
    for u in (-wide + 2.5, wide - 2.5):
        cx, cy = place(u, deep - 2.5)
        lathe(part, "Poste", [(0, 0), (7.0, 0), (7.0, 28), (7.6, 28.4), (7.6, 29.4), (6.4, 30), (6.4, 33)], (cx, cy, base), (0, 0, 1), segments=28)
        lathe(part, "PosteDome", [(6.2, 0), (6.0, 2.2), (4.8, 4.4), (2.8, 6.0), (0.7, 6.8), (0.3, 8), (0, 8.4)], (cx, cy, base + 33), (0, 0, 1), segments=24)


def basilica(part):
    x, y = -4227.0, 4012.0
    base = BASES["notredame"]
    turn = math.radians(20)
    c, s = math.cos(turn), math.sin(turn)
    for offset, half, high in ((-9, 8.5, 15), (9, 8.5, 15), (0, 9.5, 22)):
        prism(part, "Stone", square((x + c * offset, y + s * offset), half, turn), base, base + high)
    prism(part, "Stone", square((x, y), 7, turn), base + 22, base + 30)
    lathe(part, "Dome", [(0, 13), (2.4, 12.6), (5, 10.6), (6.6, 7.4), (7, 3.5), (7, 0)], (x, y, base + 30), (0, 0, 1), segments=32)
    lathe(part, "Gold", [(0.4, 13), (0.3, 16), (0.7, 16.4), (0, 17)], (x, y, base + 30), (0, 0, 1), segments=8)


def ketchaoua(part):
    x, y = -2623.0, 2233.0
    base = BASES["ketchaoua"]
    for offset in (-14, 14):
        prism(part, "Stone", square((x + offset, y - 16), 4.2, 0), base, base + 30)
        lathe(part, "Dome", [(0, 4), (2.2, 3.2), (3.8, 1.2), (4, 0)], (x + offset, y - 16, base + 30), (0, 0, 1), segments=16)
    prism(part, "Stone", square((x, y), 19, 0), base, base + 15)


marks = Part("Marks", (0, 0, 0))
mosque(marks)
maqam(marks)
grande_poste(marks)
basilica(marks)
ketchaoua(marks)
marks.build(M, collection, angle=30)

if MODE == "preview":
    out = os.path.abspath(args[2])
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.65, 0.75, 1)
    scene.world = world
    b = BASES["maqam"]
    add_camera(scene, (MAQAM[0] + 30, MAQAM[1] - 150, b + 2), (MAQAM[0], MAQAM[1], b + 46), lens=30)
    use_gpu(scene, 32)
    scene.render.resolution_x, scene.render.resolution_y = 900, 900
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("Rendered", out, flush=True)
else:
    out = os.path.join(ROOT, "public/moto/city/marks.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_materials="EXPORT",
        export_image_format="NONE",
        export_normals=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_position_quantization=16,
    )
    print("Packed marks", os.path.getsize(out) / 1e6, "MB", flush=True)

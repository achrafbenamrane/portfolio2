"""
The walls of Algiers, baked. Every kind of bay in the old centre is modelled here in full: moulded
window surrounds, hoods on consoles, pediments, shell keystones, louvred shutters, rustication,
Moorish arches. Each is then lit the way the city lights its fronts at night, from a strip on the
balcony below, so the plaster glows warm at the foot of each storey and every moulding throws a
shadow up the wall. Cycles renders each one square-on into a cell of an atlas.

The game puts those pictures on simple modules with real depth, so a street of ten thousand bays
costs almost nothing and still has the look of a path-traced render. The alpha channel says what
each texel is: 0 wall, about .5 shutter (the game tints it), 1 glass (the game lights it or not).

    blender --background --python scripts/blender/build_moto_atlas.py -- <repo root> [cell ...]
    python scripts/moto_facade_pack.py

Writes assets-source/moto/build/atlas/; the second step packs it for the game.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import script_args, use_gpu  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
ONLY = set(args[1:])
BUILD = os.path.join(ROOT, "assets-source/moto/build/atlas")
os.makedirs(BUILD, exist_ok=True)

BAY = 3.7
TALL = 3.5
GROUND = 4.4
CELL = 512
# Where the opening in the module sits: every kind of window fits this rectangle.
HALF = 0.7
SILL = 0.28
HEAD = 2.9
RECESS = 0.24

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
collection = scene.collection


def material(name, colour, rough=0.75, bump=0.0, emission=None):
    item = bpy.data.materials.new(name)
    item.use_nodes = True
    tree = item.node_tree
    shader = tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*colour, 1)
    shader.inputs["Roughness"].default_value = rough
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission[:3], 1)
        shader.inputs["Emission Strength"].default_value = emission[3]
    if bump:
        coords = tree.nodes.new("ShaderNodeTexCoord")
        fine = tree.nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = 90
        fine.inputs["Detail"].default_value = 8
        wide = tree.nodes.new("ShaderNodeTexNoise")
        wide.inputs["Scale"].default_value = 3.2
        wide.inputs["Detail"].default_value = 5
        tree.links.new(coords.outputs["Object"], fine.inputs["Vector"])
        tree.links.new(coords.outputs["Object"], wide.inputs["Vector"])
        make = tree.nodes.new("ShaderNodeBump")
        make.inputs["Strength"].default_value = bump
        make.inputs["Distance"].default_value = 0.012
        tree.links.new(fine.outputs["Fac"], make.inputs["Height"])
        tree.links.new(make.outputs["Normal"], shader.inputs["Normal"])
        # Old plaster: never one colour, a little dirtier in patches.
        mix = tree.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"
        mix.inputs["Color1"].default_value = (*colour, 1)
        ramp = tree.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.3
        ramp.color_ramp.elements[0].color = (0.8, 0.77, 0.72, 1)
        ramp.color_ramp.elements[1].position = 0.72
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        tree.links.new(wide.outputs["Fac"], ramp.inputs["Fac"])
        tree.links.new(ramp.outputs["Color"], mix.inputs["Color2"])
        mix.inputs["Fac"].default_value = 1
        tree.links.new(mix.outputs["Color"], shader.inputs["Base Color"])
    return item


PLASTER = material("Plaster", (0.84, 0.81, 0.74), 0.85, bump=0.28)
STONE = material("Stone", (0.9, 0.87, 0.8), 0.7, bump=0.16)
CARVED = material("Carved", (0.9, 0.87, 0.8), 0.7)
FRAME = material("Frame", (0.62, 0.6, 0.56), 0.5)
SHUTTER = material("Shutter", (0.6, 0.6, 0.6), 0.55)
ZINC = material("Zinc", (0.2, 0.21, 0.23), 0.55, bump=0.25)
STEEL = material("Steel", (0.32, 0.32, 0.33), 0.5)
TILE = material("Tile", (0.1, 0.32, 0.36), 0.3)
# What's seen through the glass is the room behind it, with sheer curtains in the light.
GLASS = material("Glass", (0, 0, 0), 0.4, emission=(1.0, 0.72, 0.42, 1.0))
SHOP_GLASS = material("ShopGlass", (0, 0, 0), 0.4, emission=(1.0, 0.86, 0.66, 1.0))
MASKS = {SHUTTER.name: 0.5, GLASS.name: 1.0, SHOP_GLASS.name: 1.0}


def curtain_on(item, scale):
    """Folds in the light behind the glass, as an emission pattern."""
    tree = item.node_tree
    shader = tree.nodes["Principled BSDF"]
    coords = tree.nodes.new("ShaderNodeTexCoord")
    wave = tree.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = scale
    wave.inputs["Distortion"].default_value = 1.2
    wave.inputs["Detail"].default_value = 1.5
    tree.links.new(coords.outputs["Object"], wave.inputs["Vector"])
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.74, 0.5, 0.27, 1)
    ramp.color_ramp.elements[1].color = (1.0, 0.76, 0.48, 1)
    tree.links.new(wave.outputs["Color"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], shader.inputs["Emission Color"])


curtain_on(GLASS, 2.6)


class Cell:
    """Geometry for one cell, gathered material by material."""

    def __init__(self, name, wide=BAY, tall=TALL):
        self.name = name
        self.wide = wide
        self.tall = tall
        self.parts = {}
        self.shadows = []

    def add(self, mat, verts, faces):
        part = self.parts.setdefault(mat.name, (mat, [], []))
        n = len(part[1])
        part[1].extend(verts)
        part[2].extend([tuple(i + n for i in f) for f in faces])

    def quad(self, mat, a, b, c, d):
        self.add(mat, [a, b, c, d], [(0, 1, 2, 3)])

    def box(self, mat, x0, x1, y0, y1, z0, z1):
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        self.add(mat, v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])

    def rings(self, mat, rings, closed=True):
        """Skin between rings of equal length, each a list of (x, y, z)."""
        n = len(rings[0])
        verts = [p for ring in rings for p in ring]
        faces = []
        last = n if closed else n - 1
        for r in range(len(rings) - 1):
            for i in range(last):
                j = (i + 1) % n
                faces.append((r * n + i, r * n + j, (r + 1) * n + j, (r + 1) * n + i))
        self.add(mat, verts, faces)

    def strip(self, mat, x0, x1, z, profile):
        """A moulding run along x: profile is (out, up) pairs."""
        self.rings(mat, [[(x0, y, z + u) for y, u in profile], [(x1, y, z + u) for y, u in profile]], closed=False)

    def wall(self, mat=PLASTER):
        """The wall, with the module's opening cut in it and the glass set back."""
        w, t = self.wide / 2, self.tall
        self.quad(mat, (-w, 0, 0), (-HALF, 0, 0), (-HALF, 0, t), (-w, 0, t))
        self.quad(mat, (HALF, 0, 0), (w, 0, 0), (w, 0, t), (HALF, 0, t))
        self.quad(mat, (-HALF, 0, 0), (HALF, 0, 0), (HALF, 0, SILL), (-HALF, 0, SILL))
        self.quad(mat, (-HALF, 0, HEAD), (HALF, 0, HEAD), (HALF, 0, t), (-HALF, 0, t))
        self.quad(mat, (-HALF, -RECESS, SILL), (HALF, -RECESS, SILL), (HALF, -RECESS, HEAD), (-HALF, -RECESS, HEAD))
        return self


def opening(shape, grow=0.0, count=24):
    """The outline of a window, as (x, z), grown outward by some distance."""
    h = HALF + grow
    low = SILL - grow
    top = HEAD + grow
    pts = [(-h, low), (h, low)]
    if shape == "rect":
        pts += [(h, top), (-h, top)]
        return pts
    if shape == "segment":
        rise = 0.28
        spring = top - rise
        for t in np.linspace(0, 1, count):
            x = h * (1 - 2 * t)
            pts.append((x, spring + rise * (1 - (x / h) ** 2)))
        return pts
    if shape == "round":
        spring = top - h
        for t in np.linspace(0, math.pi, count):
            pts.append((h * math.cos(t), spring + h * math.sin(t)))
        return pts
    if shape == "horseshoe":
        # The Moorish arch: the circle carries on past its widest point, and turns back in.
        radius = h * 1.0
        spring = top - radius * 1.02
        for t in np.linspace(-0.32, math.pi + 0.32, count):
            pts.append((radius * math.cos(t), spring + radius * math.sin(t) * 1.02))
        return pts
    raise ValueError(shape)


def glazed(cell, shape, y=-0.2):
    """Frame, glazing bars and glass in an opening. Fills the corners a curved head leaves."""
    outline = opening(shape, -0.02)
    ring = [(x, y, z) for x, z in outline]
    inner = [(x * 0.94, y - 0.005, SILL + 0.06 + (z - SILL) * 0.965) for x, z in outline]
    cell.rings(FRAME, [ring, inner])
    # The glass, a fan of triangles from the middle, so any arch fills.
    middle = (0.0, y - 0.015, (SILL + HEAD) / 2)
    verts = [middle] + [(x, y - 0.015, z) for x, _, z in inner]
    n = len(inner)
    cell.add(GLASS, verts, [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)])
    # Two tall casements, each with its panes.
    cell.box(FRAME, -0.035, 0.035, y - 0.01, y + 0.03, SILL, HEAD - 0.04)
    for z in (1.05, 1.82, 2.42):
        cell.box(FRAME, -HALF + 0.05, HALF - 0.05, y - 0.008, y + 0.012, z - 0.014, z + 0.014)
    for x in (-0.35, 0.35):
        cell.box(FRAME, x - 0.014, x + 0.014, y - 0.008, y + 0.012, SILL + 0.1, HEAD - 0.1)


def surround(cell, shape, width=0.14, proud=0.05):
    """The moulded frame round a window: fillet, cyma, bead, stepping out from the opening."""
    steps = [(0.0, 0.0), (0.012, proud * 0.5), (0.04, proud * 0.8), (0.06, proud), (width * 0.7, proud), (width * 0.74, proud * 1.3), (width * 0.94, proud * 1.3), (width, 0.0)]
    rings = []
    for grow, out in steps:
        rings.append([(x, out, z) for x, z in opening(shape, grow)])
    cell.rings(STONE, rings)


def shutters(cell, tall=2.6):
    """Louvred shutters folded back on the wall: each leaf a frame, with its slats."""
    for side in (-1, 1):
        for leaf in range(2):
            x0 = side * (HALF + 0.17 + leaf * 0.34)
            x1 = x0 + side * 0.32
            a, b = min(x0, x1), max(x0, x1)
            z0, z1 = SILL + 0.02, SILL + tall
            cell.box(SHUTTER, a, b, 0.0, 0.03, z0, z0 + 0.05)
            cell.box(SHUTTER, a, b, 0.0, 0.03, z1 - 0.05, z1)
            cell.box(SHUTTER, a, a + 0.04, 0.0, 0.03, z0, z1)
            cell.box(SHUTTER, b - 0.04, b, 0.0, 0.03, z0, z1)
            cell.box(SHUTTER, a, b, 0.0, 0.03, (z0 + z1) / 2 - 0.025, (z0 + z1) / 2 + 0.025)
            for z in np.arange(z0 + 0.05, z1 - 0.05, 0.05):
                cell.rings(SHUTTER, [[(a, 0.03, z), (a, 0.006, z + 0.045)], [(b, 0.03, z), (b, 0.006, z + 0.045)]], closed=False)


def console(cell, x, z, tall=0.3, wide=0.09, out=0.18, mat=STONE):
    """A scrolled bracket under a hood, tapering down to the wall."""
    rings = []
    for t in np.linspace(0, 1, 10):
        reach = out * (0.28 + 0.72 * t**1.8) + 0.02 * math.sin(t * math.tau)
        half = wide / 2 * (0.62 + 0.38 * t)
        zz = z - tall + tall * t
        rings.append([(x - half, 0.0, zz), (x + half, 0.0, zz), (x + half, reach, zz), (x - half, reach, zz)])
    cell.rings(mat, rings)
    cell.box(mat, x - wide * 0.6, x + wide * 0.6, 0.0, out + 0.02, z - 0.012, z + 0.02)


def hood(cell, z, half=1.0, out=0.26):
    """A small cornice over a window."""
    cell.strip(STONE, -half, half, z, [(0.0, 0.0), (0.06, 0.02), (0.08, 0.06), (0.18, 0.09), (out, 0.13), (out, 0.17), (0.0, 0.2)])


def relief(cell, centre, wide, tall, height, out=0.05, mat=CARVED, steps=130):
    """A panel of carved plaster: a grid pushed out by height(u, v), with u and v from -1 to 1."""
    us = np.linspace(-1, 1, steps)
    vs = np.linspace(-1, 1, steps)
    rows = []
    for v in vs:
        rows.append([(centre[0] + u * wide / 2, out * float(height(u, v)) + 0.002, centre[1] + v * tall / 2) for u in us])
    cell.rings(mat, rows, closed=False)


def shell(u, v):
    """A scallop shell with a little scroll each side: the plasterer's favourite."""
    r = math.hypot(u * 1.2, v + 0.75)
    angle = math.atan2(v + 0.75, u * 1.2)
    fan = 0.0
    if r < 1.55 and v > -0.9:
        fan = (0.55 + 0.45 * math.cos(angle * 16)) * min((1.55 - r) * 3, 1) * (0.4 + 0.6 * r / 1.55)
    scroll = 0.0
    for side in (-1, 1):
        d = math.hypot(u - side * 0.7, v + 0.5)
        if d < 0.34:
            turn = math.atan2(v + 0.5, u - side * 0.7) + d * 16
            scroll = max(scroll, (0.5 + 0.5 * math.sin(turn)) * (0.34 - d) * 3)
    return max(fan, scroll)


def garland(u, v):
    """A swag of leaves hung between two points."""
    sag = -0.3 + 0.85 * u * u
    d = abs(v - sag)
    body = max(0.0, 1 - d / 0.3)
    leaf = 0.55 + 0.45 * math.sin(u * 26 + v * 9) * math.sin(u * 13 - v * 17)
    return body * leaf * (0.5 + 0.5 * math.cos(u * math.pi / 2))


def keystone(cell, z):
    rings = [
        [(-0.075, 0.0, z), (0.075, 0.0, z), (0.11, 0.0, z + 0.3), (-0.11, 0.0, z + 0.3)],
        [(-0.075, 0.09, z), (0.075, 0.09, z), (0.11, 0.09, z + 0.3), (-0.11, 0.09, z + 0.3)],
    ]
    cell.rings(STONE, rings)
    cell.quad(STONE, *rings[1])


def course(cell, z, proud=0.05):
    """A string course: a band that runs on from bay to bay."""
    w = cell.wide / 2
    cell.strip(STONE, -w, w, z, [(0.0, 0.0), (proud * 0.4, 0.015), (proud, 0.03), (proud, 0.09), (proud * 0.5, 0.12), (0.0, 0.13)])


def cell_hood():
    c = Cell("hood").wall()
    glazed(c, "rect")
    surround(c, "rect")
    shutters(c)
    for x in (-0.98, 0.98):
        console(c, x, 3.1)
    hood(c, 3.1, half=1.12)
    relief(c, (0, 3.02), 1.5, 0.16, garland, out=0.03)
    course(c, 0.0)
    return c


def cell_pediment():
    c = Cell("pediment").wall()
    glazed(c, "rect")
    surround(c, "rect", width=0.17)
    shutters(c)
    for x in (-0.98, 0.98):
        console(c, x, 3.0, tall=0.38)
    # A pediment, its raking cornice rising to a shallow peak.
    for side in (-1, 1):
        rings = []
        for out, up in ((0.0, 0.0), (0.09, 0.03), (0.2, 0.07), (0.2, 0.12), (0.0, 0.14)):
            rings.append([(side * 1.14, out, 3.0 + up), (0.0, out, 3.42 + up)])
        c.rings(STONE, rings, closed=False)
    c.strip(STONE, -1.14, 1.14, 2.98, [(0.0, 0.0), (0.12, 0.03), (0.2, 0.05), (0.2, 0.09), (0.0, 0.1)])
    relief(c, (0, 3.2), 0.7, 0.26, shell, out=0.05)
    course(c, 0.0)
    return c


def cell_segment():
    c = Cell("segment").wall()
    glazed(c, "segment")
    surround(c, "segment")
    shutters(c, tall=2.42)
    keystone(c, 2.96)
    relief(c, (0, 3.33), 1.1, 0.26, shell, out=0.04)
    course(c, 0.0)
    return c


def cell_attic():
    c = Cell("attic").wall()
    glazed(c, "rect")
    surround(c, "rect", width=0.1, proud=0.03)
    shutters(c, tall=2.4)
    course(c, 0.0, 0.03)
    return c


def cell_rich():
    c = Cell("rich").wall()
    glazed(c, "round")
    surround(c, "round", width=0.17)
    shutters(c, tall=2.1)
    keystone(c, 2.98)
    relief(c, (-0.86, 3.0), 0.72, 0.62, garland, out=0.05)
    relief(c, (0.86, 3.0), 0.72, 0.62, garland, out=0.05)
    # Pilasters at each side of the bay, with a simple capital.
    w = c.wide / 2
    for side in (-1, 1):
        a, b = sorted((side * w, side * (w - 0.3)))
        c.box(STONE, a, b, 0.0, 0.07, 0.0, TALL)
        c.box(STONE, a - 0.02, b + 0.02, 0.0, 0.11, 3.1, 3.24)
    course(c, 0.0)
    return c


def cell_deco():
    """Thirties modern: flat, tall, a little severe."""
    c = Cell("deco").wall()
    glazed(c, "rect")
    w = c.wide / 2
    for side in (-1, 1):
        a, b = sorted((side * (HALF + 0.02), side * (HALF + 0.42)))
        for z in np.arange(0.2, 3.3, 0.42):
            c.box(STONE, a, b, 0.0, 0.03, z, z + 0.3)
        p, q = sorted((side * w, side * (w - 0.22)))
        c.box(STONE, p, q, 0.0, 0.09, 0.0, TALL)
    c.box(STONE, -1.2, 1.2, 0.0, 0.1, 3.02, 3.14)
    c.box(STONE, -1.2, 1.2, 0.0, 0.08, 0.1, 0.2)
    return c


def cell_moorish():
    c = Cell("moorish").wall()
    glazed(c, "horseshoe")
    surround(c, "horseshoe", width=0.13)
    # Glazed tile set in the spandrels and under the sill: the blue-green of the neo-Moorish.
    for side in (-1, 1):
        c.box(TILE, side * 0.9 - 0.18, side * 0.9 + 0.18, 0.0, 0.012, 2.1, 3.2)
    c.box(TILE, -0.9, 0.9, 0.0, 0.012, 0.05, 0.18)

    def lattice(u, v):
        return 0.5 + 0.5 * math.sin(u * 22) * math.sin(v * 7)

    relief(c, (0, 3.22), 2.3, 0.32, lattice, out=0.03)
    c.strip(STONE, -1.3, 1.3, 3.36, [(0.0, 0.0), (0.09, 0.02), (0.09, 0.06), (0.0, 0.08)])
    return c


def cell_modern():
    """Post-war flats: concrete frame, a roller blind part way down."""
    c = Cell("modern").wall()
    glazed(c, "rect")
    c.box(STEEL, -HALF, HALF, -0.12, -0.11, 1.9, HEAD)
    for z in np.arange(1.9, HEAD, 0.05):
        c.box(STEEL, -HALF, HALF, -0.11, -0.104, z, z + 0.038)
    c.box(FRAME, -HALF - 0.08, HALF + 0.08, 0.0, 0.05, SILL - 0.08, SILL)
    c.box(FRAME, -HALF - 0.08, HALF + 0.08, 0.0, 0.05, HEAD, HEAD + 0.08)
    return c


def cell_rustic():
    """The storey over the shops: banded stone, and a tall arched window."""
    c = Cell("rustic").wall(STONE)
    for z in np.arange(0.12, TALL, 0.36):
        c.box(STONE, -c.wide / 2, -HALF - 0.16, 0.0, 0.035, z, z + 0.31)
        c.box(STONE, HALF + 0.16, c.wide / 2, 0.0, 0.035, z, z + 0.31)
    glazed(c, "round")
    surround(c, "round", width=0.12, proud=0.05)
    keystone(c, 2.95)
    return c


def cell_shop():
    """A shop front: pilasters, a sign band, and the plate glass, taller than a flat's."""
    c = Cell("shop", tall=GROUND)
    w = c.wide / 2
    c.quad(PLASTER, (-w, 0, 0), (w, 0, 0), (w, 0, GROUND), (-w, 0, GROUND))
    c.box(STONE, -w, -w + 0.36, 0.0, 0.1, 0.0, GROUND)
    c.box(STONE, w - 0.36, w, 0.0, 0.1, 0.0, GROUND)
    c.box(STONE, -w, w, 0.0, 0.08, 0.0, 0.34)
    c.strip(STONE, -w, w, 3.92, [(0.0, 0.0), (0.1, 0.04), (0.2, 0.09), (0.2, 0.15), (0.0, 0.2)])
    # The glass stands for what the module cuts out.
    c.quad(SHOP_GLASS, (-w + 0.38, 0.02, 0.36), (w - 0.38, 0.02, 0.36), (w - 0.38, 0.02, 3.0), (-w + 0.38, 0.02, 3.0))
    c.box(FRAME, -0.03, 0.03, 0.0, 0.05, 0.36, 3.0)
    return c


def cell_shut():
    """A shop that's closed: a steel roller, a bit knocked about."""
    c = Cell("shut", tall=GROUND)
    w = c.wide / 2
    c.quad(PLASTER, (-w, 0, 0), (w, 0, 0), (w, 0, GROUND), (-w, 0, GROUND))
    c.box(STONE, -w, -w + 0.36, 0.0, 0.1, 0.0, GROUND)
    c.box(STONE, w - 0.36, w, 0.0, 0.1, 0.0, GROUND)
    for z in np.arange(0.0, 3.1, 0.085):
        c.rings(STEEL, [[(-w + 0.38, 0.02, z), (-w + 0.38, 0.05, z + 0.04), (-w + 0.38, 0.02, z + 0.08)], [(w - 0.38, 0.02, z), (w - 0.38, 0.05, z + 0.04), (w - 0.38, 0.02, z + 0.08)]], closed=False)
    c.box(STEEL, -w + 0.3, w - 0.3, 0.0, 0.14, 3.06, 3.36)
    c.strip(STONE, -w, w, 3.92, [(0.0, 0.0), (0.1, 0.04), (0.2, 0.09), (0.2, 0.15), (0.0, 0.2)])
    return c


def cell_cornice():
    """The crown of a building, seen from the street: frieze, modillions, dentils and the drip."""
    c = Cell("cornice", tall=1.85)
    w = c.wide / 2
    c.quad(PLASTER, (-w, 0, 0), (w, 0, 0), (w, 0, 1.85), (-w, 0, 1.85))
    relief(c, (0, 0.5), c.wide, 0.44, garland, out=0.04, steps=200)
    c.strip(STONE, -w, w, 0.72, [(0.0, 0.0), (0.05, 0.02), (0.05, 0.06), (0.0, 0.08)])
    for x in np.arange(-w + 0.06, w, 0.13):
        c.box(STONE, x, x + 0.07, 0.0, 0.1, 0.82, 0.94)
    for x in np.arange(-w + 0.23, w, 0.46):
        console(c, x, 1.26, tall=0.28, wide=0.13, out=0.34)
    c.strip(STONE, -w, w, 1.26, [(0.0, 0.0), (0.36, 0.0), (0.42, 0.05), (0.42, 0.12), (0.5, 0.2), (0.5, 0.26), (0.0, 0.3)])
    return c


def cell_soffit():
    """The underside of a balcony, seen from below: panels and a moulded edge."""
    c = Cell("soffit", tall=1.0)
    w = c.wide / 2
    c.quad(STONE, (-w, 0, 0), (w, 0, 0), (w, 0, 1.0), (-w, 0, 1.0))
    for x in np.arange(-w + 0.25, w, 0.62):
        rings = [[(x, 0.0, 0.12), (x + 0.42, 0.0, 0.12), (x + 0.42, 0.0, 0.76), (x, 0.0, 0.76)]]
        rings.append([(x + 0.03, -0.02, 0.15), (x + 0.39, -0.02, 0.15), (x + 0.39, -0.02, 0.73), (x + 0.03, -0.02, 0.73)])
        c.rings(STONE, rings)
        c.quad(PLASTER, *rings[1])
    c.strip(STONE, -w, w, 0.84, [(0.0, 0.0), (0.05, 0.02), (0.08, 0.06), (0.0, 0.14)])
    return c


def cell_mansard():
    """A zinc roof, its seams running up, and the dormer's lit face."""
    c = Cell("mansard", tall=2.9)
    w = c.wide / 2
    c.quad(ZINC, (-w, 0, 0), (w, 0, 0), (w, 0, 2.9), (-w, 0, 2.9))
    for x in np.arange(-w, w, 0.42):
        c.box(ZINC, x, x + 0.03, 0.0, 0.035, 0.0, 2.9)
    c.box(STONE, -0.68, 0.68, 0.0, 0.12, 0.2, 2.1)
    c.box(FRAME, -0.5, 0.5, 0.12, 0.13, 0.42, 1.8)
    c.quad(GLASS, (-0.44, 0.135, 0.48), (0.44, 0.135, 0.48), (0.44, 0.135, 1.74), (-0.44, 0.135, 1.74))
    c.box(FRAME, -0.02, 0.02, 0.135, 0.15, 0.48, 1.74)
    c.strip(STONE, -0.8, 0.8, 2.08, [(0.0, 0.0), (0.16, 0.03), (0.16, 0.08), (0.0, 0.12)])
    return c


def cell_arcade():
    """The seafront's arcade, floor to the mezzanine: an arch between piers, with a window over it."""
    tall = GROUND + TALL
    c = Cell("arcade", tall=tall)
    w = c.wide / 2
    spring = 3.9
    radius = 1.34
    # The pier and arch, built as one face round the opening.
    edge = [(radius * math.cos(t), spring + radius * math.sin(t)) for t in np.linspace(math.pi, 0, 28)]
    left = [(-radius, 0.0)] + edge + [(radius, 0.0)]
    outer = []
    for x, z in left:
        if z == 0.0:
            outer.append((math.copysign(w, x), 0.0, 0.0))
            continue
        # Out along a ray from the arch's centre, to the edge of the bay.
        dx, dz = x, z - spring
        reach = min(w / abs(dx) if abs(dx) > 1e-6 else 1e9, (tall - spring) / dz if dz > 1e-6 else 1e9)
        outer.append((dx * reach, 0.0, spring + dz * reach))
    c.rings(STONE, [[(x, 0.0, z) for x, z in left], outer], closed=False)
    # Mouldings: the archivolt, the impost, the base, and a band at the mezzanine.
    arch_in = [(x, 0.0, z) for x, z in edge]
    arch_mid = [(x * 1.07, 0.06, spring + (z - spring) * 1.07) for x, z in edge]
    arch_out = [(x * 1.14, 0.0, spring + (z - spring) * 1.14) for x, z in edge]
    c.rings(STONE, [arch_in, arch_mid, arch_out], closed=False)
    for side in (-1, 1):
        a, b = sorted((side * w, side * radius))
        c.strip(STONE, a, b, spring - 0.14, [(0.0, 0.0), (0.08, 0.03), (0.12, 0.09), (0.12, 0.14), (0.0, 0.16)])
        c.box(STONE, a, b, 0.0, 0.09, 0.0, 0.42)
    keystone(c, spring + radius - 0.06)
    relief(c, (-1.42, 5.1), 0.8, 0.6, garland, out=0.05)
    relief(c, (1.42, 5.1), 0.8, 0.6, garland, out=0.05)
    c.strip(STONE, -w, w, 5.62, [(0.0, 0.0), (0.1, 0.04), (0.2, 0.1), (0.2, 0.15), (0.0, 0.2)])
    # The low mezzanine window above.
    c.box(STONE, -0.8, 0.8, 0.0, 0.05, 6.1, 7.36)
    c.quad(GLASS, (-0.62, 0.06, 6.22), (0.62, 0.06, 6.22), (0.62, 0.06, 7.24), (-0.62, 0.06, 7.24))
    c.box(FRAME, -0.02, 0.02, 0.06, 0.07, 6.22, 7.24)
    c.strip(STONE, -w, w, 7.6, [(0.0, 0.0), (0.05, 0.03), (0.05, 0.09), (0.0, 0.12)])
    return c


# In atlas order: four cells across. Arcade fills the bottom two cells of the last column.
CELLS = [
    cell_hood,
    cell_pediment,
    cell_segment,
    cell_attic,
    cell_rich,
    cell_deco,
    cell_moorish,
    cell_modern,
    cell_rustic,
    cell_shop,
    cell_shut,
    cell_arcade,
    cell_mansard,
    cell_cornice,
    cell_soffit,
]


def build(cell):
    """Puts a cell's geometry in the scene."""
    items = []
    for mat, verts, faces in cell.parts.values():
        mesh = bpy.data.meshes.new(mat.name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        mesh.polygons.foreach_set("use_smooth", [mat is CARVED] * len(mesh.polygons))
        item = bpy.data.objects.new(mat.name, mesh)
        mesh.materials.append(mat)
        collection.objects.link(item)
        items.append(item)
    return items


def add_light(kind, location, rotation, energy, colour, size=(1, 1)):
    data = bpy.data.lights.new("Light", kind)
    data.energy = energy
    data.color = colour
    if kind == "AREA":
        data.shape = "RECTANGLE"
        data.size, data.size_y = size
    item = bpy.data.objects.new("Light", data)
    item.location = location
    item.rotation_euler = rotation
    collection.objects.link(item)
    return item


def light_cell(cell):
    """A strip on the ledge below, close to the wall and pointing up it, and a little night sky."""
    w = cell.wide / 2
    wash = 1.0 if cell.name not in ("soffit",) else 1.5
    items = []
    # The light rises from a run of small lamps, so it scallops up the wall.
    for x in np.linspace(-w * 0.86, w * 0.86, 4):
        # A spot shines down its own -z, so this turns it over, to point up and a little at the wall.
        items.append(add_light("SPOT", (float(x), 0.8, -0.05), (math.radians(203), 0, 0), 46 * wash, (1.0, 0.71, 0.44)))
        items[-1].data.spot_size = math.radians(128)
        items[-1].data.spot_blend = 1.0
        items[-1].data.shadow_soft_size = 0.08
    # The street's own glow, from far below: it reaches the whole front and fills the shadows warm.
    street = add_light("AREA", (0, 6.5, -7.0), (math.radians(222), 0, 0), 900 * wash, (1.0, 0.76, 0.52), size=(14, 7))
    items.append(street)
    items.append(add_light("AREA", (0, 3.4, cell.tall * 0.3), (math.radians(-90), 0, 0), 9, (0.72, 0.8, 1.0), size=(8, 8)))
    return items


def set_camera(cell):
    data = bpy.data.cameras.new("Ortho")
    data.type = "ORTHO"
    data.ortho_scale = max(cell.wide, cell.tall)
    item = bpy.data.objects.new("Ortho", data)
    collection.objects.link(item)
    # From the street, looking back at the wall, with up as up. Image right is the model's -x.
    item.location = (0, 6, cell.tall / 2)
    item.rotation_euler = (math.radians(90), 0, math.radians(180))
    scene.camera = item
    return item


world = bpy.data.worlds.new("Night")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.01, 0.012, 0.02, 1)
scene.world = world
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
use_gpu(scene, 96)
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
MASK_MATERIALS = {}


def mask_material(value):
    key = round(value, 2)
    if key not in MASK_MATERIALS:
        item = bpy.data.materials.new(f"Mask{key}")
        item.use_nodes = True
        tree = item.node_tree
        tree.nodes.clear()
        out = tree.nodes.new("ShaderNodeOutputMaterial")
        glow = tree.nodes.new("ShaderNodeEmission")
        glow.inputs["Color"].default_value = (value, value, value, 1)
        glow.inputs["Strength"].default_value = 1
        tree.links.new(glow.outputs[0], out.inputs["Surface"])
        MASK_MATERIALS[key] = item
    return MASK_MATERIALS[key]


def clear():
    for item in list(collection.objects):
        bpy.data.objects.remove(item)


def render(cell_maker):
    cell = cell_maker()
    name = cell.name
    if ONLY and name not in ONLY:
        return
    clear()
    meshes = build(cell)
    lights = light_cell(cell)
    set_camera(cell)
    # A cell renders at twice its size, then shrinks: crisper than rendering small.
    scale = 2
    tall_cell = name == "arcade"
    long_side = CELL * scale * (2 if tall_cell else 1)
    aspect = cell.wide / cell.tall
    scene.render.resolution_x = int(long_side * min(aspect, 1)) if aspect < 1 else long_side
    scene.render.resolution_y = long_side if aspect < 1 else int(long_side / aspect)
    scene.render.filepath = os.path.join(BUILD, f"{name}.png")
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.01, 0.012, 0.02, 1)
    bpy.ops.render.render(write_still=True)
    print("baked", name, flush=True)

    # The same view again, flat, saying what each texel is.
    for light in lights:
        light.hide_render = True
    for item in meshes:
        item.data.materials[0] = mask_material(MASKS.get(item.name.split(".")[0], 0.0))
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = "Raw"
    scene.render.filepath = os.path.join(BUILD, f"{name}-mask.png")
    bpy.ops.render.render(write_still=True)
    scene.view_settings.view_transform = "Standard"


for maker in CELLS:
    render(maker)

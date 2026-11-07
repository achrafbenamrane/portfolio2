"""
The pieces Algiers' streets are built from, as small models the game repeats along every wall that
faces the road: a storey of wall with its window opening, the same with a short balcony, the same
with a long iron balcony that runs on into the next bay, a shop front, a lowered shutter, an arch of
the seafront arcade, a cornice, a mansard roof, and a satellite dish.

All the fine detail is in the baked atlas (scripts/blender/build_moto_atlas.py). These only give it
real depth: window reveals, balcony slabs on their brackets, the vault of the arcade.

Each module is 1 unit wide here and stretched to its bay in the game. Heights are in metres, and it
stands on the bottom of its storey, facing +y (the street). The first UV says which surface this is,
the second where it is on that surface, with u running left to right as seen from the street.

    blender --background --python scripts/blender/build_moto_facade.py -- <repo root>
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import script_args  # noqa: E402

ROOT = os.path.abspath(script_args()[0])
OUT = os.path.join(ROOT, "public/moto/city/facade.glb")

CELL, REVEAL, EDGE, SOFFIT, CORBEL, RAIL, IRON, SHOP_WALL, SHOP_GLASS, ROLLER, SIGN, ARCH, ARCH_BACK, CORNICE, MANSARD, LANTERN, DISH, CAP, VAULT = range(19)
BAY = 3.7
STOREY = 3.5
GROUND = 4.4
ARCADE_TALL = GROUND + STOREY
CORNICE_TALL = 1.75
HALF = 0.7 / BAY
SILL = 0.28
HEAD = 2.9
RECESS = 0.24


class Module:
    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.uvs = [], [], []

    def quad(self, a, b, c, d, zone, local=((0, 0), (1, 0), (1, 1), (0, 1))):
        n = len(self.verts)
        self.verts += [a, b, c, d]
        self.faces.append((n, n + 1, n + 2, n + 3))
        for u, v in local:
            self.uvs.append(((zone + 0.5) / 32, u, v))

    def wall(self, x0, z0, x1, z1, y, zone, tall):
        """A flat piece of wall, showing the part of the picture that belongs there."""
        # The street is at +y, so a viewer's right is -x.
        local = ((0.5 - x1, z0 / tall), (0.5 - x0, z0 / tall), (0.5 - x0, z1 / tall), (0.5 - x1, z1 / tall))
        self.quad((x1, y, z0), (x0, y, z0), (x0, y, z1), (x1, y, z1), zone, local)

    def box(self, low, high, zone):
        x0, y0, z0 = low
        x1, y1, z1 = high
        self.quad((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1), zone)  # Front, toward the street.
        self.quad((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), zone)
        self.quad((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1), zone)
        self.quad((x0, y1, z1), (x1, y1, z1), (x1, y0, z1), (x0, y0, z1), zone)  # Top.
        self.quad((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), zone)  # Underneath.

    def build(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        layer = mesh.uv_layers.new(name="UVMap")
        second = mesh.uv_layers.new(name="Local")
        indices = np.zeros(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get("vertex_index", indices)
        table = np.array(self.uvs, np.float32)
        layer.data.foreach_set("uv", np.stack([table[indices, 0], np.zeros(len(indices), np.float32)], axis=1).ravel())
        second.data.foreach_set("uv", table[indices, 1:3].ravel())
        item = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(item)
        return item


def storey(m):
    """A storey of wall, cut for its window, with the glass set back in the reveal."""
    h = HALF
    m.wall(-0.5, 0, -h, STOREY, 0.0, CELL, STOREY)
    m.wall(h, 0, 0.5, STOREY, 0.0, CELL, STOREY)
    m.wall(-h, 0, h, SILL, 0.0, CELL, STOREY)
    m.wall(-h, HEAD, h, STOREY, 0.0, CELL, STOREY)
    m.wall(-h, SILL, h, HEAD, -RECESS, CELL, STOREY)
    y = -RECESS
    m.quad((-h, 0, SILL), (-h, y, SILL), (-h, y, HEAD), (-h, 0, HEAD), REVEAL)
    m.quad((h, y, SILL), (h, 0, SILL), (h, 0, HEAD), (h, y, HEAD), REVEAL)
    m.quad((-h, y, HEAD), (h, y, HEAD), (h, 0, HEAD), (-h, 0, HEAD), REVEAL)
    m.quad((h, y, SILL), (-h, y, SILL), (-h, 0, SILL), (h, 0, SILL), REVEAL)


def balcony(m, half, brackets, sides):
    """A slab on scrolled brackets, with a moulded edge, and the iron rail round it."""
    deep = 0.98
    low, high = 0.05, 0.2
    # Underneath is what you see from the street, so that's where the detail goes.
    m.quad((-half, 0, low), (half, 0, low), (half, deep, low), (-half, deep, low), SOFFIT, ((0, 0), (half * 2, 0), (half * 2, 1), (0, 1)))
    m.quad((half, deep, low), (-half, deep, low), (-half, deep, high), (half, deep, high), EDGE, ((0, 0), (half * 2, 0), (half * 2, 1), (0, 1)))
    m.quad((-half, deep, high), (half, deep, high), (half, 0, high), (-half, 0, high), REVEAL)
    if sides:
        m.quad((-half, 0, low), (-half, deep, low), (-half, deep, high), (-half, 0, high), EDGE, ((0, 0), (0.3, 0), (0.3, 1), (0, 1)))
        m.quad((half, deep, low), (half, 0, low), (half, 0, high), (half, deep, high), EDGE, ((0, 0), (0.3, 0), (0.3, 1), (0, 1)))
    for x in brackets:
        w = 0.022
        # A wedge: full depth at the slab, tapering back into the wall.
        top, bottom = 0.8, 0.14
        foot = -0.42
        m.quad((x + w, bottom, foot), (x - w, bottom, foot), (x - w, top, low), (x + w, top, low), CORBEL, ((0, 0), (1, 0), (1, 1), (0, 1)))
        m.quad((x - w, 0, foot), (x - w, bottom, foot), (x - w, top, low), (x - w, 0, low), CORBEL, ((0, 0), (0.3, 0), (1, 1), (0, 1)))
        m.quad((x + w, bottom, foot), (x + w, 0, foot), (x + w, 0, low), (x + w, top, low), CORBEL, ((0.3, 0), (0, 0), (0, 1), (1, 1)))
    rail = high + 1.08
    front = deep - 0.05
    span = half * 2
    m.quad((half, front, high), (-half, front, high), (-half, front, rail), (half, front, rail), RAIL, ((0, 0), (span, 0), (span, 1), (0, 1)))
    if sides:
        m.quad((-half, 0, high), (-half, front, high), (-half, front, rail), (-half, 0, rail), RAIL, ((0, 0), (0.25, 0), (0.25, 1), (0, 1)))
        m.quad((half, front, high), (half, 0, high), (half, 0, rail), (half, front, rail), RAIL, ((0, 0), (0.25, 0), (0.25, 1), (0, 1)))
    # The handrail, a little thicker than the bars, so it holds a line from far off.
    m.box((-half, front - 0.03, rail), (half, front + 0.03, rail + 0.045), IRON)


def plain_bay():
    m = Module("Bay")
    storey(m)
    return m


def balcony_bay():
    m = Module("Balcony")
    storey(m)
    balcony(m, 0.27, (-0.2, 0.2), True)
    return m


def long_balcony_bay():
    m = Module("Filant")
    storey(m)
    balcony(m, 0.5, (-0.25, 0.25), False)
    return m


def shop_front():
    m = Module("Shop")
    left, right = -0.397, 0.397
    low, high = 0.36, 3.0
    m.wall(-0.5, 0, left, GROUND, 0.0, SHOP_WALL, GROUND)
    m.wall(right, 0, 0.5, GROUND, 0.0, SHOP_WALL, GROUND)
    m.wall(left, 0, right, low, 0.0, SHOP_WALL, GROUND)
    m.wall(left, high, right, GROUND, 0.0, SHOP_WALL, GROUND)
    y = -0.42
    m.wall(left, low, right, high, y, SHOP_GLASS, GROUND)
    m.quad((left, 0, low), (left, y, low), (left, y, high), (left, 0, high), REVEAL)
    m.quad((right, y, low), (right, 0, low), (right, 0, high), (right, y, high), REVEAL)
    m.quad((left, y, high), (right, y, high), (right, 0, high), (left, 0, high), REVEAL)
    m.quad((right, y, low), (left, y, low), (left, 0, low), (right, 0, low), REVEAL)
    # The sign, standing off the wall above the glass.
    m.box((-0.42, 0.0, 3.1), (0.42, 0.16, 3.86), EDGE)
    m.quad((0.42, 0.163, 3.13), (-0.42, 0.163, 3.13), (-0.42, 0.163, 3.83), (0.42, 0.163, 3.83), SIGN)
    return m


def shutter_front():
    m = Module("Shut")
    m.wall(-0.5, 0, 0.5, GROUND, 0.0, ROLLER, GROUND)
    return m


def arcade():
    """An arch of the seafront: a pier each side, a barrel vault running back, a lit wall at the end."""
    m = Module("Arcade")
    radius = 1.34 / BAY
    tall = ARCADE_TALL
    spring = 3.9
    rise = 1.34
    deep = 3.7
    steps = 14
    edge = [(radius * math.cos(t), spring + rise * math.sin(t)) for t in np.linspace(math.pi, 0, steps + 1)]
    line = [(-radius, 0.0), *edge, (radius, 0.0)]
    rim = []
    for x, z in line:
        if z == 0.0:
            rim.append((math.copysign(0.5, x), 0.0))
            continue
        dx, dz = x, z - spring
        reach = min(0.5 / abs(dx) if abs(dx) > 1e-6 else 1e9, (tall - spring) / dz if dz > 1e-6 else 1e9)
        rim.append((dx * reach, spring + dz * reach))
    for (ax, az), (bx, bz), (cx, cz), (dx, dz) in zip(line, line[1:], rim[1:], rim):
        m.quad((ax, 0, az), (bx, 0, bz), (cx, 0, cz), (dx, 0, dz), ARCH, ((0.5 - ax, az / tall), (0.5 - bx, bz / tall), (0.5 - cx, cz / tall), (0.5 - dx, dz / tall)))
    # The soffit of the arch, and the piers' inner faces.
    for (ax, az), (bx, bz) in zip(line, line[1:]):
        m.quad((ax, -deep, az), (bx, -deep, bz), (bx, 0, bz), (ax, 0, az), VAULT, ((0, az / tall), (0, bz / tall), (1, bz / tall), (1, az / tall)))
    # The back wall, under the same arch, and the floor.
    m.wall(-0.5, 0, 0.5, spring + rise, -deep, ARCH_BACK, spring + rise)
    m.quad((-0.5, -deep, 0.03), (0.5, -deep, 0.03), (0.5, 0, 0.03), (-0.5, 0, 0.03), VAULT, ((0, 0), (0, 0), (1, 0), (1, 0)))
    # A lantern hanging under the crown, on its short chain.
    x, y, z = 0.0, -1.6, 3.8
    w = 0.06
    d = 0.22
    m.quad((x - w, y + d, z), (x + w, y + d, z), (x + w, y + d, z + 0.5), (x - w, y + d, z + 0.5), LANTERN)
    m.quad((x + w, y - d, z), (x - w, y - d, z), (x - w, y - d, z + 0.5), (x + w, y - d, z + 0.5), LANTERN)
    m.quad((x + w, y + d, z), (x + w, y - d, z), (x + w, y - d, z + 0.5), (x + w, y + d, z + 0.5), LANTERN)
    m.quad((x - w, y - d, z), (x - w, y + d, z), (x - w, y + d, z + 0.5), (x - w, y - d, z + 0.5), LANTERN)
    m.box((x - w * 1.3, y - d * 1.3, z + 0.5), (x + w * 1.3, y + d * 1.3, z + 0.58), IRON)
    m.box((x - 0.006, y - 0.02, z + 0.58), (x + 0.006, y + 0.02, spring + rise), IRON)
    return m


def cornice():
    """The crown of the wall: frieze and brackets flat, then the real overhang of the top."""
    m = Module("Cornice")
    tall = 1.85
    m.wall(-0.5, 0, 0.5, 1.26, 0.0, CORNICE, tall)
    out = 0.52
    # Underneath the overhang, which the street sees.
    m.quad((-0.5, 0, 1.26), (0.5, 0, 1.26), (0.5, out, 1.26), (-0.5, out, 1.26), CORNICE, ((1, 0.665), (0, 0.665), (0, 0.685), (1, 0.685)))
    m.wall(-0.5, 1.26, 0.5, 1.75, out, CORNICE, tall)
    m.quad((-0.5, out, 1.75), (0.5, out, 1.75), (0.5, -3.0, 1.75), (-0.5, -3.0, 1.75), CAP)
    return m


def mansard():
    """Zinc, sloping back from the cornice, with a dormer standing out of it."""
    m = Module("Mansard")
    tall = 2.7
    back = 1.5
    uv = ((1, 0), (0, 0), (0, tall / 2.9), (1, tall / 2.9))
    m.quad((0.5, 0, 0), (-0.5, 0, 0), (-0.5, -back, tall), (0.5, -back, tall), MANSARD, uv)
    # The dormer: its face shows the same picture, brought forward.
    w = 0.19
    z0, z1 = 0.2, 2.16
    y = -0.05
    a, b = 0.5 - w, 0.5 + w
    m.quad((w, y, z0), (-w, y, z0), (-w, y, z1), (w, y, z1), MANSARD, ((a, z0 / 2.9), (b, z0 / 2.9), (b, z1 / 2.9), (a, z1 / 2.9)))
    slope = -back * z1 / tall
    m.quad((-w, y, z1), (w, y, z1), (w, slope - 0.05, z1), (-w, slope - 0.05, z1), EDGE, ((0, 0), (1, 0), (1, 1), (0, 1)))
    m.quad((-w, y, z0), (-w, y - back * (z0 / tall) - 0.02, z0), (-w, slope, z1), (-w, y, z1), MANSARD, ((0.02, 0.1), (0.03, 0.1), (0.03, 0.7), (0.02, 0.7)))
    m.quad((w, y - back * (z0 / tall) - 0.02, z0), (w, y, z0), (w, y, z1), (w, slope, z1), MANSARD, ((0.03, 0.1), (0.02, 0.1), (0.02, 0.7), (0.03, 0.7)))
    m.quad((-0.5, -back, tall), (0.5, -back, tall), (0.5, -6.0, tall), (-0.5, -6.0, tall), CAP)
    return m


def dish():
    """A satellite dish on a short pole, tipped toward the southern sky."""
    m = Module("Dish")
    sides = 12
    rings = [(0.0, 0.08), (0.2, 0.05), (0.36, 0.0)]
    tilt = math.radians(52)
    centre = np.array([0.0, 0.0, 1.02])
    axis = np.array([0.0, math.cos(tilt), math.sin(tilt)])
    u = np.array([1.0, 0.0, 0.0])
    v = np.cross(axis, u)
    for (r0, d0), (r1, d1) in zip(rings, rings[1:]):
        for k in range(sides):
            a0 = k / sides * math.tau
            a1 = (k + 1) / sides * math.tau
            p = [centre - axis * (0.08 - d) + r * (math.cos(a) * u + math.sin(a) * v) for r, d, a in ((r0, d0, a0), (r1, d1, a0), (r1, d1, a1), (r0, d0, a1))]
            m.quad(*[tuple(q) for q in p], DISH)
    m.box((-0.022, -0.022, 0.0), (0.022, 0.022, 1.0), IRON)
    m.box((-0.012, 0.0, 1.0), (0.012, 0.3, 1.024), IRON)
    return m


bpy.ops.wm.read_factory_settings(use_empty=True)
for module in (plain_bay(), balcony_bay(), long_balcony_bay(), shop_front(), shutter_front(), arcade(), cornice(), mansard(), dish()):
    item = module.build()
    print(item.name, "triangles", sum(len(p.vertices) - 2 for p in item.data.polygons), flush=True)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_materials="NONE",
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)
print("Packed facade", os.path.getsize(OUT) / 1e6, "MB", flush=True)

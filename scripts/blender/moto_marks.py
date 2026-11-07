"""
The three marks the bike wears, and no others: the maker's name on the tank, the model's name on the
tail, and the silencer maker's name on the can. Imported by build_moto.py, never run.

Each is ordinary lettering, set from fonts on this PC and laid over the finished surface, so a close
match rather than the real artwork. They're kept apart from the bodywork on purpose: everything here
sits in objects whose names start with `Marks`, in the one material `Mark`, with clean paint under
them, so the game can hide the lot by making `Marks` invisible.
"""

import math

import numpy as np
from mathutils import Vector

from moto_body import SURFACES
from moto_engine import CAN
from moto_kit import glyphs

FONTS = "C:/Windows/Fonts/"
LIFT = 0.0014


def dice(points, faces, longest):
    """Splits triangles until no edge is longer than `longest`, so the type can bend with a surface."""
    points = [tuple(p) for p in points]
    halves = {}
    out = []
    stack = [tuple(int(i) for i in f) for f in faces]
    while stack:
        face = stack.pop()
        sides = [math.dist(points[face[k]], points[face[(k + 1) % 3]]) for k in range(3)]
        k = int(np.argmax(sides))
        if sides[k] <= longest:
            out.append(face)
            continue
        a, b, c = face[k], face[(k + 1) % 3], face[(k + 2) % 3]
        key = (min(a, b), max(a, b))
        if key not in halves:
            halves[key] = len(points)
            points.append(((points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2))
        m = halves[key]
        stack.extend(((a, m, c), (m, b, c)))
    return np.array(points), np.array(out)


def set_type(text, font, length, stretch=1.0, longest=0.006):
    """A line of type, `length` long and centred on the origin, as flat points and triangles."""
    verts, tris, width, height = glyphs(text, FONTS + font)
    points = (verts - np.array([width / 2, height / 2])) * (length / width)
    points[:, 1] *= stretch
    return dice(points, tris, longest)


def on_panel(snap, start, end, look, reach=0.08):
    """Where type lands on a panel, reading from `start` to `end`, seen looking along `look`."""
    look = np.asarray(look, float) / np.linalg.norm(look)
    start, end = np.asarray(start, float), np.asarray(end, float)
    hit, normal, *_ = snap.tree.ray_cast(Vector((start + end) / 2 - look * 0.3), Vector(look), 1.0)
    centre, facing = np.array(hit), np.array(normal)
    if facing @ look > 0:
        facing = -facing
    along = end - start
    along -= facing * (along @ facing)
    along /= np.linalg.norm(along)
    up = np.cross(facing, along)

    def place(u, v):
        at, normal, *_ = snap.tree.ray_cast(Vector(centre + along * u + up * v + facing * reach), Vector(-facing), reach * 3)
        if at is None:
            return None
        normal = np.array(normal)
        if normal @ facing < 0:
            normal = -normal
        return np.array(at) + normal * LIFT, normal

    return place


def on_can(middle, angle):
    """Where type lands on the silencer: reading from the rear toward the front, on its outer face."""
    start, way, across, up, length = (CAN[k] for k in ("start", "way", "across", "up", "length"))
    out = across if across[0] < 0 else -across
    ts, wide, tall = (0.3, 0.55, 0.82, 0.93), (0.062, 0.064, 0.064, 0.063), (0.075, 0.077, 0.078, 0.077)

    def place(u, v):
        t = middle - u / length
        w, h = np.interp(t, ts, wide), np.interp(t, ts, tall)
        a = angle + v / ((w + h) / 2)
        normal = out * (math.cos(a) / w) + up * (math.sin(a) / h)
        normal /= np.linalg.norm(normal)
        at = start + way * (length * t) + out * (w * math.cos(a)) + up * (h * math.sin(a))
        return at + normal * LIFT, normal

    return place


def stamp(part, lettering, place, right=False):
    """Lays type down. `right` puts it on the far side of the bike, still reading the right way round."""
    points, faces = lettering
    verts = np.zeros((len(points), 3))
    normals = np.zeros((len(points), 3))
    landed = np.zeros(len(points), bool)
    flip = np.array([-1.0, 1.0, 1.0])
    for i, (u, v) in enumerate(points):
        spot = place(-u if right else u, v)
        if spot is None:
            continue
        verts[i], normals[i] = (spot[0] * flip, spot[1] * flip) if right else spot
        landed[i] = True
    if not landed.all():
        print("a mark ran off its panel at", int((~landed).sum()), "of", len(points), "points", flush=True)
    faces = faces[landed[faces].all(1)]
    # Every triangle faces out of the surface, whichever way the font wound it.
    tri = verts[faces]
    facing = np.einsum("ij,ij->i", np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), normals[faces].mean(1))
    faces = np.where((facing < 0)[:, None], faces[:, ::-1], faces)
    part.add_skin("Mark", verts, faces, normals, np.zeros((len(verts), 2)))


def marks(tank_part, tail_part, can_part):
    # The maker's name on the upper flank of the tank, clear of the moulding at its nose.
    tank = SURFACES["tank"]
    place = on_panel(tank, tank.down(0.168, -0.238)[0], tank.down(0.148, -0.082)[0], (-0.78, 0.0, -0.62))
    lettering = set_type("Kawasaki", "verdanaz.ttf", 0.16)
    stamp(tank_part, lettering, place)
    stamp(tank_part, lettering, place, right=True)

    # The model's name on the tail's bright flank: the script, and the small letters under its end.
    tail = SURFACES["tail"]
    look = (-1.0, 0.0, 0.0)
    place = on_panel(tail, tail.side(0.532, 0.880)[0], tail.side(0.652, 0.926)[0], look)
    lettering = set_type("Ninja", "BRUSHSCI.TTF", 0.122, stretch=1.15, longest=0.008)
    stamp(tail_part, lettering, place)
    stamp(tail_part, lettering, place, right=True)
    place = on_panel(tail, tail.side(0.622, 0.885)[0], tail.side(0.664, 0.893)[0], look)
    lettering = set_type("H2R", "seguibli.ttf", 0.042)
    stamp(tail_part, lettering, place)
    stamp(tail_part, lettering, place, right=True)

    # The silencer maker's name, in tall condensed capitals along the can.
    lettering = set_type("AKRAPOVIČ", "impact.ttf", 0.24, longest=0.008)
    stamp(can_part, lettering, on_can(0.62, math.radians(24)))

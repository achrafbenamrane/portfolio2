"""
The street furniture of Algiers, as one kit: the seafront's gilded candelabra and the swan-neck
lanterns, road lamps, flagpoles, bollards and their chains, planters, direction signs, the motorway
gantries, the striped gateway, the clipped ficus trees, the date and fan palms, and the hillside
letters. Hundreds stand near the camera at once, so each is modelled to a triangle budget, and
what a budget can't carry in geometry is carried by cut-out cards.

    python scripts/moto_street_signs.py
    blender --background --python scripts/blender/build_moto_street.py -- <repo root>

Writes public/moto/city/street.glb and src/content/moto-street.json. Each object stands with its
origin on the ground at its base and its front to -y, in metres; moto-street.json lists heights and
attach points in three.js axes.
"""

import json
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import moto_street_signs as sheets  # noqa: E402
from common import script_args  # noqa: E402
from moto_kit import Part, frame_for, grid_faces, loops_of, smooth_path, sweep_frames  # noqa: E402
from moto_paint import plain  # noqa: E402

ROOT = os.path.abspath(script_args()[0])
OUT = os.path.join(ROOT, "public/moto/city/street.glb")
LIST = os.path.join(ROOT, "src/content/moto-street.json")
LETTER_FONT = "C:/Windows/Fonts/cambriab.ttf"

bpy.ops.wm.read_factory_settings(use_empty=True)
collection = bpy.context.scene.collection

M = {
    "StreetIron": plain("StreetIron", (0.012, 0.012, 0.014), rough=0.42, metal=0.6),
    "StreetGold": plain("StreetGold", (0.78, 0.55, 0.22), rough=0.34, metal=1.0),
    "StreetSteel": plain("StreetSteel", (0.34, 0.35, 0.36), rough=0.5, metal=0.85),
    "StreetWhite": plain("StreetWhite", (0.78, 0.78, 0.76), rough=0.42),
    "StreetBronze": plain("StreetBronze", (0.5, 0.3, 0.14), rough=0.38, metal=1.0),
    "LampGlass": plain("LampGlass", (1.0, 0.8, 0.5), rough=0.2),
    "LampHead": plain("LampHead", (1.0, 0.92, 0.8), rough=0.3),
    "SignFace": plain("SignFace", (0.9, 0.9, 0.9), rough=0.5),
    "Leaf": plain("Leaf", (0.1, 0.2, 0.08), rough=0.55),
    "ChainLink": plain("ChainLink", (0.02, 0.02, 0.02), rough=0.4, metal=0.6),
    "GoldLace": plain("GoldLace", (0.78, 0.55, 0.22), rough=0.34, metal=1.0),
    "Bark": plain("Bark", (0.12, 0.09, 0.06), rough=0.85),
    "Whitewash": plain("Whitewash", (0.82, 0.8, 0.74), rough=0.8),
    "Planter": plain("Planter", (0.03, 0.03, 0.035), rough=0.5),
    "Letter": plain("Letter", (0.8, 0.74, 0.68), rough=0.7),
    "Block0": plain("Block0", (0.78, 0.72, 0.58), rough=0.7),
    "Block1": plain("Block1", (0.45, 0.07, 0.06), rough=0.7),
    "Block2": plain("Block2", (0.36, 0.38, 0.42), rough=0.7),
    "Block3": plain("Block3", (0.09, 0.3, 0.12), rough=0.7),
    "Block4": plain("Block4", (0.72, 0.3, 0.07), rough=0.7),
}
TAU = math.tau


# ── low-poly making ──────────────────────────────────────────────────────────────────────────


def unit(v):
    v = np.asarray(v, float)
    return v / max(float(np.linalg.norm(v)), 1e-12)


def wrap(cell, along, around):
    """A UV from a bark cell: `along` the length of the thing, `around` it in two mirrored halves, so it has no seam."""
    return leaf_uv(cell, along, 1 - abs(2 * around - 1))


def turned(part, material, profile, at=(0, 0, 0), axis=(0, 0, 1), sides=12, turn=0.0, flutes=0, depth=0.0, cell=None):
    """
    A profile of (radius, height) turned about an axis, listed from the bottom up so its faces look
    out. A radius of 0 closes to one point, which costs a fan instead of a ring of slivers. `flutes`
    cuts that many grooves down it, `depth` of the radius deep. `cell` wraps a cell of the leaf sheet
    round it.
    """
    a, u, v = frame_for(axis)
    c = np.asarray(at, float)
    count = flutes * 2 if flutes else sides
    angles = turn + np.arange(count) * TAU / count
    ring = np.cos(angles)[:, None] * u + np.sin(angles)[:, None] * v
    if flutes:
        ring = ring * np.where(np.arange(count) % 2, 1 - depth, 1.0)[:, None]
    verts, rows, faces, uvs = [], [], [], []
    for i, (r, h) in enumerate(profile):
        start = sum(len(v_) for v_ in verts)
        if r < 1e-6:
            verts.append((c + a * h)[None, :])
            rows.append([start])
            if cell:
                uvs.append(wrap(cell, i / (len(profile) - 1), 0.5))
        else:
            verts.append(c + a * h + r * ring)
            rows.append(list(range(start, start + count)))
            if cell:
                uvs.extend(wrap(cell, i / (len(profile) - 1), j / count) for j in range(count))
    for low, high in zip(rows, rows[1:]):
        for j in range(count):
            k = (j + 1) % count
            if len(low) == 1:
                faces.append((low[0], high[j], high[k]))
            elif len(high) == 1:
                faces.append((low[j], low[k], high[0]))
            else:
                faces.append((low[j], low[k], high[k], high[j]))
    part.add(material, np.vstack(verts), faces, np.array(uvs) if cell else None)


def bar(part, material, path, radius, sides=6, flat=1.0, normal=None, turn=0.0, cap=True, cell=None):
    """
    A section swept along a path, with no points added to it. `radius` is one number or one per
    point. `normal` holds the section square to a plane, for a scroll, where `flat` makes it deeper
    than it is wide, as a casting is. `cell` wraps a cell of the leaf sheet round it.
    """
    path = np.asarray(path, float)
    count = len(path)
    if normal is None:
        t, u, v = sweep_frames(path)
    else:
        t = np.gradient(path, axis=0)
        t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
        v = np.repeat(unit(normal)[None, :], count, axis=0)
        u = np.cross(v, t)
        u /= np.maximum(np.linalg.norm(u, axis=1, keepdims=True), 1e-9)
    radii = np.broadcast_to(np.asarray(radius, float), (count,))
    angles = turn + np.arange(sides) * TAU / sides
    cos, sin = np.cos(angles)[None, :, None], np.sin(angles)[None, :, None]
    verts = path[:, None, :] + radii[:, None, None] * (cos * u[:, None, :] + sin * flat * v[:, None, :])
    faces = grid_faces(count, sides)
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple((count - 1) * sides + j for j in range(sides)))
    uvs = np.array([wrap(cell, i / (count - 1), j / sides) for i in range(count) for j in range(sides)]) if cell else None
    part.add(material, verts.reshape(-1, 3), faces, uvs)


def fair(path, degrees=22.0):
    """The points a curve needs: one each time it has turned far enough. Returns them and where they fall along it, 0 to 1."""
    path = np.asarray(path, float)
    lengths = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    keep = [0]
    heading = unit(path[1] - path[0])
    limit = math.cos(math.radians(degrees))
    for i in range(1, len(path) - 1):
        step = path[i + 1] - path[i]
        if np.linalg.norm(step) < 1e-9:
            continue
        step = unit(step)
        if float(np.dot(heading, step)) < limit:
            keep.append(i)
            heading = step
    keep.append(len(path) - 1)
    return path[keep], lengths[keep] / lengths[-1]


def volute(centre, radius, start, turns, shrink, way=-1, count=120):
    """A spiral winding in on a centre, its radius falling by `shrink` each whole turn."""
    t = np.linspace(0, 1, count)
    angle = math.radians(start) + way * turns * TAU * t
    r = radius * shrink ** (turns * t)
    return np.stack([centre[0] + r * np.cos(angle), centre[1] + r * np.sin(angle)], axis=1)


def in_plane(points, origin, across):
    """Points drawn as (across, up) placed in the upright plane through `origin` running along `across`."""
    p = np.asarray(points, float)
    return np.asarray(origin, float) + p[:, :1] * np.asarray(across, float) + p[:, 1:2] * np.array([0, 0, 1.0])


def scroll(part, material, drawn, origin, across, wide, narrow, sides=5, flat=1.15, degrees=24.0, belly=0.0):
    """A cast scroll: a strap drawn in an upright plane, tapering along its length, swelling in the middle by `belly`."""
    points, along = fair(drawn, degrees)
    normal = np.cross(np.array([0, 0, 1.0]), np.asarray(across, float))
    radius = (wide + (narrow - wide) * along) * (1 + belly * np.sin(along * math.pi))
    bar(part, material, in_plane(points, origin, across), radius, sides=sides, flat=flat, normal=normal)


def spike(part, material, base, tip, width, normal):
    """One point of a cast leaf: a flattened pyramid, four triangles, its foot buried in what it grows from."""
    base, tip = np.asarray(base, float), np.asarray(tip, float)
    n = unit(normal)
    s = np.cross(n, unit(tip - base))
    verts = [base + s * width, base + n * width * 0.7, base - s * width, base - n * width * 0.7, tip]
    part.add(material, np.array(verts), [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)])


def frill(part, material, drawn, origin, across, every, length, width, start=0.08, stop=0.9, way=1, rake=0.8):
    """
    The ragged edge of acanthus along a scroll: leaf points down one side of it, raked the way it
    runs. `way` of 1 puts them on the left of its direction of travel.
    """
    drawn = np.asarray(drawn, float)
    lengths = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(drawn, axis=0), axis=1))])
    normal = np.cross(np.array([0, 0, 1.0]), np.asarray(across, float))
    for k, at in enumerate(np.arange(start * lengths[-1], stop * lengths[-1], every)):
        i = min(int(np.searchsorted(lengths, at)), len(drawn) - 2)
        t = unit(drawn[i + 1] - drawn[max(i - 1, 0)])
        side = np.array([-t[1], t[0]]) * way
        size = length * (1.0 if k % 2 else 0.72)
        foot, end = drawn[i] - t * width * 1.4, drawn[i] + (side + t * rake) * size
        a, b = in_plane(np.array([foot, end]), origin, across)
        spike(part, material, a, b, width, normal)


def eye(part, material, at, across, radius):
    """The boss at the heart of a volute."""
    centre = in_plane(np.array([at]), (0, 0, 0), across)[0]
    normal = np.cross(np.array([0, 0, 1.0]), np.asarray(across, float))
    turned(part, material, [(0, -radius), (radius * 0.86, -radius * 0.5), (radius * 0.86, radius * 0.5), (0, radius)], at=centre, axis=normal, sides=5)


def thorn(part, material, base, tip, width, bend=(0, 0, 0), sides=3, cell=None):
    """A small cast leaf, or a stump: a curved point."""
    base, tip = np.asarray(base, float), np.asarray(tip, float)
    middle = (base + tip) / 2 + np.asarray(bend, float)
    bar(part, material, [base, middle, tip], [width, width * 0.72, width * 0.08], sides=sides, cell=cell)


def box(part, material, low, high, ends=True):
    """A box from corner to corner. Without `ends` it has no top or bottom, for one stacked on another."""
    (x0, y0, z0), (x1, y1, z1) = low, high
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    if ends:
        faces += [(3, 2, 1, 0), (4, 5, 6, 7)]
    part.add(material, np.array(verts, float), faces)


def leaf_uv(name, s, t):
    return sheets.cell_uv(sheets.LEAF_CELLS, sheets.LEAVES_SIZE, name, s, t)


def sign_uv(name, s, t):
    return sheets.cell_uv(sheets.SIGN_CELLS, sheets.SIGNS_SIZE, name, s, t, inset=0.5)


# ── lit ironwork ─────────────────────────────────────────────────────────────────────────────


def cage(part, low_radius, high_radius, tall, at, turn=0.0):
    """Six panes of glass, wider at the top: a lantern's body."""
    at = np.asarray(at, float)
    angles = turn + np.arange(6) * TAU / 6
    ring = np.stack([np.cos(angles), np.sin(angles), np.zeros(6)], axis=1)
    low = at + ring * low_radius
    high = at + ring * high_radius + np.array([0, 0, tall])
    # Each pane has its own corners, so its UV can run foot to head and across.
    verts, uvs, faces = [], [], []
    for j in range(6):
        k = (j + 1) % 6
        verts += [low[j], low[k], high[k], high[j]]
        uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
        faces.append((j * 4, j * 4 + 1, j * 4 + 2, j * 4 + 3))
    part.add("LampGlass", np.array(verts), faces, np.array(uvs, float))
    return low, high


def crown(part, material, at, low, high, tall, teeth=8):
    """The castellated cap on a candelabra lantern: a little tower flaring to a rim of square teeth."""
    at = np.asarray(at, float)
    n = teeth * 3
    angles = np.arange(n) * TAU / n
    ring = np.stack([np.cos(angles), np.sin(angles), np.zeros(n)], axis=1)
    rise = np.array([0, 0, 1.0])
    # Two points of each tooth stand at full height, and the third is the notch beside them.
    gaps = np.where(np.arange(n) % 3 == 2, 0.66, 1.0)
    verts = [at + ring * low, at + ring * high + rise * tall * 0.74, at + ring * (high * 1.04) + rise * (tall * gaps)[:, None]]
    faces = grid_faces(3, n)
    faces.append(tuple(2 * n + j for j in range(n)))
    part.add(material, np.vstack(verts), faces)


def carriage(part, seat):
    """
    One lantern of a candelabra, standing on a point: a scrolled cup, tall panes in a slender frame,
    a flared hood with a crest of leaves round its rim, and a toothed crown on top. The light in it
    is a flat panel under the hood. Returns the middle of the glass.
    """
    b = np.asarray(seat, float)
    gold = "StreetGold"
    up = np.array([0, 0, 1.0])
    # The cup, then the ring the panes stand in.
    turned(
        part,
        gold,
        [(0, -0.3), (0.05, -0.285), (0.03, -0.24), (0.058, -0.2), (0.036, -0.15), (0.08, -0.095), (0.155, -0.04), (0.2, -0.008), (0.2, 0.014), (0.172, 0.03), (0, 0.03)],
        at=b,
        sides=8,
    )
    # Open scrolls under the ring.
    for k in range(4):
        a = k * TAU / 4 + TAU / 8
        across = np.array([math.cos(a), math.sin(a), 0.0])
        drawn = smooth_path([(0.05, -0.2), (0.125, -0.205), (0.195, -0.165), (0.225, -0.09), (0.195, -0.015)], 0.01)
        scroll(part, gold, drawn, b, across, 0.014, 0.018, sides=3, flat=1.0, degrees=36)

    tall = 0.41
    low, high = cage(part, 0.172, 0.238, tall, b + np.array([0, 0, 0.03]))
    for j in range(6):
        bar(part, gold, [low[j], high[j]], 0.0115, sides=3, cap=False)

    # The hood, from its underside up to the neck, in one piece: an ogee, swept up from a wide rim.
    turned(
        part,
        gold,
        [(0, 0.44), (0.235, 0.44), (0.3, 0.45), (0.355, 0.478), (0.355, 0.5), (0.3, 0.532), (0.235, 0.575), (0.178, 0.64), (0.135, 0.7), (0.112, 0.75)],
        at=b,
        sides=10,
    )
    # The light itself.
    angles = np.arange(6) * TAU / 6
    panel = np.stack([np.cos(angles) * 0.19, np.sin(angles) * 0.19, np.full(6, 0.43)], axis=1) + b
    part.add("LampHead", panel, [tuple(range(5, -1, -1))])

    # A crest of curling leaves round the rim, with small ones between.
    for k in range(6):
        a = k * TAU / 6
        out = np.array([math.cos(a), math.sin(a), 0])
        side = np.array([-out[1], out[0], 0])
        foot = b + out * 0.3 + up * 0.5
        thorn(part, gold, foot, foot + out * 0.1 + up * 0.07, 0.05, bend=up * 0.03 - out * 0.024)
        spike(part, gold, foot + side * 0.12 - out * 0.05, foot + side * 0.13 - out * 0.05 + up * 0.09, 0.034, out)
        spike(part, gold, foot - side * 0.12 - out * 0.05, foot - side * 0.13 - out * 0.05 + up * 0.09, 0.034, out)

    crown(part, gold, b + up * 0.74, 0.094, 0.13, 0.26, teeth=7)
    return b + up * (0.03 + tall * 0.55)


def candelabra_arm(part, turn):
    """
    One of the four arms, drawn in the plane it runs out along, to the proportions of the real ones.
    The arm leaves the shield nearly level, sags, and curls up under its lantern. Below it a shorter
    scroll runs in to the point of the shield, a big spiral sits against the stem above, and tendrils
    and a pendant fill the gaps, with acanthus raggedly down the edges.
    """
    across = np.array([math.cos(turn), math.sin(turn), 0.0])
    origin = np.zeros(3)
    gold = "StreetGold"

    # The arm.
    curl = volute(sheets.ARM_CURL, 0.095, -100, 1.3, 0.42, way=1)
    start = smooth_path([*sheets.SHIELD_ARM, tuple(curl[0])], 0.012)
    line = np.vstack([start, curl[1:]])
    scroll(part, gold, line, origin, across, 0.024, 0.012, sides=5, flat=1.0, belly=0.6)
    frill(part, gold, start, origin, across, 0.1, 0.05, 0.03, start=0.2, stop=0.84, way=-1)
    frill(part, gold, start, origin, across, 0.15, 0.04, 0.026, start=0.15, stop=0.8)
    eye(part, gold, curl[-1], across, 0.028)

    # The edge of the shield, from its point up to a small volute under the arm.
    curl = volute(sheets.EDGE_CURL, 0.058, 190, 1.2, 0.42)
    start = smooth_path([*sheets.SHIELD_EDGE, tuple(curl[0])], 0.012)
    line = np.vstack([start, curl[1:]])
    scroll(part, gold, line, origin, across, 0.02, 0.011, sides=5, flat=1.0, belly=0.6)
    frill(part, gold, start, origin, across, 0.09, 0.05, 0.026, start=0.2, stop=0.95, way=-1)

    # The big spiral.
    curl = volute((0.29, 5.645), 0.2, 95, 1.6, 0.42)
    start = smooth_path([(0.05, 6.03), (0.14, 5.97), tuple(curl[0])], 0.012)
    line = np.vstack([start, curl[1:]])
    scroll(part, gold, line, origin, across, 0.02, 0.012, belly=1.1)
    frill(part, gold, line, origin, across, 0.09, 0.05, 0.026, start=0.1, stop=0.5)
    eye(part, gold, curl[-1], across, 0.036)

    # A tendril off the spiral's shoulder, rising to curl over toward the lantern.
    curl = volute((0.66, 5.86), 0.05, 225, 1.0, 0.42)
    start = smooth_path([(0.45, 5.68), (0.53, 5.72), (0.6, 5.78), tuple(curl[0])], 0.012)
    line = np.vstack([start, curl[1:]])
    scroll(part, gold, line, origin, across, 0.014, 0.009, sides=4, belly=0.5)
    frill(part, gold, start, origin, across, 0.1, 0.042, 0.02, start=0.1, stop=1.0, way=-1)

    # The pendant under the arm, and the stem up to the lantern.
    turned(part, gold, [(0, 5.22), (0.03, 5.255), (0.054, 5.32), (0.04, 5.37), (0.05, 5.41), (0.022, 5.58)], at=across * 0.52, sides=6)
    turned(part, gold, [(0.034, 5.66), (0.056, 5.7), (0.04, 5.74), (0.03, 5.78), (0.044, 5.84)], at=across * 0.86, sides=7)

    # Behind all that, the pierced lace that fills the shield: one cut-out card in the plane of the arm.
    span = [(sheets.LACE_IN, sheets.LACE_FOOT), (sheets.LACE_OUT, sheets.LACE_FOOT), (sheets.LACE_OUT, sheets.LACE_TOP), (sheets.LACE_IN, sheets.LACE_TOP)]
    corners = in_plane(np.array(span), origin, across)
    uvs = [leaf_uv("Lace", 0, 0), leaf_uv("Lace", 1, 0), leaf_uv("Lace", 1, 1), leaf_uv("Lace", 0, 1)]
    normals = np.repeat(unit(np.cross(across, np.array([0, 0, 1.0])))[None, :], 4, axis=0)
    part.add_skin("GoldLace", corners, np.array([(0, 1, 2), (0, 2, 3)]), normals, np.array(uvs))


def candelabra():
    part = Part("Candelabra")
    iron, gold = "StreetIron", "StreetGold"

    # Foot: a square plinth, then a turned drum.
    turned(part, iron, [(0.42, 0), (0.42, 0.13), (0.37, 0.17), (0, 0.17)], sides=4, turn=TAU / 8)
    turned(
        part,
        iron,
        [(0.3, 0.17), (0.3, 0.215), (0.268, 0.24), (0.255, 0.3), (0.285, 0.335), (0.285, 0.37), (0.235, 0.4)],
        sides=12,
    )
    turned(part, gold, [(0.25, 0.4), (0.25, 0.43), (0.222, 0.445)], sides=12)
    # The fluted pedestal.
    turned(part, iron, [(0.215, 0.445), (0.178, 1.28)], flutes=12, depth=0.09)
    turned(part, gold, [(0.19, 1.27), (0.205, 1.295), (0.205, 1.32), (0.18, 1.335)], sides=12)
    # The capital, the urn, and the banded sleeve above it.
    turned(part, iron, [(0.17, 1.335), (0.2, 1.42), (0.262, 1.5), (0.262, 1.535), (0.2, 1.555), (0.12, 1.57)], sides=12)
    turned(part, gold, [(0.105, 1.57), (0.128, 1.63), (0.152, 1.74), (0.142, 1.86), (0.105, 1.96), (0.085, 2.0)], flutes=9, depth=0.1)
    turned(part, gold, [(0.085, 1.98), (0.118, 2.0), (0.118, 2.03), (0.082, 2.05)], sides=10)
    turned(part, iron, [(0.08, 2.05), (0.09, 2.12), (0.082, 2.3)], sides=10)
    turned(part, gold, [(0.082, 2.3), (0.112, 2.32), (0.112, 2.345), (0.08, 2.37)], sides=10)

    # The shaft: fluted iron, thinning all the way to the neck, with bands on it.
    turned(part, iron, [(0.09, 2.37), (0.062, 4.72)], flutes=8, depth=0.12)
    for z, r in ((3.15, 0.092), (3.95, 0.084)):
        turned(part, gold, [(r - 0.018, z - 0.03), (r, z - 0.012), (r, z + 0.012), (r - 0.018, z + 0.03)], sides=8)
    # The bulged iron collar under the head, then a thin neck.
    turned(
        part,
        iron,
        [(0.062, 4.7), (0.1, 4.74), (0.1, 4.77), (0.082, 4.8), (0.098, 4.9), (0.086, 4.99), (0.11, 5.015), (0.11, 5.04), (0.052, 5.07), (0.046, 5.12)],
        sides=10,
    )
    # The gilded stem up through the head.
    turned(part, gold, [(0.058, 5.12), (0.06, 5.75)], flutes=7, depth=0.14)
    turned(part, gold, [(0.058, 5.75), (0.1, 5.79), (0.1, 5.83), (0.06, 5.86), (0.048, 5.92), (0.058, 5.98), (0.06, 6.05), (0.08, 6.08), (0.04, 6.13)], sides=8)

    for k in range(4):
        candelabra_arm(part, k * TAU / 4)

    lamps = [carriage(part, (0, 0, 6.5))]
    for k in range(4):
        a = k * TAU / 4
        lamps.append(carriage(part, (math.cos(a) * 0.86, math.sin(a) * 0.86, 6.13)))
    return part, {"lamps": lamps, "top": (0, 0, 7.5)}, 62


def lantern():
    part = Part("Lantern")
    iron, gold = "StreetIron", "StreetGold"

    # A moulded foot with gilded bands, then a thin tapering post.
    turned(part, iron, [(0.2, 0), (0.2, 0.09), (0.172, 0.125), (0.158, 0.19), (0.175, 0.225), (0.14, 0.26)], sides=12)
    turned(part, iron, [(0.13, 0.26), (0.108, 0.86)], flutes=8, depth=0.09)
    turned(part, gold, [(0.11, 0.85), (0.135, 0.875), (0.135, 0.895), (0.1, 0.92)], sides=12)
    turned(part, iron, [(0.095, 0.92), (0.082, 1.02), (0.104, 1.1), (0.104, 1.13), (0.07, 1.17)], sides=10)
    turned(part, gold, [(0.066, 1.17), (0.098, 1.25), (0.098, 1.3), (0.06, 1.36)], flutes=6, depth=0.1)
    turned(part, iron, [(0.062, 1.36), (0.048, 2.1)], sides=10)
    turned(part, gold, [(0.046, 2.08), (0.066, 2.1), (0.066, 2.13), (0.046, 2.15)], sides=10)
    turned(part, iron, [(0.046, 2.14), (0.043, 2.5)], sides=10)
    turned(part, gold, [(0.041, 2.48), (0.06, 2.5), (0.06, 2.53), (0.04, 2.55)], sides=10)
    turned(part, iron, [(0.041, 2.54), (0.031, 4.3)], sides=10)
    turned(part, gold, [(0.031, 4.28), (0.05, 4.31), (0.05, 4.335), (0.036, 4.35), (0.05, 4.4), (0.032, 4.45), (0, 4.47)], sides=8)

    # The crook: straight up beside the post, over and round into a spiral. Front is -y.
    across = np.array([0, -1.0, 0])
    curl = volute((0.5, 4.62), 0.375, 180, 1.62, 0.5)
    climb = smooth_path([(0.125, 3.36), (0.125, 3.9), (0.125, 4.3), tuple(curl[0])], 0.05)
    scroll(part, iron, np.vstack([climb, curl[1:]]), np.zeros(3), across, 0.02, 0.0125, sides=6, flat=1.0, degrees=8)

    # Two straps tie it to the post.
    for z in (3.42, 4.1):
        bar(part, iron, [(0, 0, z), (0, -0.14, z)], 0.016, sides=5)
        turned(part, iron, [(0.034, z - 0.02), (0.034, z + 0.02)], sides=8)

    # The lantern, hung from the bottom of the spiral.
    hook = np.array([0, -0.5, 4.378])
    glass = hook - np.array([0, 0, 0.82])
    # A pendant under it, and the floor of the cage.
    turned(part, gold, [(0, -0.17), (0.022, -0.155), (0.03, -0.12), (0.022, -0.09), (0.068, -0.05), (0.118, -0.008), (0.125, 0.01), (0, 0.022)], at=glass, sides=8)
    low, high = cage(part, 0.118, 0.195, 0.41, glass + np.array([0, 0, 0.02]))
    for j in range(6):
        bar(part, iron, [low[j], high[j]], 0.011, sides=3, cap=False)
    # A hipped hood with a deep eave, then the cap and the stem up to the hook.
    turned(
        part,
        iron,
        [(0, 0.42), (0.19, 0.42), (0.235, 0.452), (0.235, 0.47), (0.09, 0.62), (0.062, 0.64)],
        at=glass,
        sides=6,
        turn=TAU / 12,
    )
    turned(part, gold, [(0.062, 0.64), (0.07, 0.655), (0.07, 0.675), (0.04, 0.69), (0.034, 0.72), (0, 0.74)], at=glass, sides=8)
    bar(part, iron, [glass + np.array([0, 0, 0.72]), hook + np.array([0, 0, 0.02])], 0.012, sides=4)
    angles = np.arange(6) * TAU / 6
    panel = np.stack([np.cos(angles) * 0.13, np.sin(angles) * 0.13, np.full(6, 0.41)], axis=1) + glass
    part.add("LampHead", panel, [tuple(range(5, -1, -1))])
    return part, {"lamp": glass + np.array([0, 0, 0.24]), "top": (0, 0, 5.0)}, 60


def road_lamp():
    part = Part("RoadLamp")
    steel = "StreetSteel"
    turned(part, steel, [(0.2, 0), (0.2, 0.025), (0.115, 0.03), (0.105, 0.5), (0.098, 0.52), (0.052, 7.6)], sides=10)
    across = np.array([0, -1.0, 0])
    # The arm runs on from the pole and bends out over the road. Front is -y.
    drawn = smooth_path([(0, 7.55), (0.0, 8.2), (0.13, 8.95), (0.62, 9.6), (1.35, 9.93), (2.05, 10.0)], 0.03)
    points, along = fair(drawn, 11)
    bar(part, steel, in_plane(points, (0, 0, 0), across), 0.052 - 0.016 * along, sides=8, cap=False)
    # The flat LED head, in line with the arm, a little down at the nose.
    head = []
    for y, wide, top, under in (
        (-1.98, 0.05, 10.05, 9.96),
        (-2.1, 0.13, 10.055, 9.965),
        (-2.5, 0.16, 10.04, 9.965),
        (-2.78, 0.12, 10.015, 9.96),
        (-2.86, 0.06, 9.995, 9.96),
    ):
        head.append([(-wide, y, under), (wide, y, under), (wide, y, top), (wide * 0.6, y, top + 0.012), (-wide * 0.6, y, top + 0.012), (-wide, y, top)])
    rows = np.array(head)[::-1]
    faces = grid_faces(len(rows), 6)
    faces.append(tuple(range(5, -1, -1)))
    last = (len(rows) - 1) * 6
    faces.append(tuple(last + j for j in range(6)))
    part.add(steel, rows.reshape(-1, 3), faces)
    face = np.array([(-0.125, -2.13, 9.959), (0.125, -2.13, 9.959), (0.125, -2.72, 9.956), (-0.125, -2.72, 9.956)])
    part.add("LampHead", face, [(3, 2, 1, 0)])
    # The door at the foot.
    box(part, steel, (-0.05, -0.116, 0.42), (0.05, -0.098, 0.74))
    return part, {"lamp": (0, -2.42, 9.94), "top": (0, 0, 10.06)}, 50


def flagpole():
    part = Part("Flagpole")
    white, bronze = "StreetWhite", "StreetBronze"
    turned(part, white, [(0.13, 0), (0.13, 0.02), (0.078, 0.05), (0.07, 0.3), (0.034, 9.22)], sides=10)
    for z, r in ((6.2, 0.05), (8.2, 0.044)):
        turned(part, bronze, [(r - 0.012, z - 0.05), (r, z - 0.035), (r, z + 0.035), (r - 0.012, z + 0.05)], sides=10)
    turned(
        part,
        bronze,
        [(0.033, 9.2), (0.048, 9.235), (0.03, 9.27), (0.056, 9.31), (0.052, 9.36), (0.02, 9.42), (0, 9.5)],
        sides=8,
    )
    return part, {"flag": (0, 0, 8.2), "top": (0, 0, 9.5)}, 55


def bollard():
    part = Part("Bollard")
    iron, bronze = "StreetIron", "StreetBronze"
    turned(
        part,
        iron,
        [(0.098, 0), (0.106, 0.06), (0.098, 0.15), (0.058, 0.26), (0.068, 0.295), (0.042, 0.33), (0.038, 0.83), (0.05, 0.85), (0.03, 0.87)],
        sides=7,
    )
    turned(part, bronze, [(0.03, 0.87), (0.058, 0.895), (0.066, 0.935), (0.056, 0.975), (0, 1.0)], sides=7)
    turned(part, bronze, [(0.052, 0.575), (0.052, 0.605)], sides=7)

    # Eyelets at two heights, either side, so a chain runs straight through a line of them.
    eyes = {}
    for side, label in ((1, "Right"), (-1, "Left")):
        for name, z in (("High", 0.74), ("Low", 0.42)):
            near, far = side * 0.03, side * 0.1
            ring = np.array([(near, 0, z + 0.022), (far, 0, z), (near, 0, z - 0.022), (near, 0, z + 0.022)], float)
            bar(part, iron, ring, 0.0085, sides=3, cap=False)
            eyes[f"eyelet{name}{label}"] = (far, 0, z)
    return part, {**eyes, "top": (0, 0, 1.0)}, 55


CHAIN_SAG = 0.2
CHAIN_REACH = 1.1


def chain():
    """
    A hanging span as two crossed strips of cut-out links, a link apart. Real links stand at right
    angles to their neighbours, and that's what the crossing does: each strip shows the rings the
    other sees edge-on.
    """
    part = Part("Chain")
    steps = 14
    width = sheets.LEAF_CELLS["Chain"][3] / sheets.LEAF_CELLS["Chain"][2] * (2 * CHAIN_REACH / sheets.CHAIN_SPAN)
    s = np.linspace(0, 1, steps + 1)
    x = (s * 2 - 1) * CHAIN_REACH
    # A catenary, with its ends at height 0.
    c = 2 * CHAIN_REACH / 4.1
    z = c * (np.cosh(x / c) - math.cosh(CHAIN_REACH / c))
    z = z * (CHAIN_SAG / -z.min()) + 0.74
    path = np.stack([x, np.zeros_like(x), z], axis=1)
    tangent = np.gradient(path, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    up = np.stack([-tangent[:, 2], np.zeros_like(x), tangent[:, 0]], axis=1)
    side = np.array([0, 1.0, 0])
    pitch = sheets.CHAIN_SPAN / sheets.CHAIN_LINKS
    for across, shift, facing in ((up, 0.0, unit(np.array([0, -1.0, 0.5]))), (np.broadcast_to(side, path.shape), pitch, unit(np.array([0, -0.3, 1.0])))):
        verts, uvs, normals = [], [], []
        for i in range(len(path)):
            for edge, t in ((-0.5, 0.0), (0.5, 1.0)):
                verts.append(path[i] + across[i] * edge * width)
                uvs.append(leaf_uv("Chain", s[i] * (sheets.CHAIN_SPAN - pitch) + shift, t))
                normals.append(facing)
        faces = []
        for i in range(len(path) - 1):
            a = i * 2
            faces += [(a, a + 3, a + 1), (a, a + 2, a + 3)]
        part.add_skin("ChainLink", np.array(verts), np.array(faces), np.array(normals), np.array(uvs))
    return part, {"endLeft": (-CHAIN_REACH, 0, 0.74), "endRight": (CHAIN_REACH, 0, 0.74), "top": (0, 0, 0.74)}, 40


# ── greenery ─────────────────────────────────────────────────────────────────────────────────


def blade(part, base, bearing, rise, length, width, droop, steps=3):
    """A strap leaf with a fold down its middle, from a point, arching over."""
    d = np.array([math.cos(bearing), math.sin(bearing), 0.0])
    side = np.array([-d[1], d[0], 0.0])
    verts, uvs, normals, faces = [], [], [], []
    p = np.asarray(base, float)
    for i in range(steps + 1):
        t = i / steps
        e = math.radians(rise) - math.radians(droop) * t * t
        step = length / steps
        forward = d * math.cos(e) + np.array([0, 0, math.sin(e)])
        normal = unit(np.cross(side, forward)) * -1
        normal = normal if normal[2] > 0 else -normal
        half = width * (1 - t**2.2) * (0.5 + 0.5 * min(t * 4, 1))
        fold = normal * half * 0.42
        if i == steps:
            verts.append(p)
            uvs.append(leaf_uv("Blade", 0.5, 1.0))
            normals.append(normal)
            break
        verts += [p - side * half + fold, p, p + side * half + fold]
        uvs += [leaf_uv("Blade", 0.02, t), leaf_uv("Blade", 0.5, t), leaf_uv("Blade", 0.98, t)]
        normals += [unit(normal - side * 0.5), normal, unit(normal + side * 0.5)]
        p = p + forward * step
    for i in range(steps - 1):
        a = i * 3
        faces += [(a, a + 3, a + 1), (a + 1, a + 3, a + 4), (a + 1, a + 4, a + 2), (a + 2, a + 4, a + 5)]
    a = (steps - 1) * 3
    faces += [(a, a + 3, a + 1), (a + 1, a + 3, a + 2)]
    part.add_skin("Leaf", np.array(verts), np.array(faces), np.array(normals), np.array(uvs))


def card(part, centre, normal, size, cell, rng, fluff=None, spin=None):
    """
    A square of foliage. Its corners' normals lean out from `fluff`, a point in the middle of the
    crown, so light rolls across the whole crown and not across each flat card.
    """
    n = unit(normal)
    helper = np.array([0, 0, 1.0]) if abs(n[2]) < 0.9 else np.array([1.0, 0, 0])
    u = unit(np.cross(n, helper))
    v = np.cross(n, u)
    a = rng.random() * TAU if spin is None else spin
    u, v = u * math.cos(a) + v * math.sin(a), v * math.cos(a) - u * math.sin(a)
    half = size / 2
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    verts = np.array([centre + u * x * half + v * y * half for x, y in corners])
    uvs = np.array([leaf_uv(cell, (x + 1) / 2, (y + 1) / 2) for x, y in corners])
    if fluff is None:
        normals = np.repeat(n[None, :], 4, axis=0)
    else:
        normals = np.array([unit(unit(p - fluff) * 0.8 + n * 0.5) for p in verts])
    part.add_skin("Leaf", verts, np.array([(0, 1, 2), (0, 2, 3)]), normals, uvs)


def planter():
    part = Part("Planter")
    rng = np.random.default_rng(1902)
    # A tapered square box with a lip, then the earth in it.
    turned(part, "Planter", [(0.29, 0), (0.45, 0.84), (0.47, 0.845), (0.47, 0.88), (0.43, 0.885), (0.42, 0.84), (0, 0.84)], sides=4, turn=TAU / 8)

    # A low skirt of leaves over the edge.
    centre = np.array([0, 0, 0.9])
    for k in range(40):
        a = rng.random() * TAU
        r = 0.12 + rng.random() * 0.34
        p = np.array([math.cos(a) * r, math.sin(a) * r, 0.92 + rng.random() * 0.26 - r * 0.2])
        card(part, p, unit(p - centre + rng.standard_normal(3) * 0.4), 0.34 + rng.random() * 0.2, rng.choice(["Ficus0", "Ficus1", "Ficus2"]), rng, fluff=centre)

    # The little spiky palm: a stub of trunk and a burst of stiff blades.
    turned(part, "Bark", [(0.05, 0.84), (0.042, 1.24), (0, 1.3)], sides=6, cell="BarkBoot")
    count = 50
    for k in range(count):
        t = k / count
        bearing = k * 2.399963 + rng.normal(0, 0.1)
        rise = 86 - 74 * t**0.9 + rng.normal(0, 4)
        blade(part, (0, 0, 1.2 + rng.random() * 0.08), bearing, rise, 0.72 + rng.random() * 0.2, 0.024, 8 + 26 * t, steps=2)
    return part, {"top": (0, 0, 2.0)}, 50


def palm_trunk(part, path, radii, sides, cell, rows, jitter=0.0, material="Bark"):
    """A trunk with its bark from the sheet, wrapped round as two mirrored halves, so it stays sharp and has no seam."""
    drawn = smooth_path(path, 0.02)
    lengths = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(drawn, axis=0), axis=1))])
    at = np.linspace(0, lengths[-1], rows)
    points = np.stack([np.interp(at, lengths, drawn[:, i]) for i in range(3)], axis=1)
    t, u, v = sweep_frames(points)
    angles = np.arange(sides) * TAU / sides
    r = np.interp(at / lengths[-1], np.linspace(0, 1, len(radii)), radii)
    verts, uvs, count = [], [], len(points)
    for i in range(count):
        for j in range(sides):
            bump = 1.0 + (jitter * (1 if (i + j) % 2 else -1) if 0 < i < count - 1 else 0)
            verts.append(points[i] + r[i] * bump * (math.cos(angles[j]) * u[i] + math.sin(angles[j]) * v[i]))
            uvs.append(leaf_uv(cell, i / (count - 1), 1 - abs(2 * j / sides - 1)))
    part.add(material, np.array(verts), grid_faces(count, sides), np.array(uvs))
    return points[-1]


def ficus():
    part = Part("Ficus")
    rng = np.random.default_rng(1830)
    # The trunk, whitewashed to the height of a man's chest, then forking under the crown.
    foot = [(0, 0, 0), (0.02, 0.01, 0.45), (0.06, -0.01, 0.9), (0.09, 0.01, 1.3)]
    palm_trunk(part, foot, [0.36, 0.25, 0.225, 0.21], 9, "BarkFicus", 4, material="Whitewash")
    trunk = [(0.09, 0.01, 1.3), (0.08, 0.03, 1.8), (0.1, 0.0, 2.25)]
    palm_trunk(part, trunk, [0.21, 0.2, 0.2], 9, "BarkFicus", 3)
    # Limbs that fork off low and wander up into the crown.
    up = np.array([0, 0, 1.0])
    for k in range(7):
        a = k * TAU / 7 + 0.4 + rng.normal(0, 0.18)
        out = np.array([math.cos(a), math.sin(a), 0])
        side = np.array([-out[1], out[0], 0])
        start = np.array([0.09, 0.0, 1.95 + 0.12 * (k % 3)])
        reach = 0.95 + rng.random() * 0.8
        rise = 0.75 + rng.random() * 0.7
        wander = rng.normal(0, 0.14, 2)
        drawn = [
            start,
            start + out * reach * 0.3 + up * rise * 0.28 + side * wander[0],
            start + out * reach * 0.62 + up * rise * 0.72 - side * wander[1],
            start + out * reach + up * rise * 1.2 + side * wander[1],
        ]
        points, along = fair(smooth_path(drawn, 0.05), 13)
        bar(part, "Bark", points, 0.125 - 0.085 * along, sides=6, cap=False, cell="BarkFicus")

    # The crown: clipped flat underneath, domed above, and lumpy with the clumps that grow back.
    middle = np.array([0.0, 0.0, 4.08])
    wide, tall = 2.72, 1.62
    bumps = [unit(rng.standard_normal(3) * np.array([1, 1, 0.55]) + np.array([0, 0, 0.2])) for _ in range(30)]

    def lumps(d):
        return min(sum(0.12 * math.exp(-(np.linalg.norm(d - b) / 0.36) ** 2) for b in bumps), 0.17)

    def shell(d):
        """How far the crown's surface is along a direction."""
        d = unit(d)
        low = tall if d[2] > 0 else tall * 0.74
        base = 1 / math.sqrt((d[0] ** 2 + d[1] ** 2) / wide**2 + d[2] ** 2 / low**2)
        return base * (0.9 + lumps(d))

    # A dark core inside it, so the crown never shows the sky through its middle.
    verts, uvs, normals, faces = [], [], [], []
    rows, sides = 8, 12
    for i in range(rows + 1):
        e = -math.pi / 2 + math.pi * i / rows
        for j in range(sides):
            a = j * TAU / sides
            d = np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])
            verts.append(middle + d * shell(d) * 0.84)
            normals.append(d)
            uvs.append(leaf_uv("Shade", (j % 2) * 0.96 + 0.02, (i % 2) * 0.96 + 0.02))
    for i in range(rows):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            if i > 0:
                faces.append((a, b, b + sides))
            if i < rows - 1:
                faces.append((a, b + sides, a + sides))
    part.add_skin("Leaf", np.array(verts), np.array(faces), np.array(normals), np.array(uvs))

    cards = 900
    for k in range(cards):
        # Spread evenly over the crown, with fewer underneath, where the clippers leave it thin.
        z = 1 - 2 * (k + 0.5) / cards
        a = k * 2.399963
        d = np.array([math.sqrt(1 - z * z) * math.cos(a), math.sqrt(1 - z * z) * math.sin(a), z])
        d = unit(d + rng.standard_normal(3) * 0.05)
        if d[2] < -0.5 and rng.random() < 0.4:
            continue
        depth = 0.9 + rng.random() * 0.13
        p = middle + d * shell(d) * depth
        # Most lie along the surface, like tiles. One in six stands off it and breaks the outline.
        n = unit(d + rng.standard_normal(3) * (0.95 if k % 6 == 0 else 0.34))
        light = 0.5 + 0.42 * d[2] + (lumps(d) - 0.08) * 2.2 + (depth - 0.96) * 2.0 + rng.normal(0, 0.05)
        cell = "Ficus3" if light < 0.32 else "Ficus2" if light < 0.56 else "Ficus1" if light < 0.8 else "Ficus0"
        card(part, p, n, 0.68 + rng.random() * 0.3, cell, rng, fluff=middle)
    return part, {"top": (0, 0, 6.0)}, 55


def frond(part, start, bearing, elevation, length, droop, cell, steps=7, roll=0.0, half=0.5, fold=30.0, middle=None):
    """
    A pinnate frond: a rib that climbs, arches and falls, with a strip of leaflets either side,
    folded up off the rib in a shallow V as a real one is.
    """
    d = np.array([math.cos(bearing), math.sin(bearing), 0.0])
    side = np.array([-d[1], d[0], 0.0])
    p = np.asarray(start, float)
    verts, uvs, normals = [], [], []
    step = length / steps
    f = math.radians(fold)
    for i in range(steps + 1):
        t = i / steps
        e = elevation + (droop - elevation) * t**1.5
        forward = d * math.cos(e) + np.array([0, 0, math.sin(e)])
        up = np.cross(side, forward) * -1
        up = up if up[2] > -0.01 or e < -1.2 else -up
        twist = roll * t
        s = side * math.cos(twist) + up * math.sin(twist)
        n = up * math.cos(twist) - side * math.sin(twist)
        # Wide from the foot to two thirds along, then closing, which the leaflets also do.
        w = half * (0.42 + 0.58 * min(t / 0.25, 1)) * (1 - 0.3 * max(t - 0.6, 0) / 0.4)
        left = p - s * w * math.cos(f) + n * w * math.sin(f)
        right = p + s * w * math.cos(f) + n * w * math.sin(f)
        verts += [left, p, right]
        uvs += [leaf_uv(cell, t, 1.0), leaf_uv(cell, t, 0.0), leaf_uv(cell, t, 1.0)]
        out = n if middle is None else unit(n * 0.75 + unit(p - middle) * 0.5)
        normals += [unit(out - s * 0.35), out, unit(out + s * 0.35)]
        p = p + forward * step
    faces = []
    for i in range(steps):
        a = i * 3
        faces += [(a, a + 4, a + 1), (a, a + 3, a + 4), (a + 1, a + 5, a + 2), (a + 1, a + 4, a + 5)]
    part.add_skin("Leaf", np.array(verts), np.array(faces), np.array(normals), np.array(uvs))


def date_palm():
    part = Part("Palm")
    rng = np.random.default_rng(1962)
    trunk_top = 5.45
    spine = [(0, 0, 0), (0.05, 0.02, 1.8), (0.14, 0.0, 3.7), (0.22, -0.03, trunk_top)]
    top = palm_trunk(part, spine, [0.56, 0.42, 0.39, 0.37, 0.35, 0.36], 10, "BarkDate", 14, jitter=0.022)

    # Where the fronds come from: a head of old leaf bases, wider than the trunk.
    turned(part, "Bark", [(0.36, -0.1), (0.46, 0.22), (0.47, 0.5), (0.34, 0.86), (0.13, 1.1), (0, 1.14)], at=top, sides=10, cell="BarkBoot")
    middle = top + np.array([0, 0, 0.8])

    # Stumps of cut fronds under the head.
    for k in range(18):
        a = k * 2.399963
        out = np.array([math.cos(a), math.sin(a), 0])
        foot = top + out * 0.36 + np.array([0, 0, -0.34 + 0.05 * (k % 6)])
        thorn(part, "Bark", foot, foot + out * 0.3 + np.array([0, 0, 0.3]), 0.1, sides=3, cell="BarkBoot")

    count = 84
    cells = ("Frond0", "Frond1", "Frond2")
    for k in range(count):
        t = k / (count - 1)
        bearing = k * 2.399963 + rng.normal(0, 0.08)
        # The newest stand almost straight up; the oldest have fallen right over.
        elevation = math.radians(82 - 92 * t**0.85 + rng.normal(0, 5))
        droop = math.radians(30 - 100 * t**0.8 + rng.normal(0, 7))
        length = 2.5 + 0.95 * math.sin(min(t * 1.5, 1) * math.pi / 2) + rng.random() * 0.22
        a = np.array([math.cos(bearing), math.sin(bearing), 0])
        foot = top + a * 0.2 + np.array([0, 0, 0.95 - 0.8 * t])
        frond(
            part,
            foot,
            bearing,
            elevation,
            length,
            droop,
            cells[k % 3],
            roll=rng.normal(0, 0.45),
            half=0.5,
            middle=middle,
        )
    return part, {"top": (0, 0, 9.0), "crown": middle}, 60


def fan_leaf(part, start, bearing, elevation, stem, radius, cell, droop=0.5, pleat=0.09, middle=None, flip=1):
    """A washingtonia leaf: a long stem, then a fan with pleats, its ends hanging over."""
    d = np.array([math.cos(bearing), math.sin(bearing), 0.0])
    side = np.array([-d[1], d[0], 0.0])
    forward = d * math.cos(elevation) + np.array([0, 0, math.sin(elevation)])
    normal = unit(np.cross(forward, side)) * -1
    normal = normal if normal[2] > 0 else -normal
    p0 = np.asarray(start, float)
    hub = p0 + forward * stem - np.array([0, 0, 0.08 * stem])
    bar(part, "Bark", [p0, (p0 + hub) / 2 + np.array([0, 0, 0.03]), hub], [0.035, 0.026, 0.02], sides=3, cap=False, cell="BarkBoot")
    spokes, rings = 7, (0.0, 0.42, 0.78, 1.0)
    verts, uvs, faces = [], [], []
    for r in rings:
        for k in range(spokes):
            a = math.radians(-92 + 184 * k / (spokes - 1))
            flat_x, flat_y = math.sin(a) * r, math.cos(a) * r
            lift = pleat * r * (1 if k % 2 else -1)
            fall = droop * r * r * (0.7 + 0.5 * abs(math.sin(a)))
            verts.append(hub + side * flat_x * radius + forward * flat_y * radius + normal * lift * radius + np.array([0, 0, -fall * radius]))
            uvs.append(leaf_uv(cell, 0.5 + flip * flat_x * 0.5 * 0.97, 0.035 + flat_y * 0.93))
    for i in range(len(rings) - 1):
        for k in range(spokes - 1):
            a, b = i * spokes + k, (i + 1) * spokes + k
            if i == 0:
                faces.append((a, b, b + 1))
            else:
                faces += [(a, b + 1, a + 1), (a, b, b + 1)]
    # Normals come from the drooped surface itself, so they always agree with the way it's wound.
    verts = np.array(verts)
    normals = np.zeros_like(verts)
    for f in faces:
        n = np.cross(verts[f[1]] - verts[f[0]], verts[f[2]] - verts[f[0]])
        normals[list(f)] += n
    normals = np.array([unit(n) for n in normals])
    if middle is not None:
        normals = np.array([unit(n + unit(p - middle) * 0.3) for n, p in zip(normals, verts)])
    part.add_skin("Leaf", verts, np.array(faces), normals, np.array(uvs))


def washingtonia():
    part = Part("Washingtonia")
    rng = np.random.default_rng(1871)
    trunk_top = 11.45
    spine = [(0, 0, 0), (0.08, 0.03, 4), (0.22, 0.02, 8), (0.42, -0.02, trunk_top)]
    top = palm_trunk(part, spine, [0.42, 0.26, 0.235, 0.215, 0.2, 0.2], 8, "BarkFan", 11, jitter=0.012)
    # The boots: a tan, cross-hatched head where the leaf bases stay on.
    turned(part, "Bark", [(0.2, -0.75), (0.31, -0.35), (0.345, 0.1), (0.27, 0.48), (0.09, 0.72), (0, 0.76)], at=top, sides=8, cell="BarkBoot")
    for k in range(14):
        a = k * 2.399963
        out = np.array([math.cos(a), math.sin(a), 0])
        foot = top + out * 0.27 + np.array([0, 0, -0.55 + 0.075 * k])
        thorn(part, "Bark", foot, foot + out * 0.2 + np.array([0, 0, 0.36]), 0.075, sides=3, cell="BarkBoot")
    middle = top + np.array([0, 0, 0.5])

    # A few dead leaves hang under the head, of uneven lengths. Most of the skirt has been cut away.
    for k in range(7):
        bearing = k * 2.399963 + rng.normal(0, 0.2)
        foot = top + np.array([math.cos(bearing) * 0.26, math.sin(bearing) * 0.26, -0.3 + 0.08 * (k % 3)])
        fan_leaf(part, foot, bearing, math.radians(-78 + rng.normal(0, 6)), 0.2 + rng.random() * 0.25, 0.7 + rng.random() * 0.45, "FanDead", droop=0.1, pleat=0.16)

    count = 19
    for k in range(count):
        t = k / (count - 1)
        bearing = k * 2.399963 + rng.normal(0, 0.1)
        elevation = math.radians(72 - 96 * t**0.9 + rng.normal(0, 5))
        foot = top + np.array([math.cos(bearing) * 0.12, math.sin(bearing) * 0.12, 0.66 - 0.5 * t])
        fan_leaf(part, foot, bearing, elevation, 1.2 + 0.4 * rng.random(), 1.2 + 0.24 * rng.random(), "Fan0", droop=0.34 + 0.3 * t, middle=middle, flip=1 if k % 2 else -1)
    return part, {"top": (0, 0, 14.0), "crown": middle}, 60


# ── signs ────────────────────────────────────────────────────────────────────────────────────


def plate(part, place, pointing, centre_z, pole_at=0.42):
    """A direction plate: a shallow black box with a sign face both sides. The pole runs through it."""
    outline = np.array(sheets.plate_outline(0.0, 1))
    inner = np.array(sheets.plate_outline(0.014, 1))
    length, tall = sheets.PLATE_LENGTH, sheets.PLATE_TALL
    if pointing == "L":
        # Mirrored, and turned round so it still runs anticlockwise.
        outline = np.array([length, 0]) + outline[::-1] * np.array([-1, 1])
        inner = np.array([length, 0]) + inner[::-1] * np.array([-1, 1])
        shift = -length * (1 - pole_at)
    else:
        shift = -length * pole_at
    n = len(outline)
    depth = 0.055
    z0 = centre_z - tall / 2

    def spot(points, y):
        return np.stack([points[:, 0] + shift, np.full(len(points), y), points[:, 1] + z0], axis=1)

    # In the drawing x runs right and z up, which seen from -y is anticlockwise as drawn.
    rows = [spot(inner, -depth + 0.004), spot(outline, -depth), spot(outline, depth), spot(inner, depth - 0.004)]
    faces = [(i * n + (j + 1) % n, i * n + j, (i + 1) * n + j, (i + 1) * n + (j + 1) % n) for i in range(3) for j in range(n)]
    part.add("StreetIron", np.vstack(rows), faces)

    other = "L" if pointing == "R" else "R"
    front = rows[0]
    uv_front = [sign_uv(f"{place}.{pointing}", p[0] / length, p[1] / tall) for p in inner]
    part.add("SignFace", front, [tuple(range(n))], np.array(uv_front))
    back = rows[3]
    uv_back = [sign_uv(f"{place}.{other}", 1 - p[0] / length, p[1] / tall) for p in inner]
    part.add("SignFace", back, [tuple(range(n - 1, -1, -1))], np.array(uv_back))


def signpost(name, plates):
    """A black post, galvanised above head height, with its plates stacked at the top."""
    part = Part(name)
    gap = 0.05
    stack = len(plates) * sheets.PLATE_TALL + (len(plates) - 1) * gap
    high = 2.62 + stack
    turned(part, "StreetIron", [(0.34, 0), (0.34, 0.05), (0.3, 0.07), (0, 0.07)], sides=4, turn=TAU / 8)
    turned(part, "StreetIron", [(0.095, 0.07), (0.075, 0.12), (0.064, 0.2), (0.058, 1.95), (0.07, 1.97), (0.07, 2.02), (0.05, 2.05)], sides=10)
    turned(part, "StreetSteel", [(0.046, 2.05), (0.042, high + 0.12)], sides=10)
    turned(part, "StreetIron", [(0.05, high + 0.12), (0.05, high + 0.16), (0.03, high + 0.2), (0, high + 0.21)], sides=10)
    top_z = 2.54 + stack - sheets.PLATE_TALL / 2
    for i, (place, pointing) in enumerate(plates):
        plate(part, place, pointing, top_z - i * (sheets.PLATE_TALL + gap))
    return part, {"top": (0, 0, high + 0.21), "plates": [(0, 0, top_z - i * (sheets.PLATE_TALL + gap)) for i in range(len(plates))]}, 40


GANTRY_SPAN = 15.2  # Post to post: a 14 m carriageway and its hard strips.
GANTRY_MIDDLE = 7.66


def gantry(name, cell, tall):
    """
    An overhead sign on a galvanised box truss. Along the bottom of the panel a row of floodlights
    on short arms light its face, which is how a sign reads at night out of range of the street lamps.
    """
    part = Part(name)
    steel = "StreetSteel"
    half = GANTRY_SPAN / 2
    z0, z1 = 6.85, 8.45
    y0, y1 = -0.4, 0.4

    for side in (-1, 1):
        x = side * half
        turned(part, steel, [(0.56, 0), (0.56, 0.03), (0.23, 0.05), (0.2, z1 + 0.28), (0, z1 + 0.34)], at=(x, 0, 0), sides=10, turn=TAU / 20)
        for y in (y0, y1):
            for z in (z0, z1):
                bar(part, steel, [(x, 0, z), (x, y, z)], 0.05, sides=5, cap=False)
    # Four chords.
    for y in (y0, y1):
        for z in (z0, z1):
            bar(part, steel, [(-half, y, z), (half, y, z)], 0.075, sides=6, cap=False)
    # Lacing, zigzagging along each face of the truss.
    bays = 12
    xs = np.linspace(-half, half, bays + 1)
    for i in range(bays):
        a, b = xs[i], xs[i + 1]
        flip = i % 2
        for y in (y0, y1):
            bar(part, steel, [(a, y, z0 if flip else z1), (b, y, z1 if flip else z0)], 0.032, sides=3, cap=False)
        for z in (z0, z1):
            bar(part, steel, [(a, y0 if flip else y1, z), (b, y1 if flip else y0, z)], 0.028, sides=3, cap=False)
    for x in xs[1:-1:2]:
        for y in (y0, y1):
            bar(part, steel, [(x, y, z0), (x, y, z1)], 0.028, sides=3, cap=False)

    # The panel, hung off the front of the truss.
    wide = sheets.GANTRY_WIDE
    bottom = GANTRY_MIDDLE - tall / 2
    top = bottom + tall
    y = y0 - 0.26
    corners = np.array([(-wide / 2, y, bottom), (wide / 2, y, bottom), (wide / 2, y, top), (-wide / 2, y, top)])
    uvs = [sign_uv(cell, 0, 0), sign_uv(cell, 1, 0), sign_uv(cell, 1, 1), sign_uv(cell, 0, 1)]
    part.add("SignFace", corners, [(0, 1, 2, 3)], np.array(uvs))
    box(part, steel, (-wide / 2 - 0.02, y + 0.001, bottom - 0.02), (wide / 2 + 0.02, y + 0.05, top + 0.02))
    # Rails on its back, and the posts that tie them to the truss.
    rails = 2 if tall < 3 else 3
    for z in np.linspace(bottom + 0.4, top - 0.4, rails):
        box(part, steel, (-wide / 2 + 0.1, y + 0.05, z - 0.05), (wide / 2 - 0.1, y + 0.13, z + 0.05), ends=False)
    for x in np.linspace(-wide / 2 + 0.5, wide / 2 - 0.5, 4):
        box(part, steel, (x - 0.05, y + 0.13, bottom + 0.2), (x + 0.05, y + 0.26, top - 0.2), ends=False)

    # Floodlights on arms under the panel's foot, looking back up at its face.
    lights = []
    for x in np.linspace(-wide / 2 + 1.6, wide / 2 - 1.6, 4):
        arm = 1.05
        bar(part, steel, [(x, y + 0.03, bottom + 0.08), (x, y - arm * 0.6, bottom - 0.03), (x, y - arm, bottom - 0.12)], 0.024, sides=4, cap=False)
        box(part, steel, (x - 0.26, y - arm - 0.1, bottom - 0.2), (x + 0.26, y - arm + 0.1, bottom - 0.08))
        glow = np.array([(x - 0.23, y - arm + 0.102, bottom - 0.19), (x + 0.23, y - arm + 0.102, bottom - 0.19), (x + 0.23, y - arm + 0.102, bottom - 0.09), (x - 0.23, y - arm + 0.102, bottom - 0.09)])
        part.add("LampHead", glow, [(3, 2, 1, 0)])
        lights.append((x, y - arm, bottom - 0.14))
    return part, {"panel": (0, y, GANTRY_MIDDLE), "panelSize": (wide, 0, tall), "floodlights": lights, "top": (0, 0, max(top, z1 + 0.34))}, 50


def totem():
    """The striped gateway: two pillars of painted blocks carrying a banded beam."""
    part = Part("Totem")
    half = 10.45
    side = 0.55
    stacks = ([4, 1, 2, 0, 1, 3, 0, 2], [3, 0, 1, 2, 4, 0, 3, 1])
    height = 11.0
    each = height / 8
    groove = 0.035
    for x, order in zip((-half, half), stacks):
        box(part, "Block2", (x - side - 0.2, -side - 0.2, 0), (x + side + 0.2, side + 0.2, 0.28))
        z = 0.28
        rise = (height - 0.28) / 8
        for colour in order:
            box(part, f"Block{colour}", (x - side, -side, z + groove), (x + side, side, z + rise), ends=False)
            box(part, "Block2", (x - side + 0.04, -side + 0.04, z), (x + side - 0.04, side - 0.04, z + groove), ends=False)
            z += rise
    # The beam runs out over both pillars, its stripes square to its length.
    stripes = [0, 1, 4, 3, 0, 2, 1, 0, 3, 4, 1, 2]
    beam = 22.0
    edges = np.linspace(-beam / 2, beam / 2, len(stripes) + 1)
    z0, z1, depth = height, 12.0, 0.6
    for i, colour in enumerate(stripes):
        box(part, f"Block{colour}", (edges[i], -depth, z0), (edges[i + 1], depth, z1))
    return part, {"top": (0, 0, 12.0)}, 40


def letters():
    """WELCOME TO ALGIERS, as big solid letters standing on a hillside and leaning back into it."""
    part = Part("Letters")
    curve = bpy.data.curves.new("Type", "FONT")
    curve.body = "WELCOME TO ALGIERS"
    curve.font = bpy.data.fonts.load(LETTER_FONT)
    curve.resolution_u = 2
    curve.space_word = 0.72
    curve.space_character = 0.97
    holder = bpy.data.objects.new("Type", curve)
    bpy.context.scene.collection.objects.link(holder)
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    mesh.calc_loop_triangles()
    flat = np.array([v.co[:2] for v in mesh.vertices])
    tris = np.array([t.vertices[:] for t in mesh.loop_triangles])
    bpy.data.objects.remove(holder)

    cap = 2.2
    flat = flat - np.array([flat[:, 0].min(), 0])
    wide = flat[:, 0].max()
    scale = cap / mesh_cap_height(flat)
    flat = flat * np.array([26.0 / wide, scale]) - np.array([13.0, 0])
    flat[:, 1] -= min(flat[:, 1].min(), 0)

    lean = math.radians(14)
    depth = 0.34
    up = np.array([0, math.sin(lean), math.cos(lean)])
    back = np.array([0, math.cos(lean), -math.sin(lean)])

    def stand(points, z):
        return points[:, :1] * np.array([1.0, 0, 0]) + points[:, 1:2] * up + z * back

    # In a font's outline, looking at it, faces run anticlockwise, which from -y means toward the viewer.
    count = len(flat)
    verts = [stand(flat, 0.0), stand(flat, depth)]
    faces = [tuple(f) for f in tris.tolist()]
    for loop in loops_of(tris.tolist()):
        m = len(loop)
        for j in range(m):
            a, b = loop[j], loop[(j + 1) % m]
            faces.append((b, a, a + count, b + count))
    part.add("Letter", np.vstack(verts), faces)
    return part, {"top": (0, 0, cap * math.cos(lean))}, 40


def mesh_cap_height(flat):
    """The flat tops of the capitals, ignoring the overshoot of the round ones."""
    tops = np.sort(flat[:, 1])
    return float(tops[int(len(tops) * 0.92)])


# ── making the kit ───────────────────────────────────────────────────────────────────────────

KIT = [
    candelabra,
    lantern,
    road_lamp,
    flagpole,
    bollard,
    chain,
    planter,
    lambda: signpost("Signpost", [("BabElOued", "L"), ("Bologhine", "L"), ("RaisHamidou", "L")]),
    lambda: signpost("Signpost2", [("ElBiar", "R"), ("Hydra", "R"), ("ElMouradia", "R")]),
    lambda: signpost("Signpost3", [("PlaceDesMartyrs", "L"), ("GrandePoste", "R"), ("MaqamEchahid", "R"), ("DjamaaElDjazair", "L")]),
    lambda: gantry("Gantry", "GantryBlue", sheets.GANTRY_TALL),
    lambda: gantry("GantryGreen", "GantryGreen", sheets.GANTRY_GREEN_TALL),
    totem,
    ficus,
    date_palm,
    washingtonia,
    letters,
]


def game_axes(value):
    """A Blender point in three.js axes, to the millimetre. glTF export_yup gives (x, z, -y)."""
    x, y, z = (float(v) for v in value)
    return [round(x, 3), round(z, 3), round(-y + 0.0, 3)]


listing = {
    "units": "metres",
    "axes": "three.js: x across, y up, +z the object's front; origin on the ground at its base",
    "objects": {},
}
for make in KIT:
    part, attach, angle = make()
    root = part.build(M, collection, angle=angle)
    triangles = 0
    low = np.full(3, np.inf)
    high = np.full(3, -np.inf)
    materials = []
    for item in root.children:
        item.data.calc_loop_triangles()
        triangles += len(item.data.loop_triangles)
        points = np.array([v.co for v in item.data.vertices])
        low, high = np.minimum(low, points.min(0)), np.maximum(high, points.max(0))
        materials.extend(m.name for m in item.data.materials)
    # The top is measured, not asked for: whatever really stands highest, above where it was aimed.
    attach["top"] = (*attach["top"][:2], float(high[2]))
    points = {}
    for key, value in attach.items():
        if key == "panelSize":
            continue
        many = isinstance(value, list)
        points[key] = [game_axes(v) for v in value] if many else game_axes(value)
    entry = {"height": round(float(high[2]), 3), "triangles": triangles, "materials": sorted(set(materials))}
    entry["size"] = [round(float(high[0] - low[0]), 3), round(float(high[2] - low[2]), 3), round(float(high[1] - low[1]), 3)]
    if "panelSize" in attach:
        entry["panelSize"] = [attach["panelSize"][0], attach["panelSize"][2]]
    if points:
        entry["attach"] = points
    listing["objects"][part.name] = entry
    print(f"{part.name:14s} {triangles:6d} tris  {entry['size']}", flush=True)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_materials="EXPORT",
    export_image_format="NONE",
    export_normals=True,
    export_yup=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=14,
)
with open(LIST, "w", encoding="utf-8") as file:
    json.dump(listing, file, indent=2)
    file.write("\n")
total = sum(entry["triangles"] for entry in listing["objects"].values())
print("Packed street", round(os.path.getsize(OUT) / 1e6, 3), "MB", "triangles", total, flush=True)

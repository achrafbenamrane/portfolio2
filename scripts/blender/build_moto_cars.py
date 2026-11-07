"""
The traffic of Algiers: a small hatchback, a saloon that doubles as the yellow taxi, a compact SUV
and a white city bus, all original to this game. They're seen from a few metres at night, so each
is built the way a real one is: pressed panels with gaps between them, glass you can see a cabin
through, lamps with something inside, and wheels with spokes and a brake disc behind.

A body is three kinds of surface. The perimeter (`Wrap`) runs from the middle of the nose, round
the corner and along the flank to the middle of the tail, so a bumper, a lamp or a door is drawn on
it unrolled, the way a designer draws it. Hood and boot lid are height fields (`Dome`) over the
plan. The glasshouse is a `Skin` of sections standing on the belt line. Lines are then drawn on
those surfaces and a seed dropped in each panel (`carve`), which is how one sheet becomes a door, a
wing and a lamp that all fit together.

    blender --background --python scripts/blender/build_moto_cars.py -- <repo root> [preview <folder> [names]]

Naming vehicles after `preview` builds only those and leaves cars.glb alone. CAR_VIEWS=front34,side
picks which views are rendered. Previews run on the CPU: the GPU is usually busy.
"""

import math
import os
import shutil
import subprocess
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import add_camera, script_args  # noqa: E402
from moto_kit import Part, Skin, V, frame_for, hermite, inside, lathe, loft, loops_of, spline_basis, tube  # noqa: E402
from moto_paint import Graph  # noqa: E402

ARGS = script_args()
ROOT = os.path.abspath(ARGS[0])
OUT = os.path.join(ROOT, "public/moto/city/cars.glb")
PREVIEW = ARGS[2] if len(ARGS) > 2 and ARGS[1] == "preview" else None
ONLY = ARGS[3:] if PREVIEW else []
bpy.ops.wm.read_factory_settings(use_empty=True)
collection = bpy.context.scene.collection

CREASE = 6.0
SOFT = 1.0
PLATES = 8


# ── small tools ──────────────────────────────────────────────────────────────────────────────


def ease(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def curve(table):
    """A smooth curve through rows of (x, y)."""
    xs = np.array([row[0] for row in table], float)
    ys = np.array([row[1] for row in table], float)

    def read(x):
        out = hermite(xs, ys, np.atleast_1d(np.asarray(x, float)))
        return out if np.ndim(x) else float(out[0])

    return read


def trace(points, step=0.08, closed=False):
    """A line through points of (a, b) or (a, b, radius): long runs coarse, round corners fine."""
    pts = [np.array(p[:2], float) for p in points]
    radii = [p[2] if len(p) > 2 else 0.0 for p in points]
    n = len(pts)
    arcs = []
    for i in range(n):
        p, r = pts[i], radii[i]
        if r <= 0 or (not closed and i in (0, n - 1)):
            arcs.append([p])
            continue
        da, db = pts[i - 1] - p, pts[(i + 1) % n] - p
        la, lb = np.linalg.norm(da), np.linalg.norm(db)
        d = min(r, la * 0.48, lb * 0.48)
        s, e = p + da / la * d, p + db / lb * d
        turn = math.pi - math.acos(float(np.clip(np.dot(da / la, db / lb), -1, 1)))
        count = max(int(turn / 0.3) + 2, 3)
        arcs.append([(1 - t) ** 2 * s + 2 * (1 - t) * t * p + t * t * e for t in np.linspace(0, 1, count)])
    out = []
    for i in range(n if closed else n - 1):
        out.extend(arcs[i])
        a, b = arcs[i][-1], arcs[(i + 1) % n][0]
        count = int(np.linalg.norm(b - a) / step)
        out.extend(a + (b - a) * t for t in np.linspace(0, 1, count + 2)[1:-1])
    if not closed:
        out.extend(arcs[-1])
    return np.array(out)


def cross2(a, b):
    return a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]


def clearance(points, lines):
    """How far each point is from a set of lines."""
    best = np.full(len(points), np.inf)
    for line, closed in lines:
        a = line if closed else line[:-1]
        b = np.roll(line, -1, axis=0) if closed else line[1:]
        d = b - a
        for start in range(0, len(a), 128):
            s, e = a[start : start + 128], d[start : start + 128]
            rel = points[:, None, :] - s[None, :, :]
            t = np.clip((rel * e).sum(2) / np.maximum((e * e).sum(1), 1e-12), 0, 1)
            gap = rel - t[..., None] * e[None, :, :]
            best = np.minimum(best, np.sqrt((gap * gap).sum(2)).min(1))
    return best


# ── surfaces ─────────────────────────────────────────────────────────────────────────────────


class Sheet(Skin):
    """A surface you can draw on. Flat coordinates are (a, b): along it, and metres down from its top edge."""

    def at(self, a, b):
        return self.point(np.asarray(a, float), np.asarray(b, float) / self.height)

    def facing(self, a, b):
        return self.normal(np.asarray(a, float), np.asarray(b, float) / self.height)

    def b(self, a, where):
        return float(where) * self.height if isinstance(where, V) else float(self.v_at(a, where)[0]) * self.height

    def line(self, points, step=0.08):
        return trace([(p[0], self.b(p[0], p[1]), *p[2:]) for p in points], step), False

    def loop(self, points, step=0.08):
        return trace([(p[0], self.b(p[0], p[1]), *p[2:]) for p in points], step, closed=True), True

    def domain(self):
        return self.ys[0], self.ys[-1], 0.0, self.height

    def rows(self, axis, low, high, across, grid, turn):
        """Where lattice rows go along one axis: closer together where the surface bends."""
        t = np.linspace(low, high, 260)
        density = np.zeros(259)
        for o in across:
            fixed = np.full(260, o)
            p = self.at(t, fixed) if axis == 0 else self.at(fixed, t)
            d = np.diff(p, axis=0)
            length = np.maximum(np.linalg.norm(d, axis=1), 1e-9)
            way = d / length[:, None]
            bend = np.arccos(np.clip((way[1:] * way[:-1]).sum(1), -1, 1))
            bend = np.concatenate([bend, bend[-1:]])
            density = np.maximum(density, length / grid + bend / turn)
        total = np.concatenate([[0], np.cumsum(density)])
        return np.interp(np.linspace(0, total[-1], max(int(total[-1]), 1) + 1), total, t)[1:-1]


class Plan:
    """The car seen from above, from the middle of the nose to the middle of the tail: a cubic spline."""

    def __init__(self, controls):
        c = np.array(controls, float)
        p = spline_basis(np.linspace(0, 1, 5000), len(c)) @ c
        p[-1] = c[-1]
        self.along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
        self.length = float(self.along[-1])
        self.p = p
        way = np.gradient(p, axis=0)
        way /= np.maximum(np.linalg.norm(way, axis=1, keepdims=True), 1e-12)
        self.n = np.stack([way[:, 1], -way[:, 0]], axis=1)
        self.widest = int(np.argmax(p[:, 0]))

    def at(self, s):
        s = np.asarray(s, float)
        place = [np.interp(s, self.along, self.p[:, i]) for i in (0, 1)]
        out = [np.interp(s, self.along, self.n[:, i]) for i in (0, 1)]
        return np.stack(place, axis=-1), np.stack(out, axis=-1)

    def sy(self, y):
        """Where along the perimeter a side-view position is."""
        return float(np.interp(y, self.p[:, 1], self.along))

    def sx(self, x, tail=False):
        """Where along the perimeter a front or rear view position is."""
        if tail:
            return float(np.interp(-x, -self.p[self.widest :, 0], self.along[self.widest :]))
        return float(np.interp(x, self.p[: self.widest, 0], self.along[: self.widest]))


class Wrap(Sheet):
    """The perimeter: at each place along the plan, a section of (out, z) points from the top down."""

    def __init__(self, plan, stations):
        # Mirrored past both ends, so the surface crosses the middle of the car with no crease in it.
        mirrored = [(-stations[1][0], stations[1][1]), *stations, (2 * plan.length - stations[-2][0], stations[-2][1])]
        super().__init__(mirrored)
        self.plan = plan

    def domain(self):
        return 0.0, self.plan.length, 0.0, self.height

    def point(self, y, v):
        flat = super().point(y, v)
        place, out = self.plan.at(flat[:, 1])
        return np.stack([place[:, 0] + flat[:, 0] * out[:, 0], place[:, 1] + flat[:, 0] * out[:, 1], flat[:, 2]], axis=1)

    def side(self, y):
        return self.plan.sy(y)

    def front(self, x):
        return self.plan.sx(x)

    def rear(self, x):
        return self.plan.sx(x, tail=True)


class Dome(Sheet):
    """A height field over the plan: flat coordinates are (y, x)."""

    def __init__(self, field):
        self.field = field
        self.height = 2.0

    def point(self, y, v):
        x = np.asarray(v, float) * self.height
        return np.stack([x, np.asarray(y, float) + 0 * x, self.field(x, np.asarray(y, float))], axis=1)


# ── cutting panels ───────────────────────────────────────────────────────────────────────────


def seed(at, mat="CarBody", lift=0.0, gap=0.006, roll=0.0012, drop=0.012, edge=True, inward=False, wall="CarTrim"):
    return {"at": at, "mat": mat, "lift": lift, "gap": gap, "roll": roll, "drop": drop, "edge": edge, "inward": inward, "wall": wall}


def cut_panel(sheet, part, flat_all, tris, opts, mirror, flipped=False):
    """Puts one region of a carved sheet on the car, with a small rolled edge all the way round."""
    used, faces = np.unique(tris, return_inverse=True)
    faces = faces.reshape(-1, 3)
    flat = flat_all[used].copy()
    area = cross2(flat[faces[:, 1]] - flat[faces[:, 0]], flat[faces[:, 2]] - flat[faces[:, 0]])
    faces[area < 0] = faces[area < 0][:, ::-1]
    loops = loops_of(faces.tolist())

    # Where the two halves of the car meet there's no gap and no edge.
    middle = np.abs(sheet.at(flat[:, 0], flat[:, 1])[:, 0]) < 0.0015
    inset = opts["gap"] / 2
    moved = flat.copy()
    if inset > 0:
        for loop in loops:
            pts = flat[loop]
            e1 = pts - np.roll(pts, 1, axis=0)
            e2 = np.roll(pts, -1, axis=0) - pts
            e1 /= np.maximum(np.linalg.norm(e1, axis=1, keepdims=True), 1e-9)
            e2 /= np.maximum(np.linalg.norm(e2, axis=1, keepdims=True), 1e-9)
            n1 = np.stack([-e1[:, 1], e1[:, 0]], axis=1)
            n2 = np.stack([-e2[:, 1], e2[:, 0]], axis=1)
            bisect = n1 + n2
            bisect /= np.maximum(np.linalg.norm(bisect, axis=1, keepdims=True), 1e-9)
            scale = 1 / np.maximum((bisect * n1).sum(1), 0.5)
            moved[loop] = pts + bisect * (scale * inset)[:, None]
        axis = sheet.centre_axis
        moved[middle, axis] = flat[middle, axis]

    position = sheet.at(moved[:, 0], moved[:, 1])
    normals = sheet.facing(moved[:, 0], moved[:, 1])
    position = position + normals * opts["lift"]
    tri = position[faces]
    if np.sum(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]) * normals[faces].mean(1)) < 0:
        faces = faces[:, ::-1]
        loops = [loop[::-1] for loop in loops]

    flip = np.array([-1.0, 1.0, 1.0])
    if opts["inward"]:
        normals, faces = -normals, faces[:, ::-1]
    if not flipped:
        part.add_skin(opts["mat"], position, faces, normals, moved)
    if mirror or flipped:
        part.add_skin(opts["mat"], position * flip, faces[:, ::-1], normals * flip, moved)
    if not opts["edge"]:
        return

    # The wall of the shut line: dark, so the line reads whatever the angle or the paint.
    verts, norms, tris_out = [], [], []
    total = 0
    for loop in loops:
        p, n = position[loop], normals[loop]
        # Neither the middle of the car nor its underside needs one.
        on_middle = middle[loop] | (moved[loop, 1] > sheet.height * 0.985)
        d = np.roll(p, -1, axis=0) - np.roll(p, 1, axis=0)
        d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-12)
        out = np.cross(d, n)
        m = len(loop)
        verts += [p, p + out * opts["roll"] - n * opts["drop"]]
        norms += [out, out]
        near, far = np.arange(total, total + m), np.arange(total + m, total + 2 * m)
        ahead = np.roll(np.arange(m), -1)
        keep = ~(on_middle & on_middle[ahead])
        tris_out.append(np.stack([near, far, far[ahead]], axis=1)[keep])
        tris_out.append(np.stack([near, far[ahead], near[ahead]], axis=1)[keep])
        total += 2 * m
    if verts:
        verts, norms, tris_out = np.vstack(verts), np.vstack(norms), np.vstack(tris_out)
        uvs = np.zeros((len(verts), 2))
        if not flipped:
            part.add_skin(opts["wall"], verts, tris_out, norms, uvs)
        if mirror or flipped:
            part.add_skin(opts["wall"], verts * flip, tris_out[:, ::-1], norms * flip, uvs)


def carve(sheet, part, seeds, seams=(), outer=None, grid=0.1, turn=0.24, step=0.1, mirror=True, flip=False):
    """
    Draws `seams` on a sheet and lifts out the panels they enclose. A seed marks a panel: it floods
    out to the nearest lines, and it can be a list when one outline is several layers deep, like a
    lamp's lens and the housing behind it. Anywhere without a seed is left open.
    """
    if outer is None:
        a0, a1, b0, b1 = sheet.domain()
        outer = trace([(a0, b0), (a1, b0), (a1, b1), (a0, b1)], step, closed=True)
    lines = [(outer, True), *seams]
    points, edges = [], []
    for line, closed in lines:
        start = len(points)
        points.extend(map(tuple, line))
        m = len(line)
        edges.extend((start + i, start + i + 1) for i in range(m - 1))
        if closed:
            edges.append((start + m - 1, start))

    low, high = outer.min(0), outer.max(0)
    along = sheet.rows(0, low[0], high[0], np.linspace(low[1], high[1], 7)[1:-1], grid, turn)
    down = sheet.rows(1, low[1], high[1], np.linspace(low[0], high[0], 9)[1:-1], grid, turn)
    lattice = np.stack(np.meshgrid(along, down, indexing="ij"), axis=-1).reshape(-1, 2)
    spacing = np.minimum.outer(np.gradient(along), np.gradient(down)).reshape(-1) if len(along) > 1 and len(down) > 1 else np.full(len(lattice), grid)
    within = inside(lattice, outer)
    lattice, spacing = lattice[within], spacing[within]
    if len(lattice):
        # Close to a line only where rows are close together, which is where the sheet bends.
        lattice = lattice[clearance(lattice, lines) > np.minimum(spacing * 0.55, grid * 0.34)]
    points.extend(map(tuple, lattice))

    verts, out_edges, faces, _, from_edges, _ = delaunay_2d_cdt([Vector(p) for p in points], edges, [], 0, 1e-6)
    verts = np.array([tuple(v) for v in verts])
    faces = np.array([f for f in faces if len(f) == 3])
    walls = {tuple(sorted(e)) for e, source in zip(out_edges, from_edges) if source}
    touching = {}
    for index, f in enumerate(faces.tolist()):
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            touching.setdefault((min(a, b), max(a, b)), []).append(index)

    tri = verts[faces]
    taken = np.zeros(len(faces), bool)
    for item in seeds:
        layers = item if isinstance(item, list) else [item]
        p = np.array(layers[0]["at"], float)
        a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
        d0 = cross2(b - a, p - a)
        d1 = cross2(c - b, p - b)
        d2 = cross2(a - c, p - c)
        hits = np.nonzero(((d0 >= 0) & (d1 >= 0) & (d2 >= 0)) | ((d0 <= 0) & (d1 <= 0) & (d2 <= 0)))[0]
        if not len(hits):
            raise ValueError(f"Seed outside the sheet at {p}")
        region, stack = {int(hits[0])}, [int(hits[0])]
        while stack:
            f = faces[stack.pop()].tolist()
            for u, v in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
                key = (min(u, v), max(u, v))
                if key in walls:
                    continue
                for other in touching[key]:
                    if other not in region:
                        region.add(other)
                        stack.append(other)
        region = np.array(sorted(region))
        if taken[region].any():
            print("  two seeds in one panel at", p, flush=True)
        taken[region] = True
        for opts in layers:
            cut_panel(sheet, part, verts, faces[region], opts, mirror, flip)


def ribbon(sheet, part, material, line, width, lift=0.001, mirror=True, flip=False):
    """A strip laid along a line on a surface: a moulding, a row of LEDs, a seal."""
    line = line[0] if isinstance(line, tuple) else line
    tangent = np.gradient(line, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-9)
    across = np.stack([-tangent[:, 1], tangent[:, 0]], axis=1)
    rows = [line - across * width / 2, line + across * width / 2]
    verts, norms = [], []
    for row in rows:
        n = sheet.facing(row[:, 0], row[:, 1])
        verts.append(sheet.at(row[:, 0], row[:, 1]) + n * lift)
        norms.append(n)
    verts, norms = np.vstack(verts), np.vstack(norms)
    m = len(line)
    faces = []
    for i in range(m - 1):
        faces += [(i, i + 1, m + i + 1), (i, m + i + 1, m + i)]
    faces = np.array(faces)
    tri = verts[faces]
    if np.sum(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]) * norms[faces].mean(1)) < 0:
        faces = faces[:, ::-1]
    uvs = np.zeros((len(verts), 2))
    other = np.array([-1.0, 1.0, 1.0])
    if flip:
        verts, norms, faces = verts * other, norms * other, faces[:, ::-1]
    part.add_skin(material, verts, faces, norms, uvs)
    if mirror:
        part.add_skin(material, verts * other, faces[:, ::-1], norms * other, uvs)


Sheet.centre_axis = 1
Wrap.centre_axis = 0


# ── finishes ─────────────────────────────────────────────────────────────────────────────────


def finishes():
    """Only the names reach the game, which has its own. These are for looking at the cars here."""
    made = {
        "CarBody": Graph("CarBody").set(colour=(0.62, 0.64, 0.67), metal=0.45, rough=0.34, coat=1.0, coat_rough=0.04),
        "BusBody": Graph("BusBody").set(colour=(0.86, 0.86, 0.84), metal=0.0, rough=0.34, coat=1.0, coat_rough=0.06),
        "CarGlass": Graph("CarGlass").set(colour=(0.012, 0.014, 0.018), rough=0.03, alpha=0.6, specular=1.0),
        "CarLens": Graph("CarLens").set(colour=(0.9, 0.92, 0.95), rough=0.02, alpha=0.16, specular=1.0),
        "CarTrim": Graph("CarTrim").set(colour=(0.014, 0.014, 0.016), rough=0.55),
        "CarGloss": Graph("CarGloss").set(colour=(0.01, 0.01, 0.012), rough=0.14, coat=1.0, coat_rough=0.03),
        "CarTyre": Graph("CarTyre").set(colour=(0.018, 0.018, 0.019), rough=0.82),
        "CarRim": Graph("CarRim").set(colour=(0.62, 0.63, 0.65), metal=1.0, rough=0.28),
        "CarDisc": Graph("CarDisc").set(colour=(0.3, 0.3, 0.31), metal=1.0, rough=0.42),
        "CarChrome": Graph("CarChrome").set(colour=(0.86, 0.87, 0.88), metal=1.0, rough=0.08),
        "CarHead": Graph("CarHead").set(colour=(1, 1, 1), emission=(1.0, 0.92, 0.76), glow=26.0),
        "CarTail": Graph("CarTail").set(colour=(0.5, 0.01, 0.01), emission=(1.0, 0.03, 0.015), glow=16.0),
        "CarTailGlow": Graph("CarTailGlow").set(colour=(0.3, 0.005, 0.004), emission=(1.0, 0.02, 0.01), glow=2.2),
        "CarTailLens": Graph("CarTailLens").set(colour=(0.16, 0.004, 0.006), rough=0.1, coat=1.0, coat_rough=0.02),
        "CarAmber": Graph("CarAmber").set(colour=(0.8, 0.3, 0.02), rough=0.15, coat=1.0, coat_rough=0.03),
        "CarInterior": Graph("CarInterior").set(colour=(0.05, 0.05, 0.055), rough=0.7),
        "CarPlate": Graph("CarPlate").set(colour=(0.9, 0.9, 0.9), rough=0.42),
        "BusSign": Graph("BusSign").set(colour=(0.1, 0.05, 0.0), emission=(1.0, 0.56, 0.12), glow=7.0),
        "BusGlow": Graph("BusGlow").set(colour=(1, 1, 1), emission=(1.0, 0.93, 0.8), glow=3.0),
        "TaxiLamp": Graph("TaxiLamp").set(colour=(1, 1, 1), emission=(1.0, 0.9, 0.5), glow=5.0),
    }
    return {name: graph.material for name, graph in made.items()}


M = finishes()


# ── finishing a vehicle ──────────────────────────────────────────────────────────────────────


def solid_chunk(verts, faces, uvs, angle=38):
    """Smooths a turned or swept piece by angle and returns it as triangles with their own normals."""
    mesh = bpy.data.meshes.new("Chunk")
    mesh.from_pydata(verts.tolist(), [], faces)
    mesh.update()
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=math.radians(angle))
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    corners = np.zeros(count * 3, dtype=np.int32)
    mesh.loop_triangles.foreach_get("loops", corners)
    loop_vertex = np.zeros(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get("vertex_index", loop_vertex)
    normals = np.zeros(len(mesh.loops) * 3)
    mesh.corner_normals.foreach_get("vector", normals)
    normals = normals.reshape(-1, 3)
    bpy.data.meshes.remove(mesh)
    which = loop_vertex[corners]
    place, facing, map_at = verts[which], normals[corners], uvs[which]
    key = np.round(np.hstack([place * 1e5, facing * 1e3, map_at * 1e3])).astype(np.int64)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return place[first], inverse.reshape(-1, 3), facing[first], map_at[first]


def finish(part, name):
    """One object, one material slot per finish, every normal set by hand: reflections run clean."""
    chunks = {}
    for material, (verts, faces, uvs, _) in part.solid.items():
        chunks.setdefault(material, []).append(solid_chunk(np.vstack(verts), faces, np.vstack(uvs)))
    for material, (verts, faces, normals, uvs, _) in part.skins.items():
        chunks.setdefault(material, []).append((np.vstack(verts), np.vstack(faces), np.vstack(normals), np.vstack(uvs)))
    place, facing, map_at, tris, slots = [], [], [], [], []
    total = 0
    mesh = bpy.data.meshes.new(name)
    for slot, (material, pieces) in enumerate(chunks.items()):
        mesh.materials.append(M[material])
        for verts, faces, normals, uvs in pieces:
            tri = verts[faces]
            good = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) > 1e-10
            place.append(verts)
            facing.append(normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9))
            map_at.append(uvs)
            tris.append(faces[good] + total)
            slots.append(np.full(int(good.sum()), slot))
            total += len(verts)
    place, facing, map_at = np.vstack(place), np.vstack(facing), np.vstack(map_at)
    tris, slots = np.vstack(tris), np.concatenate(slots)
    mesh.from_pydata(place.tolist(), [], tris.tolist())
    mesh.polygons.foreach_set("material_index", slots.astype(np.int32))
    layer = mesh.uv_layers.new(name="UVMap")
    corners = np.zeros(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get("vertex_index", corners)
    layer.data.foreach_set("uv", map_at[corners].ravel())
    mesh.update()
    mesh.shade_smooth()
    mesh.normals_split_custom_set_from_vertices(facing.tolist())
    item = bpy.data.objects.new(name, mesh)
    collection.objects.link(item)
    return item


# ── the body, from a design ──────────────────────────────────────────────────────────────────


def perimeter(c):
    """The sheet that runs round the car, from nose to tail, between the top edge and the sill."""
    plan = Plan(c["plan"])
    total = plan.length
    n0, n1 = c["nose_blend"]
    t0, t1 = total - c["tail_blend"][1], total - c["tail_blend"][0]
    places = np.unique(np.concatenate([np.linspace(0, n1, 9), np.linspace(n1, t0, 18), np.linspace(t0, total, 9)]))
    weights = c["weights"]
    stations = []
    for s in places:
        place, out = plan.at(np.array([s]))
        place, out = place[0], out[0]
        nose, tail = 1 - float(ease(n0, n1, s)), float(ease(t0, t1, s))
        rows = c["flank"](place[1]) * (1 - nose - tail) + np.array(c["nose"], float) * nose + np.array(c["tail"], float) * tail
        rim = place + rows[0, 0] * out
        rows[0, 1] = c["top"](rim[0], rim[1])
        rows[1, 1] = rows[0, 1] - rows[1, 1]
        stations.append((s, [(row[0], row[1], weights[i]) for i, row in enumerate(rows)]))
    return Wrap(plan, stations)


def greenhouse(c):
    """The glasshouse: sections from the middle of the roof to just inside the belt."""
    stations = []
    for y in np.linspace(c["cabin"][0], c["cabin"][1], 24):
        top, rail, wide = c["roof"](y), c["rail"](y), c["rail_x"](y)
        foot, reach = c["cabin_foot"](y), c["cabin_x"](y)
        drop = top - rail
        rows = [
            (0, top),
            (0.3 * wide, top),
            (0.64 * wide, top - 0.26 * drop),
            (0.9 * wide, top - 0.74 * drop),
            (wide + 0.016, rail - 0.012, 3.0),
            (wide + (reach - wide) * 0.42 + 0.004, rail + (foot - rail) * 0.42),
            (wide + (reach - wide) * 0.8 + 0.002, rail + (foot - rail) * 0.8),
            (reach, foot),
            (reach + 0.008, foot - 0.09),
        ]
        stations.append((y, rows))
    return Sheet(stations)


def plan_edge(wrap, s_from, s_to, count=60):
    """The top edge of the perimeter in plan, as (y, x) for a Dome."""
    s = np.linspace(s_from, s_to, count)
    p = wrap.point(s, np.zeros(count))
    return np.stack([p[:, 1], p[:, 0]], axis=1)


def glass_foot(cabin, lid, reach, rear=False, shift=0.0, count=12):
    """Where glass goes under a lid, worked out exactly, as a line on the glass."""
    ys = np.linspace(cabin.ys[0], cabin.ys[-1], 500)
    line = []
    for b in np.linspace(0.0, reach, count):
        p = cabin.at(ys, np.full(500, b))
        above = p[:, 2] - lid.field(p[:, 0], ys)
        order = np.nonzero(above > 0)[0]
        i = order[-1] if rear else order[0]
        j = min(max(i + 1 if rear else i - 1, 0), 499)
        t = above[i] / max(above[i] - above[j], 1e-9) if i != j else 0.0
        line.append((ys[i] + (ys[j] - ys[i]) * t + (-shift if rear else shift), b))
    line = np.array(line)
    return np.vstack([[line[0, 0], -0.05], line]), False


def door_tops(body, cabin, ys, under=0.0):
    """Where the flank goes in under the side glass, worked out exactly: a line on the flank."""
    bs = np.linspace(body.height * 0.45, 0.0, 240)
    line = []
    for y in ys:
        s = body.side(y)
        p = body.at(np.full(240, s), bs)
        section = cabin.point(np.full(300, y), np.linspace(cabin.greville[3], 1, 300))
        outside = p[:, 0] - np.interp(-p[:, 2], -section[:, 2], section[:, 0])
        cross = np.nonzero(outside < 0)[0]
        i = cross[0] if len(cross) else 239
        line.append((s, bs[max(i - 1, 0)] - under))
    return np.array(line), False


def arch(wrap, c, axle_y, grow=0.0):
    """A wheel opening in the flank, drawn past the bottom of the sheet."""
    s0 = wrap.side(axle_y)
    r = c["arch"] + grow
    centre = c["wheel"] + c.get("arch_lift", 0.012)
    points = []
    for t in np.linspace(math.radians(-104), math.radians(104), 30):
        s, z = s0 + r * math.sin(t), centre + r * math.cos(t)
        points.append((s, wrap.b(s, z)))
    pts = np.array(points)
    pts = np.vstack([[pts[0, 0], wrap.height + 0.08], pts, [pts[-1, 0], wrap.height + 0.08]])
    return pts, False


# ── wheels ───────────────────────────────────────────────────────────────────────────────────


def tyre_and_rim(name, radius, width, rim, spokes=5, twin=0.11, spoke_wide=0.017, hub=0.078, dish=0.5):
    """
    One wheel, hub at the origin, turning about x, its face toward +x. Spun by the game, so the
    brake caliper stays on the car. `rim` is the radius at the bead.
    """
    part = Part(name)
    h = width / 2
    centre = (0, 0, 0)
    wall = radius - rim
    tyre = [
        (rim + 0.004, -h * 0.82),
        (radius - wall * 0.3, -h * 0.97),
        (radius - 0.003, -h * 0.74),
        (radius, -h * 0.3),
        (radius, h * 0.3),
        (radius - 0.003, h * 0.74),
        (radius - wall * 0.34, h * 1.0),
        (rim + wall * 0.16, h * 0.96),
        (rim, h * 0.84),
    ]
    lathe(part, "CarTyre", tyre, centre, (1, 0, 0), segments=24)

    # The rim: a polished lip, then the barrel running back into the dark.
    lip = [
        (rim + 0.008, h * 0.86),
        (rim + 0.006, h * 0.9),
        (rim - 0.006, h * 0.88),
        (rim - 0.02, h * 0.42),
        (rim - 0.024, -h * 0.72),
    ]
    lathe(part, "CarRim", lip, centre, (1, 0, 0), segments=24)

    # Spokes: twins from the hub, dished back from the face, tapering to the lip.
    face = h * 0.8
    inner = rim - 0.012
    for index in range(spokes):
        base = index / spokes * math.tau
        for side in (-1, 1) if twin else (0,):
            tip_angle = base + side * twin
            root_angle = base + side * twin * 0.3
            rings = []
            for t in (0.0, 0.5, 1.0):
                r = hub * 0.72 + (inner - hub * 0.72) * t
                angle = root_angle + (tip_angle - root_angle) * t
                radial = np.array([0, math.cos(angle), math.sin(angle)])
                tangent = np.array([0, -math.sin(angle), math.cos(angle)])
                x = face - dish * h * (1 - (2 * t - 1) ** 2) * 0.42 - (1 - t) * h * 0.1
                wide = spoke_wide * (1.26 - 0.5 * t)
                deep = 0.03 * (1.25 - 0.55 * t)
                section = [(-wide, -deep), (wide, -deep), (wide, -deep * 0.25), (wide * 0.6, 0), (-wide * 0.6, 0), (-wide, -deep * 0.25)]
                rings.append([radial * r + tangent * a + np.array([x + b, 0, 0]) for a, b in section])
            loft(part, "CarRim", rings, cap=False)

    # The hub and its cap, and the bolts round it.
    boss = face - h * 0.1
    lathe(part, "CarRim", [(hub, boss - 0.05), (hub, boss - 0.004), (hub * 0.9, boss), (hub * 0.46, boss + 0.003)], centre, (1, 0, 0), segments=15)
    lathe(part, "CarGloss", [(hub * 0.46, boss + 0.003), (hub * 0.42, boss + 0.0085), (0.0, boss + 0.011)], centre, (1, 0, 0), segments=12)
    for index in range(5):
        angle = (index + 0.5) / 5 * math.tau
        at = np.array([boss + 0.0035, math.cos(angle) * hub * 0.72, math.sin(angle) * hub * 0.72])
        lathe(part, "CarTrim", [(0.0105, 0), (0, 0.001)], at, (1, 0, 0), segments=7)

    # The disc, its bell and the dust shield behind it.
    disc = rim * 0.68
    at = -h * 0.02
    lathe(part, "CarDisc", [(disc, at - 0.026), (disc, at), (disc * 0.5, at + 0.03), (0.0, at + 0.03)], centre, (1, 0, 0), segments=16)
    lathe(part, "CarTrim", [(rim - 0.024, -h * 0.72), (0, -h * 0.72)], centre, (1, 0, 0), segments=12)
    return part


# ── what every car has ───────────────────────────────────────────────────────────────────────


def pad(part, material, a, b, wide, deep, sides=8, across=(1.0, 0.0, 0.0)):
    """A soft block from a to b: seat cushions, headrests, a dashboard."""
    a, b = np.array(a, float), np.array(b, float)
    way = b - a
    way /= np.linalg.norm(way)
    u = np.array(across, float)
    u = u - way * np.dot(u, way)
    u /= np.linalg.norm(u)
    v = np.cross(way, u)
    angles = np.linspace(0, math.tau, sides, endpoint=False) + math.pi / sides
    rings = []
    for t, scale in ((0.0, 0.8), (0.1, 1.0), (1.0, 0.8)):
        c, s = np.cos(angles), np.sin(angles)
        round_u = np.sign(c) * np.abs(c) ** 0.55 * wide / 2 * scale
        round_v = np.sign(s) * np.abs(s) ** 0.55 * deep / 2 * scale
        rings.append(a + (b - a) * t + round_u[:, None] * u + round_v[:, None] * v)
    loft(part, material, rings)


def seats(part, c):
    """Enough of a cabin to catch the light through the glass."""
    front, back, floor = c["seat_front"], c["seat_rear"], c["seat_floor"]
    lean = 0.17
    for side in (-1, 1):
        x = side * c["seat_x"]
        pad(part, "CarInterior", (x, front - 0.28, floor + 0.13), (x, front + 0.22, floor + 0.11), 0.47, 0.16)
        pad(part, "CarInterior", (x, front + 0.2, floor + 0.1), (x, front + 0.2 + lean, floor + 0.68), 0.46, 0.14)
        pad(part, "CarInterior", (x, front + 0.2 + lean * 1.1, floor + 0.73), (x, front + 0.2 + lean * 1.2, floor + 0.9), 0.24, 0.1)
        pad(part, "CarInterior", (x, back + 0.27, floor + 0.67), (x, back + 0.3, floor + 0.84), 0.23, 0.1)
    pad(part, "CarInterior", (-0.62, back - 0.05, floor + 0.14), (0.62, back - 0.05, floor + 0.14), 0.5, 0.17, across=(0.0, 1.0, 0.0))
    pad(part, "CarInterior", (-0.62, back + 0.2, floor + 0.38), (0.62, back + 0.2, floor + 0.38), 0.15, 0.6, across=(0.0, 1.0, 0.25))
    # The dash and the wheel, on the left.
    dash = c["dash"]
    pad(part, "CarInterior", (-0.72, dash[0], dash[1]), (0.72, dash[0], dash[1]), 0.5, 0.18, across=(0.0, 1.0, 0.12))
    wheel_at = np.array([c["seat_x"], dash[0] + 0.32, dash[1] + 0.02])
    way = np.array([0.0, 0.84, 0.54])
    _, u, v = frame_for(way)
    ring = [wheel_at + 0.185 * (math.cos(t) * u + math.sin(t) * v) for t in np.linspace(0, math.tau, 12)]
    tube(part, "CarInterior", ring, 0.017, sides=5, smooth=False, cap=False)


def inner_shell(body, part, c, extra=()):
    """A dark skin just inside the panels: what you see down a shut line, and from inside, the cabin's walls."""
    at = (body.side(0.0), body.height * 0.5)
    carve(body, part, [seed(at, "CarTrim", lift=-0.02, gap=0, edge=False)], [arch(body, c, c["front"]), arch(body, c, c["rear"]), *extra], grid=0.42, turn=1.1, step=0.34)


def wheel_well(part, side, y, z, radius, outer, inner):
    """The dark tub over a wheel, open underneath, with a wall behind it."""
    angles = np.radians(np.linspace(-18, 198, 11))
    arc = np.stack([y + radius * np.cos(angles), z + radius * np.sin(angles)], axis=1)
    near = np.array([(side * outer, a, b) for a, b in arc])
    far = np.array([(side * inner, a, b) for a, b in arc])
    m = len(arc)
    faces = [(i, i + 1, m + i + 1, m + i) for i in range(m - 1)]
    faces.append(tuple(range(m, 2 * m)))
    part.add("CarTrim", np.vstack([near, far]), faces)


def underneath(part, c):
    """Wheel wells, the floor, and the calipers, which stay still while the wheels turn."""
    r = c["arch"] + 0.012
    z = c["wheel"] + c.get("arch_lift", 0.012)
    tyre = c["tyre"]
    x_face = c["half"] - tyre / 2 - 0.012
    for y in (c["front"], c["rear"]):
        for side in (-1, 1):
            wheel_well(part, side, y, z, r, c["half"] - 0.012, c["half"] - 0.36)
            # Behind the axle, gripping the disc.
            arc = []
            for t in np.linspace(math.radians(-32), math.radians(32), 4):
                reach = c["bead"] * 0.6
                arc.append(
                    [
                        (side * (x_face + dx), y + math.cos(t) * (reach + dr), c["wheel"] + math.sin(t) * (reach + dr))
                        for dx, dr in ((-0.046, -0.026), (0.022, -0.026), (0.022, 0.03), (-0.046, 0.03))
                    ]
                )
            loft(part, "CarGloss", arc if side > 0 else arc[::-1])
    a = c["length"] / 2 - 0.5
    w = c["half"] - 0.1
    z = c["sill"]
    part.add("CarTrim", [(-w, -a, z), (w, -a, z), (w, a, z), (-w, a, z)], [(3, 2, 1, 0)])
    z = c["seat_floor"]
    part.add("CarInterior", [(-w, -1.0, z), (w, -1.0, z), (w, c["seat_rear"] + 0.5, z), (-w, c["seat_rear"] + 0.5, z)], [(0, 1, 2, 3)])


def door_mirror(part, foot, head, wide=0.185, tall=0.108, deep=0.08):
    """On a short arm from the door: painted cap, black base, and the glass facing back."""
    for side in (-1, 1):
        f = np.array(foot, float) * (side, 1, 1)
        h = np.array(head, float) * (side, 1, 1)
        angles = np.linspace(0, math.tau, 12, endpoint=False)
        rings = []
        for t in (0.0, 0.08, 0.3, 0.7, 0.92, 1.0):
            x = (t - 0.5) * wide
            fill = 0.62 + 0.38 * math.sin(math.pi * min(max(t, 0.02), 0.98)) ** 0.6
            ca, sa = np.cos(angles), np.sin(angles)
            y = np.where(ca < 0, ca * deep * fill, ca * 0.012)
            z = np.sign(sa) * np.abs(sa) ** 0.7 * tall / 2 * fill * (1 - 0.1 * t)
            rings.append(np.stack([h[0] + np.full(12, x), h[1] + y, h[2] + z], axis=1))
        loft(part, "CarBody", rings)
        glass = np.stack([h[0] + np.cos(angles) * wide * 0.44, np.full(12, h[1] + 0.013), h[2] + np.sign(np.sin(angles)) * np.abs(np.sin(angles)) ** 0.7 * tall * 0.42], axis=1)
        part.add("CarChrome", glass, [tuple(range(11, -1, -1))])
        tube(part, "CarTrim", [f, (f + h) / 2 + np.array([0, 0.012, -0.018]), h + np.array([-side * wide * 0.3, -0.01, -tall * 0.34])], 0.016, sides=6, step=0.05, flat=0.6)


def door_handle(sheet, part, s, z, length=0.17, material="CarBody"):
    """A pull handle, standing off a shadowed dish in the door."""
    b = sheet.b(s, z)
    dish = np.stack([np.linspace(s - length * 0.52, s + length * 0.52, 5), np.full(5, b)], axis=1)
    ribbon(sheet, part, "CarTrim", dish, 0.05, lift=0.0012)
    rings = []
    for t, lift, size in ((-0.5, 0.004, 0.7), (-0.32, 0.013, 1.0), (0.32, 0.014, 1.0), (0.5, 0.004, 0.7)):
        a = s + t * length
        p = sheet.at(np.array([a]), np.array([b]))[0]
        n = sheet.facing(np.array([a]), np.array([b]))[0]
        down = np.array([0, 0, -1.0])
        down -= n * np.dot(down, n)
        down /= np.linalg.norm(down)
        rings.append([p + n * (lift + da * 0.008 * size) + down * db * 0.015 * size for da, db in ((1, -1), (1.2, 0), (1, 1), (-1, 1), (-1, -1))])
    for flip in (1, -1):
        turned = np.array(rings) * (flip, 1, 1)
        loft(part, material, turned if flip > 0 else turned[:, ::-1], cap=False)


def bowl(part, at, way, radius=0.05, core=0.02, lit=True):
    """A lamp's reflector and what lights it."""
    for side in (-1, 1):
        p = np.array(at, float) * (side, 1, 1)
        w = np.array(way, float) * (side, 1, 1)
        lathe(part, "CarChrome", [(radius, 0.0), (radius * 0.86, -radius * 0.42), (radius * 0.45, -radius * 0.72), (core * 0.8, -radius * 0.8)], p, w, segments=14)
        lathe(part, "CarHead" if lit else "CarChrome", [(core, -radius * 0.42), (core * 0.8, -radius * 0.1), (0, 0.0)], p, w, segments=8)


def plate(part, sheet, s, where, rear, index, wide=0.52, tall=0.112, lift=0.012):
    """A number plate on its dark backing. Its picture is one strip of the plates' atlas."""
    b = sheet.b(s, where)
    p = sheet.at(np.array([s]), np.array([b]))[0]
    n = sheet.facing(np.array([s]), np.array([b]))[0]
    n = n * (0, 1, 1)
    n /= np.linalg.norm(n)
    p = p * (0, 1, 1)
    p = p + n * lift
    across = np.array([-1.0 if rear else 1.0, 0, 0])
    up = np.cross(n, across)
    if up[2] < 0:
        up = -up
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    verts = np.array([p + across * a * wide / 2 + up * c * tall / 2 for a, c in corners])
    high, low = 1 - index / (PLATES + 1), 1 - (index + 1) / (PLATES + 1)
    uvs = np.array([(0.0, low), (1.0, low), (1.0, high), (0.0, high)])
    tris = np.array([(0, 1, 2), (0, 2, 3)])
    tri = verts[tris]
    if np.dot(np.cross(tri[0, 1] - tri[0, 0], tri[0, 2] - tri[0, 0]), n) < 0:
        tris = tris[:, ::-1]
    part.add_skin("CarPlate", verts, tris, np.tile(n, (4, 1)), uvs)
    back = np.array([p + across * a * (wide / 2 + 0.012) + up * c * (tall / 2 + 0.012) - n * 0.004 for a, c in corners])
    part.add_skin("CarTrim", back, tris, np.tile(n, (4, 1)), np.zeros((4, 2)))


def blades(cabin, part, z, reach=(0.74, 0.06, 0.04, 0.6)):
    """The wipers, parked along the foot of the windscreen."""

    def along(x0, x1):
        b = np.linspace(x0, x1, 9)
        ys = np.linspace(cabin.ys[0], 0.0, 240)
        out = []
        for value in b:
            heights = cabin.at(ys, np.full(240, value))[:, 2]
            out.append((float(np.interp(z + 0.022 * value, heights, ys)), value))
        return np.array(out)

    # In flat coordinates the width across the glass is the distance down the section.
    driver = along(reach[0] * 0.92, reach[1])
    other = along(reach[3] * 0.8, reach[2])
    ribbon(cabin, part, "CarTrim", driver, 0.013, lift=0.012, mirror=False)
    ribbon(cabin, part, "CarTrim", other, 0.013, lift=0.012, mirror=False, flip=True)
    ribbon(cabin, part, "CarTrim", driver[4:] + np.array([-0.012, 0.0]), 0.009, lift=0.024, mirror=False)
    ribbon(cabin, part, "CarTrim", other[4:] + np.array([-0.012, 0.0]), 0.009, lift=0.024, mirror=False, flip=True)


# ── the designs ──────────────────────────────────────────────────────────────────────────────


def flank_rows(front, rear, belt, shoulder, opens, closes, lows, flare=0.011, tuck=0.052, inset=0.2):
    """
    A section of the flank at any place along the car, from the top edge to the sill. Ahead of
    `opens` the top edge is the hood's; behind it the flank rolls over at the belt and tucks in
    under the glass; behind `closes`, if there is one, it runs out to a boot lid.
    """

    def rows(y):
        ahead = 1 - float(ease(opens[0], opens[1], y))
        behind = float(ease(closes[0], closes[1], y)) if closes else 0.0
        n0 = -inset + 0.06 * behind
        z = shoulder(y)
        b = belt(y)
        wide = flare * (math.exp(-(((y - front) / 0.42) ** 2)) + math.exp(-(((y - rear) / 0.42) ** 2)))
        shut = 1 - max(ahead, behind)
        return np.array(
            [
                [n0, 0],
                [(n0 + 0.03) * (1 - shut) - 0.098 * shut, 0.006 * (1 - shut) + 0.002 * shut],
                [-0.066 + wide * 0.3 - 0.003 * shut, (z + 0.042) * (1 - shut) + (b - 0.024) * shut],
                [-0.038 + wide * 0.6, z],
                [-0.018 + wide, z - 0.1],
                [-0.008 + wide, lows[0]],
                [-0.002 + wide * 0.9, lows[1]],
                [-0.014 + wide * 0.6, lows[2]],
                [-tuck, lows[3]],
            ]
        )

    return rows


def top_edge(hood, belt, opens, deck=None, closes=None):
    """How high the top of the perimeter runs: the hood's edge, the belt, then a boot lid's edge."""

    def height(x, y):
        if y < 0:
            share = float(ease(opens[0], opens[1], y))
            return float(hood(x, y) * (1 - share) + belt(y) * share)
        if closes is None:
            return float(belt(y))
        share = float(ease(closes[0], closes[1], y))
        return float(belt(y) * (1 - share) + deck(x, y) * share)

    return height


def round_plan(wide, tip, nose, tail):
    """The car from above. `nose` and `tail` are (out, back) steps from the middle to the flank."""
    front = [(0, -tip), (0.24, -tip)] + [(x, -tip + y) for x, y in nose]
    rear = [(x, tip - y) for x, y in reversed(tail)] + [(0.24, tip), (0, tip)]
    return front + [(wide, -0.8), (wide, -0.2), (wide, 0.4), (wide, 1.0)] + rear


def saloon_design():
    length, wide = 4.35, 0.87
    front, rear = -1.325, 1.275
    tip = length / 2
    opens, closes = (-0.94, -0.62), (1.2, 1.6)
    hood_line = curve([(-2.3, 0.72), (-2.1, 0.8), (-1.8, 0.872), (-1.5, 0.922), (-1.2, 0.965), (-0.9, 1.0), (-0.6, 1.03)])
    crown = curve([(-2.2, 0.09), (-1.7, 0.075), (-1.25, 0.05), (-0.9, 0.036), (-0.6, 0.03)])
    deck_line = curve([(1.3, 1.08), (1.6, 1.1), (1.9, 1.112), (2.1, 1.105), (2.3, 1.07)])
    belt = curve([(-1.3, 0.925), (-0.95, 0.965), (-0.2, 1.0), (0.6, 1.03), (1.2, 1.062), (1.7, 1.085)])
    shoulder = curve([(-2.2, 0.76), (-1.7, 0.815), (-1.2, 0.848), (0, 0.888), (1.2, 0.93), (1.8, 0.945), (2.2, 0.935)])

    def hood(x, y):
        t = x / 0.7
        ridge = 0.009 * (1 - ease(0.3, 0.42, np.abs(x))) * ease(-2.1, -1.8, y)
        return hood_line(y) - crown(y) * t**2 - 0.008 * t**4 + ridge

    def deck(x, y):
        return deck_line(y) - 0.04 * (x / 0.7) ** 2 - 0.012 * (x / 0.7) ** 4

    return {
        "name": "Saloon",
        "boot": True,
        "rim": {"spokes": 5, "twin": 0.11, "spoke_wide": 0.017},
        "length": length,
        "half": wide,
        "front": front,
        "rear": rear,
        "wheel": 0.31,
        "tyre": 0.2,
        "bead": 0.216,
        "arch": 0.365,
        "sill": 0.24,
        "door_foot": 0.33,
        "rocker": 0.268,
        "seat_front": -0.05,
        "seat_rear": 0.75,
        "seat_x": 0.37,
        "seat_floor": 0.34,
        "dash": (-0.62, 0.96),
        "plan": round_plan(wide, tip, [(0.5, 0.008), (0.7, 0.05), (0.81, 0.17), (0.855, 0.4), (wide - 0.002, 0.75)], [(0.5, 0.008), (0.7, 0.05), (0.81, 0.17), (0.852, 0.4), (wide - 0.004, 0.72)]),
        "nose_blend": (0.08, 1.15),
        "tail_blend": (0.04, 1.1),
        "weights": [SOFT, SOFT, SOFT, CREASE, SOFT, SOFT, 2.0, SOFT, SOFT],
        "nose": [(-0.205, 0), (-0.168, 0.016), (-0.128, 0.74), (-0.09, 0.675), (-0.042, 0.595), (-0.006, 0.51), (0.0, 0.41), (-0.02, 0.31), (-0.09, 0.228)],
        "tail": [(-0.14, 0), (-0.122, 0.018), (-0.098, 1.0), (-0.078, 0.915), (-0.05, 0.805), (-0.01, 0.665), (0.0, 0.525), (-0.02, 0.41), (-0.13, 0.31)],
        "flank": flank_rows(front, rear, belt, shoulder, opens, closes, (0.615, 0.47, 0.335, 0.228)),
        "top": top_edge(hood, belt, opens, deck, closes),
        "hood": hood,
        "deck": deck,
        "belt": belt,
        "hood_rear": (-1.005, 0.278, -0.88),
        "cabin": (-1.3, 2.0),
        "roof": curve([(-1.3, 0.8), (-0.97, 0.985), (-0.62, 1.205), (-0.32, 1.368), (-0.05, 1.44), (0.3, 1.47), (0.7, 1.458), (1.0, 1.41), (1.3, 1.295), (1.62, 1.14), (2.0, 1.03)]),
        "rail": curve([(-1.3, 0.74), (-0.97, 0.89), (-0.8, 0.965), (-0.62, 1.06), (-0.32, 1.24), (-0.05, 1.362), (0.3, 1.412), (0.7, 1.405), (1.0, 1.362), (1.3, 1.235), (1.62, 1.09), (2.0, 1.01)]),
        "rail_x": curve([(-1.3, 0.62), (-0.94, 0.665), (-0.8, 0.675), (-0.62, 0.662), (-0.32, 0.628), (-0.05, 0.605), (0.3, 0.592), (0.7, 0.59), (1.0, 0.6), (1.3, 0.63), (1.62, 0.665), (2.0, 0.7)]),
        "cabin_foot": curve([(-1.3, 0.9), (-0.9, 0.97), (-0.2, 0.99), (0.6, 1.015), (1.2, 1.045), (1.7, 1.06), (2.0, 1.0)]),
        "cabin_x": curve([(-1.3, 0.68), (-0.95, 0.7), (-0.8, 0.73), (-0.5, 0.772), (-0.2, 0.788), (0.6, 0.79), (1.2, 0.782), (1.7, 0.75), (2.0, 0.72)]),
        "doors": {"a": (-0.87, -0.83, 0.82, -0.885), "b": 0.2, "c": [(1.16, None), (1.11, 0.78, 0.08), (0.84, 0.47, 0.12), (0.84, 0.3)], "last": 1.24},
        "glass": {"front": -0.86, "header": (-0.2, -0.34), "rear": (1.05, 0.93), "b": (0.14, 0.22), "surround": [(1.02, "top", 0.08), (1.42, "foot")], "door": (1.0, 1.04), "quarter": [(1.08, "foot"), (1.05, 0.03, 0.02), (1.34, "foot")]},
        "mirror": ((0.79, -0.72, 0.99), (0.925, -0.75, 1.045)),
        "handles": ((0.02, 0.862), (0.95, 0.885)),
        "wipers": 1.06,
    }


def compact_design():
    length, wide = 3.95, 0.855
    front, rear = -1.225, 1.275
    tip = length / 2
    opens = (-0.98, -0.66)
    hood_line = curve([(-2.2, 0.72), (-1.95, 0.81), (-1.7, 0.885), (-1.4, 0.95), (-1.1, 1.0), (-0.8, 1.05)])
    crown = curve([(-2.0, 0.085), (-1.6, 0.07), (-1.2, 0.05), (-0.8, 0.036)])
    belt = curve([(-1.3, 0.945), (-0.95, 0.985), (-0.2, 1.018), (0.6, 1.05), (1.2, 1.082), (1.7, 1.1), (2.0, 1.09)])
    shoulder = curve([(-2.0, 0.78), (-1.6, 0.835), (-1.1, 0.87), (0, 0.905), (1.2, 0.955), (1.9, 0.975)])

    def hood(x, y):
        t = x / 0.7
        return hood_line(y) - crown(y) * t**2 - 0.008 * t**4

    def shelf(x, y):
        return belt(y) + 0.0 * x

    return {
        "name": "Compact",
        "boot": False,
        "rim": {"spokes": 8, "twin": 0.0, "spoke_wide": 0.015},
        "length": length,
        "half": wide,
        "front": front,
        "rear": rear,
        "wheel": 0.298,
        "tyre": 0.185,
        "bead": 0.192,
        "arch": 0.35,
        "sill": 0.235,
        "door_foot": 0.325,
        "rocker": 0.262,
        "seat_front": -0.12,
        "seat_rear": 0.66,
        "seat_x": 0.36,
        "seat_floor": 0.36,
        "dash": (-0.68, 0.98),
        "plan": round_plan(wide, tip, [(0.5, 0.01), (0.69, 0.055), (0.795, 0.16), (0.84, 0.36), (wide - 0.002, 0.64)], [(0.52, 0.012), (0.72, 0.06), (0.815, 0.16), (0.848, 0.33), (wide - 0.003, 0.56)]),
        "nose_blend": (0.08, 1.05),
        "tail_blend": (0.04, 0.95),
        "weights": [SOFT, SOFT, SOFT, CREASE, SOFT, SOFT, 2.0, SOFT, SOFT],
        "nose": [(-0.2, 0), (-0.165, 0.016), (-0.125, 0.765), (-0.088, 0.695), (-0.04, 0.61), (-0.006, 0.52), (0.0, 0.41), (-0.02, 0.31), (-0.09, 0.235)],
        "tail": [(-0.17, 0), (-0.128, 0.004), (-0.1, 1.045), (-0.082, 0.95), (-0.05, 0.84), (-0.012, 0.69), (0.0, 0.55), (-0.018, 0.42), (-0.11, 0.3)],
        "flank": flank_rows(front, rear, belt, shoulder, opens, None, (0.625, 0.47, 0.335, 0.235)),
        "top": top_edge(hood, belt, opens),
        "hood": hood,
        "deck": shelf,
        "belt": belt,
        "hood_rear": (-1.03, 0.24, -0.92),
        "cabin": (-1.35, 1.86),
        "roof": curve([(-1.35, 0.82), (-1.02, 1.01), (-0.72, 1.215), (-0.42, 1.372), (-0.12, 1.45), (0.25, 1.475), (0.7, 1.462), (1.1, 1.425), (1.42, 1.365), (1.6, 1.26), (1.74, 1.165), (1.86, 1.08)]),
        "rail": curve([(-1.35, 0.76), (-1.02, 0.905), (-0.85, 0.98), (-0.7, 1.07), (-0.42, 1.245), (-0.12, 1.37), (0.25, 1.418), (0.7, 1.41), (1.1, 1.375), (1.42, 1.3), (1.6, 1.222), (1.74, 1.146), (1.86, 1.068)]),
        "rail_x": curve([(-1.35, 0.6), (-1.0, 0.65), (-0.86, 0.665), (-0.7, 0.655), (-0.42, 0.622), (-0.12, 0.6), (0.25, 0.592), (0.7, 0.595), (1.1, 0.6), (1.42, 0.6), (1.7, 0.585), (1.86, 0.56)]),
        "cabin_foot": curve([(-1.35, 0.92), (-0.95, 0.99), (-0.2, 1.008), (0.6, 1.038), (1.2, 1.068), (1.6, 1.08), (1.86, 1.05)]),
        "cabin_x": curve([(-1.35, 0.67), (-1.0, 0.69), (-0.85, 0.72), (-0.55, 0.762), (-0.2, 0.778), (0.6, 0.782), (1.2, 0.772), (1.5, 0.75), (1.7, 0.71), (1.86, 0.64)]),
        "doors": {"a": (-0.91, -0.87, 0.84, -0.8), "b": 0.1, "c": [(1.02, None), (0.99, 0.79, 0.06), (0.92, 0.66, 0.08), (0.82, 0.5, 0.1), (0.82, 0.3)], "last": 1.1},
        "glass": {"front": -0.9, "header": (-0.3, -0.44), "rear": (1.43, 1.32), "b": (0.04, 0.11), "surround": [(1.2, "top", 0.1), (1.52, "foot")], "door": (0.9, 0.96), "quarter": [(1.0, "foot"), (1.0, 0.03, 0.02), (1.15, 0.03, 0.04), (1.45, "foot")]},
        "mirror": ((0.78, -0.76, 1.01), (0.905, -0.79, 1.065)),
        "handles": ((-0.09, 0.88), (0.84, 0.905)),
        "wipers": 1.085,
    }


def crossover_design():
    length, wide = 4.45, 0.905
    front, rear = -1.335, 1.295
    tip = length / 2
    opens = (-0.96, -0.64)
    hood_line = curve([(-2.4, 0.84), (-2.15, 0.93), (-1.85, 0.99), (-1.5, 1.04), (-1.2, 1.08), (-0.9, 1.125), (-0.6, 1.16)])
    crown = curve([(-2.2, 0.07), (-1.7, 0.06), (-1.25, 0.045), (-0.9, 0.034), (-0.6, 0.03)])
    belt = curve([(-1.3, 1.04), (-0.95, 1.09), (-0.2, 1.125), (0.6, 1.15), (1.2, 1.175), (1.7, 1.19), (2.2, 1.17)])
    shoulder = curve([(-2.2, 0.87), (-1.7, 0.92), (-1.2, 0.965), (0, 1.0), (1.2, 1.035), (2.1, 1.05)])

    def hood(x, y):
        t = x / 0.74
        ridge = 0.012 * (1 - ease(0.38, 0.5, np.abs(x))) * ease(-2.2, -1.9, y)
        return hood_line(y) - crown(y) * t**2 - 0.006 * t**4 + ridge

    def shelf(x, y):
        return belt(y) + 0.0 * x

    return {
        "name": "Crossover",
        "boot": False,
        "rim": {"spokes": 6, "twin": 0.085, "spoke_wide": 0.016, "hub": 0.086},
        "length": length,
        "half": wide,
        "front": front,
        "rear": rear,
        "wheel": 0.345,
        "tyre": 0.225,
        "bead": 0.228,
        "arch": 0.405,
        "arch_lift": 0.02,
        "sill": 0.31,
        "door_foot": 0.42,
        "rocker": 0.0,
        "seat_front": -0.04,
        "seat_rear": 0.78,
        "seat_x": 0.39,
        "seat_floor": 0.46,
        "dash": (-0.6, 1.08),
        "plan": round_plan(wide, tip, [(0.54, 0.01), (0.75, 0.05), (0.85, 0.16), (0.892, 0.38), (wide - 0.002, 0.74)], [(0.56, 0.012), (0.76, 0.05), (0.855, 0.15), (0.895, 0.36), (wide - 0.003, 0.7)]),
        "nose_blend": (0.08, 1.1),
        "tail_blend": (0.04, 1.0),
        "weights": [SOFT, SOFT, SOFT, CREASE, SOFT, SOFT, 2.0, SOFT, SOFT],
        "nose": [(-0.2, 0), (-0.158, 0.014), (-0.118, 0.85), (-0.08, 0.77), (-0.04, 0.68), (-0.008, 0.58), (0.0, 0.47), (-0.02, 0.38), (-0.08, 0.31)],
        "tail": [(-0.17, 0), (-0.13, 0.004), (-0.1, 1.15), (-0.08, 1.05), (-0.05, 0.92), (-0.012, 0.76), (0.0, 0.62), (-0.018, 0.5), (-0.1, 0.38)],
        "flank": flank_rows(front, rear, belt, shoulder, opens, None, (0.72, 0.56, 0.42, 0.31), flare=0.014, tuck=0.045),
        "top": top_edge(hood, belt, opens),
        "hood": hood,
        "deck": shelf,
        "belt": belt,
        "hood_rear": (-1.0, 0.26, -0.89),
        "cabin": (-1.32, 2.08),
        "roof": curve([(-1.32, 0.96), (-0.98, 1.13), (-0.66, 1.35), (-0.38, 1.525), (-0.12, 1.595), (0.3, 1.63), (0.9, 1.625), (1.4, 1.6), (1.72, 1.56), (1.86, 1.44), (1.98, 1.3), (2.08, 1.14)]),
        "rail": curve([(-1.32, 0.9), (-0.98, 1.03), (-0.8, 1.115), (-0.64, 1.22), (-0.38, 1.4), (-0.12, 1.52), (0.3, 1.572), (0.9, 1.57), (1.4, 1.545), (1.72, 1.49), (1.86, 1.385), (1.98, 1.26), (2.08, 1.12)]),
        "rail_x": curve([(-1.32, 0.64), (-0.96, 0.69), (-0.82, 0.7), (-0.64, 0.69), (-0.38, 0.655), (-0.12, 0.63), (0.3, 0.62), (0.9, 0.62), (1.4, 0.625), (1.8, 0.62), (2.08, 0.58)]),
        "cabin_foot": curve([(-1.32, 1.02), (-0.92, 1.09), (-0.2, 1.112), (0.6, 1.138), (1.2, 1.16), (1.8, 1.17), (2.08, 1.14)]),
        "cabin_x": curve([(-1.32, 0.71), (-0.96, 0.73), (-0.8, 0.76), (-0.5, 0.802), (-0.2, 0.82), (0.6, 0.824), (1.2, 0.815), (1.7, 0.79), (1.95, 0.74), (2.08, 0.67)]),
        "doors": {"a": (-0.88, -0.84, 0.95, -0.86), "b": 0.2, "c": [(1.16, None), (1.12, 0.92, 0.08), (0.9, 0.62, 0.12), (0.88, 0.4)], "last": 1.24},
        "glass": {"front": -0.87, "header": (-0.2, -0.34), "rear": (1.76, 1.64), "b": (0.14, 0.22), "surround": [(1.44, "top", 0.1), (1.76, "foot")], "door": (1.02, 1.08), "quarter": [(1.14, "foot"), (1.14, 0.03, 0.02), (1.4, 0.03, 0.05), (1.7, "foot")]},
        "mirror": ((0.815, -0.73, 1.105), (0.965, -0.76, 1.165)),
        "handles": ((0.02, 0.98), (0.95, 1.005)),
        "wipers": 1.2,
    }


# ── drawing a car ────────────────────────────────────────────────────────────────────────────


class Draw:
    """The sheets of one car and the lines and panels being drawn on its flank."""

    def __init__(self, c):
        self.c = c
        self.body = perimeter(c)
        self.cabin = greenhouse(c)
        self.part = Part(c["name"])
        self.field = Dome(c["hood"])
        self.lid = Dome(c["deck"])
        self.end = self.body.plan.length
        self.sy, self.fx, self.rx = self.body.side, self.body.front, self.body.rear
        self.seams, self.seeds = [], []

    def on(self, s, z):
        return (s, self.body.b(s, z))

    def line(self, points, step=0.1):
        made = self.body.line(points, step)
        self.seams.append(made)
        return made

    def loop(self, points, step=0.08):
        made = self.body.loop(points, step)
        self.seams.append(made)
        return made

    def panel(self, s, z, *args, **more):
        self.seeds.append(seed(self.on(s, z), *args, **more))

    def lamp_in(self, s, z, radius, aim=(0.0, -1.0, 0.0), depth=0.016, share=0.75, lit=True):
        """A reflector behind the lens, aimed down the road."""
        at = np.array([s])
        b = np.array([self.body.b(s, z)])
        p, n = self.body.at(at, b)[0], self.body.facing(at, b)[0]
        way = n * (1 - share) + np.array(aim) * share
        bowl(self.part, p - n * depth, way / np.linalg.norm(way), radius=radius, core=radius * 0.42, lit=lit)

    def strip(self, material, points, width, lift=0.0008, step=0.05, sheet=None):
        sheet = sheet or self.body
        ribbon(sheet, self.part, material, sheet.line(points, step), width, lift=lift)


def flanks(d):
    """Wheel openings and doors: the same job on every car."""
    c, sy = d.c, d.sy
    above = V(-0.05)
    doors = c["doors"]
    foot = c["door_foot"]
    a = doors["a"]
    d.seams += [arch(d.body, c, c["front"]), arch(d.body, c, c["rear"])]
    d.line([(sy(a[0]), above), (sy(a[1]), a[2], 0.1), (sy(a[3]), foot - 0.03)], step=0.24)
    d.line([(sy(doors["b"]), above), (sy(doors["b"] + 0.005), foot - 0.03)], step=0.3)
    d.line([(sy(p[0]), above if p[1] is None else p[1], *p[2:]) for p in doors["c"]], step=0.24)
    start, stop = c["front"] + c["arch"] - 0.04, c["rear"] - c["arch"] + 0.04
    d.line([(sy(start), foot), (sy(stop), foot)], step=0.34)
    if c["rocker"]:
        d.line([(sy(start), c["rocker"]), (sy(stop), c["rocker"])], step=0.34)
    d.seams.append(door_tops(d.body, d.cabin, np.linspace(a[0] - 0.05, doors["last"], 9), under=0.004))
    d.panel(sy(-0.3), 0.6 + foot - 0.33)
    d.panel(sy(doors["b"] + 0.3), 0.6 + foot - 0.33)
    d.panel(sy(0.0), foot - 0.016 if not c["rocker"] else (foot + c["rocker"]) / 2)
    if c["rocker"]:
        d.panel(sy(0.0), c["rocker"] - 0.012, "CarTrim", gap=0.002, edge=False)


def lids(d):
    """The hood and the dark scuttle behind it, the boot if there is one, and what's under their gaps."""
    c, part, field, body, sy = d.c, d.part, d.field, d.body, d.sy
    y0, k, y1 = c["hood_rear"]
    edge = plan_edge(body, 0, sy(y1))
    x1 = float(edge[-1, 1])
    xs = np.linspace(x1 * 0.93, 0.0, 9)
    rim = np.stack([y0 + k * xs**2, xs], axis=1)
    carve(field, part, [seed((c["front"] - 0.2, 0.3))], outer=np.vstack([edge, rim]), grid=0.17)
    back = plan_edge(body, sy(y1 - 0.02), sy(-0.5))
    behind = np.stack([y0 + k * xs**2 - 0.012, xs], axis=1)[::-1]
    carve(field, part, [seed((-0.72, 0.2), "CarTrim", gap=0.0)], outer=np.vstack([behind, back, [(-0.5, 0.0)]]), grid=0.26)
    under = np.vstack([plan_edge(body, 0, sy(y1 + 0.02)) + np.array([0.0, 0.03]), [(y0 + 0.08, 0.0)]])
    carve(field, part, [seed((c["front"] - 0.2, 0.3), "CarTrim", lift=-0.024, gap=0, edge=False)], outer=under, grid=0.45, turn=1.3, step=0.22)
    if c["boot"]:
        edge = plan_edge(body, sy(1.6), d.end)
        carve(d.lid, part, [seed((1.85, 0.3))], outer=np.vstack([edge, [(1.62, 0.0), (1.6, 0.4)]]), grid=0.17)


def glasshouse(d):
    """Roof, pillars and glass, cut from one sheet, with the headlining inside it."""
    c, cabin, part = d.c, d.cabin, d.part
    g = c["glass"]
    high = cabin.height
    rail, foot = cabin.greville[4], cabin.greville[7] + 0.02
    top = rail + 0.042
    pillar = rail - 0.03
    inset = 0.016
    end = cabin.ys[-1] + 0.1
    head_a, head_b = g["header"]
    rear_a, rear_b = g["rear"]

    def place(point):
        """Window corners name the top of the glass, its foot, or a share below the top."""
        where = point[1]
        v = top if where == "top" else foot if where == "foot" else top + inset + where
        return (point[0], V(v), *point[2:])

    windscreen = cabin.line([(cabin.ys[0] - 0.1, V(pillar)), (head_a, V(pillar), 0.06), (head_b, V(-0.03))], step=0.22)
    frit = cabin.line([(cabin.ys[0] - 0.1, V(pillar - 0.03)), (head_a - 0.06, V(pillar - 0.03), 0.05), (head_b - 0.05, V(-0.03))], step=0.22)
    rear_glass = cabin.line([(rear_b, V(-0.03)), (rear_a, V(pillar), 0.06), (end, V(pillar))], step=0.22)
    rear_frit = cabin.line([(rear_b + 0.05, V(-0.03)), (rear_a + 0.05, V(pillar - 0.03), 0.05), (end, V(pillar - 0.03))], step=0.22)
    reach = (pillar + 0.05) * high
    feet = [
        glass_foot(cabin, d.field, reach, shift=0.012),
        glass_foot(cabin, d.field, reach, shift=0.07),
        glass_foot(cabin, d.lid, reach, rear=True, shift=0.012),
        glass_foot(cabin, d.lid, reach, rear=True, shift=0.06),
    ]
    # Nothing of this sheet shows behind the foot of the rear glass: the boot or tailgate takes over.
    last = feet[2][0][-1]
    feet.append(cabin.line([(last[0], V(last[1] / high)), (last[0], V(1.05))], step=0.4))
    surround = cabin.loop([(g["front"], V(foot)), (g["front"], V(top), 0.01), *[place(p) for p in g["surround"]]], step=0.26)
    bay = V(foot + 0.01)
    row = V(top + inset)
    y0, y1 = g["b"]
    front_glass = cabin.loop([(g["front"] + 0.05, bay), (g["front"] + 0.05, row, 0.01), (y0, row, 0.03), (y0, bay)], step=0.26)
    rear_door = cabin.loop([(y1, bay), (y1, row, 0.03), (g["door"][0], row, 0.05), (g["door"][1], bay)], step=0.26)
    quarter = cabin.loop([place(p) for p in g["quarter"]], step=0.26)
    shut = dict(gap=0.003, edge=False)
    mid = (top + inset + foot) / 2 * high
    carve(
        cabin,
        part,
        [
            seed((0.4, 0.2), gap=0.004),
            seed((-0.75, 0.1), "CarGlass", lift=-0.004, **shut),
            seed(((rear_a + rear_b) / 2 + 0.2, 0.1), "CarGlass", lift=-0.004, **shut),
            seed(((y0 + y1) / 2, mid), "CarGloss", gap=0.002, edge=False),
            seed(((g["front"] + y0) / 2 + 0.2, mid), "CarGlass", lift=-0.003, **shut),
            seed(((y1 + g["door"][0]) / 2, mid), "CarGlass", lift=-0.003, **shut),
            seed((g["quarter"][0][0] + 0.06, (foot - 0.03) * high), "CarGlass", lift=-0.003, **shut),
            seed((head_b - 0.03, (pillar - 0.015) * high), "CarGloss", lift=-0.0035, gap=0.001, edge=False),
            seed((rear_a + 0.12, (pillar - 0.015) * high), "CarGloss", lift=-0.0035, gap=0.001, edge=False),
        ],
        [windscreen, frit, rear_glass, rear_frit, surround, front_glass, rear_door, quarter, *feet],
        grid=0.2,
        turn=0.36,
        step=0.2,
    )
    carve(cabin, part, [seed((0.4, 0.2), "CarInterior", lift=-0.024, gap=0, edge=False, inward=True)], [windscreen, rear_glass, surround], grid=0.5, turn=1.1, step=0.34)
    blades(cabin, part, c["wipers"])


def fittings(d, belt_finish="CarTrim"):
    c, body, cabin, part, sy = d.c, d.body, d.cabin, d.part, d.sy
    a = c["doors"]["a"][0] + 0.05
    ribbon(body, part, belt_finish, door_tops(body, cabin, np.linspace(a, c["doors"]["last"] - 0.08, 9), under=-0.008), 0.012, lift=0.0025)
    door_mirror(part, *c["mirror"])
    for y, z in c["handles"]:
        door_handle(body, part, sy(y), z)
    seats(part, c)
    underneath(part, c)


def rear_fittings(d, x, z, reflector, wiper=None, fin=None):
    """The small things on the back of a car: a tailpipe, reflectors, a rear wiper, a roof fin."""
    c, part, cabin = d.c, d.part, d.cabin
    at = np.array([x, c["length"] / 2 - 0.1, z])
    lathe(part, "CarChrome", [(0.03, -0.06), (0.033, 0.03), (0.027, 0.03), (0.024, -0.06)], at, (0, 1, 0.02), segments=10)
    d.strip("CarTailLens", [(d.rx(0.76), reflector), (d.rx(0.76) - 0.15, reflector)], 0.03, lift=0.004, step=0.05)
    if wiper:
        line = np.array([(wiper, 0.02), (wiper - 0.2, 0.16), (wiper - 0.27, 0.34)])
        ribbon(cabin, part, "CarTrim", line, 0.012, lift=0.012, mirror=False)
    if fin:
        y, z = fin, float(c["roof"](fin))
        rings = [[(-w, y + dy, z - 0.004), (w, y + dy, z - 0.004), (w * 0.3, y + dy, z + up), (-w * 0.3, y + dy, z + up)] for dy, w, up in ((-0.09, 0.012, 0.004), (0.04, 0.03, 0.05), (0.1, 0.028, 0.058))]
        loft(part, "CarGloss", rings)


def saloon():
    d = Draw(saloon_design())
    c = d.c
    sy, fx, rx, end = d.sy, d.fx, d.rx, d.end
    above, below = V(-0.05), V(1.05)
    flanks(d)

    head = d.line([(fx(0.34), above), (fx(0.36), 0.71, 0.03), (fx(0.58), 0.672, 0.08), (sy(-1.93), 0.7, 0.08), (sy(-1.72), 0.79, 0.03), (sy(-1.63), above)], step=0.09)
    d.loop([(rx(0.36), 1.03, 0.02), (rx(0.36), 0.9, 0.03), (rx(0.62), 0.865, 0.06), (sy(1.76), 0.87, 0.08), (sy(1.58), 0.93, 0.03), (sy(1.62), 1.03, 0.02)], step=0.05)
    d.line([(-0.02, 0.765), (fx(0.3), 0.765, 0.03), (fx(0.33), 0.69, 0.03), (fx(0.2), 0.645, 0.03), (-0.02, 0.64)], step=0.06)
    d.line([(-0.02, 0.46), (fx(0.46), 0.46, 0.04), (fx(0.58), 0.40, 0.04), (fx(0.5), 0.285, 0.05), (-0.02, 0.285)], step=0.06)
    d.loop([(fx(0.62), 0.43, 0.02), (fx(0.75), 0.45, 0.02), (fx(0.78), 0.38, 0.02), (fx(0.66), 0.35, 0.02)], step=0.05)
    d.line([(sy(-1.77), 0.82), (sy(-1.72), 0.70, 0.05), (sy(-1.62), 0.6, 0.04), (sy(-1.56), 0.5)], step=0.06)
    d.line([(sy(1.46), 0.5), (sy(1.55), 0.66, 0.05), (sy(1.66), 0.74, 0.06), (rx(0.74), 0.745, 0.12), (end + 0.02, 0.745)], step=0.08)
    d.line([(rx(0.4), 1.0), (rx(0.36), 1.05), (rx(0.36), above)], step=0.06)
    d.line([(rx(0.4), 0.95), (rx(0.36), 0.88), (rx(0.36), 0.7)], step=0.06)
    d.line([(sy(1.72), below), (sy(1.82), 0.34, 0.03), (rx(0.74), 0.415, 0.1), (end + 0.02, 0.415)], step=0.08)
    d.loop([(end + 0.02, 0.905), (rx(0.3), 0.905, 0.012), (rx(0.3), 0.778, 0.012), (end + 0.02, 0.778)], step=0.05)

    d.panel(sy(-1.9), 0.55)  # front bumper
    d.panel(sy(-1.25), 0.82)  # wing
    d.panel(sy(1.45), 0.85)  # rear quarter
    d.panel(rx(0.5), 0.6)  # rear bumper
    d.panel(rx(0.5), 0.35, "CarTrim", gap=0.003, edge=False)  # valance
    d.panel(rx(0.15), 1.0)  # boot
    d.panel(rx(0.15), 0.84, "CarTrim", gap=0.002, lift=-0.008, edge=False)  # plate recess
    d.panel(fx(0.1), 0.7, "CarGloss", gap=0.004, lift=-0.016, edge=False)  # grille
    d.panel(fx(0.2), 0.38, "CarTrim", gap=0.004, lift=-0.022, edge=False)  # intake
    d.panel(fx(0.7), 0.4, "CarTrim", gap=0.004, lift=-0.014, edge=False)  # fog lamp pod
    at = d.on(fx(0.6), 0.75)
    d.seeds.append([seed(at, "CarLens", gap=0.0035, edge=False), seed(at, "CarTrim", lift=-0.052, gap=0, edge=False)])
    d.panel(rx(0.7), 0.95, "CarTailLens", gap=0.0035, edge=False)
    carve(d.body, d.part, d.seeds, d.seams, grid=0.18, turn=0.4, step=0.22)
    inner_shell(d.body, d.part, c, extra=[head])

    d.lamp_in(fx(0.5), 0.738, 0.04, lit=False)
    d.lamp_in(fx(0.67), 0.742, 0.046)
    d.strip("CarHead", [(fx(0.42), 0.702), (fx(0.6), 0.685), (sy(-1.95), 0.712), (sy(-1.82), 0.76)], 0.008, lift=-0.008, step=0.04)
    for z in (0.742, 0.718, 0.692, 0.666):
        d.strip("CarChrome" if z == 0.718 else "CarTrim", [(0.0, z), (fx(0.31 if z > 0.7 else 0.26), z)], 0.0065, lift=-0.008, step=0.08)
    for z in (0.41, 0.36, 0.32):
        d.strip("CarGloss", [(0.0, z), (fx(0.46), z)], 0.008, lift=-0.012, step=0.08)
    d.strip("CarChrome", [(0.0, 0.777), (fx(0.33), 0.777)], 0.011, step=0.08)
    d.strip("CarTail", [(rx(0.4), 0.985), (rx(0.62), 0.975), (sy(1.82), 0.965), (sy(1.66), 0.975)], 0.024, lift=0.0009, step=0.04)
    d.strip("CarTailGlow", [(rx(0.42), 0.925), (rx(0.62), 0.9), (sy(1.82), 0.905), (sy(1.68), 0.93)], 0.05, lift=0.0007, step=0.04)
    d.strip("CarLens", [(rx(0.4), 0.945), (rx(0.5), 0.94)], 0.02, lift=0.0012, step=0.04)

    lids(d)
    glasshouse(d)
    fittings(d, "CarChrome")
    rear_fittings(d, 0.52, 0.335, 0.56, fin=1.06)
    plate(d.part, d.body, 0.0, 0.56, False, 2)
    plate(d.part, d.body, end, 0.84, True, 3, lift=0.004)
    return d.part, c


def compact():
    d = Draw(compact_design())
    c = d.c
    sy, fx, rx, end = d.sy, d.fx, d.rx, d.end
    above, below = V(-0.05), V(1.05)
    flanks(d)

    # A friendly face: tall lamps sweeping back, a slot between them, one wide mouth below.
    head = d.line([(fx(0.36), above), (fx(0.39), 0.74, 0.03), (fx(0.54), 0.668, 0.07), (sy(-1.68), 0.685, 0.09), (sy(-1.5), 0.815, 0.03), (sy(-1.42), above)], step=0.09)
    d.line([(-0.02, 0.775), (fx(0.33), 0.775, 0.02), (fx(0.35), 0.74, 0.02), (-0.02, 0.725)], step=0.06)
    d.line([(-0.02, 0.55), (fx(0.5), 0.55, 0.05), (fx(0.62), 0.42, 0.05), (fx(0.5), 0.3, 0.06), (-0.02, 0.3)], step=0.06)
    d.loop([(fx(0.68), 0.48, 0.02), (fx(0.78), 0.5, 0.02), (sy(-1.78), 0.42, 0.02), (fx(0.74), 0.38, 0.02)], step=0.05)
    d.line([(sy(-1.58), 0.84), (sy(-1.56), 0.7, 0.05), (sy(-1.5), 0.6, 0.04), (sy(-1.45), 0.5)], step=0.06)

    # Round the back: tall corner lamps, the tailgate between them, a bumper under it.
    d.loop([(rx(0.5), 1.06, 0.03), (rx(0.5), 0.9, 0.03), (rx(0.72), 0.84, 0.05), (sy(1.64), 0.875, 0.08), (sy(1.47), 1.0, 0.03), (sy(1.52), 1.075, 0.02)], step=0.05)
    d.line([(sy(1.45), 0.5), (sy(1.53), 0.64, 0.05), (sy(1.63), 0.7, 0.06), (rx(0.72), 0.705, 0.12), (end + 0.02, 0.705)], step=0.08)
    d.line([(rx(0.56), 1.0), (rx(0.5), 1.06), (rx(0.5), above)], step=0.06)
    d.line([(rx(0.56), 0.95), (rx(0.5), 0.86), (rx(0.5), 0.66)], step=0.06)
    d.line([(sy(1.63), below), (sy(1.7), 0.34, 0.03), (rx(0.7), 0.4, 0.1), (end + 0.02, 0.4)], step=0.08)
    d.loop([(end + 0.02, 0.875), (rx(0.29), 0.875, 0.012), (rx(0.29), 0.75, 0.012), (end + 0.02, 0.75)], step=0.05)

    d.panel(sy(-1.75), 0.58)  # front bumper
    d.panel(sy(-1.15), 0.84)  # wing
    d.panel(sy(1.3), 0.85)  # rear quarter
    d.panel(rx(0.5), 0.6)  # rear bumper
    d.panel(rx(0.5), 0.35, "CarTrim", gap=0.003)  # valance
    d.panel(rx(0.15), 0.98)  # tailgate
    d.panel(rx(0.15), 0.81, "CarTrim", gap=0.002, lift=-0.008, edge=False)  # plate recess
    d.panel(fx(0.1), 0.75, "CarGloss", gap=0.004, lift=-0.012, edge=False)  # slot
    d.panel(fx(0.2), 0.42, "CarGloss", gap=0.004, lift=-0.022, edge=False)  # mouth
    d.panel(fx(0.74), 0.44, "CarTrim", gap=0.004, lift=-0.012, edge=False)  # fog lamp pod
    at = d.on(fx(0.62), 0.76)
    d.seeds.append([seed(at, "CarLens", gap=0.0035, edge=False), seed(at, "CarTrim", lift=-0.052, gap=0, edge=False)])
    d.panel(rx(0.7), 0.95, "CarTailLens", gap=0.0035, edge=False)
    carve(d.body, d.part, d.seeds, d.seams, grid=0.18, turn=0.4, step=0.22)
    inner_shell(d.body, d.part, c, extra=[head])

    d.lamp_in(fx(0.52), 0.76, 0.044, lit=False)
    d.lamp_in(fx(0.7), 0.775, 0.06)
    d.strip("CarAmber", [(sy(-1.74), 0.74), (sy(-1.62), 0.79)], 0.02, lift=-0.01)
    d.strip("CarChrome", [(0.0, 0.75), (fx(0.33), 0.748)], 0.008, lift=-0.005, step=0.08)
    for z in (0.5, 0.455, 0.41, 0.365, 0.325):
        d.strip("CarTrim", [(0.0, z), (fx(0.54 if 0.38 < z < 0.48 else 0.46), z)], 0.009, lift=-0.012, step=0.08)
    d.strip("CarChrome", [(fx(0.71), 0.455), (fx(0.76), 0.46)], 0.018, lift=-0.006, step=0.03)
    d.strip("CarTail", [(rx(0.56), 1.022), (rx(0.74), 1.022), (sy(1.72), 1.018), (sy(1.6), 1.024)], 0.015, lift=0.0009, step=0.04)
    d.strip("CarTail", [(rx(0.58), 0.925), (rx(0.74), 0.905), (sy(1.72), 0.915), (sy(1.62), 0.955)], 0.015, lift=0.0009, step=0.04)
    d.strip("CarTailGlow", [(rx(0.6), 0.975), (rx(0.74), 0.965), (sy(1.72), 0.968), (sy(1.62), 0.985)], 0.05, lift=0.0007, step=0.04)
    d.strip("CarLens", [(sy(1.62), 0.97), (sy(1.54), 1.0)], 0.03, lift=0.0012, step=0.04)

    lids(d)
    glasshouse(d)
    fittings(d)
    # A small roof spoiler over the glass, with the stop lamp in it.
    bs = np.linspace(0.0, d.cabin.height * (d.cabin.greville[4] - 0.03), 7)
    roof_edge = d.cabin.at(np.full(7, 1.33), bs)
    roof_end = d.cabin.at(np.full(7, 1.62), bs)
    for side in (1, -1):
        rings = []
        for t, up in ((0.0, 0.0), (0.45, 0.016), (1.0, 0.014)):
            top = roof_edge * (1 - t) + roof_end * t + np.array([0, 0, up + 0.012])
            low = top - np.array([0, 0, 0.012 + 0.014 * t])
            rings.append(np.vstack([top, low[::-1]]) * (side, 1, 1))
        rings = np.array(rings)
        loft(d.part, "CarBody", rings if side < 0 else rings[:, ::-1], cap=True)
    rear_fittings(d, 0.5, 0.34, 0.53, wiper=1.77)
    plate(d.part, d.body, 0.0, 0.43, False, 0, lift=0.0)
    plate(d.part, d.body, end, 0.81, True, 1, lift=0.004)
    return d.part, c


def crossover():
    d = Draw(crossover_design())
    c = d.c
    sy, fx, rx, end = d.sy, d.fx, d.rx, d.end
    above, below = V(-0.05), V(1.05)
    flanks(d)

    # Slim eyes high on the nose, a broad grille under them, a pale skid plate at the chin.
    head = d.line([(fx(0.42), above), (fx(0.45), 0.845, 0.03), (fx(0.7), 0.82, 0.06), (sy(-1.95), 0.85, 0.06), (sy(-1.76), 0.93, 0.03), (sy(-1.68), above)], step=0.09)
    d.line([(-0.02, 0.87), (fx(0.38), 0.87, 0.03), (fx(0.42), 0.815, 0.04), (fx(0.5), 0.72, 0.04), (fx(0.44), 0.655, 0.05), (-0.02, 0.655)], step=0.06)
    d.line([(-0.02, 0.52), (fx(0.52), 0.52, 0.04), (fx(0.68), 0.5, 0.05), (sy(-1.95), 0.56, 0.05), (sy(-1.68), 0.56, 0.03), (sy(-1.62), 0.5)], step=0.08)
    d.line([(-0.02, 0.42), (fx(0.42), 0.42, 0.03), (fx(0.5), 0.33, 0.03), (fx(0.5), below)], step=0.08)
    d.loop([(fx(0.62), 0.69, 0.02), (fx(0.8), 0.72, 0.02), (sy(-1.97), 0.66, 0.02), (fx(0.74), 0.6, 0.02)], step=0.05)
    d.line([(sy(-1.8), 0.97), (sy(-1.76), 0.84, 0.05), (sy(-1.66), 0.72, 0.04), (sy(-1.6), 0.6)], step=0.06)

    # Rear: a long horizontal lamp each side, tailgate between, a black lower bumper.
    d.loop([(rx(0.46), 1.14, 0.03), (rx(0.46), 1.02, 0.03), (rx(0.72), 0.985, 0.05), (sy(1.84), 0.99, 0.08), (sy(1.62), 1.06, 0.03), (sy(1.7), 1.155, 0.02)], step=0.05)
    d.line([(sy(1.5), 0.62), (sy(1.6), 0.79, 0.05), (sy(1.72), 0.84, 0.06), (rx(0.72), 0.85, 0.12), (end + 0.02, 0.85)], step=0.08)
    d.line([(rx(0.5), 1.1), (rx(0.46), 1.17), (rx(0.46), above)], step=0.06)
    d.line([(rx(0.5), 1.06), (rx(0.46), 0.98), (rx(0.46), 0.8)], step=0.06)
    d.line([(sy(1.62), 0.52), (sy(1.72), 0.58, 0.04), (rx(0.72), 0.6, 0.1), (end + 0.02, 0.6)], step=0.08)
    d.line([(-0.02 + end + 0.04, 0.47), (rx(0.46), 0.47, 0.03), (rx(0.54), below)], step=0.08)
    d.loop([(end + 0.02, 1.0), (rx(0.29), 1.0, 0.012), (rx(0.29), 0.875, 0.012), (end + 0.02, 0.875)], step=0.05)

    # Black cladding round the wheels and along the sill.
    grow = 0.075
    d.seams += [arch(d.body, c, c["front"], grow=grow), arch(d.body, c, c["rear"], grow=grow)]

    d.panel(sy(-1.9), 0.62)  # front bumper
    d.panel(sy(-1.15), 0.96)  # wing
    d.panel(sy(1.42), 0.96)  # rear quarter
    d.panel(rx(0.5), 0.72)  # rear bumper, painted
    d.panel(rx(0.8), 0.52, "CarTrim", gap=0.003, edge=False)  # rear bumper, black
    d.panel(rx(0.2), 0.43, "CarRim", gap=0.003, edge=False)  # rear skid
    d.panel(rx(0.15), 1.12)  # tailgate
    d.panel(rx(0.15), 0.935, "CarTrim", gap=0.002, lift=-0.008, edge=False)  # plate recess
    d.panel(fx(0.1), 0.75, "CarGloss", gap=0.004, lift=-0.016, edge=False)  # grille
    d.panel(sy(-1.75), 0.45, "CarTrim", gap=0.003, lift=0.003, edge=False)  # lower front
    d.panel(fx(0.25), 0.36, "CarRim", gap=0.003, edge=False)  # skid plate
    d.panel(fx(0.72), 0.66, "CarTrim", gap=0.004, lift=-0.014, edge=False)  # fog lamp pod
    for y in (c["front"], c["rear"]):
        d.panel(sy(y), c["wheel"] + c["arch"] + 0.04, "CarTrim", gap=0.003, lift=0.003, edge=False)
    at = d.on(fx(0.66), 0.88)
    d.seeds.append([seed(at, "CarLens", gap=0.0035, edge=False), seed(at, "CarTrim", lift=-0.052, gap=0, edge=False)])
    d.panel(rx(0.7), 1.08, "CarTailLens", gap=0.0035, edge=False)
    carve(d.body, d.part, d.seeds, d.seams, grid=0.18, turn=0.4, step=0.22)
    inner_shell(d.body, d.part, c, extra=[head])

    d.lamp_in(fx(0.56), 0.888, 0.034, lit=False)
    d.lamp_in(fx(0.72), 0.888, 0.042)
    d.strip("CarHead", [(fx(0.46), 0.862), (fx(0.7), 0.838), (sy(-1.95), 0.868), (sy(-1.82), 0.905)], 0.01, lift=-0.008, step=0.04)
    for z in (0.83, 0.79, 0.75, 0.71, 0.675):
        d.strip("CarChrome" if z == 0.79 else "CarTrim", [(0.0, z), (fx(0.42 if z > 0.72 else 0.38), z)], 0.012, lift=-0.008, step=0.08)
    d.strip("CarChrome", [(fx(0.68), 0.67), (fx(0.78), 0.685)], 0.02, lift=-0.006, step=0.03)
    d.strip("CarTail", [(rx(0.5), 1.1), (rx(0.72), 1.09), (sy(1.84), 1.085), (sy(1.7), 1.09)], 0.02, lift=0.0009, step=0.04)
    d.strip("CarTailGlow", [(rx(0.52), 1.05), (rx(0.72), 1.03), (sy(1.86), 1.03), (sy(1.74), 1.05)], 0.038, lift=0.0007, step=0.04)
    d.strip("CarLens", [(rx(0.5), 1.065), (rx(0.58), 1.06)], 0.02, lift=0.0012, step=0.04)

    lids(d)
    glasshouse(d)
    fittings(d)
    # Roof rails.
    for side in (-1, 1):
        points = []
        for y, lift in ((-0.3, 0.012), (-0.2, 0.04), (0.3, 0.05), (1.0, 0.05), (1.48, 0.04), (1.58, 0.012)):
            b = d.cabin.greville[4] * d.cabin.height - 0.06
            p = d.cabin.at(np.array([y]), np.array([b]))[0]
            points.append((side * p[0], p[1], p[2] + lift))
        tube(d.part, "CarRim", points, 0.0125, sides=6, step=0.09, flat=0.75)
    rear_fittings(d, 0.55, 0.44, 0.69, wiper=1.96, fin=1.48)
    plate(d.part, d.body, 0.0, 0.6, False, 4)
    plate(d.part, d.body, end, 0.935, True, 5, lift=0.004)
    return d.part, c


# ── the bus ──────────────────────────────────────────────────────────────────────────────────


def bus_wheel(name, radius, width, rim):
    """A steel disc wheel: deep, with a ring of hand holes and ten studs."""
    part = Part(name)
    h = width / 2
    centre = (0, 0, 0)
    wall = radius - rim
    tyre = [
        (rim + 0.006, -h * 0.84),
        (radius - wall * 0.3, -h * 0.98),
        (radius - 0.004, -h * 0.8),
        (radius, -h * 0.3),
        (radius, h * 0.3),
        (radius - 0.004, h * 0.8),
        (radius - 0.02, h * 0.93),
        (radius - wall * 0.42, h * 1.02),
        (rim + wall * 0.16, h * 0.96),
        (rim, h * 0.84),
    ]
    lathe(part, "CarTyre", tyre, centre, (1, 0, 0), segments=28)
    lathe(part, "CarRim", [(rim + 0.012, h * 0.86), (rim + 0.008, h * 0.92), (rim - 0.012, h * 0.86), (rim - 0.03, h * 0.3), (rim * 0.72, h * 0.22), (rim * 0.62, h * 0.32), (rim * 0.44, h * 0.34), (0.0, h * 0.34)], centre, (1, 0, 0), segments=28)
    for index in range(10):
        angle = index / 10 * math.tau
        at = np.array([h * 0.345, math.cos(angle) * rim * 0.52, math.sin(angle) * rim * 0.52])
        lathe(part, "CarChrome", [(0.017, 0.0), (0.017, 0.014), (0.0, 0.016)], at, (1, 0, 0), segments=6)
        hole = np.array([h * 0.235, math.cos(angle + 0.31) * rim * 0.8, math.sin(angle + 0.31) * rim * 0.8])
        lathe(part, "CarTrim", [(0.028, 0.0), (0.0, 0.002)], hole, (1, 0, 0), segments=8)
    return part


def bus_design():
    length, wide = 12.0, 1.275
    tip = length / 2
    front, rear = -3.28, 2.62
    roof = 2.96

    def lid(x, y):
        return roof + 0.05 * (1 - (x / 1.1) ** 2)

    def flank(y):
        return np.array(
            [
                [-0.34, 0],
                [-0.2, 0.012],
                [-0.075, 2.86],
                [-0.022, 2.7],
                [-0.008, 2.15],
                [0.0, 1.45],
                [0.0, 0.92],
                [-0.002, 0.42],
                [-0.03, 0.32],
            ]
        )

    return {
        "name": "Bus",
        "length": length,
        "half": wide,
        "front": front,
        "rear": rear,
        "wheel": 0.48,
        "tyre": 0.28,
        "bead": 0.29,
        "arch": 0.56,
        "plan": round_plan(wide, tip, [(0.8, 0.0), (1.1, 0.02), (1.235, 0.1), (1.27, 0.32), (wide, 0.8)], [(0.8, 0.0), (1.1, 0.02), (1.235, 0.1), (1.27, 0.32), (wide, 0.8)]),
        "nose_blend": (0.5, 1.5),
        "tail_blend": (0.5, 1.5),
        "weights": [SOFT, SOFT, SOFT, 3.0, SOFT, SOFT, SOFT, SOFT, SOFT],
        "nose": [(-0.46, 0), (-0.34, 0.012), (-0.25, 2.84), (-0.2, 2.62), (-0.11, 1.9), (-0.03, 1.2), (0.0, 0.82), (-0.004, 0.48), (-0.04, 0.34)],
        "tail": [(-0.34, 0), (-0.2, 0.012), (-0.1, 2.86), (-0.05, 2.7), (-0.022, 2.1), (-0.008, 1.45), (0.0, 0.92), (-0.004, 0.48), (-0.05, 0.38)],
        "flank": flank,
        "top": lambda x, y: float(lid(x, y)),
        "lid": lid,
    }


def bus():
    c = bus_design()
    body = perimeter(c)
    part = Part("Bus")
    sy, fx, rx = body.side, body.front, body.rear
    end = body.plan.length
    below = V(1.05)
    paint = "BusBody"

    def on(s, z):
        return (s, body.b(s, z))

    arches = [arch(body, c, c["front"]), arch(body, c, c["rear"])]
    # Round the front: one great screen, the lit panel at its head, the mask below it.
    windscreen = body.line([(-0.05, 2.87), (fx(0.98), 2.87, 0.1), (sy(-5.84), 2.84, 0.1), (sy(-5.72), 2.2, 0.1), (sy(-5.76), 1.1, 0.08), (fx(0.98), 1.02, 0.08), (-0.05, 1.02)], step=0.3)
    frame = body.line([(-0.05, 2.82), (fx(0.92), 2.82, 0.08), (sy(-5.88), 2.78, 0.1), (sy(-5.78), 2.2, 0.1), (sy(-5.8), 1.16, 0.06), (fx(0.92), 1.08, 0.06), (-0.05, 1.08)], step=0.3)
    sign = body.line([(-0.05, 2.77), (fx(0.82), 2.77, 0.03), (fx(0.82), 2.56, 0.03), (-0.05, 2.56)], step=0.2)
    head = body.loop([(fx(0.6), 0.94, 0.05), (fx(0.98), 0.94, 0.05), (sy(-5.86), 0.88, 0.06), (sy(-5.82), 0.72, 0.05), (fx(0.98), 0.64, 0.05), (fx(0.62), 0.66, 0.05)], step=0.1)
    bumper = body.line([(-0.02, 0.56), (fx(0.98), 0.56, 0.1), (sy(-5.7), 0.56, 0.05), (sy(-5.62), 0.5, 0.05), (sy(-5.6), below)], step=0.2)
    # Tail: lamps stacked up the corners, a rear window, the engine louvres below it.
    tail = body.loop([(rx(0.98), 2.14, 0.03), (sy(5.76), 2.14, 0.03), (sy(5.76), 1.44, 0.03), (rx(0.98), 1.44, 0.03)], step=0.16)
    louvre = body.line([(end + 0.02, 1.32), (rx(0.96), 1.32, 0.03), (rx(0.96), 0.68, 0.03), (end + 0.02, 0.68)], step=0.2)
    rear_window = body.line([(end + 0.02, 2.62), (rx(0.9), 2.62, 0.08), (rx(0.9), 1.72, 0.06), (end + 0.02, 1.72)], step=0.2)
    common = [*arches, windscreen, frame, sign, head, bumper, tail, louvre, rear_window]
    band_top, band_foot = 2.62, 1.22

    def side_panels(doors, flip):
        """All of one side: the kerb side has doors, so the window band stops for them."""
        seams = list(common)
        seeds = [
            seed(on(sy(0.0) if not doors else sy(1.4), 1.0), paint, gap=0.0),
            seed(on(0.2, 0.4), "CarTrim", gap=0.004, edge=False),
            seed(on(0.3, 1.5), "CarGlass", lift=-0.005, gap=0.004, edge=False),
            seed(on(0.3, 2.65), "BusSign", lift=-0.01, gap=0.004, edge=False),
            seed(on(0.3, 2.845), "CarGloss", lift=-0.003, gap=0.003, edge=False),
            [seed(on(fx(0.8), 0.8), "CarLens", gap=0.004, edge=False), seed(on(fx(0.8), 0.8), "CarTrim", lift=-0.05, gap=0, edge=False)],
            seed(on(rx(1.1), 1.75), "CarTailLens", gap=0.004, lift=-0.014, edge=False),
            seed(on(rx(0.3), 1.0), "CarGloss", gap=0.004, lift=-0.016, edge=False),
            seed(on(rx(0.3), 2.2), "CarGlass", lift=-0.005, gap=0.004, edge=False),
        ]
        start = -5.3
        spans = []
        for y0, y1 in doors:
            if y0 - 0.12 > start:
                spans.append((start, y0 - 0.12))
            start = y1 + 0.12
            seams.append(body.loop([(sy(y0), 2.72, 0.04), (sy(y1), 2.72, 0.04), (sy(y1), 0.46, 0.03), (sy(y0), 0.46, 0.03)], step=0.6))
            mid = (y0 + y1) / 2
            seams.append(body.loop([(sy(y0 + 0.07), 2.64, 0.03), (sy(mid - 0.02), 2.64, 0.03), (sy(mid - 0.02), 0.56, 0.03), (sy(y0 + 0.07), 0.56, 0.03)], step=0.6))
            seams.append(body.loop([(sy(mid + 0.02), 2.64, 0.03), (sy(y1 - 0.07), 2.64, 0.03), (sy(y1 - 0.07), 0.56, 0.03), (sy(mid + 0.02), 0.56, 0.03)], step=0.6))
            seeds.append(seed(on(sy(mid), 2.68), "CarTrim", gap=0.002, edge=False))
            seeds.append(seed(on(sy(y0 + 0.2), 1.6), "CarGlass", lift=-0.004, gap=0.003, edge=False))
            seeds.append(seed(on(sy(y1 - 0.2), 1.6), "CarGlass", lift=-0.004, gap=0.003, edge=False))
        spans.append((start, 5.55))
        for y0, y1 in spans:
            seams.append(body.loop([(sy(y0), band_top, 0.06), (sy(y1), band_top, 0.06), (sy(y1), band_foot, 0.06), (sy(y0), band_foot, 0.06)], step=0.7))
            seeds.append(seed(on(sy((y0 + y1) / 2), 1.9), "CarGlass", lift=-0.005, gap=0.004, edge=False))
            # The pillars and the opening lights across the band.
            line = body.line([(sy(y0 + 0.02), 2.26), (sy(y1 - 0.02), 2.26)], step=0.8)
            ribbon(body, part, "CarTrim", line, 0.024, lift=-0.002, mirror=False, flip=flip)
            for y in np.arange(y0 + 1.5, y1 - 0.4, 1.56):
                line = body.line([(sy(y), band_top), (sy(y), band_foot)], step=1.0)
                ribbon(body, part, "CarTrim", line, 0.05, lift=-0.002, mirror=False, flip=flip)
        carve(body, part, seeds, seams, grid=0.24, turn=0.28, step=0.26, mirror=False, flip=flip)

    # Doors on the kerb side, which is the right: -x, with the bus heading -y.
    side_panels([], False)
    side_panels([(-5.28, -4.12), (-0.86, 0.4)], True)
    low, high = on(sy(0.0), 0.9), on(sy(0.0), 2.8)
    walls = [body.line([(-0.1, z), (end + 0.1, z)], step=1.2) for z in (1.16, 2.7)]
    carve(body, part, [seed(p, "CarInterior", lift=-0.04, gap=0, edge=False, inward=True) for p in (low, high)], [*arches, *walls], grid=1.2, turn=1.2, step=1.0)

    # Panel lines down the flanks, and the small lamps along them.
    for y0, y1 in ((-2.72, -0.95), (0.5, 2.06), (3.18, 5.5)):
        ribbon(body, part, "CarTrim", body.line([(sy(y0), 0.66), (sy(y1), 0.66)], step=0.9), 0.008, lift=0.0008)
    for y in (-1.6, 1.2, 4.1):
        ribbon(body, part, "CarTrim", body.line([(sy(y), 1.18), (sy(y), 0.36)], step=0.5), 0.008, lift=0.0008)
    for y in (-4.6, -2.0, 1.0, 4.4):
        ribbon(body, part, "CarAmber", body.line([(sy(y), 0.52), (sy(y + 0.12), 0.52)], step=0.2), 0.04, lift=0.002)

    # Roof, with the air conditioning on it.
    roof = Dome(c["lid"])
    edge = plan_edge(body, 0, end, count=70)
    carve(roof, part, [seed((0.0, 0.4), paint, gap=0.0, edge=False)], outer=np.vstack([edge, [(edge[-1, 0], 0.0), (edge[0, 0], 0.0)]]), grid=0.8, turn=0.6, step=0.7)
    pad(part, paint, (0, -2.7, 3.08), (0, 0.7, 3.08), 1.56, 0.2, sides=10)
    pad(part, paint, (0, 2.2, 3.06), (0, 4.6, 3.06), 1.4, 0.15, sides=10)
    for y in np.linspace(-2.4, 0.4, 5):
        pad(part, "CarTrim", (-0.6, y, 3.185), (0.6, y, 3.185), 0.3, 0.012, sides=4, across=(0, 1, 0))

    # Lamps, wipers, mirrors, plates.
    for s, z, r, lit in ((fx(0.76), 0.8, 0.07, False), (fx(0.98), 0.79, 0.085, True), (sy(-5.88), 0.8, 0.055, False)):
        at_s = np.array([s])
        b = np.array([body.b(s, z)])
        p, n = body.at(at_s, b)[0], body.facing(at_s, b)[0]
        way = n * 0.4 + np.array([0, -1.0, 0]) * 0.8
        bowl(part, p - n * 0.016, way / np.linalg.norm(way), radius=r, core=r * 0.42, lit=lit)
    ribbon(body, part, "CarTail", body.line([(sy(5.82), 2.03), (rx(1.0), 2.03)], step=0.06), 0.1, lift=0.002)
    ribbon(body, part, "CarTailGlow", body.line([(sy(5.82), 1.8), (rx(1.0), 1.8)], step=0.06), 0.14, lift=0.002)
    ribbon(body, part, "CarAmber", body.line([(sy(5.82), 1.57), (rx(1.0), 1.57)], step=0.06), 0.12, lift=0.002)
    for z in np.arange(0.74, 1.3, 0.07):
        ribbon(body, part, "CarTrim", body.line([(end, z), (rx(0.94), z)], step=0.4), 0.03, lift=-0.008)
    low = body.at(np.array([fx(0.34)]), np.array([body.b(fx(0.34), 1.14)]))[0]
    wipe = np.vstack([low, low + np.array([0.3, 0.13, 0.86])]) + np.array([0, -0.03, 0])
    tube(part, "CarTrim", wipe, 0.012, sides=4, smooth=False)
    tube(part, "CarTrim", wipe * (-1, 1, 1), 0.012, sides=4, smooth=False)
    for side in (-1, 1):
        root = np.array([side * 1.2, -5.42, 2.84])
        reach = np.array([side * 1.42, -5.82, 2.62])
        tube(part, "CarTrim", [root, root + np.array([side * 0.2, -0.26, 0.06]), reach], 0.018, sides=6, step=0.12)
        pad(part, "CarTrim", reach + np.array([0, 0, 0.06]), reach - np.array([0, 0, 0.36]), 0.22, 0.1)
    plate(part, body, 0.0, 0.7, False, 6, lift=0.006)
    plate(part, body, end, 0.54, True, 7, lift=0.006)

    # The saloon inside: rows of seats, the floor, and the strip lights that keep a bus lit at night.
    for y in np.arange(-3.0, 5.2, 0.86):
        if -1.1 < y < 0.6:
            continue
        for x in (-0.76, 0.76):
            pad(part, "CarInterior", (x, y + 0.1, 0.98), (x, y + 0.18, 1.62), 0.86, 0.1)
    pad(part, "CarInterior", (0.74, -5.2, 1.16), (0.74, -4.4, 1.16), 0.9, 0.2)
    pad(part, "CarInterior", (0, -5.7, 0.62), (0, 5.8, 0.62), 2.3, 0.04, sides=4)
    pad(part, "CarInterior", (0, -5.7, 2.66), (0, 5.8, 2.66), 2.42, 0.03, sides=4)
    for x in (-0.62, 0.62):
        pad(part, "BusGlow", (x, -5.0, 2.58), (x, 5.6, 2.58), 0.11, 0.02, sides=4)
    for y in (c["front"], c["rear"]):
        for side in (-1, 1):
            wheel_well(part, side, y, c["wheel"] + 0.012, c["arch"] + 0.01, c["half"] - 0.012, c["half"] - 0.46)
    return part, c


def taxi_sign():
    """The lit box on a taxi's roof, sized for the saloon and standing on it."""
    part = Part("TaxiSign")
    centre = np.array([0.0, 0.36, 1.468])
    wide, deep, tall = 0.34, 0.135, 0.125
    index = PLATES
    high, low = 1 - index / (PLATES + 1), 1 - (index + 1) / (PLATES + 1)
    pad(part, "CarTrim", centre + (0, 0, 0.012), centre + (0, 0, 0.0), wide * 0.86, deep * 1.1, across=(1, 0, 0))
    for y, normal in ((-1.0, (0, -1, 0)), (1.0, (0, 1, 0))):
        across = np.array([1.0 if y < 0 else -1.0, 0, 0])
        at = centre + np.array([0, y * deep * 0.46, 0.02 + tall / 2])
        lean = np.array([0, -y * deep * 0.1, tall / 2])
        verts = np.array([at - across * wide / 2 - lean, at + across * wide / 2 - lean, at + across * wide * 0.46 + lean, at - across * wide * 0.46 + lean])
        uvs = np.array([(0.0, low), (1.0, low), (0.96, high), (0.04, high)])
        tris = np.array([(0, 1, 2), (0, 2, 3)])
        part.add_skin("TaxiLamp", verts, tris, np.tile(np.array(normal, float), (4, 1)), uvs)
    # The roof and ends of the box.
    a = centre + (0, 0, 0.02)
    rim = [(wide / 2, deep * 0.46), (-wide / 2, deep * 0.46), (-wide / 2, -deep * 0.46), (wide / 2, -deep * 0.46)]
    low_ring = [a + (x, y, 0) for x, y in rim]
    top_ring = [a + (x * 0.92, y * 0.8, tall) for x, y in rim]
    loft(part, "CarTrim", [low_ring, top_ring])
    return part


# ── number plates ────────────────────────────────────────────────────────────────────────────

PLATE_CODE = r"""
import sys
from PIL import Image, ImageDraw, ImageFont

path, numbers = sys.argv[1], sys.argv[2:]
width, row = 256, 32
sheet = Image.new("RGB", (width, row * (len(numbers) + 1)), (240, 240, 232))
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 26)
for index, number in enumerate(numbers):
    top = index * row
    # Front plates are white, rear plates are yellow, as they are in Algeria.
    colour = (236, 236, 228) if index % 2 == 0 else (242, 190, 28)
    draw.rectangle((0, top, width, top + row), fill=colour)
    draw.rectangle((1, top + 1, width - 2, top + row - 2), outline=(20, 20, 20), width=1)
    length = draw.textlength(number, font=font)
    draw.text(((width - length) / 2, top + 1), number, fill=(12, 12, 12), font=font)
top = len(numbers) * row
draw.rectangle((0, top, width, top + row), fill=(250, 226, 150))
big = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)
length = draw.textlength("TAXI", font=big)
draw.text(((width - length) / 2, top - 1), "TAXI", fill=(16, 14, 10), font=big)
sheet.save(path, optimize=True)
"""
NUMBERS = ["048213 118 16", "048213 118 16", "271905 116 16", "271905 116 16", "163740 121 16", "163740 121 16", "000417 214 16", "000417 214 16"]


def plate_sheet():
    """Blender's Python has no PIL, so the plates are drawn by the system's one and read back."""
    folder = tempfile.mkdtemp()
    path = os.path.join(folder, "plates.png")
    subprocess.run([shutil.which("python") or "python", "-c", PLATE_CODE, path, *NUMBERS], check=True)
    image = bpy.data.images.load(path)
    image.pack()
    return image


def picture_on(material, image):
    tree = material.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if material.name == "TaxiLamp":
        tree.links.new(node.outputs["Color"], bsdf.inputs["Emission Color"])


def count_by_finish(item):
    item.data.calc_loop_triangles()
    counts = {}
    slots = [m.name for m in item.data.materials]
    for tri in item.data.loop_triangles:
        counts[slots[tri.material_index]] = counts.get(slots[tri.material_index], 0) + 1
    return counts


# ── looking at them ──────────────────────────────────────────────────────────────────────────


PREVIEW_PAINT = {"Compact": (0.8, 0.8, 0.76), "Saloon": (0.69, 0.38, 0.008), "Crossover": (0.2, 0.012, 0.016), "Bus": (0.8, 0.8, 0.78)}


def repaint(colour):
    bsdf = next(n for n in M["CarBody"].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*colour, 1)


def preview(items, folder, views):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = 1100, 620
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"

    world = bpy.data.worlds.new("Night")
    world.use_nodes = True
    tree = world.node_tree
    background = tree.nodes["Background"]
    coords = tree.nodes.new("ShaderNodeTexCoord")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coords.outputs["Generated"], split.inputs[0])
    tree.links.new(split.outputs["Z"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], background.inputs["Color"])
    stops = ramp.color_ramp.elements
    stops[0].position, stops[0].color = 0.0, (0.03, 0.022, 0.018, 1)
    stops[1].position, stops[1].color = 0.45, (0.006, 0.009, 0.02, 1)
    middle = stops.new(0.1)
    middle.color = (0.045, 0.036, 0.04, 1)
    background.inputs["Strength"].default_value = 1.0
    scene.world = world

    ground = bpy.data.meshes.new("Road")
    ground.from_pydata([(-80, -80, 0), (80, -80, 0), (80, 80, 0), (-80, 80, 0)], [], [(0, 1, 2, 3)])
    road = Graph("Road").set(colour=(0.028, 0.028, 0.03), rough=0.42)
    ground.materials.append(road.material)
    floor = bpy.data.objects.new("Road", ground)
    collection.objects.link(floor)

    # One street lamp, warm and soft, and a far row of them for the paint to reflect.
    lamp = bpy.data.lights.new("Lamp", "AREA")
    lamp.size = 2.4
    lamp.energy = 520
    lamp.color = (1.0, 0.72, 0.46)
    holder = bpy.data.objects.new("Lamp", lamp)
    collection.objects.link(holder)
    holder.rotation_euler = (0.3, -0.3, 0)
    for index, (x, y) in enumerate(((14, -22), (14, -6), (14, 10), (14, 26), (-14, 22), (-14, 6), (-14, -10), (-14, -26))):
        far = bpy.data.lights.new(f"Far{index}", "AREA")
        far.size = 1.6
        far.energy = 900
        far.color = (1.0, 0.78, 0.55)
        spot = bpy.data.objects.new(f"Far{index}", far)
        collection.objects.link(spot)
        spot.location = (x, y, 7.5)
        spot.rotation_euler = Vector((-x, -y, -7.5)).to_track_quat("-Z", "Y").to_euler()

    camera = None
    for item in items:
        wheel = bpy.data.objects[f"{item.name}Wheel"]
        wheel.hide_render = True
        for y in item["axles"]:
            for side in (-1, 1):
                copy = bpy.data.objects.new("wheel", wheel.data)
                collection.objects.link(copy)
                copy.location = (side * item["wheel_x"], y, item["wheel_radius"])
                copy.rotation_euler = (0, 0, 0 if side > 0 else math.pi)
                copy["wheel_of"] = item.name
    if "TaxiSign" in bpy.data.objects:
        bpy.data.objects["TaxiSign"].hide_render = True
    for item in items:
        for other in items:
            other.hide_render = other is not item
        for child in collection.objects:
            if child.get("wheel_of"):
                child.hide_render = child["wheel_of"] != item.name
        repaint(PREVIEW_PAINT[item.name])
        if "TaxiSign" in bpy.data.objects:
            bpy.data.objects["TaxiSign"].hide_render = item.name != "Saloon"
        size = max(item.dimensions.x, item.dimensions.y)
        high = item.dimensions.z
        holder.location = (-size * 0.95, -size * 0.45, 6.5 + high * 0.5)
        for view, (ax, ay, az, lens) in views.items():
            place = (ax * size, ay * size, az * high)
            target = (0, 0, high * 0.44)
            if camera is None:
                camera = add_camera(scene, place, target, lens=lens)
            camera.location = place
            camera.data.lens = lens
            camera.rotation_euler = (Vector(target) - Vector(place)).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = os.path.join(folder, f"{item.name}_{view}.png")
            bpy.ops.render.render(write_still=True)
            print("rendered", view, flush=True)


VIEWS = {
    "front34": (-0.72, -1.0, 0.78, 45),
    "rear34": (0.72, 1.0, 0.82, 45),
    "side": (2.3, 0.0, 0.62, 60),
    "front": (0.0, -2.0, 0.66, 60),
    "rear": (0.0, 2.0, 0.7, 60),
    "close": (-0.46, -0.64, 0.6, 50),
    "above": (-0.42, -0.5, 1.9, 40),
    "rearclose": (0.44, 0.66, 0.72, 50),
}

built = []
sheet = plate_sheet()
picture_on(M["CarPlate"], sheet)
picture_on(M["TaxiLamp"], sheet)
for name, make, spin in (("Compact", compact, tyre_and_rim), ("Saloon", saloon, tyre_and_rim), ("Crossover", crossover, tyre_and_rim), ("Bus", bus, bus_wheel)):
    if ONLY and name not in ONLY:
        continue
    part, c = make()
    item = finish(part, name)
    built.append(item)
    if spin is bus_wheel:
        wheel = finish(bus_wheel(f"{name}Wheel", c["wheel"], c["tyre"], c["bead"]), f"{name}Wheel")
    else:
        wheel = finish(tyre_and_rim(f"{name}Wheel", c["wheel"], c["tyre"], c["bead"], **c.get("rim", {})), f"{name}Wheel")
    # What the game needs to place and spin the wheels, and to know when the bike's hit something.
    item["half_length"] = c["length"] / 2
    item["half_width"] = c["half"]
    item["axles"] = [float(c["front"]), float(c["rear"])]
    item["wheel_x"] = float(c["half"] - c["tyre"] / 2 - 0.012)
    item["wheel_radius"] = float(c["wheel"])
    body_count = sum(count_by_finish(item).values())
    wheel_count = sum(count_by_finish(wheel).values())
    print(name, "body", body_count, "wheel", wheel_count, "all", body_count + 4 * wheel_count, count_by_finish(item), flush=True)

if not ONLY or "Saloon" in ONLY:
    finish(taxi_sign(), "TaxiSign")

if not ONLY:
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_normals=True,
        export_yup=True,
        export_extras=True,
        export_draco_mesh_compression_enable=True,
        # A clear coat shows every step in a normal, so they're kept finer than the default.
        export_draco_position_quantization=15,
        export_draco_normal_quantization=14,
    )
    print("Packed cars", round(os.path.getsize(OUT) / 1e6, 3), "MB", flush=True)

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    picked = VIEWS if not os.environ.get("CAR_VIEWS") else {k: VIEWS[k] for k in os.environ["CAR_VIEWS"].split(",")}
    preview(built, PREVIEW, picked)

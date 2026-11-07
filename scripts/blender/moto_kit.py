"""
The geometry for /3d's motorcycles. Imported by build_moto.py, never run.

Two kinds of thing make up a bike. Bodywork is a Skin: stations along the bike, each a row of
control points, read as a rational spline so a heavy point becomes a crease that can fade out
along its length. Panels are then cut out of a skin in side view, which is how a designer draws
them, and each gets real thickness and a rolled edge: the highlight on that edge, and the dark gap
beside it, is most of what separates a real fairing from a shape. The normals come from the
surface itself, not the mesh, so a reflection runs clean across a panel however it was cut.

Everything else is turned, swept or extruded, the way it's made: lathe, tube, loft and extrude.

Axes: x across (the rider's left is +x), y along (the front is -y), z up, in metres, ground at 0.
"""

import math

import bmesh  # noqa: F401
import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt


# ── 2D outlines ──────────────────────────────────────────────────────────────────────────────


def rounded(points, step=0.004, closed=True):
    """
    A polygon with rounded corners, resampled. A point is (a, b) or (a, b, radius); a radius of 0
    is a sharp corner. It's how panels are really drawn: straight runs and tight radii.
    """
    pts = [np.array(p[:2], float) for p in points]
    radii = [p[2] if len(p) > 2 else 0.0 for p in points]
    n = len(pts)
    out = []
    span = range(n) if closed else range(1, n - 1)
    if not closed:
        out.append(pts[0])
    for i in span:
        p, a, b = pts[i], pts[i - 1], pts[(i + 1) % n]
        r = radii[i]
        da, db = a - p, b - p
        la, lb = np.linalg.norm(da), np.linalg.norm(db)
        if r <= 0 or la < 1e-9 or lb < 1e-9:
            out.append(p)
            continue
        d = min(r, la * 0.48, lb * 0.48)
        s, e = p + da / la * d, p + db / lb * d
        count = max(int(d * 2.2 / step), 3)
        for t in np.linspace(0, 1, count):
            out.append((1 - t) ** 2 * s + 2 * (1 - t) * t * p + t * t * e)
    if not closed:
        out.append(pts[-1])
    return resample(np.array(out), step, closed)


def resample(line, step, closed=True):
    """Even spacing along a line, keeping its corners where it can."""
    line = np.asarray(line, float)
    if closed:
        line = np.vstack([line, line[:1]])
    lengths = np.linalg.norm(np.diff(line, axis=0), axis=1)
    keep = np.concatenate([[True], lengths > 1e-9])
    line = line[keep]
    lengths = np.linalg.norm(np.diff(line, axis=0), axis=1)
    along = np.concatenate([[0], np.cumsum(lengths)])
    count = max(int(along[-1] / step), 6)
    at = np.linspace(0, along[-1], count + 1)
    if closed:
        at = at[:-1]
    return np.stack([np.interp(at, along, line[:, i]) for i in range(line.shape[1])], axis=1)


def inside(points, polygon):
    """Which points are inside a polygon: a ray cast, for all of them at once."""
    x, y = points[:, 0][:, None], points[:, 1][:, None]
    ax, ay = polygon[:, 0][None, :], polygon[:, 1][None, :]
    bx, by = np.roll(polygon[:, 0], -1)[None, :], np.roll(polygon[:, 1], -1)[None, :]
    crosses = (ay > y) != (by > y)
    with np.errstate(divide="ignore", invalid="ignore"):
        hit = x < (bx - ax) * (y - ay) / (by - ay) + ax
    return np.count_nonzero(crosses & hit, axis=1) % 2 == 1


def distance_to(points, polygon):
    """How far each point is from a closed line."""
    a = polygon
    b = np.roll(polygon, -1, axis=0)
    ab = b - a
    best = np.full(len(points), np.inf)
    for start in range(0, len(a), 256):
        s, d = a[start : start + 256], ab[start : start + 256]
        rel = points[:, None, :] - s[None, :, :]
        t = np.clip((rel * d).sum(2) / np.maximum((d * d).sum(1), 1e-12), 0, 1)
        gap = rel - t[..., None] * d[None, :, :]
        best = np.minimum(best, np.sqrt((gap * gap).sum(2)).min(1))
    return best


def triangulate(outer, holes=(), interior=None):
    """A polygon with holes and any extra points inside it, as triangles."""
    points, edges = [], []
    for loop in [outer, *holes]:
        start = len(points)
        points.extend(map(tuple, loop))
        edges.extend((start + i, start + (i + 1) % len(loop)) for i in range(len(loop)))
    if interior is not None and len(interior):
        points.extend(map(tuple, interior))
    verts, _, faces, *_ = delaunay_2d_cdt([Vector(p) for p in points], edges, [], 0, 1e-7)
    verts = np.array([tuple(v) for v in verts])
    faces = np.array([f for f in faces if len(f) == 3])
    centres = verts[faces].mean(1)
    keep = inside(centres, outer)
    for hole in holes:
        keep &= ~inside(centres, hole)
    return verts, faces[keep]


def loops_of(faces):
    """The boundary of a set of triangles, as closed chains of vertices in winding order."""
    edges = {}
    for f in faces:
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            if (b, a) in edges:
                del edges[(b, a)]
            else:
                edges[(a, b)] = True
    following = {}
    for a, b in edges:
        following.setdefault(a, []).append(b)
    loops = []
    while following:
        start = next(iter(following))
        loop, at = [start], following[start].pop()
        if not following[start]:
            del following[start]
        while at != start:
            loop.append(at)
            nxt = following[at].pop()
            if not following[at]:
                del following[at]
            at = nxt
        loops.append(loop)
    return loops


# ── where geometry collects ──────────────────────────────────────────────────────────────────


class Part:
    """
    One rigid piece of the bike, with a pivot for the game to turn it about. Geometry piles up by
    material, and a piece whose normals were worked out from its surface stays separate from one
    left to be smoothed by angle.
    """

    def __init__(self, name, pivot=(0, 0, 0), parent=None):
        self.name = name
        self.pivot = Vector(pivot)
        self.parent = parent
        self.solid = {}
        self.skins = {}
        self.shades = {}

    def add(self, material, verts, faces, uvs=None):
        chunk = self.solid.setdefault(material, [[], [], [], 0])
        chunk[0].append(np.asarray(verts, float))
        chunk[1].extend(([i + chunk[3] for i in f] for f in faces))
        count = len(verts)
        chunk[2].append(np.zeros((count, 2)) if uvs is None else np.asarray(uvs, float))
        chunk[3] += count

    def add_skin(self, material, verts, faces, normals, uvs, shade=None):
        """`shade` is a brightness per vertex, for a fade in the paint itself."""
        chunk = self.skins.setdefault(material, [[], [], [], [], 0])
        chunk[0].append(np.asarray(verts, float))
        chunk[1].append(np.asarray(faces) + chunk[4])
        chunk[2].append(np.asarray(normals, float))
        chunk[3].append(np.asarray(uvs, float))
        chunk[4] += len(verts)
        self.shades.setdefault(material, []).append(np.ones(len(verts)) if shade is None else np.asarray(shade, float))

    def _mesh(self, name, verts, faces, uvs, material):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata((verts - np.array(self.pivot)).tolist(), [], faces)
        mesh.materials.append(material)
        layer = mesh.uv_layers.new(name="UVMap")
        indices = np.zeros(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get("vertex_index", indices)
        layer.data.foreach_set("uv", uvs[indices].ravel())
        return mesh

    def build(self, materials, collection, angle=32, tidy=False, shaded=()):
        root = bpy.data.objects.new(self.name, None)
        collection.objects.link(root)
        root.location = self.pivot
        self.root = root
        if self.parent is not None:
            root.parent = self.parent.root
            root.location = self.pivot - self.parent.pivot
        made = []
        for key, (verts, faces, uvs, _) in self.solid.items():
            mesh = self._mesh(f"{self.name}.{key}", np.vstack(verts), faces, np.vstack(uvs), materials[key])
            if tidy:
                # Winds every closed solid outward, however its pieces were drawn.
                work = bmesh.new()
                work.from_mesh(mesh)
                bmesh.ops.recalc_face_normals(work, faces=work.faces)
                work.to_mesh(mesh)
                work.free()
            mesh.shade_smooth()
            mesh.set_sharp_from_angle(angle=math.radians(angle))
            made.append(mesh)
        for key, (verts, faces, normals, uvs, _) in self.skins.items():
            all_faces = np.vstack(faces).tolist()
            mesh = self._mesh(f"{self.name}.{key}.skin", np.vstack(verts), all_faces, np.vstack(uvs), materials[key])
            mesh.shade_smooth()
            mesh.normals_split_custom_set_from_vertices(np.vstack(normals).tolist())
            if key in shaded:
                # A vertex colour carries the fade: it's the same grey in all three channels.
                value = np.concatenate(self.shades[key])
                layer = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
                layer.data.foreach_set("color", np.stack([value, value, value, np.ones_like(value)], axis=1).ravel())
                mesh.color_attributes.active_color = layer
            made.append(mesh)
        for mesh in made:
            item = bpy.data.objects.new(mesh.name, mesh)
            collection.objects.link(item)
            item.parent = root
        return root


# ── turned, swept, lofted, extruded ──────────────────────────────────────────────────────────


def frame_for(axis):
    """Two directions square to an axis."""
    axis = np.asarray(axis, float)
    axis = axis / np.linalg.norm(axis)
    helper = np.array([0, 0, 1.0]) if abs(axis[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(axis, helper)
    u /= np.linalg.norm(u)
    return axis, u, np.cross(axis, u)


def grid_faces(rows, columns, closed=True):
    faces = []
    last = columns if closed else columns - 1
    for i in range(rows - 1):
        for j in range(last):
            a, b = i * columns + j, i * columns + (j + 1) % columns
            faces.append((a, b, b + columns, a + columns))
    return faces


def lathe(part, material, profile, centre, axis=(1, 0, 0), segments=96, turn=0.0, fit=False):
    """
    Turns a profile of (radius, along the axis) points about an axis: what a lathe does. The
    profile's points are kept exactly, so a chamfer in it stays a chamfer.
    """
    a, u, v = frame_for(axis)
    c = np.asarray(centre, float)
    angles = np.linspace(0, math.tau, segments, endpoint=False) + turn
    ring = np.cos(angles)[:, None] * u + np.sin(angles)[:, None] * v
    verts, uvs = [], []
    along = 0.0
    previous = None
    for r, offset in profile:
        if previous is not None:
            along += math.hypot(r - previous[0], offset - previous[1])
        previous = (r, offset)
        verts.append(c + a * offset + max(r, 1e-5) * ring)
        uvs.append(np.stack([angles / math.tau, np.full(segments, along)], axis=1))
    uvs = np.vstack(uvs)
    if fit:
        uvs[:, 1] /= along  # Run the map's full height from one end of the profile to the other.
    part.add(material, np.vstack(verts), grid_faces(len(profile), segments), uvs)


def smooth_path(points, step=0.01):
    """A Catmull-Rom curve through points."""
    p = np.asarray(points, float)
    p = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        count = max(int(np.linalg.norm(p2 - p1) / step), 2)
        for t in np.linspace(0, 1, count, endpoint=False):
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t**3))
    out.append(p[-2])
    return np.array(out)


def sweep_frames(path):
    """A frame along a path, carried along without twisting."""
    tangents = np.gradient(path, axis=0)
    tangents /= np.maximum(np.linalg.norm(tangents, axis=1, keepdims=True), 1e-9)
    _, u, _ = frame_for(tangents[0])
    us = [u]
    for i in range(1, len(path)):
        u = us[-1] - tangents[i] * np.dot(us[-1], tangents[i])
        us.append(u / max(np.linalg.norm(u), 1e-9))
    us = np.array(us)
    return tangents, us, np.cross(tangents, us)


def tube(part, material, points, radius, sides=16, step=0.012, smooth=True, cap=True, flat=1.0):
    """A pipe along a path. `radius` may be one number or one per path point; `flat` squashes it."""
    path = smooth_path(points, step) if smooth else np.asarray(points, float)
    t, u, v = sweep_frames(path)
    count = len(path)
    if np.ndim(radius):
        share = np.linspace(0, len(radius) - 1, count)
        radii = np.interp(share, np.arange(len(radius)), radius)
    else:
        radii = np.full(count, radius)
    angles = np.linspace(0, math.tau, sides, endpoint=False)
    verts, uvs = [], []
    along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    for i in range(count):
        ring = np.cos(angles)[:, None] * u[i] * radii[i] + np.sin(angles)[:, None] * v[i] * radii[i] * flat
        verts.append(path[i] + ring)
        uvs.append(np.stack([angles / math.tau, np.full(sides, along[i])], axis=1))
    verts = np.vstack(verts)
    faces = grid_faces(count, sides)
    uvs = np.vstack(uvs)
    if cap:
        n = len(verts)
        verts = np.vstack([verts, path[0], path[-1]])
        uvs = np.vstack([uvs, [0, 0], [0, along[-1]]])
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((n, k, j))
            faces.append((n + 1, (count - 1) * sides + j, (count - 1) * sides + k))
    part.add(material, verts, faces, uvs)
    return path


def loft(part, material, rings, cap=True, uvs=None):
    """A skin over rings that all have the same number of points."""
    rings = np.asarray(rings, float)
    rows, columns = rings.shape[:2]
    verts = rings.reshape(-1, 3)
    faces = grid_faces(rows, columns)
    if cap:
        faces.append(tuple(range(columns - 1, -1, -1)))
        faces.append(tuple((rows - 1) * columns + j for j in range(columns)))
    part.add(material, verts, faces, uvs)


def extrude(part, material, outline, depth, origin, ex, ey, holes=(), chamfer=0.0008):
    """
    A flat shape cut out and given thickness, the way a bracket or a brake disc is made. `outline`
    is in the plane of ex and ey, and it grows along their cross product from `origin`.
    """
    ex, ey = np.asarray(ex, float), np.asarray(ey, float)
    ez = np.cross(ex, ey)
    o = np.asarray(origin, float)
    verts2, faces = triangulate(np.asarray(outline, float), [np.asarray(h, float) for h in holes])
    loops = loops_of(faces.tolist())
    place = lambda pts, z: o + pts[:, :1] * ex + pts[:, 1:2] * ey + z * ez  # noqa: E731
    count = len(verts2)
    verts = [place(verts2, depth), place(verts2, 0.0)]
    all_faces = [tuple(f) for f in faces.tolist()]
    all_faces += [(f[2] + count, f[1] + count, f[0] + count) for f in faces.tolist()]
    total = count * 2

    for loop in loops:
        pts = verts2[loop]
        d = np.roll(pts, -1, axis=0) - np.roll(pts, 1, axis=0)
        d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
        outward = np.stack([d[:, 1], -d[:, 0]], axis=1)
        m = len(loop)
        # The two faces are drawn in by the chamfer, so the wall sits on the true outline.
        rings = [pts - outward * chamfer, pts, pts, pts - outward * chamfer]
        heights = [depth, depth - chamfer, chamfer, 0.0]
        start = total
        for ring, z in zip(rings, heights):
            verts.append(place(ring, z))
            total += m
        for row in range(3):
            for j in range(m):
                k = (j + 1) % m
                a, b = start + row * m + j, start + row * m + k
                all_faces.append((a, a + m, b + m, b))
        # Tie the chamfers to the two faces.
        for j in range(m):
            k = (j + 1) % m
            all_faces.append((loop[j], start + j, start + k, loop[k]))
            last = start + 3 * m
            all_faces.append((loop[k] + count, last + k, last + j, loop[j] + count))
    verts = np.vstack(verts)
    uvs = np.stack([verts @ ex, verts @ ey], axis=1)
    part.add(material, verts, all_faces, uvs)


def bolt(part, centre, normal, size=0.005, material="Bolt", washer=False):
    """A socket-head cap screw, seen from its head."""
    profile = []
    if washer:
        profile += [(size * 1.9, 0), (size * 1.9, size * 0.28), (size * 1.25, size * 0.3)]
    base = size * 0.3 if washer else 0
    profile += [
        (size * 1.2, base),
        (size * 1.2, base + size * 1.0),
        (size * 1.08, base + size * 1.14),
        (size * 0.62, base + size * 1.14),
        (size * 0.58, base + size * 0.62),
        (0, base + size * 0.62),
    ]
    lathe(part, material, profile, centre, normal, segments=14)


def ring_of(centre, axis, radius, count, turn=0.0):
    """Points round a circle: bolt circles, mostly."""
    a, u, v = frame_for(axis)
    c = np.asarray(centre, float)
    return [c + radius * (math.cos(t + turn) * u + math.sin(t + turn) * v) for t in np.linspace(0, math.tau, count, endpoint=False)]


def circle(radius, centre=(0, 0), step=0.004, count=None):
    n = count or max(int(math.tau * radius / step), 10)
    t = np.linspace(0, math.tau, n, endpoint=False)
    return np.stack([centre[0] + radius * np.cos(t), centre[1] + radius * np.sin(t)], axis=1)


def glyphs(text, font_path):
    """A line of type as flat triangles: (points, triangles, width, cap height)."""
    curve = bpy.data.curves.new("Type", "FONT")
    curve.body = text
    curve.font = bpy.data.fonts.load(font_path)
    curve.resolution_u = 6
    holder = bpy.data.objects.new("Type", curve)
    bpy.context.scene.collection.objects.link(holder)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(depsgraph))
    mesh.calc_loop_triangles()
    verts = np.array([v.co[:2] for v in mesh.vertices])
    tris = np.array([t.vertices[:] for t in mesh.loop_triangles])
    bpy.data.objects.remove(holder)
    verts = verts - verts.min(0)
    return verts, tris, float(verts[:, 0].max()), float(verts[:, 1].max())


# ── bodywork ─────────────────────────────────────────────────────────────────────────────────


def spline_basis(v, count, degree=3):
    """Clamped uniform B-spline basis, for every parameter at once: (points, controls)."""
    v = np.clip(np.asarray(v, float), 0, 1 - 1e-9)
    knots = np.concatenate([np.zeros(degree), np.linspace(0, 1, count - degree + 1), np.ones(degree)])
    basis = np.zeros((len(v), len(knots) - 1))
    for i in range(len(knots) - 1):
        basis[:, i] = (knots[i] <= v) & (v < knots[i + 1])
    for d in range(1, degree + 1):
        nxt = np.zeros((len(v), len(knots) - d - 1))
        for i in range(len(knots) - d - 1):
            left = knots[i + d] - knots[i]
            right = knots[i + d + 1] - knots[i + 1]
            if left > 0:
                nxt[:, i] += (v - knots[i]) / left * basis[:, i]
            if right > 0:
                nxt[:, i] += (knots[i + d + 1] - v) / right * basis[:, i + 1]
        basis = nxt
    return basis


def hermite(xs, ys, x):
    """A smooth curve through rows of numbers, in x: Catmull-Rom with uneven spacing."""
    xs = np.asarray(xs, float)
    ys = np.asarray(ys, float)
    x = np.clip(np.asarray(x, float), xs[0], xs[-1])
    slopes = np.zeros_like(ys)
    slopes[1:-1] = (ys[2:] - ys[:-2]) / (xs[2:] - xs[:-2]).reshape(-1, *[1] * (ys.ndim - 1))
    slopes[0] = (ys[1] - ys[0]) / (xs[1] - xs[0])
    slopes[-1] = (ys[-1] - ys[-2]) / (xs[-1] - xs[-2])
    i = np.clip(np.searchsorted(xs, x, side="right") - 1, 0, len(xs) - 2)
    h = (xs[i + 1] - xs[i]).reshape(-1, *[1] * (ys.ndim - 1))
    t = ((x - xs[i]) / (xs[i + 1] - xs[i])).reshape(-1, *[1] * (ys.ndim - 1))
    return (
        (2 * t**3 - 3 * t**2 + 1) * ys[i]
        + (t**3 - 2 * t**2 + t) * h * slopes[i]
        + (-2 * t**3 + 3 * t**2) * ys[i + 1]
        + (t**3 - t**2) * h * slopes[i + 1]
    )


class V(float):
    """In a panel outline, a place on the profile (0 at the top centre, 1 at the bottom) instead of a height."""


class Skin:
    """
    One half of a piece of bodywork. `stations` is a list of (y, points), each point (x, z, weight)
    from the top centreline downward, the same number at every station. Weight 1 is a soft curve;
    heavier pulls the surface to the point, and that's a crease.
    """

    def __init__(self, stations):
        stations = sorted(stations, key=lambda s: s[0])
        self.ys = np.array([s[0] for s in stations], float)
        self.controls = np.array([[(p[0], p[1], p[2] if len(p) > 2 else 1.0) for p in s[1]] for s in stations], float)
        self.count = self.controls.shape[1]
        # Where along the profile each control point has its effect.
        degree = 3
        knots = np.concatenate([np.zeros(degree), np.linspace(0, 1, self.count - degree + 1), np.ones(degree)])
        self.greville = np.array([knots[i + 1 : i + degree + 1].mean() for i in range(self.count)])
        lengths = np.linalg.norm(np.diff(self.controls[:, :, :2], axis=1), axis=2).sum(1)
        self.height = float(lengths.max())

    def point(self, y, v):
        y = np.asarray(y, float)
        c = hermite(self.ys, self.controls, y)
        basis = spline_basis(v, self.count) * np.maximum(c[:, :, 2], 0.02)
        basis /= basis.sum(1, keepdims=True)
        x = (basis * c[:, :, 0]).sum(1)
        z = (basis * c[:, :, 1]).sum(1)
        return np.stack([x, y, z], axis=1)

    def normal(self, y, v):
        dy, dv = 0.0015, 0.0015
        y, v = np.asarray(y, float), np.asarray(v, float)
        a = self.point(y + dy, v) - self.point(y - dy, v)
        b = self.point(y, np.clip(v + dv, 0, 1)) - self.point(y, np.clip(v - dv, 0, 1))
        n = np.cross(b, a)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        return n

    def v_at(self, y, z):
        """Where on the profile a side-view point lands: down from the top, to the first crossing."""
        y = np.atleast_1d(np.asarray(y, float))
        z = np.atleast_1d(np.asarray(z, float))
        samples = np.linspace(0, 1, 500)
        out = np.zeros(len(y))
        for i in range(len(y)):
            p = self.point(np.full(500, y[i]), samples)
            heights = p[:, 2]
            lowest = int(np.argmin(heights))
            top = int(np.argmax(heights[: lowest + 1]))
            run = heights[top : lowest + 1]
            out[i] = np.interp(-z[i], -run, samples[top : lowest + 1])
        return out

    def spot(self, y, where):
        """A point on the skin and which way it faces."""
        v = float(where) if isinstance(where, V) else float(self.v_at(y, where)[0])
        ys, vs = np.array([float(y)]), np.array([v])
        return self.point(ys, vs)[0], self.normal(ys, vs)[0]

    def fasten(self, part, places, size=0.0042, lift=0.0):
        """The quarter-turn fasteners that hold a panel on, on both sides."""
        for y, where in places:
            p, n = self.spot(y, where)
            for flip in (np.array([1.0, 1, 1]), np.array([-1.0, 1, 1])):
                bolt(part, (p + n * lift) * flip, n * flip, size=size, washer=True)

    def stamp(self, part, material, glyph, centre, size, angle=0.0, lift=0.0005):
        """
        Lettering laid on the skin, on both sides, reading front to back on each. `glyph` comes from
        `glyphs`, `size` is its cap height, and `angle` tilts it in side view.
        """
        verts, tris, width, height = glyph
        p = (verts - np.array([width / 2, height / 2])) * (size / height)
        for side in (1, -1):
            a = math.radians(angle) * side
            along = p[:, 0] * math.cos(a) - p[:, 1] * math.sin(a)
            up = p[:, 0] * math.sin(a) + p[:, 1] * math.cos(a)
            y = centre[0] + side * along
            z = centre[1] + up
            v = self.v_at(y, z)
            position = self.point(y, v)
            normals = self.normal(y, v)
            position = position + normals * lift
            flip = np.array([side, 1.0, 1.0])
            position, normals = position * flip, normals * flip
            faces = tris
            tri = position[faces]
            if np.sum(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]) * normals[faces].mean(1)) < 0:
                faces = faces[:, ::-1]
            part.add_skin(material, position, faces, normals, np.stack([y, v], axis=1))

    def flat(self, points, step=0.005):
        """An outline of (y, height or V, corner radius) points, unrolled onto the skin."""
        control = []
        for point in points:
            y, where = point[0], point[1]
            radius = point[2] if len(point) > 2 else 0.0
            v = float(where) if isinstance(where, V) else float(self.v_at(y, where)[0])
            control.append((y, v * self.height, radius))
        return rounded(control, step)

    def panel(self, part, material, outline, holes=(), grid=0.011, thick=0.0035, roll=0.0022, mirror=True, join=False, lift=0.0, step=0.005):
        """
        Cuts a panel out of the skin. `outline` is a list of points for `flat`. Set `join` when it
        runs up to the centreline, where the two halves meet without an edge, and `lift` to stand
        it proud of the surface, for a panel laid over another.
        """
        outer = self.flat(outline, step)
        hole_loops = [self.flat(h, step) for h in holes]

        # The lattice lands on the creases, so a mesh edge runs right along each one.
        low, high = outer.min(0), outer.max(0)
        ys = np.arange(low[0] + grid * 0.5, high[0], grid)
        heavy = self.greville[self.controls[:, :, 2].max(0) > 3] * self.height
        vs = np.unique(np.concatenate([np.arange(low[1], high[1], grid), heavy[(heavy > low[1]) & (heavy < high[1])]]))
        lattice = np.stack(np.meshgrid(ys, vs, indexing="ij"), axis=-1).reshape(-1, 2)
        lattice = lattice[inside(lattice, outer)]
        for hole in hole_loops:
            lattice = lattice[~inside(lattice, hole)]
        clear = distance_to(lattice, outer)
        for hole in hole_loops:
            clear = np.minimum(clear, distance_to(lattice, hole))
        lattice = lattice[clear > grid * 0.45]

        flat, faces = triangulate(outer, hole_loops, lattice)
        y, v = flat[:, 0], flat[:, 1] / self.height
        position = self.point(y, v)
        normals = self.normal(y, v)
        position = position + normals * lift

        tri = position[faces]
        winding = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        if np.sum(winding * normals[faces].mean(1)) < 0:
            faces = faces[:, ::-1]

        verts, norms, uvs, tris = [position], [normals], [flat], [faces]
        total = len(position)
        steps = 3
        for loop in loops_of(faces.tolist()):
            p, n = position[loop], normals[loop]
            at_centre = np.abs(p[:, 0]) < 0.0015 if join else np.zeros(len(loop), bool)
            d = np.roll(p, -1, axis=0) - np.roll(p, 1, axis=0)
            d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-12)
            out = np.cross(d, n)
            rows = []
            for k in range(1, steps + 1):
                t = k / steps * math.pi / 2
                pos = p + out * (roll * math.sin(t)) - n * (roll * (1 - math.cos(t)))
                nor = n * math.cos(t) + out * math.sin(t)
                rows.append((pos, nor))
            rows.append((p + out * roll - n * thick, out))
            rows.append((p + out * (roll * 0.2) - n * (thick + roll), -n))
            m = len(loop)
            previous = np.array(loop)
            for pos, nor in rows:
                pos = np.where(at_centre[:, None], p - n * 1e-4, pos)
                ring = np.arange(total, total + m)
                verts.append(pos)
                norms.append(nor)
                uvs.append(np.repeat(flat[loop][:1], m, axis=0) * 0 + flat[loop])
                total += m
                nxt = np.roll(np.arange(m), -1)
                quad_a = np.stack([previous, ring, ring[nxt]], axis=1)
                quad_b = np.stack([previous, ring[nxt], previous[nxt]], axis=1)
                tris.extend([quad_a, quad_b])
                previous = ring

        verts, norms = np.vstack(verts), np.vstack(norms)
        uvs, tris = np.vstack(uvs), np.vstack(tris)
        part.add_skin(material, verts, tris, norms, uvs)
        if mirror:
            flip = np.array([-1.0, 1.0, 1.0])
            part.add_skin(material, verts * flip, tris[:, ::-1], norms * flip, uvs)

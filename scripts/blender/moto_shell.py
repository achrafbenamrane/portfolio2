"""
Hard-surface panels for /3d's motorcycles. Imported by the moto scripts, never run.

A sharp fairing isn't a smooth skin with lines drawn on it: it's flat facets that meet in tight
radii, cut to an outline, with an edge you can see. So a panel here is drawn the way a designer
draws one, as a cage of named points and the facets between them. It's subdivided with creases,
given thickness and a rolled edge, and its normals are weighted so a big flat facet stays flat
right up to its crease. The highlight along that edge is most of what makes it look made.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from moto_kit import bolt


def split_faces(faces):
    return [f.split() if isinstance(f, str) else list(f) for f in faces]


def _oriented(verts, polys, flip, ref, top):
    """The cage as a mesh, with its faces wound to look away from the bike."""
    mesh = bpy.data.meshes.new("cage")
    mesh.from_pydata(verts.tolist(), [], polys)
    mesh.update()
    work = bmesh.new()
    work.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(work, faces=work.faces)
    work.to_mesh(mesh)
    work.free()
    mesh.update()

    votes = 0.0
    for poly in mesh.polygons:
        p = verts[list(poly.vertices)]
        c = p.mean(0)
        area = np.zeros(3)
        for a, b in zip(p, np.roll(p, -1, axis=0)):
            area += np.cross(a, b)
        away = c - (ref if ref is not None else np.array([0.0, c[1], top]))
        votes += float(np.dot(area, away))
    if (votes < 0) != flip:
        work = bmesh.new()
        work.from_mesh(mesh)
        bmesh.ops.reverse_faces(work, faces=work.faces)
        work.to_mesh(mesh)
        work.free()
        mesh.update()
    return mesh


def shell(
    part,
    material,
    points,
    faces,
    crease=0.8,
    soft=(),
    levels=2,
    thick=0.003,
    roll=0.0014,
    mirror=True,
    whole=False,
    centre=None,
    limit=38,
    flip=False,
    fade=None,
):
    """
    `points` maps names to (x, y, z), for the rider's left side, and `faces` lists them round each
    facet. `soft` is ((a, b), weight) to soften one crease, `whole` makes one piece across the
    centreline, and `mirror` makes a twin on the other side. A name ending in "~" is a soft corner
    on the outline. `fade` takes the finished points and gives a brightness for each, so the paint can
    run from silver to black across a panel. Returns a Snap, for sitting fasteners on the panel.
    """
    names = list(points)
    index = {n: i for i, n in enumerate(names)}
    coords = [tuple(float(c) for c in points[n]) for n in names]
    polys = [[index[n] for n in f] for f in split_faces(faces)]
    smooth_corner = {index[n] for n in names if n.endswith("~")}
    softened = {frozenset((index[a], index[b])): w for (a, b), w in soft}

    if whole:
        twin, extra = {}, []
        for i, p in enumerate(coords):
            if abs(p[0]) < 1e-6:
                twin[i] = i
            else:
                twin[i] = len(coords) + len(extra)
                extra.append((-p[0], p[1], p[2]))
        polys = polys + [[twin[i] for i in reversed(f)] for f in polys]
        softened.update({frozenset(twin[i] for i in k): w for k, w in list(softened.items())})
        smooth_corner |= {twin[i] for i in smooth_corner}
        coords = coords + extra

    verts = np.array(coords, float)
    ref = np.array(centre, float) if centre is not None else None
    mesh = _oriented(verts, polys, flip, ref, max(0.6, float(verts[:, 2].mean()) - 0.2))

    # Every edge of the cage is a crease, with the outline held hardest.
    uses = {}
    for poly in mesh.polygons:
        for key in poly.edge_keys:
            k = tuple(sorted(key))
            uses[k] = uses.get(k, 0) + 1
    edge_weight = mesh.attributes.new("crease_edge", "FLOAT", "EDGE")
    outline = set()
    for edge in mesh.edges:
        key = tuple(sorted(edge.vertices))
        if uses.get(key, 0) == 1:
            weight = 1.0
            outline.update(key)
        else:
            weight = softened.get(frozenset(key), crease)
        edge_weight.data[edge.index].value = weight
    point_weight = mesh.attributes.new("crease_vert", "FLOAT", "POINT")
    for i in range(len(mesh.vertices)):
        point_weight.data[i].value = 1.0 if i in outline and i not in smooth_corner else 0.0

    # The weave lies flat across each facet, the way cloth is laid up.
    layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        n = np.abs(np.array(poly.normal))
        a, b = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[int(np.argmax(n))]
        for corner in poly.loop_indices:
            p = mesh.vertices[mesh.loops[corner].vertex_index].co
            layer.data[corner].uv = (p[a], p[b])
    mesh.shade_smooth()

    holder = bpy.data.objects.new("cage", mesh)
    bpy.context.scene.collection.objects.link(holder)
    if levels > 0:
        subdivide = holder.modifiers.new("subdivide", "SUBSURF")
        subdivide.levels = levels
        subdivide.render_levels = levels
        subdivide.use_creases = True
        subdivide.boundary_smooth = "PRESERVE_CORNERS"
        subdivide.uv_smooth = "NONE"
    if thick > 0:
        solid = holder.modifiers.new("solid", "SOLIDIFY")
        solid.thickness = thick
        solid.offset = -1
        solid.use_rim = True
        solid.use_quality_normals = True
    if roll > 0:
        bevel = holder.modifiers.new("bevel", "BEVEL")
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(limit)
        bevel.width = roll
        bevel.segments = 2
        bevel.profile = 0.6
        bevel.use_clamp_overlap = True
    weighted = holder.modifiers.new("weighted", "WEIGHTED_NORMAL")
    weighted.mode = "FACE_AREA"
    weighted.weight = 60
    weighted.keep_sharp = False

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = holder.evaluated_get(depsgraph)
    final = evaluated.to_mesh()
    final.calc_loop_triangles()
    count = len(final.loops)
    corner_vert = np.zeros(count, np.int32)
    final.loops.foreach_get("vertex_index", corner_vert)
    corner_normal = np.zeros(count * 3, np.float32)
    final.corner_normals.foreach_get("vector", corner_normal)
    corner_normal = corner_normal.reshape(-1, 3)
    corner_uv = np.zeros(count * 2, np.float32)
    final.uv_layers.active.data.foreach_get("uv", corner_uv)
    corner_uv = corner_uv.reshape(-1, 2)
    position = np.zeros(len(final.vertices) * 3, np.float32)
    final.vertices.foreach_get("co", position)
    position = position.reshape(-1, 3)
    tris = np.zeros(len(final.loop_triangles) * 3, np.int32)
    final.loop_triangles.foreach_get("loops", tris)
    tris = tris.reshape(-1, 3)

    # Vertices split only where a normal or the weave really breaks.
    key = np.round(np.hstack([corner_vert[:, None], corner_normal * 400, corner_uv * 4000])).astype(np.int64)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.ravel()
    out_verts = position[corner_vert[first]].astype(float)
    out_normals = corner_normal[first].astype(float)
    out_uvs = corner_uv[first].astype(float)
    out_faces = inverse[tris]

    evaluated.to_mesh_clear()
    bpy.data.objects.remove(holder)
    bpy.data.meshes.remove(mesh)

    shade = None if fade is None else fade(out_verts)
    part.add_skin(material, out_verts, out_faces, out_normals, out_uvs, shade)
    if mirror and not whole:
        flipped = np.array([-1.0, 1.0, 1.0])
        part.add_skin(material, out_verts * flipped, out_faces[:, ::-1], out_normals * flipped, out_uvs, shade)
    return Snap(out_verts, out_faces)


class Snap:
    """Finds a place on a finished panel, to sit a fastener on it."""

    def __init__(self, verts, faces):
        self.tree = BVHTree.FromPolygons([tuple(v) for v in verts], [tuple(int(i) for i in f) for f in faces], all_triangles=True)

    def side(self, y, z):
        hit = self.tree.ray_cast(Vector((1.5, y, z)), Vector((-1, 0, 0)))
        return (np.array(hit[0]), np.array(hit[1])) if hit[0] is not None else (None, None)

    def down(self, x, y):
        hit = self.tree.ray_cast(Vector((x, y, 2.0)), Vector((0, 0, -1)))
        return (np.array(hit[0]), np.array(hit[1])) if hit[0] is not None else (None, None)

    def fasten(self, part, places, size=0.0042, material="Bolt", mirror=True):
        for y, z in places:
            p, n = self.side(y, z)
            if p is None:
                print("missed a fastener at", y, z, flush=True)
                continue
            if n[0] < 0:
                n = -n
            bolt(part, p, n, size=size, material=material, washer=True)
            if mirror:
                twin = np.array([-1.0, 1.0, 1.0])
                bolt(part, p * twin, n * twin, size=size, material=material, washer=True)


def rows_cage(rows, prefix="r"):
    """Stations as a cage: rows of (x, y, z), the same number in each, as points and quads."""
    points, faces = {}, []
    for i, row in enumerate(rows):
        for j, p in enumerate(row):
            points[f"{prefix}{i}_{j}"] = p
    for i in range(len(rows) - 1):
        for j in range(len(rows[0]) - 1):
            faces.append([f"{prefix}{i}_{j}", f"{prefix}{i}_{j + 1}", f"{prefix}{i + 1}_{j + 1}", f"{prefix}{i + 1}_{j}"])
    return points, faces


def along_columns(rows, columns, weight, prefix="r"):
    """The edges running down whole columns of a rows_cage, to give them one crease."""
    return [((f"{prefix}{i}_{j}", f"{prefix}{i + 1}_{j}"), weight) for j in columns for i in range(len(rows) - 1)]


def across_rows(rows, picks, weight, prefix="r"):
    """The edges across whole rows of a rows_cage."""
    return [((f"{prefix}{i}_{j}", f"{prefix}{i}_{j + 1}"), weight) for i in picks for j in range(len(rows[0]) - 1)]

"""
Hard-surface modelling for the machines in /3d/2090. Imported, never run.

A machine looks like a machine because of its gaps. So nothing here is one smooth skin: a
limb is a dark core, with separate armour plates laid over it, and the seams between them are
real gaps with real shadow in them. A bevel on every edge then catches the light, which is
most of what stops hard surfaces looking like game geometry.

Everything is built where it stands in the rest pose. `Part` then moves its origin to its
joint, so the page can turn a limb by turning a node.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import Group, select_only


def superellipse(angle, a, b, power):
    """A rounded rectangle, more or less: 2 is an ellipse, and it squares off as it rises."""
    c, s = math.cos(angle), math.sin(angle)
    return (
        a * math.copysign(abs(c) ** (2 / power), c),
        b * math.copysign(abs(s) ** (2 / power), s),
    )


def section(at, a, b, ox=0.0, oy=0.0, power=3.2):
    """A cross-section: where along the axis, its two half-widths, and how far off centre."""
    return dict(at=at, a=a, b=b, ox=ox, oy=oy, power=power)


def lerp_section(a, b, t):
    mixed = {key: a[key] + (b[key] - a[key]) * t for key in a}
    return mixed


def slice_sections(sections, start, end):
    """The part of a list of cross-sections between two shares of its length."""
    first, last = sections[0]["at"], sections[-1]["at"]

    def at(share):
        target = first + (last - first) * share
        for a, b in zip(sections, sections[1:]):
            low, high = sorted((a["at"], b["at"]))
            if low <= target <= high:
                return lerp_section(a, b, (target - a["at"]) / ((b["at"] - a["at"]) or 1))
        return sections[-1].copy()

    inner = [
        s
        for s in sections
        if (first + (last - first) * start - s["at"]) * (first + (last - first) * end - s["at"]) < 0
    ]
    return [at(start), *inner, at(end)]


class Hull(Group):
    """A mesh built from lofts and plates. `side` is 1 or -1: -1 mirrors it across X."""

    def __init__(self, name, side=1):
        super().__init__(name)
        self.side = side

    def _place(self, along, u, v, axis):
        if axis == "z":
            point = (u, v, along)
        elif axis == "y":
            point = (u, along, v)
        else:
            point = (along, u, v)
        return (point[0] * self.side, point[1], point[2])

    def _ring(self, s, axis, turns, inflate=0.0):
        ring = []
        for angle in turns:
            u, v = superellipse(angle, s["a"] + inflate, s["b"] + inflate, s["power"])
            ring.append(self.bm.verts.new(self._place(s["at"], u + s["ox"], v + s["oy"], axis)))
        return ring

    def _face(self, verts, colour):
        face = self.bm.faces.new(verts)
        self._finish([face], colour, smooth=True)
        return face

    def loft(self, sections, colour, axis="z", sides=32, caps=True):
        """A solid, through a list of cross-sections."""
        turns = [2 * math.pi * i / sides for i in range(sides)]
        rings = [self._ring(s, axis, turns) for s in sections]
        for lower, upper in zip(rings, rings[1:]):
            for i in range(sides):
                j = (i + 1) % sides
                self._face((lower[i], lower[j], upper[j], upper[i]), colour)
        if caps:
            self._face(list(reversed(rings[0])), colour)
            self._face(rings[-1], colour)

    def plate(self, sections, start, end, colour, axis="z", thickness=0.022, lift=0.0, columns=14):
        """
        A curved armour plate: part of a loft's surface, between two angles in degrees, given
        real thickness. Angle 0 faces out along the first axis, 90 along the second.
        """
        turns = [math.radians(start + (end - start) * i / columns) for i in range(columns + 1)]
        outer = [self._ring(s, axis, turns, lift + thickness) for s in sections]
        inner = [self._ring(s, axis, turns, lift) for s in sections]
        for row in range(len(sections) - 1):
            for i in range(columns):
                self._face((outer[row][i], outer[row][i + 1], outer[row + 1][i + 1], outer[row + 1][i]), colour)
                self._face((inner[row][i + 1], inner[row][i], inner[row + 1][i], inner[row + 1][i + 1]), colour)
        for row in range(len(sections) - 1):
            self._face((inner[row][0], outer[row][0], outer[row + 1][0], inner[row + 1][0]), colour)
            self._face((outer[row][-1], inner[row][-1], inner[row + 1][-1], outer[row + 1][-1]), colour)
        for i in range(columns):
            self._face((outer[0][i + 1], outer[0][i], inner[0][i], inner[0][i + 1]), colour)
            self._face((outer[-1][i], outer[-1][i + 1], inner[-1][i + 1], inner[-1][i]), colour)

    def panels(self, sections, start, end, colour, cuts=(), rows=(), axis="z", thickness=0.024, lift=0.0, bolts=True, seam=0.7):
        """
        A plate split into smaller panels with hairline gaps, each set a few millimetres
        differently. One big plate looks like a toy; the same area in panels looks engineered.
        """
        turns = [start, *cuts, end]
        shares = [0.0, *rows, 1.0]
        for i, (a0, a1) in enumerate(zip(turns, turns[1:])):
            for j, (s0, s1) in enumerate(zip(shares, shares[1:])):
                part = slice_sections(sections, s0 + (0.008 if j else 0), s1 - (0.008 if j < len(shares) - 2 else 0))
                left = a0 + (seam if i else 0)
                right = a1 - (seam if i < len(turns) - 2 else 0)
                raised = lift + 0.004 * ((i * 2 + j * 3) % 3) / 2
                columns = max(int(abs(right - left) / 11), 2)
                self.plate(part, left, right, colour, axis=axis, thickness=thickness, lift=raised, columns=columns)
                if bolts and (i + j) % 2 == 0:
                    self.rivets(part, left, right, axis, raised + thickness)

    def rivets(self, sections, start, end, axis, lift, inset=2.4):
        """A bolt in each corner of a panel."""
        for s in (lerp_section(sections[0], sections[-1], 0.07), lerp_section(sections[0], sections[-1], 0.93)):
            for turn in (start + inset, end - inset):
                u, v = superellipse(math.radians(turn), s["a"] + lift, s["b"] + lift, s["power"])
                un, vn = superellipse(math.radians(turn), s["a"] + lift + 0.01, s["b"] + lift + 0.01, s["power"])
                at = Vector(self._place(s["at"], u + s["ox"], v + s["oy"], axis))
                out = Vector(self._place(s["at"], un + s["ox"], vn + s["oy"], axis))
                self.cylinder(at, at + (out - at).normalized() * 0.006, 0.0095, "Frame", sides=6)

    def drum(self, centre, axis, radius, width, colour, sides=28, rim=None):
        """A joint housing, with an optional cap in another colour."""
        c = Vector(centre)
        c.x *= self.side
        way = Vector(axis).normalized() * (width / 2)
        way.x *= self.side
        self.cylinder(c - way, c + way, radius, colour, sides=sides)
        if rim:
            for end in (-1, 1):
                self.cylinder(c + way * end, c + way * (end * 1.14), radius * 0.72, rim, sides=sides)

    def block(self, low, high, colour):
        a, b = list(low), list(high)
        a[0], b[0] = sorted((a[0] * self.side, b[0] * self.side))
        self.box(a, b, colour)

    def rod(self, start, end, radius, colour, sides=14):
        a, b = Vector(start), Vector(end)
        a.x *= self.side
        b.x *= self.side
        self.cylinder(a, b, radius, colour, sides=sides)

    def hose(self, points, radius, colour, sides=8, steps=6):
        """A pipe through some points, smoothed so it reads as flexible."""
        p = [Vector(point) for point in points]
        for point in p:
            point.x *= self.side
        padded = [p[0], *p, p[-1]]
        path = []
        for i in range(1, len(padded) - 2):
            a, b, c, d = padded[i - 1 : i + 3]
            for step in range(steps):
                t = step / steps
                path.append(
                    0.5
                    * (
                        2 * b
                        + (c - a) * t
                        + (2 * a - 5 * b + 4 * c - d) * t * t
                        + (3 * b - a - 3 * c + d) * t * t * t
                    )
                )
        path.append(p[-1])
        for a, b in zip(path, path[1:]):
            self.cylinder(a, b, radius, colour, sides=sides, caps=False)

    def bolts(self, points, normal, radius=0.013, colour="Steel", height=0.008):
        way = Vector(normal).normalized() * height
        way.x *= self.side
        for point in points:
            p = Vector(point)
            p.x *= self.side
            self.cylinder(p, p + way, radius, colour, sides=6)


class Decal:
    """Printing on a curved plate: a thin skin that follows it, mapped to one cell of the sheet."""

    def __init__(self, name, side=1):
        self.name = name
        self.hull = Hull(name, side)
        self.bm = self.hull.bm
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def place(self, sections, start, end, cell, grid, axis="z", lift=0.03, columns=8, flip=False):
        """`cell` is its column and row on a `grid`-wide sheet."""
        hull = self.hull
        turns = [math.radians(start + (end - start) * i / columns) for i in range(columns + 1)]
        rows = [hull._ring(s, axis, turns, lift) for s in sections]
        rising = sections[-1]["at"] > sections[0]["at"]
        u0 = cell[0] / grid
        v0 = 1 - (cell[1] + 1) / grid
        size = 1 / grid
        count = len(rows) - 1
        for r in range(count):
            for i in range(columns):
                quad = (rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i])
                face = self.bm.faces.new(quad)
                hull._finish([face], "Decal", smooth=True)
                places = ((i, r), (i + 1, r), (i + 1, r + 1), (i, r + 1))
                for loop, (cx, cy) in zip(face.loops, places):
                    across = cx / columns
                    up = cy / count if rising else 1 - cy / count
                    if hull.side < 0 or flip:
                        across = 1 - across
                    loop[self.uv].uv = (u0 + across * size, v0 + up * size)


def finish(group, materials, collection, bevel=0.007, segments=1, angle=32):
    """Builds the mesh, and gives every hard edge a bevel to catch the light."""
    bmesh.ops.recalc_face_normals(group.bm, faces=list(group.bm.faces))
    obj = group.build(collection, materials)
    mesh = obj.data
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=math.radians(angle))
    if bevel:
        modifier = obj.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(angle)
        modifier.miter_outer = "MITER_ARC"
        modifier.harden_normals = True
        weighted = obj.modifiers.new("Weighted", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
        select_only(obj)
        for item in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=item.name)
    return obj


class Part:
    """One rigid piece of the machine: everything that moves with one joint."""

    def __init__(self, name, pivot, parent, materials, collection):
        self.name = name
        self.pivot = Vector(pivot)
        self.parent = parent
        self.materials = materials
        self.collection = collection
        self.pieces = []
        self.printing = []

    def add(self, group, bevel=0.007, segments=1, angle=32):
        self.pieces.append(finish(group, self.materials, self.collection, bevel, segments, angle))

    def print_on(self, decal):
        """Decals stay a separate mesh: they're mapped to the sheet, not to the bake."""
        self.printing.append(decal)

    def build(self):
        first = self.pieces[0]
        select_only(*self.pieces)
        bpy.context.view_layer.objects.active = first
        if len(self.pieces) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = self.name
        obj.data.name = self.name
        obj.data.transform(Matrix.Translation(-self.pivot))
        obj.location = self.pivot
        for index, decal in enumerate(self.printing):
            skin = decal.hull.build(self.collection, self.materials)
            skin.name = f"{self.name}_Print{index}"
            skin.data.shade_smooth()
            skin.data.transform(Matrix.Translation(-self.pivot))
            skin.location = self.pivot
        return obj

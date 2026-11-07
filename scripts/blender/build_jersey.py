"""
Cuts, sews and drapes the store's football shirt.

    blender --background --factory-startup --python scripts/blender/build_jersey.py -- <outdir>

The shirt is made the way a real one is, because that is the only way its folds
look real: two flat panels are cut from a pattern, stitched along the shoulders
and the sides, and left to fall onto a body in Blender's cloth solver.

Cutting from a pattern also settles the UVs for free. A vertex's place on the
flat panel IS its texture coordinate, so stripes stay straight on the cloth and
bend only where the cloth bends.

Writes <outdir>/jersey_raw.blend and <outdir>/jersey_layout.json, which holds the
pattern in metres for the kit painter (scripts/store_kits.py).
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

sys.path.insert(0, os.path.dirname(__file__))
from common import add_camera, orbit_points, script_args, studio, use_gpu  # noqa: E402

args = script_args()
OUT = os.path.abspath(args[0])
SPACING = float(args[1]) if len(args) > 1 else 0.0125
FRAMES = int(args[2]) if len(args) > 2 else 170
SEWING = float(args[3]) if len(args) > 3 else 5.0
BENDING = float(args[4]) if len(args) > 4 else 0.1
COMPRESSION = float(args[5]) if len(args) > 5 else 6.0

# --- The pattern ------------------------------------------------------------
# Right half of one panel, in metres. z = 0 is the hem. The sleeves are cut on
# the panel, angled down 30 degrees, so a shirt with arms slightly out needs no
# armhole seam; the seam a real shirt has there is painted by the kit painter.

HPS = (0.092, 0.735)  # high point of the shoulder, where the collar meets it
TIP = (0.235, 0.685)  # end of the shoulder
SLEEVE_ANGLE = math.radians(30)
SLEEVE_LENGTH = 0.235
SLEEVE_OPENING = 0.175
S1 = (
    TIP[0] + SLEEVE_LENGTH * math.cos(SLEEVE_ANGLE),
    TIP[1] - SLEEVE_LENGTH * math.sin(SLEEVE_ANGLE),
)
S2 = (
    S1[0] - SLEEVE_OPENING * math.sin(SLEEVE_ANGLE),
    S1[1] - SLEEVE_OPENING * math.cos(SLEEVE_ANGLE),
)

OVER_ARM = [HPS, (0.165, 0.712), TIP, (0.33, 0.632), S1]
UNDER_ARM = [
    S2,
    (0.318, 0.44),
    (0.292, 0.458),
    (0.277, 0.445),
    (0.272, 0.40),
    (0.264, 0.25),
    (0.272, 0.0),
]
NECK = {
    "front": [(0.0, 0.645), (0.05, 0.66), (0.08, 0.70), HPS],
    "back": [(0.0, 0.715), (0.05, 0.718), (0.08, 0.726), HPS],
}
HEM = [(0.0, 0.0), (0.272, 0.0)]

# Where the panels land in the texture: front on the top half, back on the
# bottom, the strip to the right left free for the collar and the neck label.
# The back is flipped so that, seen from outside, it reads the right way round.
UV_SCALE = 0.645
UV_X = 0.44
UV_Z = 0.01
UV_LEFT = 0.01
UV_FRONT_V = 0.505
UV_BACK_V = 0.005


def panel_uv(panel, x, z):
    px = x if panel == "front" else -x
    v0 = UV_FRONT_V if panel == "front" else UV_BACK_V
    return (UV_LEFT + (px + UV_X) * UV_SCALE, v0 + (z + UV_Z) * UV_SCALE)


def spline(points, steps=40):
    """Catmull-Rom through `points`, as a dense polyline."""
    pts = [Vector(p) for p in points]
    if len(pts) == 2:
        return [pts[0].lerp(pts[1], t / steps) for t in range(steps + 1)]
    padded = [pts[0] * 2 - pts[1], *pts, pts[-1] * 2 - pts[-2]]
    line = []
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1 : i + 3]
        for step in range(steps):
            t = step / steps
            t2, t3 = t * t, t * t * t
            line.append(
                0.5
                * (
                    2 * p1
                    + (p2 - p0) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (3 * p1 - p0 - 3 * p2 + p3) * t3
                )
            )
    line.append(pts[-1].copy())
    return line


def resample(line, spacing):
    """Even steps along a polyline, ends included."""
    lengths = [0.0]
    for a, b in zip(line, line[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    count = max(2, round(total / spacing))
    out = []
    index = 0
    for k in range(count + 1):
        target = total * k / count
        while index < len(lengths) - 2 and lengths[index + 1] < target:
            index += 1
        span = lengths[index + 1] - lengths[index]
        t = 0 if span == 0 else (target - lengths[index]) / span
        out.append(line[index].lerp(line[index + 1], t))
    return out


def half_chain(panel):
    """The right half's edge, hem centre round to neck centre, tagged by seam."""
    hem = resample(spline(HEM), SPACING)
    under = resample(spline(UNDER_ARM), SPACING)[::-1]  # hem corner -> cuff
    cuff = resample(spline([S2, S1]), SPACING)
    over = resample(spline(OVER_ARM), SPACING)[::-1]  # cuff -> collar
    neck = resample(spline(NECK[panel]), SPACING)[::-1]  # collar -> centre

    chain = []

    def add(points, tag):
        for k, point in enumerate(points):
            chain.append((point, tag, k))

    add(hem, "hem")
    add(under[1:], "under")
    add(cuff[1:], "cuff")
    add(over[1:], "over")
    add(neck[1:], "neck")
    return chain


def panel_outline(panel):
    """Full closed outline, counter-clockwise, as (point, tag, index, side)."""
    right = half_chain(panel)
    outline = [(p, tag, k, "R") for p, tag, k in right]
    left = [
        (Vector((-p.x, p.y)), tag, k, "L")
        for p, tag, k in reversed(right[1:-1])  # the two centre points are shared
    ]
    return outline + left


def inside(point, polygon):
    x, y = point
    hit = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def edge_distance(point, polygon):
    best = 1e9
    px, py = point
    for i in range(len(polygon)):
        ax, ay = polygon[i]
        bx, by = polygon[(i + 1) % len(polygon)]
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        t = 0 if length == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def triangulate(outline):
    """An even triangle mesh over the panel, as a cloth solver wants it."""
    polygon = [(p.x, p.y) for p, *_ in outline]
    points = [Vector(p) for p in polygon]
    row = SPACING * math.sqrt(3) / 2
    z = -0.02
    odd = False
    while z < 0.76:
        x = -0.46 + (SPACING / 2 if odd else 0)
        while x < 0.46:
            if inside((x, z), polygon) and edge_distance((x, z), polygon) > SPACING * 0.62:
                points.append(Vector((x, z)))
            x += SPACING
        z += row
        odd = not odd

    boundary = len(polygon)
    edges = [(i, (i + 1) % boundary) for i in range(boundary)]
    verts, _, faces, original, _, _ = delaunay_2d_cdt(points, edges, [], 0, 1e-7)

    # Triangles outside the outline are the convex hull's, not the panel's.
    keep = []
    for face in faces:
        a, b, c = (verts[i] for i in face)
        centre = ((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3)
        if inside(centre, polygon):
            keep.append(face)

    input_to_output = {}
    for output, inputs in enumerate(original):
        for value in inputs:
            input_to_output[value] = output
    return verts, keep, [input_to_output[i] for i in range(boundary)]


# How far each panel starts from the body's centre plane. Flat on purpose: the
# solver takes the starting pose as the cloth's natural shape, so a panel that
# starts curved keeps a belly that no body is pushing out.
PANEL_DEPTH = 0.142


def build_cloth(scene):
    positions, faces, uvs, sewing = [], [], [], []
    seams = {}

    for panel, sign in (("front", -1.0), ("back", 1.0)):
        outline = panel_outline(panel)
        verts, tris, boundary = triangulate(outline)
        offset = len(positions)
        for vertex in verts:
            positions.append((vertex.x, sign * PANEL_DEPTH, vertex.y))
        for tri in tris:
            # Both panels must face outward: the back's winding runs the other way.
            ordered = tri if panel == "back" else tri[::-1]
            faces.append([offset + i for i in ordered])
            uvs.append([panel_uv(panel, verts[i].x, verts[i].y) for i in ordered])
        hem_end = max(k for _, tag, k, _ in outline if tag == "hem")
        for (point, tag, k, side), output in zip(outline, boundary):
            # The last hem point is the corner, which the side seam starts from.
            if tag in ("under", "over") or (tag == "hem" and k == hem_end):
                seams.setdefault((tag, side, k), []).append(offset + output)

    for pair in seams.values():
        if len(pair) == 2:
            sewing.append(tuple(pair))

    mesh = bpy.data.meshes.new("Jersey")
    mesh.from_pydata(positions, sewing, faces)
    mesh.update()
    layer = mesh.uv_layers.new(name="UVMap")
    index = 0
    for polygon, uv in zip(mesh.polygons, uvs):
        for loop, coordinate in zip(polygon.loop_indices, uv):
            layer.data[loop].uv = coordinate
        index += 1

    jersey = bpy.data.objects.new("Jersey", mesh)
    scene.collection.objects.link(jersey)
    return jersey, sewing


def loft(rings, segments=40):
    """Skin a list of (centre, radius_a, radius_b, axis_a, axis_b) rings."""
    verts, faces = [], []
    for centre, ra, rb, axis_a, axis_b in rings:
        for s in range(segments):
            angle = 2 * math.pi * s / segments
            verts.append(
                Vector(centre)
                + Vector(axis_a) * (ra * math.cos(angle))
                + Vector(axis_b) * (rb * math.sin(angle))
            )
    for r in range(len(rings) - 1):
        for s in range(segments):
            a = r * segments + s
            b = r * segments + (s + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    return verts, faces


def build_body(scene):
    """A dress-form: never seen, only there to be draped over."""
    x, y = (1, 0, 0), (0, 1, 0)
    torso = [
        ((0, 0, -0.30), 0.165, 0.115),
        ((0, 0, -0.10), 0.170, 0.118),
        ((0, 0, 0.05), 0.165, 0.112),
        ((0, 0, 0.22), 0.152, 0.104),
        ((0, 0, 0.38), 0.165, 0.113),
        ((0, 0, 0.50), 0.182, 0.124),
        ((0, 0, 0.58), 0.190, 0.122),
        ((0, 0, 0.64), 0.186, 0.108),
        ((0, 0, 0.675), 0.165, 0.092),
        ((0, 0, 0.70), 0.120, 0.076),
        ((0, 0, 0.725), 0.075, 0.066),
        ((0, 0, 0.76), 0.058, 0.058),
        ((0, 0, 0.86), 0.055, 0.055),
    ]
    verts, faces = loft([(c, a, b, x, y) for c, a, b in torso])

    # Thinner than a real arm on purpose. A sleeve is as wide round as an arm plus
    # the ease it hangs with; a form that fills it leaves the seam nothing to close.
    arm_angle = math.radians(36)
    for side in (1, -1):
        direction = Vector((side * math.cos(arm_angle), 0, -math.sin(arm_angle)))
        across = Vector((math.sin(arm_angle) * side, 0, math.cos(arm_angle)))
        joint = Vector((side * 0.178, 0, 0.628))
        rings = []
        for t, radius in ((-0.04, 0.046), (0.0, 0.048), (0.12, 0.046), (0.28, 0.042), (0.42, 0.038)):
            rings.append((joint + direction * t, radius, radius, across, y))
        arm_verts, arm_faces = loft(rings)
        offset = len(verts)
        verts += arm_verts
        faces += [tuple(i + offset for i in face) for face in arm_faces]

    mesh = bpy.data.meshes.new("Body")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    # The solver reads a face's normal as "outside". One arm is lofted the other
    # way round, and with its normals inverted it throws the cloth off the body.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    body = bpy.data.objects.new("Body", mesh)
    scene.collection.objects.link(body)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    body.modifiers.new("Collision", "COLLISION")
    body.collision.thickness_outer = 0.006
    body.collision.thickness_inner = 0.05
    body.collision.cloth_friction = 4.0
    body.collision.damping = 0.4
    return body


def simulate(scene, jersey):
    cloth = jersey.modifiers.new("Cloth", "CLOTH")
    settings = cloth.settings
    settings.quality = 8
    settings.mass = 0.12
    settings.air_damping = 2.0
    settings.tension_stiffness = 22
    settings.compression_stiffness = COMPRESSION
    settings.shear_stiffness = 14
    settings.bending_stiffness = BENDING
    settings.tension_damping = 6
    settings.compression_damping = 6
    settings.shear_damping = 6
    settings.use_sewing_springs = True
    settings.sewing_force_max = SEWING

    collision = cloth.collision_settings
    collision.collision_quality = 4
    collision.distance_min = 0.004
    collision.use_self_collision = False

    # Sew first with no weight on the cloth, then let it hang.
    weights = settings.effector_weights
    weights.gravity = 0.0
    weights.keyframe_insert("gravity", frame=1)
    weights.keyframe_insert("gravity", frame=45)
    weights.gravity = 1.0
    weights.keyframe_insert("gravity", frame=70)

    # A perfectly even shirt on a perfectly even body hangs like a moulding. A
    # breath of turbulence while it settles gives it folds of its own.
    bpy.ops.object.effector_add(type="TURBULENCE", location=(0.1, -0.4, 0.5))
    breath = bpy.context.object
    breath.field.size = 0.35
    breath.field.noise = 0.6
    breath.field.seed = 7
    breath.field.flow = 0
    breath.field.strength = 0
    breath.field.keyframe_insert("strength", frame=50)
    breath.field.strength = 5
    breath.field.keyframe_insert("strength", frame=75)
    breath.field.keyframe_insert("strength", frame=FRAMES - 45)
    breath.field.strength = 0
    breath.field.keyframe_insert("strength", frame=FRAMES - 20)

    scene.frame_start = 1
    scene.frame_end = FRAMES
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = FRAMES

    for frame in range(1, FRAMES + 1):
        scene.frame_set(frame)
        if frame % 15 == 0:
            evaluated = jersey.evaluated_get(bpy.context.evaluated_depsgraph_get())
            corners = [Vector(c) for c in evaluated.bound_box]
            low = [min(c[i] for c in corners) for i in range(3)]
            high = [max(c[i] for c in corners) for i in range(3)]
            print(
                f"cloth frame {frame}/{FRAMES}  "
                f"x {low[0]:.2f}..{high[0]:.2f}  y {low[1]:.2f}..{high[1]:.2f}  "
                f"z {low[2]:.2f}..{high[2]:.2f}",
                flush=True,
            )

    evaluated = jersey.evaluated_get(bpy.context.evaluated_depsgraph_get())
    draped = [v.co.copy() for v in evaluated.to_mesh().vertices]
    evaluated.to_mesh_clear()
    jersey.modifiers.remove(cloth)
    return draped


def weld(jersey, draped, sewing):
    """Close the seams for good: each stitched pair becomes one vertex."""
    mesh = jersey.data
    for vertex, position in zip(mesh.vertices, draped):
        vertex.co = position

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()

    gaps = []
    target = {}
    worst = []
    for a, b in sewing:
        va, vb = bm.verts[a], bm.verts[b]
        gaps.append((va.co - vb.co).length)
        worst.append((gaps[-1], tuple(round(c, 3) for c in va.co), tuple(round(c, 3) for c in vb.co)))
        middle = (va.co + vb.co) / 2
        va.co = middle
        vb.co = middle
        target[vb] = va

    loose = [edge for edge in bm.edges if not edge.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="EDGES")
    bmesh.ops.weld_verts(bm, targetmap=target)
    bmesh.ops.smooth_vert(
        bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True
    )
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update()
    print(f"sewn: {len(gaps)} stitches, widest gap before welding {max(gaps) * 1000:.1f} mm")
    for gap, a, b in sorted(worst, reverse=True)[:6]:
        print(f"  sewn gap {gap * 1000:.1f} mm  {a} {b}")


def preview(scene, jersey, body):
    """Three turntable stills on a UV checker, to judge the drape and the mapping."""
    material = bpy.data.materials.new("Check")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.65
    checker = nodes.new("ShaderNodeTexChecker")
    checker.inputs["Scale"].default_value = 40
    checker.inputs["Color1"].default_value = (0.75, 0.05, 0.08, 1)
    checker.inputs["Color2"].default_value = (0.92, 0.9, 0.88, 1)
    coords = nodes.new("ShaderNodeUVMap")
    coords.uv_map = "UVMap"
    links.new(coords.outputs["UV"], checker.inputs["Vector"])
    links.new(checker.outputs["Color"], principled.inputs["Base Color"])
    jersey.data.materials.append(material)

    body.hide_render = True
    studio(scene, centre=(0, 0, 0.38))
    use_gpu(scene, samples=48)
    scene.render.resolution_x = 560
    scene.render.resolution_y = 700
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    centre = (0, 0, 0.38)
    for name, position in zip(
        ("front", "side", "back"), orbit_points(centre, 1.7, 0.75, (0, 55, 180))
    ):
        add_camera(scene, position, centre, lens=55, name=f"Camera_{name}")
        scene.render.filepath = os.path.join(OUT, f"jersey_preview_{name}.png")
        bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    jersey, sewing = build_cloth(scene)
    body = build_body(scene)
    print(
        f"cloth: {len(jersey.data.vertices)} verts, {len(jersey.data.polygons)} tris, "
        f"{len(sewing)} stitches",
        flush=True,
    )

    draped = simulate(scene, jersey)
    weld(jersey, draped, sewing)

    layout = {
        "uv": {
            "scale": UV_SCALE,
            "x": UV_X,
            "z": UV_Z,
            "left": UV_LEFT,
            "frontV": UV_FRONT_V,
            "backV": UV_BACK_V,
        },
        "points": {"hps": HPS, "tip": TIP, "s1": S1, "s2": S2},
        "overArm": [tuple(p) for p in resample(spline(OVER_ARM), 0.01)],
        "underArm": [tuple(p) for p in resample(spline(UNDER_ARM), 0.01)],
        "neck": {
            panel: [tuple(p) for p in resample(spline(NECK[panel]), 0.01)]
            for panel in NECK
        },
    }
    with open(os.path.join(OUT, "jersey_layout.json"), "w") as file:
        json.dump(layout, file, indent=1)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "jersey_raw.blend"))
    preview(scene, jersey, body)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "jersey_raw.blend"))


main()

"""
Finishes the draped shirt and exports it for the web.

    blender --background --factory-startup --python scripts/blender/finish_jersey.py -- <jerseydir> <publicdir>

Takes jersey_raw.blend from build_jersey.py and adds what the solver cannot:

  - The collar, a ribbed band swept round the neck, and rolled edges on the hem
    and cuffs, so no edge of the cloth is paper-thin up close.
  - A second shape, "Hung": the same shirt pressed flat over a hanger. One mesh
    carries both, so a shirt lifted off the rail can fill out as if it were put
    on, and the rail can show it the way a rail would.
  - A four-bone skeleton for the mirror: hips, chest and two arms.
  - An ambient-occlusion bake, which scripts/store_kits.py multiplies into every
    kit so the folds stay dark in lighting that casts no shadows.

Writes <publicdir>/jersey.glb, <jerseydir>/jersey_ao.png and jersey_finished.blend.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector, kdtree

sys.path.insert(0, os.path.dirname(__file__))
from common import script_args, use_gpu  # noqa: E402

args = script_args()
JERSEY_DIR = os.path.abspath(args[0])
PUBLIC = os.path.abspath(args[1])
HANG_DEPTH = 0.34  # how much of the worn depth a hung shirt keeps
HANG_SWING = 28  # degrees the sleeves drop from the worn pose

with open(os.path.join(JERSEY_DIR, "jersey_layout.json")) as file:
    LAYOUT = json.load(file)

UV = LAYOUT["uv"]
TIP = Vector(LAYOUT["points"]["tip"])

# The free strip of the texture, right of the panels.
COLLAR_UV = (0.592, 0.935, 0.40, 0.04)  # u, v, width, height
LABEL_UV = (0.60, 0.80, 0.09, 0.05)

# A folded band in section: (outward, up), metres, base to top and back down.
COLLAR_PROFILE = [
    (0.0006, -0.0045),
    (0.0034, 0.0015),
    (0.0036, 0.0125),
    (0.0028, 0.0215),
    (0.0, 0.0245),
    (-0.0028, 0.0215),
    (-0.0036, 0.0125),
    (-0.0034, 0.0015),
    (-0.0006, -0.0045),
]
COLLAR_SEGMENTS = 128

# A rolled edge in section: (along the surface normal, out past the edge).
ROLL_PROFILE = [(0.0012, -0.005), (0.0017, -0.0005), (0.0, 0.0017), (-0.0017, -0.0005), (-0.0012, -0.005)]


def pattern_point(u, v):
    """Where a texture coordinate sits on the flat pattern, in metres."""
    front = v >= UV["frontV"] - 0.002
    z = (v - (UV["frontV"] if front else UV["backV"])) / UV["scale"] - UV["z"]
    x = (u - UV["left"]) / UV["scale"] - UV["x"]
    return (x if front else -x), z


def smoothstep(low, high, value):
    t = max(0.0, min(1.0, (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def clear_extras():
    for obj in list(bpy.data.objects):
        if obj.name not in ("Jersey", "Body"):
            bpy.data.objects.remove(obj)


def edge_loops(bm):
    """The cloth's four openings, as ordered lists of boundary edges."""
    edges = [edge for edge in bm.edges if edge.is_boundary]
    by_vert = {}
    for edge in edges:
        for vert in edge.verts:
            by_vert.setdefault(vert.index, []).append(edge)

    loops = []
    seen = set()
    for first in edges:
        if first.index in seen:
            continue
        loop = []
        edge = first
        vert = first.verts[0]
        while edge is not None and edge.index not in seen:
            seen.add(edge.index)
            other = edge.other_vert(vert)
            loop.append((vert.index, other.index, edge))
            vert = other
            onward = [e for e in by_vert[vert.index] if e.index not in seen]
            edge = onward[0] if onward else None
        loops.append(loop)
    return loops


def name_loops(loops, coords):
    """Tell neck, hem and sleeves apart by where they sit."""
    named = {}
    centres = []
    for loop in loops:
        centre = sum((coords[a] for a, _, _ in loop), Vector()) / len(loop)
        centres.append((centre, loop))
    named["hem"] = min(centres, key=lambda item: item[0].z)[1]
    named["neck"] = min(
        (item for item in centres if item[1] is not named["hem"]),
        key=lambda item: abs(item[0].x),
    )[1]
    for centre, loop in centres:
        if loop is named["hem"] or loop is named["neck"]:
            continue
        named["cuff_left" if centre.x > 0 else "cuff_right"] = loop
    return named


def closed_resample(points, count):
    lengths = [0.0]
    ring = points + points[:1]
    for a, b in zip(ring, ring[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    out = []
    index = 0
    for k in range(count):
        target = total * k / count
        while lengths[index + 1] < target:
            index += 1
        span = lengths[index + 1] - lengths[index]
        t = 0 if span == 0 else (target - lengths[index]) / span
        out.append(ring[index].lerp(ring[index + 1], t))
    return out


def smooth_closed(points, passes):
    count = len(points)
    for _ in range(passes):
        points = [
            (points[i - 1] + points[i] * 2 + points[(i + 1) % count]) / 4
            for i in range(count)
        ]
    return points


def ordered_neck(loop):
    """Start the ring at the back of the neck, so every shape starts it alike."""
    return [a for a, _, _ in loop]


def collar_verts(neck_ids, coords):
    points = smooth_closed(
        closed_resample([coords[i] for i in neck_ids], COLLAR_SEGMENTS), 10
    )
    centre = sum(points, Vector()) / len(points)
    normal = Vector()
    for i, point in enumerate(points):
        following = points[(i + 1) % len(points)]
        normal += (point - centre).cross(following - centre)
    normal.normalize()
    if normal.z < 0:
        normal = -normal

    verts = []
    for point in points:
        outward = point - centre
        outward -= normal * outward.dot(normal)
        outward.normalize()
        up = (normal * 0.93 - outward * 0.28).normalized()
        for out_amount, up_amount in COLLAR_PROFILE:
            verts.append(point + outward * out_amount + up * up_amount)
    return verts


def collar_faces():
    faces, uvs = [], []
    rows = len(COLLAR_PROFILE)
    u0, v0, width, height = COLLAR_UV
    for i in range(COLLAR_SEGMENTS):
        j = (i + 1) % COLLAR_SEGMENTS
        ua = u0 + width * i / COLLAR_SEGMENTS
        ub = u0 + width * (i + 1) / COLLAR_SEGMENTS
        for k in range(rows - 1):
            va = v0 + height * k / (rows - 1)
            vb = v0 + height * (k + 1) / (rows - 1)
            faces.append((i * rows + k, j * rows + k, j * rows + k + 1, i * rows + k + 1))
            uvs.append(((ua, va), (ub, va), (ub, vb), (ua, vb)))
    return faces, uvs


def roll_verts(loop, coords, normals, inward):
    """A thin tube along an open edge, one ring of points per boundary vertex."""
    ids = [a for a, _, _ in loop]
    verts = []
    count = len(ids)
    for k, index in enumerate(ids):
        before = coords[ids[k - 1]]
        after = coords[ids[(k + 1) % count]]
        tangent = (after - before).normalized()
        normal = normals[index]
        outward = tangent.cross(normal).normalized()
        if outward.dot(inward[index]) > 0:
            outward = -outward
        for along, out in ROLL_PROFILE:
            verts.append(coords[index] + normal * along + outward * out)
    return verts


def roll_faces(loop, uv_of_edge):
    faces, uvs = [], []
    rows = len(ROLL_PROFILE)
    count = len(loop)
    for k, (a, b, edge) in enumerate(loop):
        j = (k + 1) % count
        uv_a, uv_b = uv_of_edge[edge.index][a], uv_of_edge[edge.index][b]
        for r in range(rows - 1):
            faces.append((k * rows + r, j * rows + r, j * rows + r + 1, k * rows + r + 1))
            uvs.append((uv_a, uv_b, uv_b, uv_a))
    return faces, uvs


def label_verts(neck_ids, coords):
    """A woven neck label, inside the back of the collar."""
    back = max((coords[i] for i in neck_ids), key=lambda c: c.y)
    verts = []
    for row in range(3):
        for column in range(5):
            x = (column / 4 - 0.5) * 0.058
            z = -0.012 - row / 2 * 0.03
            verts.append(back + Vector((x, -0.004 - abs(x) * 0.12, z)))
    return verts


def label_faces():
    faces, uvs = [], []
    u0, v0, width, height = LABEL_UV
    for row in range(2):
        for column in range(4):
            a = row * 5 + column
            faces.append((a, a + 5, a + 6, a + 1))
            top = v0 + height * (1 - row / 2)
            bottom = v0 + height * (1 - (row + 1) / 2)
            left = u0 + width * column / 4
            right = u0 + width * (column + 1) / 4
            uvs.append(((left, top), (left, bottom), (right, bottom), (right, top)))
    return faces, uvs


def surface_data(jersey, coords):
    """Normals and inward directions for one shape of the cloth."""
    mesh = jersey.data.copy()
    for vertex, position in zip(mesh.vertices, coords):
        vertex.co = position
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    bm.verts.ensure_lookup_table()
    normals = {}
    inward = {}
    for vert in bm.verts:
        normals[vert.index] = vert.normal.copy()
        if vert.link_faces:
            centre = sum((f.calc_center_median() for f in vert.link_faces), Vector())
            inward[vert.index] = centre / len(vert.link_faces) - vert.co
        else:
            inward[vert.index] = Vector((0, 0, 1))
    bm.free()
    bpy.data.meshes.remove(mesh)
    return normals, inward


def sleeve_share(x, z):
    """How much of a point on the flat pattern belongs to the sleeve, 0..1."""
    armpit = Vector((0.292, 0.458))
    along = (armpit - TIP).normalized()
    outward = Vector((-along.y, along.x))
    if outward.x < 0:
        outward = -outward
    offset = Vector((abs(x), z)) - TIP
    return smoothstep(-0.035, 0.045, offset.dot(outward))


def vertex_pattern(mesh, limit=None):
    """Each vertex's place on the flat pattern, read back off its UVs."""
    uv_layer = mesh.uv_layers.active.data
    pattern = {}
    for polygon in mesh.polygons:
        for vertex, loop in zip(polygon.vertices, polygon.loop_indices):
            if (limit is None or vertex < limit) and vertex not in pattern:
                pattern[vertex] = pattern_point(*uv_layer[loop].uv)
    return pattern


def hang(jersey):
    """
    The shape a shirt takes on a rail: flat front to back, sleeves swung down.

    Shaped, not simulated. Dropping this cloth onto a hanger needs self-collision
    to keep the back from passing through the front, and the result is still a
    tangle at the sleeves. This keeps the drape's real folds, and squeezing depth
    preserves order, so the two layers can never cross.
    """
    swing = math.radians(HANG_SWING)
    pattern = vertex_pattern(jersey.data)
    hung = []
    for vertex in jersey.data.vertices:
        x, z = pattern[vertex.index]
        position = vertex.co.copy()
        flat = Vector((position.x, (position.y + 0.015) * HANG_DEPTH, position.z))

        share = sleeve_share(x, z)
        side = 1 if x > 0 else -1
        joint = Vector((side * 0.178, 0, 0.628))
        relative = flat - joint
        cosine, sine = math.cos(swing), -math.sin(swing) * side
        swung = joint + Vector(
            (
                relative.x * cosine - relative.z * sine,
                relative.y,
                relative.x * sine + relative.z * cosine,
            )
        )
        # Sleeves fall in front of the body's edge, not through it.
        swung.y -= 0.02
        hung.append(flat.lerp(swung, share))
    return hung


def add_trims(jersey, hung):
    """Collar, rolled edges and label, for both shapes. Returns the hung coords."""
    mesh = jersey.data
    worn = [v.co.copy() for v in mesh.vertices]

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.edges.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.active

    loops = name_loops(edge_loops(bm), worn)
    print("openings:", {name: len(loop) for name, loop in loops.items()})

    uv_of_edge = {}
    for name, loop in loops.items():
        if name == "neck":
            continue
        for a, b, edge in loop:
            face = edge.link_faces[0]
            corners = {l.vert.index: tuple(l[uv_layer].uv) for l in face.loops}
            uv_of_edge[edge.index] = corners

    worn_normals, worn_inward = surface_data(jersey, worn)
    hung_normals, hung_inward = surface_data(jersey, hung)
    neck_ids = ordered_neck(loops["neck"])

    parts = []  # (worn verts, hung verts, faces, uvs)
    faces, uvs = collar_faces()
    parts.append((collar_verts(neck_ids, worn), collar_verts(neck_ids, hung), faces, uvs))
    for name in ("hem", "cuff_left", "cuff_right"):
        faces, uvs = roll_faces(loops[name], uv_of_edge)
        parts.append(
            (
                roll_verts(loops[name], worn, worn_normals, worn_inward),
                roll_verts(loops[name], hung, hung_normals, hung_inward),
                faces,
                uvs,
            )
        )
    faces, uvs = label_faces()
    parts.append((label_verts(neck_ids, worn), label_verts(neck_ids, hung), faces, uvs))

    all_hung = list(hung)
    for worn_verts, hung_verts, faces, uvs in parts:
        new = [bm.verts.new(position) for position in worn_verts]
        all_hung.extend(hung_verts)
        for face, corners in zip(faces, uvs):
            created = bm.faces.new([new[i] for i in face])
            created.smooth = True
            for loop, corner in zip(created.loops, corners):
                loop[uv_layer].uv = corner

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return all_hung, len(worn)


def add_skeleton(scene, jersey, cloth_count):
    """Weights come off the flat pattern, where the armhole is a straight line."""
    mesh = jersey.data
    pattern = vertex_pattern(mesh, limit=cloth_count)

    weights = {}
    for vertex, (x, z) in pattern.items():
        sleeve = sleeve_share(x, z)
        chest = smoothstep(0.12, 0.42, z)
        side = "Arm.L" if x > 0 else "Arm.R"
        weights[vertex] = {
            side: sleeve,
            "Chest": (1 - sleeve) * chest,
            "Hips": (1 - sleeve) * (1 - chest),
        }

    # The trims take the weights of the cloth they sit on.
    tree = kdtree.KDTree(cloth_count)
    for index in range(cloth_count):
        tree.insert(mesh.vertices[index].co, index)
    tree.balance()
    for vertex in mesh.vertices[cloth_count:]:
        _, nearest, _ = tree.find(vertex.co)
        weights[vertex.index] = weights[nearest]

    armature = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", armature)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    hips = armature.edit_bones.new("Hips")
    hips.head = (0, 0, 0.12)
    hips.tail = (0, 0, 0.42)
    chest = armature.edit_bones.new("Chest")
    chest.head = (0, 0, 0.42)
    chest.tail = (0, 0, 0.70)
    chest.parent = hips
    angle = math.radians(36)
    for name, sign in (("Arm.L", 1), ("Arm.R", -1)):
        arm = armature.edit_bones.new(name)
        arm.head = (sign * 0.178, 0, 0.628)
        arm.tail = (sign * (0.178 + 0.3 * math.cos(angle)), 0, 0.628 - 0.3 * math.sin(angle))
        arm.parent = chest
    bpy.ops.object.mode_set(mode="OBJECT")

    groups = {name: jersey.vertex_groups.new(name=name) for name in ("Hips", "Chest", "Arm.L", "Arm.R")}
    for vertex, shares in weights.items():
        for name, share in shares.items():
            if share > 0.002:
                groups[name].add([vertex], share, "REPLACE")

    jersey.parent = rig
    modifier = jersey.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    return rig


def bake_ao(scene, jersey):
    use_gpu(scene, samples=160, denoise=False)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Bake")
    scene.world.light_settings.distance = 0.11

    image = bpy.data.images.new("JerseyAO", 2048, 2048, alpha=False)
    material = bpy.data.materials.new("Bake")
    material.use_nodes = True
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    material.node_tree.nodes.active = node
    jersey.data.materials.clear()
    jersey.data.materials.append(material)

    for obj in bpy.data.objects:
        obj.select_set(False)
    bpy.context.view_layer.objects.active = jersey
    jersey.select_set(True)
    bpy.ops.object.bake(type="AO", margin=24, use_clear=True)

    image.filepath_raw = os.path.join(JERSEY_DIR, "jersey_ao.png")
    image.file_format = "PNG"
    image.save()


def export(jersey, rig):
    for obj in bpy.data.objects:
        obj.select_set(False)
    jersey.select_set(True)
    rig.select_set(True)
    os.makedirs(PUBLIC, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(PUBLIC, "jersey.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        export_animations=False,
        export_materials="NONE",
        export_cameras=False,
        export_lights=False,
        export_def_bones=False,
    )


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(JERSEY_DIR, "jersey_raw.blend"))
    clear_extras()
    scene = bpy.context.scene
    jersey = bpy.data.objects["Jersey"]
    body = bpy.data.objects["Body"]
    body.modifiers.clear()
    body.hide_render = True
    body.hide_viewport = True
    jersey.data.materials.clear()

    # Face every triangle outward: the bake reads the surface from its front.
    bm = bmesh.new()
    bm.from_mesh(jersey.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    centre = sum((f.calc_center_median() for f in bm.faces), Vector()) / len(bm.faces)
    outward = sum(
        ((f.calc_center_median() - centre).normalized().dot(f.normal) for f in bm.faces), 0.0
    )
    if outward < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(jersey.data)
    bm.free()

    hung = hang(jersey)
    all_hung, cloth_count = add_trims(jersey, hung)

    rig = add_skeleton(scene, jersey, cloth_count)
    print(
        f"finished: {len(jersey.data.vertices)} verts, "
        f"{sum(len(p.vertices) - 2 for p in jersey.data.polygons)} tris",
        flush=True,
    )
    bake_ao(scene, jersey)

    jersey.shape_key_add(name="Basis", from_mix=False)
    shape = jersey.shape_key_add(name="Hung", from_mix=False)
    for point, position in zip(shape.data, all_hung):
        point.co = position

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(JERSEY_DIR, "jersey_finished.blend"))
    export(jersey, rig)
    print("exported", os.path.join(PUBLIC, "jersey.glb"), flush=True)


main()

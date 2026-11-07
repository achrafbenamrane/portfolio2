"""
The Fang's rider: a real body in one-piece race leathers, posed on the bike by solving each limb to
the bike's actual grips, pegs and seat. Five poses go out as shape keys for the game to blend:
sitting up, tucked in, hanging off each side, and stopped with a foot on the road. The helmet's a
separate model that follows the head.

The suit is painted by scripts/moto_suit.py. For that, this script writes out where every texel of
the suit sits on the standing body, so panels and seams can be drawn in real space and run straight
across the UV islands.

    blender --background --python scripts/blender/build_moto_rider.py -- <repo root> [map|cover]

`map` writes the position map and stops. Run that, then moto_suit.py, then this again without it.
`cover` stands the rider on the ground with the helmet at their hip, for the cover picture, and
saves that to assets-source/moto/build/rider-cover.blend instead.
Needs assets-source/pizza/chef/chef.blend. Writes public/moto/rider.glb and src/content/moto-rider.json.
"""

import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import script_args  # noqa: E402
from moto_kit import Part, Skin, V, extrude, lathe, rounded  # noqa: E402
from moto_paint import plain  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "export"
BUILD = os.path.join(ROOT, "assets-source/moto/build")
MAP_SIZE = 2048

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "assets-source/pizza/chef/chef.blend"))
scene = bpy.context.scene
rig = bpy.data.objects["ChefRig"]
rig.animation_data_clear()
for bone in rig.pose.bones:
    bone.rotation_mode = "QUATERNION"

# The figure is three meshes: skin where it shows, the clothes, and the shoes. Close-fitting clothes
# are most of the way to a race suit, so they become the leathers.
suit = bpy.data.objects["Suit"]
skin = bpy.data.objects["Body"]
boots = bpy.data.objects["Shoes"]
WEAR = (suit, skin, boots)
for modifier in list(skin.modifiers):
    if modifier.type == "SUBSURF":
        skin.modifiers.remove(modifier)  # Only the neck and the wrists ever show.
for modifier in list(suit.modifiers):
    if modifier.type == "MASK":
        suit.modifiers.remove(modifier)

# Leathers are tight but not skin: the aero hump, the shoulder cups, and the knee and elbow armour
# are pushed out of the suit itself, so they bend with it.
for vertex in suit.data.vertices:
    x, y, z = vertex.co
    ax = abs(x)
    side = 1 if x >= 0 else -1
    # Pull the loose shirt and trousers in to the body.
    if z > 1.0 and ax < 0.2:
        vertex.co.y *= 0.9
    hump = math.exp(-((x / 0.1) ** 2) - ((z - 1.43) / 0.13) ** 2) * (1 if y > 0.0 else 0)
    vertex.co.y += hump * 0.085
    knee = math.exp(-(((ax - 0.156) / 0.065) ** 2) - ((z - 0.52) / 0.065) ** 2) * (1 if y < 0.0 else 0)
    vertex.co.y -= knee * 0.026
    cup = math.exp(-(((ax - 0.225) / 0.07) ** 2) - ((z - 1.42) / 0.065) ** 2)
    vertex.co.x += side * cup * 0.024
    vertex.co.z += cup * 0.008
    elbow = math.exp(-(((ax - 0.364) / 0.05) ** 2) - ((z - 1.237) / 0.05) ** 2) * (1 if y > -0.03 else 0)
    vertex.co.y += elbow * 0.018

# New UVs for the suit: the clothes' own overlap, and this paint needs every texel to be one place.
for item in scene.objects:
    item.select_set(False)
suit.hide_set(False)
suit.hide_viewport = False
bpy.context.view_layer.objects.active = suit
suit.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.006)
bpy.ops.object.mode_set(mode="OBJECT")


def glove_or_boot(x, y, z):
    """Gloves and boots aren't in the suit's paint: they're coloured by where they are."""
    ax = abs(x)
    black, white, red = (0.009, 0.009, 0.011), (0.05, 0.05, 0.054), (0.022, 0.022, 0.024)
    if ax > 0.47:
        # A hard white knuckle bar over black leather.
        return white if 1.06 < z < 1.09 and y < -0.27 else black
    if z < 0.26:
        if z < 0.03:
            return (0.02, 0.02, 0.022)  # The sole.
        if y < -0.09 and z < 0.1:
            return white  # The toe slider.
        return red if 0.1 < z < 0.16 else black
    return black


# ── solving a pose ───────────────────────────────────────────────────────────────────────────

# Where the bike's own build says they are: see src/content/moto-bike.json.
SPOTS = json.load(open(os.path.join(ROOT, "src/content/moto-bike.json")))["blender"]
GRIP = {"L": Vector(SPOTS["grip_left"]), "R": Vector(SPOTS["grip_right"])}
PEG = {"L": Vector(SPOTS["peg_left"]), "R": Vector(SPOTS["peg_right"])}
SIDES = {"L": 1, "R": -1}


def update():
    bpy.context.view_layer.update()


def aim(bone, direction):
    """Points a bone along a direction, wherever its parent has got to."""
    update()
    pose_bone = rig.pose.bones[bone]
    rest = pose_bone.bone.matrix_local
    parent = pose_bone.parent
    held = (parent.matrix @ parent.bone.matrix_local.inverted() @ rest) if parent else rest
    held = held.to_3x3()
    swing = (held @ Vector((0, 1, 0))).rotation_difference(Vector(direction).normalized())
    pose_bone.rotation_quaternion = (held.inverted() @ swing.to_matrix() @ held).to_quaternion()


def reach(upper, lower, target, pole):
    """Two bones to a point, with the joint between them bending toward `pole`."""
    update()
    start = rig.pose.bones[upper].head.copy()
    first = rig.pose.bones[upper].bone.length
    second = rig.pose.bones[lower].bone.length
    way = target - start
    gap = min(way.length, (first + second) * 0.999)
    way = way.normalized()
    along = (first * first - second * second + gap * gap) / (2 * gap)
    height = math.sqrt(max(first * first - along * along, 0))
    side = (pole - way * pole.dot(way)).normalized()
    joint = start + way * along + side * height
    aim(upper, joint - start)
    aim(lower, (start + way * gap) - joint)


def pose(hip, lean, bank=0.0, head=0.32, shift_knee=0.0, foot=None):
    """`lean` is how far forward the torso is from upright, `bank` how far over it goes sideways."""
    for bone in rig.pose.bones:
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
    rig.location = Vector(hip) - rig.data.bones["Hips"].head_local
    back = Vector((bank, -math.sin(lean), math.cos(lean))).normalized()
    upper = Vector((bank * 1.4, -math.sin(lean + 0.16), math.cos(lean + 0.16))).normalized()
    aim("Hips", back)
    aim("Spine", back)
    aim("Chest", upper)
    aim("Neck", Vector((bank, -math.sin(lean * 0.55), math.cos(lean * 0.55))))
    aim("Head", Vector((bank * 0.3, -math.sin(head), math.cos(head))))
    offset = rig.location
    for key, side in SIDES.items():
        reach(f"UpperArm{key}", f"ForeArm{key}", GRIP[key] - offset, Vector((side * 0.9, 0.3, -0.25)))
        aim(f"Hand{key}", Vector((-side * 0.18, -0.9, -0.24)))
        for finger in range(1, 6):
            for joint in range(1, 4):
                pose_bone = rig.pose.bones[f"Finger{finger}{joint}{key}"]
                pose_bone.rotation_quaternion = Quaternion(Vector((1, 0, 0)), 0.72 if finger > 1 else 0.3)
        knee_out = 0.36 + (shift_knee if side * bank > 0 else 0)
        target = Vector(foot) if foot and key == "L" else PEG[key]
        reach(f"Thigh{key}", f"Shin{key}", target - offset, Vector((side * knee_out, -1, 0.1)))
        aim(f"Foot{key}", Vector((side * 0.1, -0.86, -0.1)) if foot and key == "L" else Vector((side * 0.1, -0.8, -0.56)))
    update()


POSES = {
    "sit": dict(hip=(0, 0.25, 0.925), lean=1.02, head=0.46),
    "tuck": dict(hip=(0, 0.33, 0.935), lean=1.26, head=0.9),
    "left": dict(hip=(0.11, 0.25, 0.925), lean=0.98, bank=0.2, head=0.56, shift_knee=0.9),
    "right": dict(hip=(-0.11, 0.25, 0.925), lean=0.98, bank=-0.2, head=0.56, shift_knee=0.9),
    "stop": dict(hip=(0.015, 0.25, 0.935), lean=0.8, head=0.24, foot=(0.34, 0.06, 0.1)),
}


def capture(with_uv=False):
    """Every worn vertex as it stands now, and the faces, in one list, with each face's material."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points, faces, slots, uvs = [], [], [], []
    for item in WEAR:
        evaluated = item.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        start = len(points)
        world = evaluated.matrix_world
        points.extend(tuple(world @ vertex.co) for vertex in mesh.vertices)
        faces.extend(tuple(i + start for i in polygon.vertices) for polygon in mesh.polygons)
        slots.extend([0 if item is suit else 1] * len(mesh.polygons))
        if with_uv:
            layer = mesh.uv_layers.active
            if item is suit and layer:
                for polygon in mesh.polygons:
                    uvs.append([tuple(layer.data[i].uv) for i in polygon.loop_indices])
            else:
                uvs.extend([[(0.0, 0.0)] * len(polygon.vertices) for polygon in mesh.polygons])
        evaluated.to_mesh_clear()
    return np.array(points), faces, slots, uvs


# Standing, to read everything by where on the body it is.
for bone in rig.pose.bones:
    bone.rotation_quaternion = (1, 0, 0, 0)
rig.location = (0, 0, 0)
update()
standing, faces, slots, uvs = capture(with_uv=True)

if MODE == "map":
    # Where each texel of the suit sits on the standing body.
    position = np.zeros((MAP_SIZE, MAP_SIZE, 3), np.float32)
    filled = np.zeros((MAP_SIZE, MAP_SIZE), bool)
    for face, slot, uv in zip(faces, slots, uvs):
        if slot != 0:
            continue
        for k in range(1, len(face) - 1):
            ids = (face[0], face[k], face[k + 1])
            t = np.array((uv[0], uv[k], uv[k + 1])) * (MAP_SIZE - 1)
            p = standing[list(ids)]
            low = np.floor(t.min(0)).astype(int)
            high = np.ceil(t.max(0)).astype(int) + 1
            xs, ys = np.meshgrid(np.arange(low[0], high[0]), np.arange(low[1], high[1]))
            d = (t[1, 1] - t[2, 1]) * (t[0, 0] - t[2, 0]) + (t[2, 0] - t[1, 0]) * (t[0, 1] - t[2, 1])
            if abs(d) < 1e-9:
                continue
            a = ((t[1, 1] - t[2, 1]) * (xs - t[2, 0]) + (t[2, 0] - t[1, 0]) * (ys - t[2, 1])) / d
            b = ((t[2, 1] - t[0, 1]) * (xs - t[2, 0]) + (t[0, 0] - t[2, 0]) * (ys - t[2, 1])) / d
            c = 1 - a - b
            hit = (a >= -0.02) & (b >= -0.02) & (c >= -0.02)
            if not hit.any():
                continue
            rows, cols = ys[hit].clip(0, MAP_SIZE - 1), xs[hit].clip(0, MAP_SIZE - 1)
            position[rows, cols] = a[hit, None] * p[0] + b[hit, None] * p[1] + c[hit, None] * p[2]
            filled[rows, cols] = True
    np.save(os.path.join(BUILD, "suit-position.npy"), position)
    np.save(os.path.join(BUILD, "suit-filled.npy"), filled)
    print("Mapped the suit:", round(float(filled.mean()), 3), "of the sheet", flush=True)
    sys.exit(0)

shapes = {}
heads = {}
for name, settings in POSES.items():
    pose(**settings)
    shapes[name], _, _, _ = capture()
    head = rig.pose.bones["Head"]
    matrix = rig.matrix_world @ head.matrix
    location = matrix.to_translation()
    # The helmet's built upright, so what it needs is how far the head has turned from standing.
    turn = matrix.to_quaternion() @ head.bone.matrix_local.to_quaternion().inverted()
    # Blender to three: x, z, -y.
    heads[name] = {"at": [location.x, location.z, -location.y], "turn": [turn.x, turn.z, -turn.y, turn.w]}
    print(name, "grip error", [round((rig.matrix_world @ rig.pose.bones[f"Hand{k}"].head - GRIP[k]).length, 3) for k in "LR"], flush=True)

# Standing beside the bike, for the cover: a hand on the tank, the helmet carried on the right hip.
HELMET_HAND = Vector((-0.42, -0.12, 1.1))
TANK_HAND = Vector((0.27, -0.44, 1.02))


def stand():
    for bone in rig.pose.bones:
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
    rig.location = (0, 0, 0)
    update()
    reach("UpperArmR", "ForeArmR", HELMET_HAND, Vector((-0.8, 0.9, -0.5)))
    aim("HandR", Vector((0.12, -0.92, 0.1)))
    reach("UpperArmL", "ForeArmL", TANK_HAND, Vector((0.9, 0.3, -0.4)))
    aim("HandL", Vector((-0.1, -0.8, -0.5)))
    for key, curl in (("R", 0.62), ("L", 0.34)):
        for finger in range(1, 6):
            for joint in range(1, 4):
                rig.pose.bones[f"Finger{finger}{joint}{key}"].rotation_quaternion = Quaternion(Vector((1, 0, 0)), curl)
    update()


if MODE == "cover":
    stand()
    standing_cover = capture()[0]
    neck = rig.matrix_world @ rig.pose.bones["Head"].head
    json.dump({"neck": list(neck)}, open(os.path.join(BUILD, "cover-neck.json"), "w"))

# ── the mesh that goes out ───────────────────────────────────────────────────────────────────

out = bpy.data.meshes.new("Rider")
out.from_pydata((standing_cover if MODE == "cover" else shapes["sit"]).tolist(), [], faces)
out.shade_smooth()
layer = out.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
for index, point in enumerate(standing):
    layer.data[index].color = (*glove_or_boot(*point), 1)
out.materials.append(plain("Suit", (1, 1, 1), rough=0.42))
out.materials.append(plain("Leather", (1, 1, 1), rough=0.42))
out.polygons.foreach_set("material_index", slots)
sheet = out.uv_layers.new(name="UVMap")
flat_uv = [point for corners in uvs for point in corners]
sheet.data.foreach_set("uv", np.array(flat_uv, np.float32).ravel())
print("rider vertices", len(standing), "faces", len(faces), flush=True)

for item in list(bpy.data.objects):
    bpy.data.objects.remove(item)
collection = scene.collection
rider = bpy.data.objects.new("Rider", out)
collection.objects.link(rider)
if MODE != "cover":
    rider.shape_key_add(name="Basis", from_mix=False)
    for name in ("tuck", "left", "right", "stop"):
        key = rider.shape_key_add(name=name, from_mix=False)
        key.data.foreach_set("co", shapes[name].ravel())

# ── the helmet ───────────────────────────────────────────────────────────────────────────────

SIZE = 0.9


def row(y, points):
    return y * SIZE, [(p[0] * SIZE, p[1] * SIZE, 5.0 if i == 3 else 1.0) for i, p in enumerate(points)]


# Origin at the top of the neck, up along +z, face toward -y. A race helmet's a long egg: a tall
# crown, a chin bar that juts, and a tail that tapers to the spoiler.
shell = Skin(
    [
        row(-0.18, [(0, 0.17), (0.03, 0.17), (0.056, 0.155), (0.068, 0.11), (0.068, 0.045), (0.058, -0.008), (0.03, -0.045)]),
        row(-0.14, [(0, 0.218), (0.05, 0.218), (0.092, 0.2), (0.114, 0.145), (0.116, 0.06), (0.102, -0.008), (0.07, -0.062)]),
        row(-0.06, [(0, 0.274), (0.07, 0.274), (0.121, 0.246), (0.137, 0.165), (0.136, 0.07), (0.124, -0.016), (0.098, -0.082)]),
        row(0.05, [(0, 0.282), (0.07, 0.282), (0.123, 0.25), (0.14, 0.165), (0.138, 0.07), (0.126, -0.02), (0.104, -0.092)]),
        row(0.13, [(0, 0.238), (0.06, 0.238), (0.106, 0.212), (0.122, 0.146), (0.12, 0.07), (0.11, -0.006), (0.09, -0.086)]),
        row(0.18, [(0, 0.168), (0.03, 0.168), (0.06, 0.152), (0.075, 0.106), (0.075, 0.05), (0.065, -0.006), (0.05, -0.062)]),
    ]
)
K = SIZE
helmet = Part("Helmet")
port = [(-0.172 * K, V(0.3), 0.008), (-0.1 * K, V(0.27), 0.02), (-0.03 * K, V(0.36), 0.03), (-0.02 * K, V(0.52), 0.03), (-0.06 * K, V(0.62), 0.02), (-0.172 * K, V(0.64), 0.008)]
shell.panel(helmet, "HelmetPaint", [(-0.18 * K, V(0.0)), (0.18 * K, V(0.0)), (0.18 * K, V(0.8), 0.02), (-0.18 * K, V(0.8), 0.02)], holes=[port], join=True, grid=0.008, thick=0.005, roll=0.002)
# The lower shell and the neck roll, in black.
shell.panel(helmet, "HelmetBlack", [(-0.178 * K, V(0.815), 0.01), (0.178 * K, V(0.815), 0.01), (0.178 * K, V(1.0)), (-0.178 * K, V(1.0))], grid=0.01, thick=0.004, roll=0.002)
# What's inside the eye port: dark padding, so nothing shows through.
shell.panel(helmet, "HelmetBlack", [(-0.176 * K, V(0.26), 0.01), (-0.02 * K, V(0.26), 0.02), (-0.01 * K, V(0.66), 0.02), (-0.176 * K, V(0.68), 0.01)], lift=-0.018, grid=0.01, thick=0.002)
# The visor: a mirror-smoked sheet, a little larger than the port, on a pivot by the ear.
shell.panel(helmet, "Visor", [(-0.178 * K, V(0.27), 0.008), (-0.1 * K, V(0.235), 0.02), (-0.015 * K, V(0.34), 0.03), (-0.005 * K, V(0.52), 0.03), (-0.05 * K, V(0.655), 0.02), (-0.178 * K, V(0.675), 0.008)], lift=0.0034, grid=0.008, thick=0.002, roll=0.0012)
# A stripe over the crown, and the rear wing's two fins.
shell.panel(helmet, "HelmetWhite", [(-0.16 * K, V(0.0)), (0.17 * K, V(0.0)), (0.17 * K, V(0.05)), (-0.16 * K, V(0.05))], lift=0.0008, join=True, grid=0.01, thick=0.001, roll=0.0006)
shell.panel(helmet, "HelmetBlack", [(0.03 * K, V(0.14), 0.012), (0.17 * K, V(0.2), 0.012), (0.15 * K, V(0.34), 0.012), (0.04 * K, V(0.26), 0.012)], lift=0.0012, grid=0.01, thick=0.0015, roll=0.0008)
# Vents: two on the brow, one in the chin.
shell.panel(helmet, "HelmetVent", [(-0.15 * K, V(0.1), 0.004), (-0.07 * K, V(0.09), 0.004), (-0.07 * K, V(0.15), 0.004), (-0.15 * K, V(0.17), 0.004)], lift=0.0014, grid=0.006, thick=0.0012, roll=0.0006)
shell.panel(helmet, "HelmetVent", [(-0.178 * K, V(0.7), 0.004), (-0.12 * K, V(0.69), 0.004), (-0.12 * K, V(0.76), 0.004), (-0.178 * K, V(0.77), 0.004)], lift=0.0014, grid=0.006, thick=0.0012, roll=0.0006)
for side in (-1, 1):
    pivot, facing = shell.spot(-0.012 * K, V(0.47))
    pivot = pivot * np.array([side, 1.0, 1.0])
    facing = facing * np.array([side, 1.0, 1.0])
    lathe(helmet, "HelmetBlack", [(0, 0.0065), (0.012, 0.0065), (0.022, 0.0048), (0.024, 0.0), (0.024, -0.004)], pivot, facing, segments=24)
    fin = rounded([(0.09, 0.2, 0.006), (0.17, 0.205, 0.01), (0.185, 0.17, 0.004), (0.1, 0.18, 0.008)], step=0.004)
    extrude(helmet, "HelmetBlack", fin * K, 0.0045, (side * 0.045 * K - 0.00225, 0, 0), (0, 1, 0), (0, 0, 1), chamfer=0.0008)
materials = {
    "HelmetPaint": plain("HelmetPaint", (0.012, 0.012, 0.013), rough=0.5),
    "HelmetBlack": plain("HelmetBlack", (0.007, 0.007, 0.008), rough=0.34),
    "HelmetWhite": plain("HelmetWhite", (0.03, 0.03, 0.032), rough=0.4),
    "HelmetVent": plain("HelmetVent", (0.004, 0.004, 0.005), rough=0.5),
    "Visor": plain("Visor", (0.02, 0.02, 0.025), rough=0.1),
}
helmet.build(materials, collection)


def finish_cover():
    """The real suit on the rider, the head taken away for the portrait, and the helmet in hand."""
    tree_of = {}
    for slot in out.materials:
        slot.use_nodes = True
        tree_of[slot.name.split(".")[0]] = slot.node_tree
    tree = tree_of["Suit"]
    shader = tree.nodes["Principled BSDF"]
    for name, socket, data in (("suit-albedo", "Base Color", False), ("suit-rough", "Roughness", True)):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(os.path.join(ROOT, "public/moto", f"{name}.webp"))
        node.image.pack()
        if data:
            node.image.colorspace_settings.name = "Non-Color"
        tree.links.new(node.outputs["Color"], shader.inputs[socket])
    normal = tree.nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images.load(os.path.join(ROOT, "public/moto/suit-normal.webp"))
    normal.image.pack()
    normal.image.colorspace_settings.name = "Non-Color"
    bend = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(normal.outputs["Color"], bend.inputs["Color"])
    tree.links.new(bend.outputs["Normal"], shader.inputs["Normal"])
    tree = tree_of["Leather"]
    shader = tree.nodes["Principled BSDF"]
    colour = tree.nodes.new("ShaderNodeAttribute")
    colour.attribute_name = "Col"
    tree.links.new(colour.outputs["Color"], shader.inputs["Base Color"])

    # Everything of the skin above the collar goes: the portrait stands there instead.
    import bmesh

    work = bmesh.new()
    work.from_mesh(out)
    work.faces.ensure_lookup_table()
    doomed = [face for face in work.faces if face.material_index == 1 and face.calc_center_median().z > 1.3 and abs(face.calc_center_median().x) < 0.24]
    bmesh.ops.delete(work, geom=doomed, context="FACES")
    work.to_mesh(out)
    work.free()

    holder = bpy.data.objects.new("HelmetHeld", None)
    collection.objects.link(holder)
    holder.location = HELMET_HAND + Vector((0.01, -0.02, 0.03))
    holder.rotation_euler = (math.radians(-6), math.radians(4), math.radians(-24))
    for item in collection.objects:
        if item not in (rider, holder) and item.parent is None:
            item.parent = holder
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, "rider-cover.blend"))
    print("Saved the cover rider", flush=True)


if MODE == "cover":
    finish_cover()
    sys.exit(0)

json.dump({"poses": ["tuck", "left", "right", "stop"], "heads": heads}, open(os.path.join(ROOT, "src/content/moto-rider.json"), "w"), separators=(",", ":"))

target = os.path.join(ROOT, "public/moto/rider.glb")
bpy.ops.export_scene.gltf(
    filepath=target,
    export_format="GLB",
    export_materials="EXPORT",
    export_image_format="NONE",
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
    export_morph=True,
    export_morph_normal=True,
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=True,
)
print("Exported rider", os.path.getsize(target) / 1e6, "MB", flush=True)

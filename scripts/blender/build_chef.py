"""
Puts the chef together: the MakeHuman body and clothes, the apron, neckerchief and toque, a
skeleton, and the moves.

    B --background --factory-startup --python scripts/blender/build_chef.py -- \
        <repo root> [look <out.png> | pose <out prefix> <frames> <clip> | head <out.png> | blend <out.blend>]
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Group, add_area, add_camera, script_args, select_only, use_gpu  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "look"
OUT = os.path.abspath(args[2]) if len(args) > 2 else ""
CHEF = os.path.join(ROOT, "assets-source/pizza/chef")
TEX = os.path.join(CHEF, "tex")

scene = bpy.context.scene
for thing in list(bpy.data.objects):
    bpy.data.objects.remove(thing)

human = np.load(os.path.join(CHEF, "human.npz"))
extras = np.load(os.path.join(CHEF, "body.npz"))
face_path = os.path.join(CHEF, "face-fit.npz")
face_fit = np.load(face_path) if os.path.exists(face_path) else None


def plain(name, colour, roughness=0.7, sheen=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*colour, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Sheen Weight"].default_value = sheen
    return material


def textured(name, picture, roughness=0.6, normal=None, strength=1.0):
    material = plain(name, (1, 1, 1), roughness)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(os.path.join(TEX, picture))
    links.new(image.outputs["Color"], shader.inputs["Base Color"])
    if normal:
        map_node = nodes.new("ShaderNodeTexImage")
        map_node.image = bpy.data.images.load(os.path.join(TEX, normal))
        map_node.image.colorspace_settings.name = "Non-Color"
        converter = nodes.new("ShaderNodeNormalMap")
        converter.inputs["Strength"].default_value = strength
        links.new(map_node.outputs["Color"], converter.inputs["Color"])
        links.new(converter.outputs["Normal"], shader.inputs["Normal"])
    return material


def skin_material():
    picture = "skin-face.png" if os.path.exists(os.path.join(TEX, "skin-face.png")) else "skin.png"
    material = textured("Skin", picture, 0.42)
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Subsurface Weight"].default_value = 0.34
    shader.inputs["Subsurface Radius"].default_value = (1.0, 0.36, 0.16)
    shader.inputs["Subsurface Scale"].default_value = 0.006
    return material


def eye_material():
    """The eyeball's outer shell is clear, and the picture's alpha is what says so."""
    material = textured("Eyes", "eye.png", 0.06)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    image = next(node for node in nodes if node.type == "TEX_IMAGE")
    links.new(image.outputs["Alpha"], nodes["Principled BSDF"].inputs["Alpha"])
    return material


def wooden(name, picture):
    """A photographed grain, wrapped on without needing UVs."""
    material = plain(name, (1, 1, 1), 0.46)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.3, 1.3, 1.3)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(os.path.normpath(os.path.join(TEX, "../../polyhaven", picture)))
    image.projection = "BOX"
    image.projection_blend = 0.25
    links.new(mapping.outputs["Vector"], image.inputs["Vector"])
    links.new(image.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return material


def hair_material():
    """Near black, and see-through where the cards end."""
    material = plain("Hair", (0.012, 0.009, 0.008), 0.42)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(os.path.join(TEX, "hair.png"))
    links.new(image.outputs["Alpha"], nodes["Principled BSDF"].inputs["Alpha"])
    return material


MATERIALS = {
    "Body": skin_material(),
    "Suit": textured("Suit", "suit.png", 0.72, "suit-normal.png", 1.2),
    "Shoes": textured("Shoes", "shoes.png", 0.32, "shoes-normal.png"),
    "Eyes": eye_material(),
    "Teeth": textured("Teeth", "teeth.png", 0.24),
    "Hair": hair_material(),
    "Apron": plain("Apron", (0.016, 0.13, 0.06), 0.8, 0.5),
    "Scarf": plain("Scarf", (0.46, 0.012, 0.03), 0.62, 0.3),
    "Toque": plain("Toque", (0.9, 0.89, 0.86), 0.68, 0.3),
    "Buttons": plain("Buttons", (0.02, 0.02, 0.022), 0.3),
}


def build_mesh(name, vertices, sizes, loops, material):
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(vertices))
    mesh.vertices.foreach_set("co", np.asarray(vertices, np.float32).ravel())
    mesh.loops.add(len(loops))
    mesh.loops.foreach_set("vertex_index", np.asarray(loops, np.int32))
    mesh.polygons.add(len(sizes))
    starts = np.zeros(len(sizes), np.int32)
    starts[1:] = np.cumsum(sizes)[:-1]
    mesh.polygons.foreach_set("loop_start", starts)
    mesh.update(calc_edges=True)
    mesh.validate()
    mesh.shade_smooth()
    if material:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj


parts = {}
for name in ("Body", "Suit", "Shoes", "Eyes", "Teeth", "Hair"):
    vertices = human[f"{name}_v"]
    if face_fit is not None and f"{name}_v" in face_fit.files:
        vertices = face_fit[f"{name}_v"]
    obj = build_mesh(name, vertices, human[f"{name}_sizes"], human[f"{name}_loops"], MATERIALS[name])
    layer = obj.data.uv_layers.new(name="UVMap")
    layer.uv.foreach_set("vector", human[f"{name}_uv"].ravel())
    parts[name] = obj

for name in ("Apron", "Scarf", "Toque"):
    triangles = extras[f"{name}_f"]
    parts[name] = build_mesh(
        name,
        extras[f"{name}_v"],
        np.full(len(triangles), 3, np.int32),
        triangles.ravel(),
        MATERIALS[name],
    )

# The toque is cut to fit: as wide and as deep as the head where its band sits.
head_points = np.asarray(human["Body_v"] if face_fit is None else face_fit["Body_v"])
top = head_points[:, 2].max()
band_z = top - 0.052
level = head_points[np.abs(head_points[:, 2] - band_z) < 0.006]
fit_x = np.ptp(level[:, 0]) / 2 * 1.08
fit_y = np.ptp(level[:, 1]) / 2 * 1.13
parts["Toque"].scale = (fit_x, fit_y, 1)
parts["Toque"].location = (float(level[:, 0].min() + np.ptp(level[:, 0]) / 2), float(level[:, 1].min() + np.ptp(level[:, 1]) / 2 + 0.006), float(band_z))

# Nothing of the hair goes higher than the band: it's under the toque.
hair_mesh = parts["Hair"].data
points = np.empty(len(hair_mesh.vertices) * 3, np.float32)
hair_mesh.vertices.foreach_get("co", points)
points = points.reshape(-1, 3)
points[:, 2] = np.minimum(points[:, 2], band_z + 0.015)
hair_mesh.vertices.foreach_set("co", points.ravel())
hair_mesh.update()

world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.3, 0.29, 0.28, 1)
scene.world = world

if MODE == "head":
    # Straight on and orthographic, for the face landmarker to read.
    for name, obj in parts.items():
        if name not in ("Body", "Eyes"):
            obj.hide_render = True
    add_area(scene, "Key", (0, -1.4, 1.8), (0, 0, 1.62), 2.0, 40, (1, 1, 1))
    camera = add_camera(scene, (0, -1.0, 1.62), (0, 0, 1.62), name="Face")
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.4
    use_gpu(scene, 32)
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("Rendered head", OUT)
    sys.exit(0)


# The peel -------------------------------------------------------------------------------

PEEL_HANDLE = 1.35
PEEL_BLADE = 0.36

wood = wooden("Peel", "oak_veneer_01_diff_2k.jpg")
peel_mesh = Group("Peel")
peel_mesh.cylinder((0, 0, 0), (0, PEEL_HANDLE, 0), 0.0155, "Peel", sides=14)
blade = 0.17
steps = 18
outline = [
    (-0.03 - (blade - 0.03) * min(i / 5, 1), PEEL_HANDLE + i / steps * PEEL_BLADE)
    for i in range(steps)
]
for (x0, y0), (x1, y1) in zip(outline, outline[1:]):
    peel_mesh.quad([(x0, y0, 0.004), (-x0, y0, 0.004), (-x1, y1, 0.004), (x1, y1, 0.004)], "Peel")
    peel_mesh.quad([(x1, y1, -0.004), (-x1, y1, -0.004), (-x0, y0, -0.004), (x0, y0, -0.004)], "Peel")
peel = peel_mesh.build(scene.collection, {"Peel": wood})
peel.data.shade_flat()
parts["Peel"] = peel

# The skeleton ---------------------------------------------------------------------------

names = [str(name) for name in human["bone_names"]]
heads = {name: Vector(point.tolist()) for name, point in zip(names, human["bone_heads"])}
tails = {name: Vector(point.tolist()) for name, point in zip(names, human["bone_tails"])}
parent_of = {name: str(parent) for name, parent in zip(names, human["bone_parents"])}
roll_of = {name: float(roll) for name, roll in zip(names, human["finger_rolls"])}

armature_data = bpy.data.armatures.new("ChefRig")
armature = bpy.data.objects.new("ChefRig", armature_data)
scene.collection.objects.link(armature)
bpy.context.view_layer.update()
select_only(armature)
bpy.ops.object.mode_set(mode="EDIT")
edit = armature_data.edit_bones

root = edit.new("Root")
root.head = (0, 0, 0)
root.tail = (0, 0, 0.2)
for name in names:
    item = edit.new(name)
    item.head = heads[name]
    item.tail = tails[name]
    item.roll = roll_of[name]
for name in names:
    edit[name].parent = edit[parent_of[name]]
peel_bone = edit.new("Peel")
peel_bone.head = (0, 0, 0)
peel_bone.tail = (0, 0.4, 0)
peel_bone.parent = edit["Root"]
bpy.ops.object.mode_set(mode="OBJECT")

BONES = {name: (b.head_local.copy(), b.tail_local.copy()) for name, b in armature_data.bones.items()}


def bind(obj, weights=None, rigid=None):
    """Gives a mesh to the skeleton: by its weights, or whole to one bone."""
    if rigid:
        group = obj.vertex_groups.new(name=rigid)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    else:
        top = np.argsort(weights, axis=1)[:, -4:]
        rows = np.arange(len(weights))[:, None]
        kept = np.zeros_like(weights)
        kept[rows, top] = weights[rows, top]
        total = kept.sum(axis=1, keepdims=True)
        kept = np.divide(kept, total, out=np.zeros_like(kept), where=total > 0)
        for column, name in enumerate(names):
            used = np.nonzero(kept[:, column] > 0.01)[0]
            if not len(used):
                continue
            group = obj.vertex_groups.new(name=name)
            for vertex in used.tolist():
                group.add([vertex], float(kept[vertex, column]), "REPLACE")
    obj.parent = armature
    modifier = obj.modifiers.new("Rig", "ARMATURE")
    modifier.object = armature


def nearest_bone_weights(obj, allowed, sharpness):
    mesh = obj.data
    points = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get("co", points)
    points = points.reshape(-1, 3)
    weights = np.zeros((len(points), len(names)), np.float32)
    for bone_name in allowed:
        a = np.array(BONES[bone_name][0], np.float32)
        b = np.array(BONES[bone_name][1], np.float32)
        ab = b - a
        t = np.clip(((points - a) @ ab) / float(ab @ ab), 0, 1)
        d = np.linalg.norm(points - (a + t[:, None] * ab), axis=1)
        weights[:, names.index(bone_name)] = 1 / np.maximum(d, 0.012) ** sharpness
    return weights / weights.sum(axis=1, keepdims=True)


for name in ("Body", "Suit", "Shoes", "Eyes", "Teeth", "Hair"):
    bind(parts[name], human[f"{name}_w"])
bind(parts["Apron"], nearest_bone_weights(parts["Apron"], ["Hips", "ThighL", "ThighR"], 3.0))
bind(parts["Scarf"], nearest_bone_weights(parts["Scarf"], ["Chest", "Neck"], 4.0))
select_only(parts["Toque"])
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bind(parts["Toque"], rigid="Head")
bind(parts["Peel"], rigid="Peel")

# The moves ------------------------------------------------------------------------------

poses = armature.pose.bones
for item in poses:
    item.rotation_mode = "QUATERNION"


def refresh():
    bpy.context.view_layer.update()


def aim(name, head_at, tail_at):
    """Stands a bone from one point to another, keeping its roll."""
    item = poses[name]
    rest = item.bone.matrix_local
    was = (rest.col[1].to_3d()).normalized()
    turn = was.rotation_difference((Vector(tail_at) - Vector(head_at)).normalized()).to_matrix().to_4x4()
    matrix = turn @ Matrix(rest.to_3x3()).to_4x4()
    matrix.translation = head_at
    item.matrix = matrix
    refresh()


def lay_peel(at, way):
    """
    Points the peel with its blade flat, because a pizza rides on it. `aim` can't: it turns a
    bone the shortest way, and the peel starts out pointing backwards, so its roll comes out
    as anything. Stood on end like a staff, the blade faces forward instead.
    """
    up = Vector((0, -1, 0)) if abs(way.z) > 0.9 else Vector((0, 0, 1))
    across = way.cross(up).normalized()
    face = across.cross(way).normalized()
    matrix = Matrix((across, way, face)).transposed().to_4x4()
    matrix.translation = at
    poses["Peel"].matrix = matrix
    refresh()


def reach(root_at, target, first, second, hint):
    """Where a joint between two bones goes, for the end of them to touch a target."""
    span = target - root_at
    length = min(span.length, first + second - 0.002)
    along = span.normalized()
    middle = (first * first - second * second + length * length) / (2 * length)
    height = math.sqrt(max(first * first - middle * middle, 0))
    side = (hint - along * hint.dot(along)).normalized()
    return root_at + along * middle + side * height, root_at + along * length


def length_of(name):
    head_at, tail_at = BONES[name]
    return (tail_at - head_at).length


# How far each finger closes round the handle, joint by joint.
CURL = (0.95, 1.15, 0.8)
THUMB = (0.25, 0.5, 0.5)


def grip(tag, way, closed=1.0):
    """Turns the hand so its fingers close across the handle, and closes them."""
    hand = poses[f"Hand{tag}"]
    matrix = hand.matrix.copy()
    along = matrix.col[1].to_3d().normalized()
    across = matrix.col[0].to_3d().normalized()
    wanted = (way - along * way.dot(along)).normalized()
    angle = across.angle(wanted)
    if across.cross(wanted).dot(along) < 0:
        angle = -angle
    turned = Matrix.Rotation(angle, 4, along) @ Matrix(matrix.to_3x3()).to_4x4()
    turned.translation = matrix.translation
    hand.matrix = turned
    refresh()
    for finger in range(1, 6):
        for segment in range(1, 4):
            bend = (THUMB if finger == 1 else CURL)[segment - 1] * closed
            poses[f"Finger{finger}{segment}{tag}"].rotation_quaternion = Quaternion((1, 0, 0), bend)
    refresh()


SHORT = []


def turn_about_itself(name, angle):
    """A twist of the body, which an aimed bone can't do: it only says where the bone points."""
    item = poses[name]
    axis = item.matrix.col[1].to_3d().normalized()
    turned = Matrix.Rotation(angle, 4, axis) @ Matrix(item.matrix.to_3x3()).to_4x4()
    turned.translation = item.matrix.translation
    item.matrix = turned
    refresh()


def pose(hips=(0, 0, 0), lean=0.0, twist=0.0, look=(0, -1, 0), peel_at=(0, 0, 1), peel_way=(0, 1, 0), grips=(0.1, 0.62), feet=None, free_hand=None):
    """One moment: where the hips and the peel are. The arms and legs follow from those."""
    for item in poses:
        item.rotation_quaternion = (1, 0, 0, 0)
        item.location = (0, 0, 0)
    refresh()

    rest_hips, rest_spine = BONES["Hips"]
    shift = Vector(hips)
    aim("Hips", rest_hips + shift, rest_spine + shift)
    bend = Quaternion((1, 0, 0), -lean)
    spine_head = poses["Spine"].head.copy()
    aim("Spine", spine_head, spine_head + bend @ (BONES["Spine"][1] - BONES["Spine"][0]))
    turn_about_itself("Spine", twist / 2)
    chest_head = poses["Chest"].head.copy()
    aim("Chest", chest_head, chest_head + bend @ (BONES["Chest"][1] - BONES["Chest"][0]))
    turn_about_itself("Chest", twist)
    neck_head = poses["Neck"].head.copy()
    aim("Neck", neck_head, neck_head + (BONES["Neck"][1] - BONES["Neck"][0]))

    # A head turns on the neck: side to side, then up and down.
    head_head = poses["Head"].head.copy()
    facing = Vector(look)
    yaw = math.atan2(facing.x, -facing.y)
    nod = -math.atan2(facing.z, math.hypot(facing.x, facing.y))
    rest = poses["Head"].bone.matrix_local
    turned = Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(nod, 4, "X") @ Matrix(rest.to_3x3()).to_4x4()
    turned.translation = head_head
    poses["Head"].matrix = turned
    refresh()

    at = Vector(peel_at)
    way = Vector(peel_way).normalized()
    lay_peel(at, way)

    for tag, on_handle, elbow_out in (("R", grips[0], -1), ("L", grips[1], 1)):
        target = at + way * on_handle
        free = tag == "L" and free_hand
        if free:
            target = Vector(free_hand)
        shoulder = poses[f"UpperArm{tag}"].head.copy()
        if not free:
            # It's the palm that closes round the handle, a hand's length past the wrist.
            target = target - (target - shoulder).normalized() * PALM
        elbow, wrist = reach(
            shoulder,
            target,
            length_of(f"UpperArm{tag}"),
            length_of(f"ForeArm{tag}"),
            Vector((elbow_out * 0.8, 0.5, -0.5)),
        )
        if not free and (wrist - target).length > 0.01:
            SHORT.append((tag, round((wrist - target).length, 3)))
        aim(f"UpperArm{tag}", shoulder, elbow)
        aim(f"ForeArm{tag}", elbow, wrist)
        aim(f"Hand{tag}", wrist, wrist + (wrist - elbow).normalized() * 0.16)
        if free:
            grip(tag, Vector((0, 1, 0)), 0.22)
        else:
            grip(tag, way)

    for tag, sign in (("L", 1), ("R", -1)):
        planted = feet[tag] if feet else None
        ankle = Vector(planted) if planted else BONES[f"Foot{tag}"][0]
        toe = ankle + (BONES[f"Foot{tag}"][1] - BONES[f"Foot{tag}"][0])
        hip = poses[f"Thigh{tag}"].head.copy()
        knee, foot = reach(hip, ankle, length_of(f"Thigh{tag}"), length_of(f"Shin{tag}"), Vector((sign * 0.1, -1, 0.1)))
        aim(f"Thigh{tag}", hip, knee)
        aim(f"Shin{tag}", knee, foot)
        aim(f"Foot{tag}", foot, toe)


def keep(frame):
    for item in poses:
        item.keyframe_insert("rotation_quaternion", frame=frame)
        item.keyframe_insert("location", frame=frame)


# Every few frames the arms are solved again. Left to blend between the big moments, each
# joint takes its own short way there and the hands slide off the handle.
SOLVE_EVERY = 3

PALM = 0.075

POSE_DEFAULTS = dict(hips=(0, 0, 0), lean=0.0, twist=0.0)


def between(first, second, share):
    """A moment part of the way from one to the other, easing in and out."""
    eased = share * share * (3 - 2 * share)
    blended = {}
    for key in {*first, *second}:
        a = first.get(key, POSE_DEFAULTS.get(key))
        b = second.get(key, POSE_DEFAULTS.get(key))
        if isinstance(a, (int, float)):
            blended[key] = a + (b - a) * eased
        elif isinstance(a, tuple):
            blended[key] = tuple(x + (y - x) * eased for x, y in zip(a, b))
        else:
            blended[key] = a
    return blended


def clip(name, moments):
    armature.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    armature.animation_data.action = action
    for (frame, settings), (next_frame, next_settings) in zip(moments, moments[1:]):
        for at in range(frame, next_frame, SOLVE_EVERY):
            SHORT.clear()
            pose(**between(settings, next_settings, (at - frame) / (next_frame - frame)))
            keep(at)
            if SHORT:
                print("short of the handle", name, at, SHORT, flush=True)
    pose(**moments[-1][1])
    keep(moments[-1][0])
    return action


REST_L = BONES["FootL"][0] + Vector((0.02, 0.14, 0))
REST_R = BONES["FootR"][0] + Vector((-0.03, -0.22, 0))
FEET = {"L": REST_L, "R": REST_R}

# The peel held level at the waist, pointing where the chef faces.
READY = dict(peel_at=(-0.16, 0.34, 1.02), peel_way=(0.07, -1, 0.05), grips=(0.14, 0.62), twist=-0.14, feet=FEET)

serve = clip(
    "Serve",
    [
        (1, {**READY, "hips": (0, 0.03, -0.01), "lean": 0.02, "look": (0.05, -1, -0.12)}),
        (28, {**READY, "peel_at": (-0.16, 0.42, 1.03), "hips": (0, 0.09, -0.02), "lean": -0.03, "look": (0.05, -1, -0.1)}),
        (66, {**READY, "peel_at": (-0.13, -0.42, 0.98), "grips": (0.13, 0.3), "twist": -0.62, "hips": (0, -0.29, -0.085), "lean": 0.35, "look": (0.03, -1, -0.28)}),
        (84, {**READY, "peel_at": (-0.13, -0.44, 0.98), "grips": (0.13, 0.3), "twist": -0.64, "hips": (0, -0.3, -0.085), "lean": 0.36, "look": (0.03, -1, -0.28)}),
        (118, {**READY, "peel_at": (-0.16, 0.26, 1.02), "hips": (0, 0.05, -0.02), "lean": 0.03, "look": (0.3, -1, 0.02)}),
        (136, {**READY, "peel_at": (-0.16, 0.34, 1.02), "hips": (0, 0.03, -0.01), "lean": 0.01, "look": (0.5, -1, 0.04)}),
    ],
)

# Standing easy: the peel grounded like a staff in one hand, the other at his side.
STAFF = dict(peel_at=(-0.33, 0.05, 0.02), peel_way=(0, 0, 1), grips=(0.98, 1.3), free_hand=(0.27, -0.02, 0.86))
idle = clip(
    "Idle",
    [
        (1, {**STAFF, "look": (-0.22, -1, 0.02)}),
        (46, {**STAFF, "hips": (0.008, 0, -0.003), "twist": 0.03, "look": (-0.34, -1, 0.05)}),
        (92, {**STAFF, "look": (-0.22, -1, 0.02)}),
    ],
)

scene.frame_start = 1
scene.frame_end = 136


def studio():
    add_area(scene, "Key", (-1.6, -2.6, 2.6), (0, 0, 1.1), 2.0, 110, (1, 0.96, 0.9))
    add_area(scene, "Fill", (2.2, -1.6, 1.4), (0, 0, 1.1), 2.2, 26, (0.92, 0.95, 1))
    use_gpu(scene, 72)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    scene.render.image_settings.file_format = "PNG"


if MODE == "pose":
    frames = [int(item) for item in args[3].split(",")]
    armature.animation_data.action = bpy.data.actions[args[4] if len(args) > 4 else "Serve"]
    studio()
    add_camera(scene, (2.9, -3.2, 1.7), (0, -0.3, 1.05), lens=50, name="Look")
    scene.render.resolution_x = 860
    scene.render.resolution_y = 860
    for frame in frames:
        scene.frame_set(frame)
        scene.render.filepath = f"{OUT}-{frame}.png"
        bpy.ops.render.render(write_still=True)
    print("Rendered poses")
    sys.exit(0)

if MODE == "look":
    armature.animation_data.action = None
    for item in poses:
        item.rotation_quaternion = (1, 0, 0, 0)
    refresh()
    studio()
    add_camera(scene, (1.0, -4.3, 1.42), (0, 0, 0.98), lens=70, name="Look")
    scene.render.resolution_x = 760
    scene.render.resolution_y = 1000
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("Rendered chef", OUT)
    sys.exit(0)

if MODE == "face":
    # The head close up, straight on and from the side of the front.
    armature.animation_data.action = None
    for item in poses:
        item.rotation_quaternion = (1, 0, 0, 0)
    refresh()
    studio()
    scene.render.resolution_x = 620
    scene.render.resolution_y = 720
    for label, degrees in (("front", 0), ("three", 32), ("side", 60)):
        angle = math.radians(degrees)
        add_camera(scene, (math.sin(angle) * 1.25, -math.cos(angle) * 1.25, 1.66), (0, 0, 1.6), lens=85, name=label)
        scene.render.filepath = f"{OUT}-{label}.png"
        bpy.ops.render.render(write_still=True)
    print("Rendered face")
    sys.exit(0)

if MODE == "blend":
    # Saved at rest, smoothed for the close-ups, to be filmed in the restaurant.
    armature.animation_data.action = None
    for item in poses:
        item.rotation_quaternion = (1, 0, 0, 0)
        item.location = (0, 0, 0)
    # MakeHuman's head is a shade small for these shoulders, and it's the head people look at.
    poses["Head"].scale = (1.06, 1.06, 1.06)
    refresh()
    # The apron is one tube and the legs inside it scissor, so what it covers isn't drawn:
    # a thigh can't come through cloth that has nothing behind it.
    hem = float(extras["Apron_v"][:, 2].min())
    waist = float(extras["Apron_v"][:, 2].max())
    legs = [names.index(bone) for bone in ("Hips", "ThighL", "ThighR", "ShinL", "ShinR")]
    for name in ("Body", "Suit"):
        points = human[f"{name}_v"]
        held = human[f"{name}_w"][:, legs].sum(axis=1) > 0.6
        covered = held & (points[:, 2] > hem + 0.06) & (points[:, 2] < waist - 0.05)
        group = parts[name].vertex_groups.new(name="UnderApron")
        group.add(np.flatnonzero(covered).tolist(), 1.0, "REPLACE")
        hide = parts[name].modifiers.new("UnderApron", "MASK")
        hide.vertex_group = "UnderApron"
        hide.invert_vertex_group = True
    for name in ("Body", "Suit"):
        smooth = parts[name].modifiers.new("Smooth", "SUBSURF")
        smooth.levels = 1
        smooth.render_levels = 1
    for image in bpy.data.images:
        if image.source == "FILE":
            image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print("Saved chef", OUT)

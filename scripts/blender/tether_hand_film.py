"""
Films a human hand making every gesture in /3d/2090, as a stand-in for a webcam. It's how the
controls get tested end to end: the real tracking model has to find this hand in real pictures.

    blender --background --python scripts/blender/tether_hand_film.py -- <repo root> <out folder> [frames | all]

Needs assets-source/pizza/chef/chef.blend. Join the frames into an MJPEG, and hand it to Chrome
with --use-file-for-fake-video-capture. FPS below has to match what the test expects.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import script_args, use_gpu  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
OUT = os.path.abspath(args[1])
ONLY = args[2] if len(args) > 2 else "all"
os.makedirs(OUT, exist_ok=True)
FPS = 15

OPEN = dict(thumb=0.0, index=0.0, middle=0.0, ring=0.0, little=0.0)
FIST = dict(thumb=1.0, index=1.0, middle=1.0, ring=1.0, little=1.0)
TWO = dict(thumb=0.9, index=0.0, middle=0.0, ring=1.0, little=1.0)
ONE = dict(thumb=0.9, index=0.0, middle=1.0, ring=1.0, little=1.0)
PINCH = dict(thumb=0.62, index=0.5, middle=0.0, ring=0.0, little=0.0)

# Seconds, hand shape, and where it is: across and up from the middle of the picture.
BEATS = [
    (1.6, OPEN, (0.0, 0.0)),
    (0.5, OPEN, (0.0, 0.11)),
    (1.2, OPEN, (0.0, 0.11)),
    (0.4, OPEN, (0.0, 0.0)),
    (0.5, OPEN, (0.13, 0.0)),
    (0.8, OPEN, (0.13, 0.0)),
    (0.4, OPEN, (0.0, 0.0)),
    (0.6, OPEN, (0.0, 0.0)),
    (0.14, OPEN, (0.0, 0.14)),
    (0.3, OPEN, (0.0, 0.0)),
    (0.8, OPEN, (0.0, 0.0)),
    (0.14, FIST, (0.0, 0.0)),
    (0.2, FIST, (0.0, 0.0)),
    (0.2, OPEN, (0.0, 0.0)),
    (0.5, OPEN, (0.0, 0.0)),
    (0.14, FIST, (0.0, 0.0)),
    (1.1, FIST, (0.0, 0.0)),
    (0.2, OPEN, (0.0, 0.0)),
    (0.5, OPEN, (0.0, 0.0)),
    (0.2, TWO, (0.0, 0.0)),
    (1.1, TWO, (0.0, 0.0)),
    (0.2, OPEN, (0.0, 0.0)),
    (0.5, OPEN, (0.0, 0.0)),
    (0.2, ONE, (0.0, 0.0)),
    (1.1, ONE, (0.0, 0.0)),
    (0.2, OPEN, (0.0, 0.0)),
    (0.5, OPEN, (0.0, 0.0)),
    (0.3, PINCH, (0.0, 0.0)),
    (1.1, PINCH, (0.0, 0.0)),
    (0.3, OPEN, (0.0, 0.0)),
    (0.8, OPEN, (0.0, 0.0)),
]

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "assets-source/pizza/chef/chef.blend"))
scene = bpy.context.scene
rig = bpy.data.objects["ChefRig"]
rig.animation_data_clear()

body = bpy.data.objects["Body"]
for obj in scene.objects:
    if obj.type == "MESH" and obj.name != "Body":
        obj.hide_render = True

# Only the arm, so nothing else gets in the picture.
keep = [group.name for group in body.vertex_groups if group.name.endswith("R") and (group.name.startswith(("Finger", "Hand", "ForeArm")))]
kept = body.vertex_groups.new(name="JustTheArm")
everything = {group.index: group.name for group in body.vertex_groups}
for vert in body.data.vertices:
    weight = sum(item.weight for item in vert.groups if everything[item.group] in keep)
    if weight > 0.4:
        kept.add([vert.index], 1.0, "REPLACE")
for modifier in list(body.modifiers):
    if modifier.type == "MASK":
        body.modifiers.remove(modifier)
mask = body.modifiers.new("JustTheArm", "MASK")
mask.vertex_group = "JustTheArm"
body.modifiers.move(body.modifiers.find("JustTheArm"), 1)

CURL = (0.95, 1.4, 1.1)
THUMB = (0.45, 0.7, 0.9)
FINGERS = {"thumb": 1, "index": 2, "middle": 3, "ring": 4, "little": 5}


def shape_hand(curl):
    for name, finger in FINGERS.items():
        for segment in range(1, 4):
            bend = (THUMB if finger == 1 else CURL)[segment - 1] * curl[name]
            bone = rig.pose.bones[f"Finger{finger}{segment}R"]
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = Quaternion((1, 0, 0), bend)


bpy.context.view_layer.update()
hand = rig.pose.bones["HandR"]
world = rig.matrix_world @ hand.matrix
along = world.col[1].to_3d().normalized()
across = world.col[0].to_3d().normalized()
normal = world.col[2].to_3d().normalized()
centre = world.translation + along * 0.09

camera_data = bpy.data.cameras.new("Webcam")
camera_data.lens = 26
camera = bpy.data.objects.new("Webcam", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera

world_nodes = bpy.data.worlds.new("Room")
world_nodes.use_nodes = True
world_nodes.node_tree.nodes["Background"].inputs[0].default_value = (0.32, 0.31, 0.3, 1)
scene.world = world_nodes
sun = bpy.data.lights.new("Window", "SUN")
sun.energy = 2.4
sun.angle = math.radians(20)
light = bpy.data.objects.new("Window", sun)
scene.collection.objects.link(light)
light.rotation_euler = (-normal * 1 + along * 0.5).to_track_quat("Z", "Y").to_euler()

use_gpu(scene, 10)
scene.render.resolution_x = 640
scene.render.resolution_y = 480
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 92
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"


def state_at(seconds):
    """What the hand is doing at a moment: each beat blends from the one before it."""
    clock = 0.0
    before = (OPEN, (0.0, 0.0))
    for length, shape, place in BEATS:
        if seconds < clock + length:
            t = (seconds - clock) / length
            t = t * t * (3 - 2 * t)
            curl = {key: before[0][key] + (shape[key] - before[0][key]) * t for key in shape}
            at = tuple(before[1][i] + (place[i] - before[1][i]) * t for i in range(2))
            return curl, at
        clock += length
        before = (shape, place)
    return before


total = sum(beat[0] for beat in BEATS)
frames = range(int(total * FPS)) if ONLY == "all" else [int(item) for item in ONLY.split(",")]
print("seconds", total, "frames", len(frames), flush=True)
for frame in frames:
    curl, (x, y) = state_at(frame / FPS)
    shape_hand(curl)
    # The picture moves opposite the camera. The hand is filmed from the palm's side.
    eye = centre - normal * 0.5 + across * x * 1.5 - along * y * 1.5
    camera.location = eye
    camera.rotation_mode = "QUATERNION"
    forward = normal
    right = forward.cross(along).normalized()
    up = right.cross(forward).normalized()
    camera.rotation_quaternion = Matrix((right, up, -forward)).transposed().to_quaternion()
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUT, f"h{frame:04d}.jpg")
    bpy.ops.render.render(write_still=True)
print("Filmed the hand", flush=True)

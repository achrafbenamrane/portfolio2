"""
Films a whole person stood back from a webcam, doing everything /3d/2090 reads from a body: it's
how "play with my whole body" gets tested against the real pose model.

    blender --background --python scripts/blender/tether_body_film.py -- <repo root> <out folder> [frames | all]

Needs assets-source/pizza/chef/chef.blend. Join the frames into an MJPEG at 30 frames a second,
because that's the speed Chrome plays one at, and hand it to Chrome with
--use-file-for-fake-video-capture:

    ffmpeg -framerate 15 -i film/b%04d.jpg -vf "fps=30,format=yuvj420p" -c:v mjpeg -q:v 3 -f mjpeg body.mjpeg

The arms are aimed in the room, not turned about their own bones: the rig stands in an A-pose, so
turning a bone "forward" swings the arm out to the side, and that's not what a punch looks like.
"""

import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import add_camera, script_args  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
OUT = os.path.abspath(args[1])
ONLY = args[2] if len(args) > 2 else "all"
os.makedirs(OUT, exist_ok=True)
FPS = 15

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "assets-source/pizza/chef/chef.blend"))
scene = bpy.context.scene
rig = bpy.data.objects["ChefRig"]
rig.animation_data_clear()
for name in ("Peel", "Toque", "Apron"):
    if name in bpy.data.objects:
        bpy.data.objects[name].hide_render = True
for bone in rig.pose.bones:
    bone.rotation_mode = "QUATERNION"
body = bpy.data.objects["Body"]
for modifier in list(body.modifiers):
    if modifier.type == "MASK":
        modifier.show_render = False
suit = bpy.data.objects.get("Suit")
if suit:
    for modifier in list(suit.modifiers):
        if modifier.type == "MASK":
            modifier.show_render = False

world = bpy.data.worlds.new("Room")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.41, 0.4, 1)
scene.world = world
sun = bpy.data.lights.new("Window", "SUN")
sun.energy = 2.2
sun.angle = math.radians(24)
light = bpy.data.objects.new("Window", sun)
scene.collection.objects.link(light)
light.rotation_euler = (math.radians(66), 0, math.radians(-24))
add_camera(scene, (0, -5.6, 1.15), (0, 0, 0.98), lens=44)
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 640
scene.render.resolution_y = 480
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 92
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"

# The person faces the camera, down -Y, so their left is +X.
FORWARD = Vector((0, -1, 0))


def turn(bone, axis, angle):
    rig.pose.bones[bone].rotation_quaternion = Quaternion(Vector(axis), angle)


def aim(bone, direction):
    """Points a bone along a direction in the room, wherever its parent has got to."""
    bpy.context.view_layer.update()
    pose_bone = rig.pose.bones[bone]
    rest = pose_bone.bone.matrix_local
    parent = pose_bone.parent
    held = (parent.matrix @ parent.bone.matrix_local.inverted() @ rest) if parent else rest
    held = held.to_3x3()
    swing = (held @ Vector((0, 1, 0))).rotation_difference(Vector(direction).normalized())
    pose_bone.rotation_quaternion = (held.inverted() @ swing.to_matrix() @ held).to_quaternion()


def arm(side, upper, fore):
    """Directions are for the left arm: the right one is its mirror."""
    mirror = 1 if side == "L" else -1
    aim(f"UpperArm{side}", (upper[0] * mirror, upper[1], upper[2]))
    aim(f"ForeArm{side}", (fore[0] * mirror, fore[1], fore[2]))


def mix(a, b, share):
    return tuple(x + (y - x) * share for x, y in zip(a, b))


def ramp(t, start, end, edge=0.25):
    """0 outside a beat, 1 inside it, with quick edges."""
    return max(min((t - start) / edge, 1, (end - t) / edge), 0)


# Arms, as (upper, fore) directions.
DOWN = ((0.14, 0, -1), (0.08, -0.14, -1))
GUARD = ((0.36, -0.3, -0.88), (-0.3, -0.42, 0.86))
STRAIGHT = ((0.05, -1, -0.04), (-0.03, -1, 0.02))
FACE = ((0.42, -0.42, -0.8), (-0.42, -0.2, 0.88))
HIGH = ((0.3, -0.05, 1), (0.1, -0.05, 1))
WING = ((1, 0, 0), (1, 0, 0))
TOGETHER = ((0.4, -0.55, -0.72), (-0.82, -0.56, 0.1))


def blend(a, b, share):
    return mix(a[0], b[0], share), mix(a[1], b[1], share)


def legs(left, right):
    turn("ThighL", (1, 0, 0), left)
    turn("ShinL", (1, 0, 0), -left * 1.6)
    turn("ThighR", (1, 0, 0), right)
    turn("ShinR", (1, 0, 0), -right * 1.6)


def pose(t):
    """What the person is doing at a moment, as a story of beats."""
    for bone in rig.pose.bones:
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
    rig.location = (0, 0, 0)
    left, right = DOWN, DOWN

    # 2 to 5: an easy march. 5 to 7: marching as hard as they can.
    for start, end, lift, rate in ((2, 5, 0.62, 1.2), (5, 7, 1.1, 2.1)):
        if start <= t < end:
            swing = math.sin((t - start) * math.tau * rate)
            legs(max(swing, 0) * lift, max(-swing, 0) * lift)
            sway = 0.22 * swing
            left = ((0.14, sway, -1), (0.08, sway - 0.14, -1))
            right = ((0.14, -sway, -1), (0.08, -sway - 0.14, -1))

    # 7.5 to 10.4: up into a guard, and three straight punches at the camera.
    if 7.5 <= t < 10.4:
        guard = ramp(t, 7.5, 10.4, 0.3)
        left, right = blend(DOWN, GUARD, guard), blend(DOWN, GUARD, guard)
        for start, side in ((8.1, "R"), (8.9, "L"), (9.6, "R")):
            if start <= t < start + 0.4:
                out = math.sin((t - start) / 0.4 * math.pi)
                if side == "L":
                    left = blend(GUARD, STRAIGHT, out)
                else:
                    right = blend(GUARD, STRAIGHT, out)

    # 10.8 to 12.2: hands at the face.
    if 10.8 <= t < 12.2:
        up = ramp(t, 10.8, 12.2)
        left, right = blend(DOWN, FACE, up), blend(DOWN, FACE, up)

    # 12.6 to 14.8: right down, and held.
    if 12.6 <= t < 14.8:
        down = ramp(t, 12.6, 14.8, 0.35)
        rig.location.z = -0.5 * down
        turn("ThighL", (1, 0, 0), 1.2 * down)
        turn("ThighR", (1, 0, 0), 1.2 * down)
        turn("ShinL", (1, 0, 0), -1.9 * down)
        turn("ShinR", (1, 0, 0), -1.9 * down)

    # 15.2 to 15.8: a jump.
    if 15.2 <= t < 15.8:
        rig.location.z = 0.42 * math.sin((t - 15.2) / 0.6 * math.pi)

    # 16.2 to 18: leaning left, then right.
    if 16.2 <= t < 18:
        lean = math.sin((t - 16.2) / 1.8 * math.tau)
        turn("Spine", (0, 0, 1), lean * 0.2)
        turn("Chest", (0, 0, 1), lean * 0.16)

    # 18.4 to 19.6: both hands over the head.
    if 18.4 <= t < 19.6:
        up = ramp(t, 18.4, 19.6, 0.3)
        left, right = blend(DOWN, HIGH, up), blend(DOWN, HIGH, up)

    # 20 to 29: flying. Wings level, tipped right, tipped left, raised, lowered, hands together.
    if 20 <= t < 27:
        out = ramp(t, 20, 27, 0.4)
        tip = 0.5 * (ramp(t, 21, 22.4, 0.3) - ramp(t, 22.6, 24, 0.3))
        rise = 0.5 * (ramp(t, 24.2, 25.4, 0.3) - ramp(t, 25.6, 26.8, 0.3))
        wing_l = ((math.cos(tip + rise), 0, math.sin(tip + rise)), (math.cos(tip + rise), 0, math.sin(tip + rise)))
        wing_r = ((math.cos(rise - tip), 0, math.sin(rise - tip)), (math.cos(rise - tip), 0, math.sin(rise - tip)))
        left, right = blend(DOWN, wing_l, out), blend(DOWN, wing_r, out)
    if 27 <= t < 28.2:
        up = ramp(t, 27, 28.2, 0.3)
        left, right = blend(DOWN, TOGETHER, up), blend(DOWN, TOGETHER, up)
    if 28.4 <= t < 29.4:
        up = ramp(t, 28.4, 29.4, 0.3)
        left, right = blend(DOWN, HIGH, up), blend(DOWN, HIGH, up)

    arm("L", *left)
    arm("R", *right)


TOTAL = 30
frames = range(int(TOTAL * FPS)) if ONLY == "all" else [int(item) for item in ONLY.split(",")]
print("frames", len(frames), flush=True)
for frame in frames:
    pose(frame / FPS)
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUT, f"b{frame:04d}.jpg")
    bpy.ops.render.render(write_still=True)
print("Filmed the body", flush=True)

"""
Renders a clothed human turning a full circle, to test the mirror against a known angle.

    blender --background --factory-startup --disable-autoexec --python scripts/blender/mirror_turntable.py -- <bundle.blend> <outdir>

<bundle.blend> is human_base_meshes_bundle.blend from Blender's free Human Base Meshes
asset bundle (CC0). It writes frames to <outdir>/full and <outdir>/upper: 8 seconds a
turn at 30 fps, from a full-body view and a laptop view. See README.md for how to feed
them to the mirror. Test material only: nothing here ships.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
BUNDLE, OUT = (os.path.abspath(a) for a in args[:2])
FRAMES = 240

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

with bpy.data.libraries.load(BUNDLE, link=False) as (src, dst):
    dst.objects = ["GEO-body_male_realistic"] if "GEO-body_male_realistic" in src.objects else ["realistic_body_male"]
body = dst.objects[0]
if body.type != "MESH":
    print("NOT A MESH", body.type)
scene.collection.objects.link(body)
for modifier in list(body.modifiers):
    print("modifier", modifier.type)

body.parent = None
body.location = (0, 0, 0)
body.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

mesh = body.data
coords = [v.co for v in mesh.vertices]
low = [min(c[i] for c in coords) for i in range(3)]
high = [max(c[i] for c in coords) for i in range(3)]
print("BOUNDS", [round(v, 3) for v in low], [round(v, 3) for v in high], "verts", len(coords))

height = high[2] - low[2]
scale = 1.8 / height
body.scale = (scale, scale, scale)
bottom = low[2] * scale
body.location = (0, 0, -bottom)
print("scale", scale)


def z_of(fraction):
    """A height on the body, as a fraction of its height, in mesh coordinates."""
    return low[2] + (high[2] - low[2]) * fraction


def material(name, colour, roughness=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return m


skin = material("Skin", (0.62, 0.40, 0.29), 0.45)
tee = material("Tee", (0.05, 0.20, 0.08))
jeans = material("Jeans", (0.03, 0.06, 0.16))
hair = material("Hair", (0.012, 0.009, 0.008), 0.5)
shoes = material("Shoes", (0.8, 0.8, 0.78))
dark = material("Brow", (0.02, 0.012, 0.01))
mesh.materials.clear()
for m in (skin, tee, jeans, hair, shoes, dark):
    mesh.materials.append(m)

neck_z = z_of(0.845)
hip_z = z_of(0.50)
ankle_z = z_of(0.06)
head_top = high[2]
sleeve_x = (high[0] - low[0]) * 0.27

bm = bmesh.new()
bm.from_mesh(mesh)
for face in bm.faces:
    c = face.calc_center_median()
    if c.z < ankle_z:
        face.material_index = 4
    elif c.z < hip_z and abs(c.x) > (high[0] - low[0]) * 0.17:
        face.material_index = 0  # the hands hang beside the hips
    elif c.z < hip_z:
        face.material_index = 2
    elif c.z < neck_z and abs(c.x) < sleeve_x:
        face.material_index = 1
    elif c.z >= neck_z:
        # Hair: the crown and the back of the head.
        crown = c.z > head_top - (head_top - neck_z) * 0.26
        behind = c.y > (low[1] + high[1]) / 2 + 0.01 * (high[2] - low[2]) and c.z > neck_z + (head_top - neck_z) * 0.42
        face.material_index = 3 if crown or behind else 0
    else:
        face.material_index = 0
bm.to_mesh(mesh)
bm.free()

# Eyes and a mouth, so a face detector has a face to find.
head_y = low[1]
faces = [v for v in mesh.vertices if v.co.z > neck_z]
front = min(v.co.y for v in faces)
face_z = neck_z + (head_top - neck_z) * 0.58
print("front of face y", round(front, 4), "face z", round(face_z, 3))


def dot(x, z, radius, mat, flatten=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=radius)
    sphere = bpy.context.object
    sphere.scale = flatten
    sphere.data.materials.append(mat)
    # Sit it on the surface of the face at this x, z.
    best = min(faces, key=lambda v: (v.co.x - x) ** 2 + (v.co.z - z) ** 2)
    sphere.location = (best.co.x, best.co.y - radius * 0.2, z)
    sphere.parent = body
    return sphere


head_h = head_top - neck_z
white = material("EyeWhite", (0.85, 0.85, 0.82), 0.2)
for side in (-1, 1):
    x = side * head_h * 0.135
    dot(x, face_z, head_h * 0.042, white, (1.5, 0.6, 0.85))
    dot(x, face_z, head_h * 0.024, dark, (1, 1, 1))
    dot(x, face_z + head_h * 0.075, head_h * 0.03, dark, (2.9, 0.6, 0.5))
lips = material("Lips", (0.42, 0.13, 0.12), 0.4)
dot(0, face_z - head_h * 0.31, head_h * 0.038, lips, (2.6, 0.7, 0.7))

for polygon in mesh.polygons:
    polygon.use_smooth = True

body.rotation_mode = "XYZ"
body.rotation_euler = (0, 0, 0)
body.keyframe_insert("rotation_euler", index=2, frame=1)
body.rotation_euler = (0, 0, math.radians(360))
body.keyframe_insert("rotation_euler", index=2, frame=FRAMES + 1)
for fcurve in body.animation_data.action.layers[0].strips[0].channelbag(body.animation_data.action.slots[0]).fcurves:
    for key in fcurve.keyframe_points:
        key.interpolation = "LINEAR"

# A plain room behind him.
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
floor = bpy.context.object
floor.data.materials.append(material("Floor", (0.55, 0.53, 0.5)))
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 2.2, 8), rotation=(math.radians(90), 0, 0))
wall = bpy.context.object
wall.data.materials.append(material("Wall", (0.72, 0.71, 0.68)))

world = bpy.data.worlds.new("Room")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.9, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.65
scene.world = world
sun = bpy.data.lights.new("Key", "AREA")
sun.size = 4
sun.energy = 260
key = bpy.data.objects.new("Key", sun)
scene.collection.objects.link(key)
key.location = (-1.6, -3.0, 3.0)
key.rotation_euler = (math.radians(55), 0, math.radians(-25))

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = FRAMES
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 92


def camera(name, location, target, lens):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    return obj


views = {
    "full": camera("Full", (0, -4.3, 1.15), (0, 0, 1.0), 38),
    "upper": camera("Upper", (0, -2.5, 1.5), (0, 0, 1.37), 50),
}

only = args[2] if len(args) > 2 else None
if only == "still":
    scene.camera = views["full"]
    scene.frame_set(1)
    scene.render.filepath = os.path.join(OUT, "still_front.jpg")
    bpy.ops.render.render(write_still=True)
    scene.frame_set(61)
    scene.render.filepath = os.path.join(OUT, "still_side.jpg")
    bpy.ops.render.render(write_still=True)
    scene.camera = views["upper"]
    scene.frame_set(1)
    scene.render.filepath = os.path.join(OUT, "still_upper.jpg")
    bpy.ops.render.render(write_still=True)
else:
    for name, cam in views.items():
        scene.camera = cam
        scene.render.filepath = os.path.join(OUT, name, "f_####")
        bpy.ops.render.render(animation=True)
        print("rendered", name, flush=True)

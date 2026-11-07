"""
Builds the ONEFRAME museum.

    blender --background --factory-startup --python scripts/blender/build_museum.py -- <builddir> <publicdir> <layoutjson>

The building is a frame. A ONEFRAME is a black box with a bar of light along the top
and a story inside, so the hall is one too: black walls, one long LED bar down the
ceiling with the same white end cap, and six stories along the back wall, each in a
bay of its own, throwing its colour across the walls and a floor polished like glass.

The frames themselves are built here as well: a black wood box, its LED bar, the printed
plate at the back and the car standing in front of it, from the layers cut by
scripts/museum_frames.py. The page builds the plates and cars itself, from the same
numbers, so that it can move them.

Writes <builddir>/museum.blend and <layoutjson>, which the page reads.
"""

import json
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import Group, add_area, add_camera, linear_material, script_args  # noqa: E402

args = script_args()
BUILD = os.path.abspath(args[0])
PUBLIC = os.path.abspath(args[1])
LAYOUT_OUT = os.path.abspath(args[2])

FRAME_LAYERS = os.path.join(os.path.dirname(LAYOUT_OUT), "museum-frames.json")

# --- The hall, in metres ----------------------------------------------------

HALL_X = 13.0  # half its length
BACK_Y = 3.0
FRONT_Y = -6.0
HEIGHT = 5.0

BAY = 3.6  # from one frame to the next
FIN_DEPTH = 0.42
FIN_WIDTH = 0.2

FRAME_Z = 1.95  # the middle of each frame, a little above the eye

LOGO = {"width": 5.0, "z": 2.5, "y": -1.5}

# --- The frame --------------------------------------------------------------

W = 1.72  # far larger than the real thing: this is the museum's way of looking at one
H = W * 907 / 784
D = 0.56  # front to back
T = 0.17  # the moulding
OPENING_W = W - 2 * T
OPENING_H = H - 2 * T
PLATE_W = 1.31
PLATE_Y = -0.016  # a plate's distance from the back, negative is towards the front

# How far each subject stands in front of the print. The cars pinned flat to their
# plates sit close; the Land Rover and the van stand on the floor of the box.
SUBJECT_Y = {
    "camaro": -0.08,
    "amg": -0.08,
    "lotus": -0.07,
    "brezina": -0.27,
    "just-go-out": -0.27,
    "bike-life": -0.15,
}

# Top to bottom of the wall, in the order they hang.
ORDER = ["camaro", "amg", "lotus", "brezina", "just-go-out", "bike-life"]


def wood_material():
    """Black-stained wood, with the grain running up the moulding."""
    material = bpy.data.materials.new("Wood")
    material.use_nodes = True
    tree = material.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.42
    coords = tree.nodes.new("ShaderNodeTexCoord")
    stretch = tree.nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (70, 70, 2.5)
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 9.0
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.34
    ramp.color_ramp.elements[0].color = (0.006, 0.0056, 0.0052, 1)
    ramp.color_ramp.elements[1].position = 0.66
    ramp.color_ramp.elements[1].color = (0.028, 0.026, 0.024, 1)
    links = tree.links
    links.new(coords.outputs["Object"], stretch.inputs["Vector"])
    links.new(stretch.outputs["Vector"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return material


def emission(name, colour, strength):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    light = tree.nodes.new("ShaderNodeEmission")
    light.inputs["Color"].default_value = (*colour, 1)
    light.inputs["Strength"].default_value = strength
    tree.links.new(light.outputs[0], output.inputs["Surface"])
    return material


def image_material(name, path, strength, cut_out=False):
    """A print lit from the front: it shows its picture, and throws its colour."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    light = tree.nodes.new("ShaderNodeEmission")
    light.inputs["Strength"].default_value = strength
    image = tree.nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(path, check_existing=True)
    image.extension = "EXTEND"
    tree.links.new(image.outputs["Color"], light.inputs["Color"])
    if cut_out:
        mix = tree.nodes.new("ShaderNodeMixShader")
        clear = tree.nodes.new("ShaderNodeBsdfTransparent")
        tree.links.new(image.outputs["Alpha"], mix.inputs["Fac"])
        tree.links.new(clear.outputs[0], mix.inputs[1])
        tree.links.new(light.outputs[0], mix.inputs[2])
        tree.links.new(mix.outputs[0], output.inputs["Surface"])
    else:
        tree.links.new(light.outputs[0], output.inputs["Surface"])
    return material


def plane(name, corners, uvs, material, collection):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(corners, [], [(0, 1, 2, 3)])
    mesh.update()
    layer = mesh.uv_layers.new(name="UVMap")
    for loop, uv in zip(layer.data, uvs):
        loop.uv = uv
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def build_frame_body(collection, materials):
    """The box. One mesh, shared by every frame in the hall."""
    wood = Group("FrameWood")
    x, z = W / 2, H / 2
    ox, oz = OPENING_W / 2, OPENING_H / 2
    wood.box((-x, -D, oz), (x, 0, z), "wood", bevel=0.012)
    wood.box((-x, -D, -z), (x, 0, -oz), "wood", bevel=0.012)
    wood.box((-x, -D, -oz), (-ox, 0, oz), "wood", bevel=0.012)
    wood.box((ox, -D, -oz), (x, 0, oz), "wood", bevel=0.012)
    wood.box((-ox, -0.01, -oz), (ox, 0, oz), "wood")
    wood_object = wood.build(collection, materials)

    # The LED bar, under the top of the moulding near the front, its driver at one end.
    bar_y0, bar_y1 = -D + 0.045, -D + 0.13
    bar_top = oz - 0.016
    cap_x = ox - 0.22
    led = Group("FrameBar")
    led.box((-ox + 0.03, bar_y0, bar_top - 0.052), (cap_x, bar_y1, bar_top), "alloy", bevel=0.008)
    led.box((cap_x, bar_y0 - 0.01, bar_top - 0.108), (ox - 0.025, bar_y1 + 0.01, bar_top), "cap", bevel=0.014)
    led_object = led.build(collection, materials)

    glow = Group("FrameLamp")
    glow.box((-ox + 0.036, bar_y0 + 0.005, bar_top - 0.108), (cap_x - 0.005, bar_y1 - 0.005, bar_top - 0.052), "lamp_frame", bevel=0.016)
    glow_object = glow.build(collection, materials)
    return wood_object, led_object, glow_object


def place_frame(slug, x, layers, parts, collection):
    """One frame on the wall: instances of the box, and its own print and subject."""
    centre_y = BACK_Y - 0.002
    for part in parts:
        instance = bpy.data.objects.new(f"{part.name}_{slug}", part.data)
        collection.objects.link(instance)
        instance.location = (x, centre_y, FRAME_Z)

    info = layers[slug]
    pixel = PLATE_W / info["plate"]["width"]
    plate_height = info["plate"]["height"] * pixel
    bottom = FRAME_Z - OPENING_H / 2
    top = FRAME_Z + OPENING_H / 2
    y = centre_y + PLATE_Y
    half = PLATE_W / 2

    frames = os.path.join(PUBLIC, "frames")
    material = image_material(f"Plate_{slug}", os.path.join(frames, f"{slug}-plate.webp"), 1.5)
    # scripts/museum_frames.py has already carried the print up behind the LED bar.
    plane(
        f"Plate_{slug}",
        [(x - half, y, bottom), (x + half, y, bottom), (x + half, y, top), (x - half, y, top)],
        [(0, 0), (1, 0), (1, 1), (0, 1)],
        material,
        collection,
    )

    subject = info["subject"]
    width = subject["width"] * pixel
    height = subject["height"] * pixel
    left = x - half + subject["x"] * pixel
    sub_top = bottom + plate_height - subject["y"] * pixel
    sub_bottom = sub_top - height
    # Whatever runs below the print stands on the floor of the box.
    lift = max(0.0, bottom - sub_bottom)
    sub_bottom += lift
    sub_top += lift
    y = centre_y + SUBJECT_Y[slug]
    cut = image_material(f"Subject_{slug}", os.path.join(frames, f"{slug}-subject.webp"), 1.5, cut_out=True)
    plane(
        f"Subject_{slug}",
        [(left, y, sub_bottom), (left + width, y, sub_bottom), (left + width, y, sub_top), (left, y, sub_top)],
        [(0, 0), (1, 0), (1, 1), (0, 1)],
        cut,
        collection,
    )
    return {
        "slug": slug,
        "x": x,
        "z": FRAME_Z,
        "subject": {
            "x": left + width / 2 - x,
            "z": (sub_top + sub_bottom) / 2 - FRAME_Z,
            "width": width,
            "height": height,
            "y": SUBJECT_Y[slug],
        },
        "plateHeight": plate_height,
    }


def build_hall(walls, floor, props, glow):
    x, h = HALL_X, HEIGHT
    b, f = BACK_Y, FRONT_Y
    floor.quad([(-x, f, 0), (x, f, 0), (x, b, 0), (-x, b, 0)], "floor")
    walls.quad([(-x, b, 0), (x, b, 0), (x, b, h), (-x, b, h)], "wall")
    walls.quad([(x, f, 0), (-x, f, 0), (-x, f, h), (x, f, h)], "wall")
    walls.quad([(-x, f, 0), (-x, b, 0), (-x, b, h), (-x, f, h)], "wall")
    walls.quad([(x, b, 0), (x, f, 0), (x, f, h), (x, b, h)], "wall")
    walls.quad([(-x, b, h), (x, b, h), (x, f, h), (-x, f, h)], "ceiling")

    # Fins between the frames: a bay for each, so each keeps its own colour.
    for index in range(len(ORDER) + 1):
        fin = (index - len(ORDER) / 2) * BAY
        props.box(
            (fin - FIN_WIDTH / 2, b - FIN_DEPTH, 0),
            (fin + FIN_WIDTH / 2, b, h),
            "fin",
            bevel=0.01,
        )

    # The long bar of light: the frames' LED, at the size of the building.
    bar_y = 1.15
    props.box((-x + 0.4, bar_y - 0.11, h - 0.16), (x - 2.0, bar_y + 0.11, h - 0.05), "alloy_hall", bevel=0.01)
    props.box((x - 2.0, bar_y - 0.17, h - 0.34), (x - 0.4, bar_y + 0.17, h - 0.05), "cap_hall", bevel=0.03)
    glow.box((-x + 0.42, bar_y - 0.1, h - 0.21), (x - 2.02, bar_y + 0.1, h - 0.16), "lamp_hall")

    # A bench to look from.
    props.box((-2.1, -1.65, 0.34), (2.1, -1.05, 0.46), "bench", bevel=0.02)
    for leg in (-1.7, 1.7):
        props.box((leg - 0.04, -1.6, 0), (leg + 0.04, -1.1, 0.34), "steel", bevel=0.004)

    # A shadow gap where the wall meets the floor, as a real gallery has.
    props.box((-x, b - 0.02, 0), (x, b, 0.06), "black", bevel=0)


def add_logo(collection):
    # Seen from inside the hall, +y runs to the viewer's right.
    source = os.path.join(BUILD, "logo-wall.png")
    logo = LOGO
    wide = logo["width"]
    tall = wide * 200 / 724
    x = -HALL_X + 0.02
    y0 = logo["y"] - wide / 2
    y1 = logo["y"] + wide / 2
    z0 = logo["z"] - tall / 2
    z1 = logo["z"] + tall / 2
    material = image_material("LogoWall", source, 1.15)
    plane(
        "LogoWall",
        [(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)],
        [(0, 0), (1, 0), (1, 1), (0, 1)],
        material,
        collection,
    )
    return {"x": x, "y": logo["y"], "z": logo["z"], "width": wide, "height": tall}


def glow_for(colour):
    """A frame's colour, pushed towards saturation, for the light it throws."""
    peak = max(colour) or 1
    return tuple(max(0.015, c / peak) ** 2.4 for c in colour)


def main():
    os.makedirs(BUILD, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Museum"

    with open(FRAME_LAYERS) as file:
        layers = json.load(file)

    room = bpy.data.collections.new("Room")
    scene.collection.children.link(room)
    frames = bpy.data.collections.new("Frames")
    scene.collection.children.link(frames)

    materials = {
        "wood": wood_material(),
        "alloy": linear_material("Alloy", (0.72, 0.72, 0.72), 0.3, 0.7),
        "cap": linear_material("Cap", (0.62, 0.62, 0.6), 0.5),
        "lamp_frame": emission("LampFrame", (1.0, 0.97, 0.92), 14.0),
        "wall": linear_material("Wall", (0.055, 0.055, 0.058), 0.55),
        "ceiling": linear_material("Ceiling", (0.03, 0.03, 0.03), 0.8),
        "floor": linear_material("Floor", (0.02, 0.02, 0.021), 0.14),
        "fin": linear_material("Fin", (0.045, 0.045, 0.048), 0.5),
        "alloy_hall": linear_material("AlloyHall", (0.3, 0.3, 0.3), 0.35, 0.6),
        "cap_hall": linear_material("CapHall", (0.7, 0.7, 0.68), 0.5),
        "lamp_hall": emission("LampHall", (1.0, 0.97, 0.92), 2.6),
        "bench": linear_material("Bench", (0.012, 0.012, 0.012), 0.38),
        "steel": linear_material("Steel", (0.5, 0.5, 0.5), 0.3, 0.9),
        "black": linear_material("Black", (0.002, 0.002, 0.002), 0.8),
    }

    parts = build_frame_body(frames, materials)
    positions = []
    for index, slug in enumerate(ORDER):
        x = (index - (len(ORDER) - 1) / 2) * BAY
        positions.append(place_frame(slug, x, layers, parts, frames))

        # What a lit print does to a dark room.
        colour = glow_for(layers[slug]["glow"])
        wash = add_area(scene, f"Wash_{slug}", (x, BACK_Y - D - 0.05, FRAME_Z), (x, BACK_Y - 3.0, 0.2), 1.3, 120, colour)
        back = add_area(scene, f"Halo_{slug}", (x, BACK_Y - 1.6, 0.25), (x, BACK_Y, FRAME_Z + 0.2), 0.9, 42, colour)
        # They stand for a glow, not a lamp: the polished floor must not see them.
        for light in (wash, back):
            light.visible_glossy = False
            light.visible_camera = False
        # From below the frame, a real shadow would be a dark peak on the wall above it.
        back.data.use_shadow = False
    for part in parts:
        frames.objects.unlink(part)

    walls, floor = Group("Walls"), Group("Floor")
    props, glow = Group("Props"), Group("Glow")
    build_hall(walls, floor, props, glow)
    for group in (walls, floor, props, glow):
        group.build(room, materials)
    logo = add_logo(room)

    world = bpy.data.worlds.new("Dark")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
    scene.world = world

    add_camera(scene, (6.9, -5.4, 1.25), (-3.4, 3.0, 2.1), lens=22, name="Hero")

    layout = {
        "hall": {"x": HALL_X, "back": BACK_Y, "front": FRONT_Y, "height": HEIGHT, "bay": BAY},
        "frame": {
            "width": W,
            "height": H,
            "depth": D,
            "moulding": T,
            "openingWidth": OPENING_W,
            "openingHeight": OPENING_H,
            "plateWidth": PLATE_W,
            "plateY": PLATE_Y,
        },
        "frames": positions,
        "logo": logo,
    }
    with open(LAYOUT_OUT, "w") as file:
        json.dump(layout, file, indent=2)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, "museum.blend"))
    print("museum saved", flush=True)


main()

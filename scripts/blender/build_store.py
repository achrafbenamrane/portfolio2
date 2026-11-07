"""
Builds the sports store.

    blender --background --factory-startup --python scripts/blender/build_store.py -- <storedir> <jerseydir> <publicdir>

Everything that stands still in the store lives here, as four meshes the web page
treats differently:

    Walls, Floor, Props   lit once by Cycles and baked to textures (bake_store.py)
    Chrome                reflective, shaded live against a panorama of the room
    Glow                  light sources, drawn as plain white

The shirts on the back wall are placed here too, so the bake catches their shadows,
but the page draws its own, because they have to come off the wall when clicked.

Writes <storedir>/store.blend and src/content/store-layout.json, the positions the
page needs. Blender is Z-up and the web is Y-up: the page converts, see toWeb().
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import Group, add_camera, linear_material, look_at, script_args  # noqa: E402
from preview_kit import kit_material  # noqa: E402

args = script_args()
STORE_DIR = os.path.abspath(args[0])
JERSEY_DIR = os.path.abspath(args[1])
PUBLIC = os.path.abspath(args[2])
LAYOUT_OUT = os.path.abspath(args[3])

# --- The room ---------------------------------------------------------------

RX, RY, RH = 4.0, 2.9, 3.5  # half width, half depth, height
SKYLIGHT = (-3.5, -1.3, 1.2, 1.5)  # x0, y0, x1, y1
WELL = 0.3

KITS = [
    "barcelona",
    "real-madrid",
    "man-city",
    "liverpool",
    "bayern",
    "juventus",
    "paris",
    "milan",
]

# Shirt wall: pegs off a rail on the back wall, one shirt face-out on each.
PEG_Z = 1.96
PEG_SPACING = 0.8
PEG_X0 = -PEG_SPACING * (len(KITS) - 1) / 2
JERSEY_Y = RY - 0.40
JERSEY_LIFT = PEG_Z - 0.115 - 0.70  # the shirt's shoulders sit on the hanger

# Side rack on the right, shirts edge-on as on any rail.
RACK_X = 3.3
RACK_Y0, RACK_Y1 = -1.55, 2.2
RACK_Z = 1.9
RACK_SPACING = 0.125

# A short free-standing rail in the front-left corner, in the same way.
RAIL_Y = -2.15
RAIL_X0, RAIL_X1 = -3.55, -1.05

MIRROR = {"y0": -1.55, "y1": 0.95, "z0": 0.04, "z1": 2.6, "x": -RX + 0.03}

COLOURS = {
    "wall": (0.86, 0.85, 0.835),
    "floor": (0.80, 0.795, 0.785),
    "ceiling": (0.88, 0.875, 0.865),
    "white": (0.84, 0.83, 0.82),
    "red": (0.273, 0.0058, 0.0176),  # #8F1024 in linear light
    "red_deep": (0.102, 0.0033, 0.0091),  # #5A0B18
    "black": (0.012, 0.011, 0.011),
    "grey": (0.32, 0.31, 0.31),
}


def build_shell(walls, floor):
    x, y, h = RX, RY, RH
    floor.quad([(-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0)], "floor")

    walls.quad([(-x, y, 0), (x, y, 0), (x, y, h), (-x, y, h)], "wall")  # back
    walls.quad([(x, -y, 0), (-x, -y, 0), (-x, -y, h), (x, -y, h)], "wall")  # front
    walls.quad([(-x, -y, 0), (-x, y, 0), (-x, y, h), (-x, -y, h)], "wall")  # left
    walls.quad([(x, y, 0), (x, -y, 0), (x, -y, h), (x, y, h)], "wall")  # right

    # The ceiling, as four panels round the skylight, facing down.
    x0, y0, x1, y1 = SKYLIGHT
    for a, b, c, d in (
        ((-x, -y), (x, -y), (x, y0), (-x, y0)),
        ((-x, y1), (x, y1), (x, y), (-x, y)),
        ((-x, y0), (x0, y0), (x0, y1), (-x, y1)),
        ((x1, y0), (x, y0), (x, y1), (x1, y1)),
    ):
        walls.quad([(*d, h), (*c, h), (*b, h), (*a, h)], "ceiling")

    # The light well above it.
    top = h + WELL
    walls.quad([(x0, y1, h), (x1, y1, h), (x1, y1, top), (x0, y1, top)], "ceiling")
    walls.quad([(x1, y0, h), (x0, y0, h), (x0, y0, top), (x1, y0, top)], "ceiling")
    walls.quad([(x0, y0, h), (x0, y1, h), (x0, y1, top), (x0, y0, top)], "ceiling")
    walls.quad([(x1, y1, h), (x1, y0, h), (x1, y0, top), (x1, y1, top)], "ceiling")


def build_skylight(props, glow):
    x0, y0, x1, y1 = SKYLIGHT
    top = RH + WELL
    glow.quad([(x1, y0, top), (x0, y0, top), (x0, y1, top), (x1, y1, top)], "sky")
    # Glazing bars, in the rhythm of the reference's roof.
    bar = 0.035
    z = RH + 0.18
    for k in range(1, 5):
        x = x0 + (x1 - x0) * k / 5
        props.box((x - bar, y0, z - bar), (x + bar, y1, z + bar), "white")
    middle = (y0 + y1) / 2
    props.box((x0, middle - bar, z - bar), (x1, middle + bar, z + bar), "white")


def build_tracks(props, glow):
    """Ceiling tracks and the spot cans along them. Returns where the lights go."""
    spots = []

    def track(start, end):
        a, b = Vector(start), Vector(end)
        low = Vector((min(a.x, b.x) - 0.025, min(a.y, b.y) - 0.025, RH - 0.05))
        high = Vector((max(a.x, b.x) + 0.025, max(a.y, b.y) + 0.025, RH))
        props.box(low, high, "white")

    def can(position, target):
        p, t = Vector(position), Vector(target)
        direction = (t - p).normalized()
        props.cylinder(p - direction * 0.09, p + direction * 0.09, 0.042, "white", sides=14)
        props.cylinder((p.x, p.y, RH - 0.05), p, 0.009, "white", sides=8, caps=False)
        glow.cylinder(p + direction * 0.09, p + direction * 0.092, 0.036, "lamp", sides=14)
        spots.append((p + direction * 0.1, t))

    # Over the shirt wall: one can per shirt.
    wall_y = RY - 1.2
    track((-3.3, wall_y, 0), (3.3, wall_y, 0))
    for index in range(len(KITS)):
        x = PEG_X0 + index * PEG_SPACING
        can((x, wall_y, RH - 0.2), (x, JERSEY_Y, 1.5))

    # Over the counter.
    mid_y = -1.6
    track((-1.2, mid_y, 0), (2.1, mid_y, 0))
    for x in (-0.7, 0.45, 1.6):
        can((x, mid_y, RH - 0.2), (x, 0.0, 0.95))

    # Along the right-hand rack.
    track((RACK_X - 0.95, -2.2, 0), (RACK_X - 0.95, 2.2, 0))
    for y in (-1.3, 0.0, 1.3):
        can((RACK_X - 0.95, y, RH - 0.2), (RACK_X, y, 1.3))

    # In front of the mirror.
    track((-RX + 1.3, -2.45, 0), (-RX + 1.3, -1.55, 0))
    can((-RX + 1.3, -2.1, RH - 0.2), (RAIL_X0 + 0.9, RAIL_Y, 1.2))

    return spots


def hanger(chrome, x, y, z_hook, along=(1, 0, 0)):
    """A wire hanger with its hook top at z_hook, shoulders along `along`."""
    a = Vector(along).normalized()
    up = Vector((0, 0, 1))
    centre = Vector((x, y, 0))

    def at(across, height):
        return centre + a * across + up * (z_hook + height)

    hook = [
        at(0.0, -0.075),
        at(0.0, -0.04),
        at(0.012, -0.02),
        at(0.02, -0.002),
        at(0.008, 0.012),
        at(-0.012, 0.01),
        at(-0.02, -0.006),
    ]
    frame = [
        at(0.0, -0.075),
        at(0.09, -0.102),
        at(0.2, -0.14),
        at(0.213, -0.15),
        at(0.2, -0.158),
        at(-0.2, -0.158),
        at(-0.213, -0.15),
        at(-0.2, -0.14),
        at(-0.09, -0.102),
        at(0.0, -0.075),
    ]
    chrome.polyline(hook, 0.0032, "chrome", sides=6)
    chrome.polyline(frame, 0.0032, "chrome", sides=6)


def build_shirt_wall(chrome, props):
    rail_y = RY - 0.07
    x_end = -PEG_X0 + 0.55
    chrome.cylinder((-x_end, rail_y, PEG_Z), (x_end, rail_y, PEG_Z), 0.019, "chrome", sides=20)
    # Wall brackets.
    for x in (-x_end + 0.12, -1.2, 1.2, x_end - 0.12):
        chrome.cylinder((x, RY, PEG_Z), (x, rail_y, PEG_Z), 0.012, "chrome", sides=12)
        chrome.cylinder((x, RY, PEG_Z), (x, RY - 0.008, PEG_Z), 0.034, "chrome", sides=16)
    for index in range(len(KITS)):
        x = PEG_X0 + index * PEG_SPACING
        chrome.cylinder((x, rail_y, PEG_Z), (x, JERSEY_Y - 0.1, PEG_Z), 0.0085, "chrome", sides=12)
        chrome.sphere((x, JERSEY_Y - 0.1, PEG_Z), 0.0125, "chrome")
        hanger(chrome, x, JERSEY_Y, PEG_Z + 0.012)


def floor_foot(chrome, props, x, y):
    """Where a rack's upright meets the floor: a flange on a black plate."""
    props.box((x - 0.14, y - 0.14, 0), (x + 0.14, y + 0.14, 0.012), "black", bevel=0.002)
    chrome.cylinder((x, y, 0.012), (x, y, 0.03), 0.05, "chrome", sides=20)


def build_side_rack(chrome, props):
    for y in (RACK_Y0 - 0.2, RACK_Y1 + 0.2):
        floor_foot(chrome, props, RACK_X, y)
        chrome.cylinder((RACK_X, y, 0.02), (RACK_X, y, RACK_Z), 0.021, "chrome", sides=18)
        chrome.sphere((RACK_X, y, RACK_Z), 0.026, "chrome")
    chrome.cylinder(
        (RACK_X, RACK_Y0 - 0.2, RACK_Z), (RACK_X, RACK_Y1 + 0.2, RACK_Z), 0.019, "chrome", sides=18
    )
    count = int((RACK_Y1 - RACK_Y0) / RACK_SPACING)
    for index in range(count):
        hanger(chrome, RACK_X, RACK_Y0 + index * RACK_SPACING, RACK_Z + 0.012)

    for x in (RAIL_X0 - 0.15, RAIL_X1 + 0.15):
        floor_foot(chrome, props, x, RAIL_Y)
        chrome.cylinder((x, RAIL_Y, 0.02), (x, RAIL_Y, RACK_Z), 0.021, "chrome", sides=18)
        chrome.sphere((x, RAIL_Y, RACK_Z), 0.026, "chrome")
    chrome.cylinder(
        (RAIL_X0 - 0.15, RAIL_Y, RACK_Z), (RAIL_X1 + 0.15, RAIL_Y, RACK_Z), 0.019, "chrome", sides=18
    )
    count = int((RAIL_X1 - RAIL_X0) / RACK_SPACING)
    for index in range(count):
        hanger(chrome, RAIL_X0 + index * RACK_SPACING, RAIL_Y, RACK_Z + 0.012, along=(0, 1, 0))


def build_counter(props):
    x0, y0, x1, y1 = -1.2, -0.2, 1.5, 0.7
    props.box((x0, y0, 0.0), (x1, y1, 0.97), "red", bevel=0.012)
    props.box((x0 - 0.035, y0 - 0.035, 0.97), (x1 + 0.035, y1 + 0.035, 1.015), "white", bevel=0.008)

    # Folded shirts on the counter, in stacks.
    stacks = (
        (-0.8, 0.25, ("red_deep", "white", "black", "red")),
        (-0.1, 0.25, ("white", "red", "grey")),
    )
    for x, y, layers in stacks:
        z = 1.015
        for colour in layers:
            props.box((x - 0.2, y - 0.16, z), (x + 0.2, y + 0.16, z + 0.032), colour, bevel=0.012)
            z += 0.034
    return (0.62, 0.32, 1.015 + 0.112), (0.98, 0.14, 1.015 + 0.112)


def build_plinths(props):
    """Stepped plinths in the back-left corner, for balls and boot boxes."""
    x_wall = -RX
    props.box((x_wall, 1.1, 0), (x_wall + 0.8, RY, 0.42), "white", bevel=0.006)
    props.box((x_wall, 1.85, 0.42), (x_wall + 0.6, RY, 0.84), "white", bevel=0.006)
    for k, y in enumerate((1.28, 1.58)):
        for level in range(2 - k):
            z = 0.42 + level * 0.13
            props.box((x_wall + 0.2, y - 0.13, z), (x_wall + 0.56, y + 0.13, z + 0.125), "red", bevel=0.004)
    return [(x_wall + 0.3, 2.1, 0.84 + 0.112), (x_wall + 0.3, 2.5, 0.84 + 0.112)]


def build_mirror(chrome, props, glow, glass):
    m = MIRROR
    frame = 0.035
    x = m["x"]
    glass.quad(
        [(x, m["y0"], m["z0"]), (x, m["y1"], m["z0"]), (x, m["y1"], m["z1"]), (x, m["y0"], m["z1"])],
        "mirror",
    )
    depth = x + 0.012
    for low, high in (
        ((-RX, m["y0"] - frame, m["z0"] - 0.03), (depth, m["y0"], m["z1"] + frame)),
        ((-RX, m["y1"], m["z0"] - 0.03), (depth, m["y1"] + frame, m["z1"] + frame)),
        ((-RX, m["y0"], m["z1"]), (depth, m["y1"], m["z1"] + frame)),
        ((-RX, m["y0"], m["z0"] - 0.03), (depth, m["y1"], m["z0"])),
    ):
        chrome.box(low, high, "chrome")

    # A strip of light over the glass.
    z = m["z1"] + 0.09
    glow.box((-RX, m["y0"], z), (-RX + 0.05, m["y1"], z + 0.03), "lamp")

    # Stand here: a round mat in the brand red.
    centre_y = (m["y0"] + m["y1"]) / 2
    props.cylinder((-RX + 1.35, centre_y, 0), (-RX + 1.35, centre_y, 0.014), 0.95, "red_deep", sides=64)


def football(location, radius, collection, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=radius, location=location)
    ball = bpy.context.object
    bpy.ops.object.shade_smooth()
    collection.objects.link(ball)
    bpy.context.scene.collection.objects.unlink(ball)
    ball.data.materials.append(material)
    return ball


def add_logo(collection, material):
    curve = bpy.data.curves.new("Logo", "FONT")
    curve.body = "WOLFEXO"
    curve.font = bpy.data.fonts.load("C:/Windows/Fonts/bahnschrift.ttf")
    curve.size = 0.62
    curve.extrude = 0.022
    curve.offset = 0.0075
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.resolution_u = 6
    logo = bpy.data.objects.new("LogoCurve", curve)
    collection.objects.link(logo)
    logo.rotation_euler = (math.radians(90), 0, 0)
    logo.location = (0.0, RY - 0.03, 2.72)
    logo.scale = (1.28, 1.0, 1.0)
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(logo.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    mesh.transform(logo.matrix_world)
    collection.objects.unlink(logo)
    bpy.data.objects.remove(logo)
    mesh.name = "Logo"
    mesh.materials.clear()
    mesh.materials.append(material)
    solid = bpy.data.objects.new("Logo", mesh)
    collection.objects.link(solid)
    return solid


def place_shirts(collection):
    with bpy.data.libraries.load(os.path.join(JERSEY_DIR, "jersey_finished.blend")) as (src, dst):
        dst.meshes = ["Jersey"]
    mesh = dst.meshes[0]
    mesh.shape_keys.key_blocks["Hung"].value = 1.0
    mesh.materials.clear()
    mesh.materials.append(None)

    jerseys = []
    for index, slug in enumerate(KITS):
        shirt = bpy.data.objects.new(f"Shirt_{slug}", mesh)
        collection.objects.link(shirt)
        shirt.location = (PEG_X0 + index * PEG_SPACING, JERSEY_Y, JERSEY_LIFT)
        shirt.material_slots[0].link = "OBJECT"
        shirt.material_slots[0].material = kit_material(PUBLIC, slug, "-1k")
        jerseys.append({"slug": slug, "x": shirt.location.x, "y": shirt.location.y, "z": shirt.location.z})

    count = int((RACK_Y1 - RACK_Y0) / RACK_SPACING)
    rack = []
    for index in range(count):
        slug = KITS[(index * 3) % len(KITS)]
        y = RACK_Y0 + index * RACK_SPACING
        shirt = bpy.data.objects.new(f"RackShirt_{index}", mesh)
        collection.objects.link(shirt)
        # Hung square to the rail, with the small variation of a real one.
        turn = math.radians(((index * 37) % 11 - 5) * 1.3)
        shirt.rotation_euler = (0, 0, turn)
        shirt.location = (RACK_X, y, RACK_Z - 0.115 - 0.70)
        shirt.material_slots[0].link = "OBJECT"
        shirt.material_slots[0].material = kit_material(PUBLIC, slug, "-1k")
        rack.append({"slug": slug, "x": RACK_X, "y": y, "z": shirt.location.z, "turn": turn})

    count = int((RAIL_X1 - RAIL_X0) / RACK_SPACING)
    for index in range(count):
        slug = KITS[(index * 5 + 2) % len(KITS)]
        x = RAIL_X0 + index * RACK_SPACING
        shirt = bpy.data.objects.new(f"RailShirt_{index}", mesh)
        collection.objects.link(shirt)
        turn = math.radians(90 + ((index * 53) % 9 - 4) * 1.4)
        shirt.rotation_euler = (0, 0, turn)
        shirt.location = (x, RAIL_Y, RACK_Z - 0.115 - 0.70)
        shirt.material_slots[0].link = "OBJECT"
        shirt.material_slots[0].material = kit_material(PUBLIC, slug, "-1k")
        rack.append({"slug": slug, "x": x, "y": RAIL_Y, "z": shirt.location.z, "turn": turn})
    return jerseys, rack


def add_spots(scene, collection, spots):
    for index, (position, target) in enumerate(spots):
        data = bpy.data.lights.new(f"Spot{index}", "SPOT")
        data.energy = 20
        data.spot_size = math.radians(58)
        data.spot_blend = 0.85
        data.shadow_soft_size = 0.05
        data.color = (1.0, 0.95, 0.88)
        light = bpy.data.objects.new(f"Spot{index}", data)
        collection.objects.link(light)
        light.location = position
        look_at(light, target)


def main():
    os.makedirs(STORE_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Store"

    room = bpy.data.collections.new("Room")
    scene.collection.children.link(room)
    shirts = bpy.data.collections.new("Shirts")
    scene.collection.children.link(shirts)
    lights = bpy.data.collections.new("Lights")
    scene.collection.children.link(lights)

    materials = {
        "wall": linear_material("Wall", COLOURS["wall"], 0.7),
        "floor": linear_material("Floor", COLOURS["floor"], 0.32),
        "ceiling": linear_material("Ceiling", COLOURS["ceiling"], 0.8),
        "white": linear_material("White", COLOURS["white"], 0.45),
        "red": linear_material("BrandRed", COLOURS["red"], 0.28),
        "red_deep": linear_material("BrandRedDeep", COLOURS["red_deep"], 0.6),
        "black": linear_material("Black", COLOURS["black"], 0.5),
        "grey": linear_material("Grey", COLOURS["grey"], 0.6),
        "chrome": linear_material("Chrome", (0.9, 0.9, 0.9), 0.08, 1.0),
        "mirror": linear_material("Mirror", (0.95, 0.95, 0.95), 0.0, 1.0),
    }
    sky = bpy.data.materials.new("Sky")
    sky.use_nodes = True
    tree = sky.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    emission = tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (0.92, 0.96, 1.0, 1)
    emission.inputs["Strength"].default_value = 3.2
    tree.links.new(emission.outputs[0], output.inputs["Surface"])
    materials["sky"] = sky
    lamp = sky.copy()
    lamp.name = "Lamp"
    lamp.node_tree.nodes["Emission"].inputs["Color"].default_value = (1.0, 0.94, 0.86, 1)
    lamp.node_tree.nodes["Emission"].inputs["Strength"].default_value = 5.0
    materials["lamp"] = lamp

    walls, floor = Group("Walls"), Group("Floor")
    props, chrome = Group("Props"), Group("Chrome")
    glow, glass = Group("Glow"), Group("MirrorGlass")

    build_shell(walls, floor)
    build_skylight(props, glow)
    spots = build_tracks(props, glow)
    build_shirt_wall(chrome, props)
    build_side_rack(chrome, props)
    ball_spots = list(build_counter(props))
    ball_spots += build_plinths(props)
    build_mirror(chrome, props, glow, glass)

    for group in (walls, floor, props, chrome, glow, glass):
        group.build(room, materials)

    ball_material = bpy.data.materials.new("Ball")
    ball_material.use_nodes = True
    ball_tree = ball_material.node_tree
    bsdf = ball_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.35
    image = ball_tree.nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(os.path.join(STORE_DIR, "ball.png"), check_existing=True)
    ball_tree.links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    for index, location in enumerate(ball_spots):
        ball = football(location, 0.11, room, ball_material)
        ball.name = f"Ball{index}"

    add_logo(room, materials["red"])
    jerseys, rack = place_shirts(shirts)
    add_spots(scene, lights, spots)

    world = bpy.data.worlds.new("Dark")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
    scene.world = world

    position = (3.72, -2.66, 3.12)
    target = (-0.75, 0.95, 0.9)
    add_camera(scene, position, target, lens=15.5, name="CCTV")

    layout = {
        "room": {"x": RX, "y": RY, "h": RH},
        "jerseys": jerseys,
        "rack": rack,
        "mirror": MIRROR,
        "cctv": {"position": position, "target": target, "lens": 15.5},
        "peg": {"z": PEG_Z, "spacing": PEG_SPACING},
    }
    with open(LAYOUT_OUT, "w") as file:
        json.dump(layout, file, indent=2)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(STORE_DIR, "store.blend"))
    print("store saved", flush=True)


main()

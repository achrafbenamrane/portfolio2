"""
The robot of /3d/2090: a four-metre lunar work machine, original to this game. Heavy shoulders,
a low sensor head and long forearms, because it was built to lift, not to look heroic.

    blender --background --python scripts/blender/build_tether_robot.py -- <repo root> preview <out.png> [degrees] [height] [lens] [target z]
    blender --background --python scripts/blender/build_tether_robot.py -- <repo root> bake [size] [samples]

It's rigid, like a real machine: every joint is a node, and the page moves them. There's no
skin and no keyframes, which is what lets a hand on a webcam drive it directly. Needs
assets-source/tether/build/decals.png from scripts/tether_decals.py.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import add_camera, script_args, use_gpu  # noqa: E402
from tether_kit import Decal, Hull, Part, section as S  # noqa: E402
from tether_surface import REGOLITH, bake_pass, glowing, printed, weathered  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "preview"
BUILD = os.path.join(ROOT, "assets-source/tether/build")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
collection = scene.collection

# The rest pose, in metres. It faces -Y, which glTF turns into +Z.
ANKLE_Z, KNEE_Z, HIP_Z = 0.46, 1.3, 2.14
HIP_X = 0.37
WAIST_Z, CHEST_Z, NECK_Z = 2.5, 2.82, 3.5
SHOULDER_X, SHOULDER_Z = 0.9, 3.22
ELBOW_Z, WRIST_Z = 2.42, 1.72
GRID = 4


M = {
    "Paint": weathered("Paint", (0.44, 0.435, 0.405), wear=1.2),
    "Trim": weathered("Trim", (0.2, 0.205, 0.215), 0.5),
    "Red": weathered("Red", (0.24, 0.008, 0.016), 0.42),
    "Frame": weathered("Frame", (0.04, 0.042, 0.047), 0.46, 1.0, wear=0.5),
    "Steel": weathered("Steel", (0.62, 0.63, 0.65), 0.24, 1.0, wear=0.0, dust=0.5),
    "Rubber": weathered("Rubber", (0.013, 0.013, 0.014), 0.8, wear=0.0),
    "Glow": glowing("Glow", (1.0, 0.68, 0.3), 14),
    "Lamp": glowing("Lamp", (1.0, 0.9, 0.72), 7),
    "Decal": printed(os.path.join(BUILD, "decals.png")),
}


def part(name, pivot, parent):
    return Part(name, pivot, parent, M, collection)


def piston(name, tag, side, top, bottom, upper_parent, lower_parent):
    """
    A hydraulic ram between two limbs, as two nodes the page aims at each other, so it really
    does slide in and out as the joint moves.
    """
    x, y, z = top
    bx, by, bz = bottom
    middle = ((x + bx) / 2, (y + by) / 2, (z + bz) / 2 + 0.05)
    cylinder = part(f"{name}Cyl{tag}", (x * side, y, z), upper_parent)
    body = Hull(f"{name}Cyl", side)
    body.rod(top, middle, 0.052, "Frame", sides=18)
    body.rod(top, (x, y, z + 0.02), 0.07, "Steel", sides=18)
    body.rod(middle, (middle[0], middle[1], middle[2] + 0.05), 0.062, "Trim", sides=18)
    cylinder.add(body, bevel=0.003)
    rod = part(f"{name}Rod{tag}", (bx * side, by, bz), lower_parent)
    shaft = Hull(f"{name}Rod", side)
    shaft.rod(bottom, (x, y, z - 0.05), 0.027, "Steel", sides=14)
    shaft.rod(bottom, (bx, by, bz + 0.04), 0.05, "Frame", sides=14)
    rod.add(shaft, bevel=0.002)
    return [cylinder, rod]


def leg(side):
    tag = "L" if side > 0 else "R"
    x = HIP_X
    pieces = []

    thigh = part(f"Thigh{tag}", (x * side, 0, HIP_Z), "Pelvis")
    core = Hull("ThighCore", side)
    core.loft([S(HIP_Z - 0.02, 0.15, 0.17, x), S(HIP_Z - 0.4, 0.17, 0.2, x), S(KNEE_Z + 0.1, 0.13, 0.16, x)], "Frame")
    core.drum((x, 0, HIP_Z), (1, 0, 0), 0.2, 0.3, "Frame", rim="Steel")
    core.hose([(x - 0.15, 0.17, HIP_Z - 0.1), (x - 0.2, 0.25, HIP_Z - 0.4), (x - 0.13, 0.2, KNEE_Z + 0.16)], 0.016, "Rubber")
    core.hose([(x + 0.1, 0.19, HIP_Z - 0.16), (x + 0.15, 0.27, HIP_Z - 0.42), (x + 0.09, 0.21, KNEE_Z + 0.18)], 0.012, "Rubber")
    thigh.add(core, bevel=0.005)

    shell = [
        S(HIP_Z - 0.1, 0.2, 0.24, x),
        S(HIP_Z - 0.38, 0.235, 0.275, x),
        S(HIP_Z - 0.6, 0.2, 0.245, x),
        S(KNEE_Z + 0.1, 0.16, 0.195, x),
    ]
    plates = Hull("ThighPlates", side)
    plates.panels(shell, -160, -72, "Paint", cuts=[-118], rows=[0.46])
    plates.panels(shell, -64, 20, "Paint", cuts=[-20], rows=[0.34, 0.72])
    plates.panels(shell, 30, 74, "Trim", rows=[0.5])
    plates.plate(shell[:2], 140, 208, "Trim")
    plates.plate(shell[1:3], -44, -32, "Red", lift=0.03, thickness=0.006, columns=2)
    thigh.add(plates)
    ink = Decal("ThighInk", side)
    ink.place([S(HIP_Z - 0.2, 0.22, 0.26, x), S(HIP_Z - 0.46, 0.225, 0.26, x)], -18, 12, (2, 1), GRID, flip=False)
    thigh.print_on(ink)
    pieces.append(thigh)

    shin = part(f"Shin{tag}", (x * side, 0, KNEE_Z), f"Thigh{tag}")
    core = Hull("ShinCore", side)
    core.drum((x, 0, KNEE_Z), (1, 0, 0), 0.17, 0.3, "Frame", rim="Steel")
    core.loft([S(KNEE_Z - 0.06, 0.13, 0.15, x), S(KNEE_Z - 0.4, 0.14, 0.16, x), S(ANKLE_Z + 0.1, 0.1, 0.12, x)], "Frame")
    core.hose([(x + 0.12, 0.13, KNEE_Z - 0.1), (x + 0.17, 0.2, KNEE_Z - 0.4), (x + 0.1, 0.1, ANKLE_Z + 0.14)], 0.015, "Rubber")
    shin.add(core, bevel=0.005)

    guard = [
        S(KNEE_Z - 0.1, 0.205, 0.235, x, -0.02),
        S(KNEE_Z - 0.34, 0.225, 0.255, x, -0.02),
        S(KNEE_Z - 0.62, 0.17, 0.19, x, -0.01),
        S(ANKLE_Z + 0.1, 0.135, 0.15, x),
    ]
    calf = [
        S(KNEE_Z - 0.08, 0.2, 0.24, x, 0.04),
        S(KNEE_Z - 0.3, 0.23, 0.32, x, 0.05),
        S(KNEE_Z - 0.55, 0.19, 0.27, x, 0.03),
        S(ANKLE_Z + 0.16, 0.13, 0.15, x),
    ]
    plates = Hull("ShinPlates", side)
    plates.panels(guard, -152, -28, "Paint", cuts=[-108, -68], rows=[0.4, 0.7])
    plates.panels(guard, -18, 28, "Trim", rows=[0.55])
    plates.panels(calf, 38, 142, "Paint", cuts=[76, 104], rows=[0.5], thickness=0.026)
    cap = [S(KNEE_Z + 0.16, 0.13, 0.15, x, -0.1), S(KNEE_Z + 0.02, 0.18, 0.19, x, -0.12), S(KNEE_Z - 0.14, 0.15, 0.17, x, -0.1)]
    plates.panels(cap, -150, -30, "Paint", cuts=[-108, -72], thickness=0.03, bolts=False)
    shin.add(plates)
    ink = Decal("ShinInk", side)
    ink.place([S(KNEE_Z - 0.32, 0.225, 0.255, x, -0.02), S(KNEE_Z - 0.5, 0.2, 0.225, x, -0.016)], -104, -70, (0, 1), GRID)
    shin.print_on(ink)
    pieces.append(shin)

    foot = part(f"Foot{tag}", (x * side, 0, ANKLE_Z), f"Shin{tag}")
    body = Hull("FootBody", side)
    body.drum((x, 0, ANKLE_Z), (1, 0, 0), 0.13, 0.26, "Frame", rim="Steel")
    body.loft(
        [
            S(0.38, 0.15, 0.1, x, 0.24, 4),
            S(0.26, 0.205, 0.16, x, 0.24, 4),
            S(0.0, 0.235, 0.22, x, 0.24, 4),
            S(-0.2, 0.235, 0.18, x, 0.2, 4),
            S(-0.32, 0.225, 0.13, x, 0.16, 4),
        ],
        "Trim",
        axis="y",
    )
    body.block((x - 0.24, -0.34, 0.0), (x + 0.24, 0.4, 0.075), "Rubber")
    for lug in range(5):
        y = -0.28 + lug * 0.15
        body.block((x - 0.21, y, -0.02), (x + 0.21, y + 0.07, 0.01), "Rubber")
    foot.add(body)
    upper = [
        S(0.3, 0.17, 0.13, x, 0.24, 4),
        S(0.08, 0.215, 0.19, x, 0.27, 4),
        S(-0.12, 0.225, 0.17, x, 0.24, 4),
        S(-0.3, 0.215, 0.12, x, 0.18, 4),
    ]
    armour = Hull("FootArmour", side)
    armour.panels(upper, 26, 154, "Paint", axis="y", cuts=[66, 114], rows=[0.5], thickness=0.022)
    armour.panels(upper[:3], -30, 16, "Paint", axis="y", rows=[0.5], thickness=0.018)
    armour.panels(upper[:3], 164, 210, "Paint", axis="y", rows=[0.5], thickness=0.018)
    foot.add(armour)
    pieces.append(foot)

    toe = part(f"Toe{tag}", (x * side, -0.34, 0.1), f"Foot{tag}")
    front = Hull("Toe", side)
    front.loft(
        [S(-0.33, 0.225, 0.095, x, 0.13, 4), S(-0.52, 0.215, 0.075, x, 0.11, 4), S(-0.68, 0.17, 0.045, x, 0.08, 4)],
        "Trim",
        axis="y",
    )
    front.block((x - 0.22, -0.68, 0), (x + 0.22, -0.34, 0.065), "Rubber")
    front.panels(
        [S(-0.35, 0.225, 0.095, x, 0.13, 4), S(-0.52, 0.215, 0.075, x, 0.11, 4), S(-0.66, 0.175, 0.05, x, 0.085, 4)],
        20,
        160,
        "Paint",
        axis="y",
        cuts=[90],
        thickness=0.016,
    )
    toe.add(front)
    pieces.append(toe)

    pieces += piston("Knee", tag, side, (x, 0.3, HIP_Z - 0.3), (x, 0.3, KNEE_Z - 0.44), f"Thigh{tag}", f"Shin{tag}")
    pieces += piston("Ankle", tag, side, (x - 0.15, -0.2, KNEE_Z - 0.46), (x - 0.15, -0.26, 0.26), f"Shin{tag}", f"Foot{tag}")
    return pieces


def build_pelvis():
    pelvis = part("Pelvis", (0, 0, HIP_Z + 0.06), "Root")
    core = Hull("PelvisCore")
    core.loft([S(HIP_Z - 0.26, 0.2, 0.18), S(HIP_Z - 0.04, 0.34, 0.26), S(HIP_Z + 0.24, 0.32, 0.27)], "Frame")
    pelvis.add(core, bevel=0.005)

    guard = [S(HIP_Z + 0.2, 0.34, 0.31), S(HIP_Z - 0.02, 0.33, 0.33), S(HIP_Z - 0.28, 0.2, 0.26)]
    plates = Hull("PelvisPlates")
    plates.panels(guard, -128, -52, "Paint", cuts=[-100, -80], rows=[0.5], thickness=0.03)
    plates.panels(guard[:2], 54, 126, "Trim", cuts=[90], thickness=0.03)
    pelvis.add(plates)

    for side in (-1, 1):
        skirt = Hull("Skirt", side)
        hang = [S(HIP_Z + 0.16, 0.13, 0.28, 0.36), S(HIP_Z - 0.06, 0.15, 0.3, 0.37), S(HIP_Z - 0.26, 0.13, 0.26, 0.37)]
        skirt.panels(hang, -46, 46, "Paint", cuts=[-6], rows=[0.5], thickness=0.024)
        pelvis.add(skirt)
    ink = Decal("PelvisInk")
    ink.place([S(HIP_Z + 0.12, 0.34, 0.345), S(HIP_Z - 0.06, 0.32, 0.34)], -108, -72, (3, 3), GRID)
    pelvis.print_on(ink)
    return pelvis


def build_spine():
    spine = part("Spine", (0, 0, WAIST_Z - 0.1), "Pelvis")
    core = Hull("Spine")
    core.loft([S(HIP_Z + 0.2, 0.22, 0.17, power=2.6), S(CHEST_Z + 0.06, 0.26, 0.2, power=2.6)], "Frame")
    for side in (-1, 1):
        core.rod((side * 0.2, -0.17, HIP_Z + 0.22), (side * 0.2, -0.17, CHEST_Z + 0.04), 0.022, "Steel")
        core.rod((side * 0.2, -0.17, HIP_Z + 0.22), (side * 0.2, -0.17, HIP_Z + 0.34), 0.038, "Frame")
        core.hose([(side * 0.27, 0.05, HIP_Z + 0.22), (side * 0.33, 0.08, HIP_Z + 0.44), (side * 0.28, 0.04, CHEST_Z + 0.06)], 0.018, "Rubber")
    spine.add(core, bevel=0.004)

    # Overlapping bands, like a lobster's tail: armour that can still bend.
    bands = Hull("Bands")
    for index, z in enumerate((HIP_Z + 0.27, HIP_Z + 0.4, HIP_Z + 0.53)):
        half = 0.33 + index * 0.028
        band = [S(z, half, half * 0.76, power=2.8), S(z + 0.15, half + 0.034, (half + 0.034) * 0.76, power=2.8)]
        bands.plate(band, -148, -32, "Paint", thickness=0.02, columns=22)
        bands.plate(band, 40, 140, "Trim", thickness=0.018, columns=14)
    spine.add(bands)
    return spine


def build_chest():
    chest = part("Chest", (0, 0, CHEST_Z), "Spine")
    core = Hull("ChestCore")
    core.loft(
        [
            S(CHEST_Z - 0.02, 0.34, 0.26),
            S(CHEST_Z + 0.2, 0.46, 0.33),
            S(CHEST_Z + 0.46, 0.58, 0.37),
            S(NECK_Z - 0.06, 0.48, 0.31),
            S(NECK_Z + 0.04, 0.26, 0.2),
        ],
        "Frame",
    )
    chest.add(core, bevel=0.005)

    body = [
        S(CHEST_Z - 0.0, 0.37, 0.3),
        S(CHEST_Z + 0.22, 0.5, 0.37),
        S(CHEST_Z + 0.46, 0.62, 0.42),
        S(NECK_Z - 0.08, 0.53, 0.35),
    ]
    plates = Hull("ChestPlates")
    plates.panels(body, -82, -24, "Paint", cuts=[-54], rows=[0.36, 0.7], thickness=0.03)
    plates.panels(body, -156, -98, "Paint", cuts=[-126], rows=[0.36, 0.7], thickness=0.03)
    plates.panels(body, -96, -84, "Trim", rows=[0.5], thickness=0.024, bolts=False)
    plates.panels(body[:3], -16, 26, "Paint", rows=[0.5], thickness=0.03)
    plates.panels(body[:3], 154, 196, "Paint", rows=[0.5], thickness=0.03)
    plates.panels(body, 44, 136, "Trim", cuts=[90], rows=[0.5], thickness=0.028)
    # A raised service hatch on one side of the chest, and a slim line of the brand's red.
    hatch = [S(CHEST_Z + 0.22, 0.5, 0.37), S(CHEST_Z + 0.42, 0.6, 0.41)]
    plates.plate(hatch, -148, -120, "Trim", lift=0.03, thickness=0.012, columns=6)
    stripe = [S(NECK_Z - 0.22, 0.585, 0.395), S(NECK_Z - 0.18, 0.57, 0.385)]
    plates.plate(stripe, -160, -20, "Red", lift=0.034, thickness=0.006, columns=24)
    collar = [S(NECK_Z - 0.16, 0.42, 0.3), S(NECK_Z + 0.02, 0.33, 0.25), S(NECK_Z + 0.12, 0.27, 0.21)]
    plates.panels(collar, -172, -8, "Paint", cuts=[-120, -60], thickness=0.03)
    chest.add(plates)

    # A handrail for a person to hold on the way up, and two work lamps.
    fittings = Hull("Fittings")
    for side in (-1, 1):
        fittings.hose([(side * 0.5, -0.42, CHEST_Z + 0.14), (side * 0.56, -0.47, CHEST_Z + 0.26), (side * 0.56, -0.47, CHEST_Z + 0.36), (side * 0.5, -0.42, CHEST_Z + 0.48)], 0.014, "Steel", sides=10)
        fittings.rod((side * 0.34, -0.43, NECK_Z - 0.14), (side * 0.34, -0.47, NECK_Z - 0.14), 0.05, "Frame", sides=18)
    for index in range(5):
        z = CHEST_Z + 0.1 + index * 0.075
        fittings.block((-0.058, -0.47 - index * 0.008, z), (0.058, -0.33, z + 0.04), "Frame")
    chest.add(fittings, bevel=0.003)
    ink = Decal("ChestInk")
    ink.place([S(CHEST_Z + 0.26, 0.56, 0.41), S(CHEST_Z + 0.42, 0.62, 0.442)], -76, -56, (2, 0), GRID, lift=0.0345)
    ink.place([S(CHEST_Z + 0.08, 0.5, 0.385), S(CHEST_Z + 0.2, 0.53, 0.4)], -146, -126, (2, 2), GRID, lift=0.0345)
    chest.print_on(ink)

    # The back: a thruster pack, with its tanks, radiators and two main nozzles.
    pack = Hull("Pack")
    pack.loft([S(CHEST_Z + 0.08, 0.34, 0.2, 0, 0.5), S(CHEST_Z + 0.34, 0.42, 0.24, 0, 0.53), S(NECK_Z - 0.1, 0.36, 0.22, 0, 0.5)], "Trim")
    for side in (-1, 1):
        pack.rod((side * 0.26, 0.82, CHEST_Z + 0.04), (side * 0.26, 0.82, NECK_Z - 0.04), 0.13, "Paint", sides=24)
        for z in (CHEST_Z + 0.16, CHEST_Z + 0.5):
            pack.rod((side * 0.26, 0.82, z), (side * 0.26, 0.82, z + 0.03), 0.138, "Frame", sides=24)
        pack.rod((side * 0.26, 0.82, NECK_Z - 0.04), (side * 0.26, 0.82, NECK_Z - 0.0), 0.09, "Steel", sides=24)
        pack.loft(
            [S(CHEST_Z + 0.06, 0.1, 0.1, side * 0.26, 0.82, 2), S(CHEST_Z - 0.05, 0.13, 0.13, side * 0.26, 0.82, 2), S(CHEST_Z - 0.2, 0.17, 0.17, side * 0.26, 0.82, 2)],
            "Frame",
            sides=24,
        )
        pack.hose([(side * 0.12, 0.52, CHEST_Z + 0.5), (side * 0.2, 0.7, CHEST_Z + 0.5), (side * 0.26, 0.7, CHEST_Z + 0.2)], 0.02, "Rubber")
        for fin in range(4):
            z = CHEST_Z + 0.34 + fin * 0.06
            pack.block((side * 0.42, 0.34, z), (side * 0.68, 0.62, z + 0.014), "Frame")
    chest.add(pack)

    lamps = part("ChestLamps", (0, 0, CHEST_Z), "Chest")
    pair = Hull("ChestLamps")
    for side in (-1, 1):
        pair.rod((side * 0.34, -0.47, NECK_Z - 0.14), (side * 0.34, -0.474, NECK_Z - 0.14), 0.03, "Lamp", sides=14)
    lamps.add(pair, bevel=0)
    return chest, lamps


def build_head():
    neck = part("Neck", (0, -0.02, NECK_Z + 0.02), "Chest")
    column = Hull("Neck")
    column.loft([S(NECK_Z - 0.04, 0.14, 0.14, 0, -0.02, 2.4), S(NECK_Z + 0.14, 0.12, 0.12, 0, -0.02, 2.4)], "Frame", sides=24)
    for index in range(3):
        z = NECK_Z - 0.02 + index * 0.05
        column.loft([S(z, 0.16, 0.16, 0, -0.02, 2.4), S(z + 0.03, 0.16, 0.16, 0, -0.02, 2.4)], "Rubber", sides=24)
    neck.add(column, bevel=0.004)

    # A squat sensor housing set down between the shoulders, not a face.
    head = part("Head", (0, -0.04, NECK_Z + 0.1), "Neck")
    z = NECK_Z + 0.08
    shell = [
        S(z, 0.2, 0.24, 0, -0.1, 4.5),
        S(z + 0.08, 0.27, 0.31, 0, -0.14, 4.5),
        S(z + 0.2, 0.28, 0.33, 0, -0.14, 4.5),
        S(z + 0.3, 0.25, 0.3, 0, -0.1, 4.2),
        S(z + 0.36, 0.17, 0.2, 0, -0.06, 3.6),
    ]
    core = Hull("HeadCore")
    core.loft(shell, "Frame")
    head.add(core, bevel=0.004)

    plates = Hull("HeadPlates")
    brow = shell[2:]
    plates.panels(brow, -180, 180, "Paint", cuts=[-124, -56, 0, 90], thickness=0.026, bolts=False)
    jaw = shell[:2]
    plates.panels(jaw, -150, -30, "Paint", cuts=[-108, -72], thickness=0.028, bolts=False)
    plates.plate(jaw, 40, 140, "Trim", thickness=0.02)
    # A heavy brow over the sensors, so they're in shadow.
    ridge = [S(z + 0.22, 0.31, 0.37, 0, -0.14, 4.5), S(z + 0.25, 0.31, 0.37, 0, -0.14, 4.5)]
    plates.plate(ridge, -158, -22, "Paint", thickness=0.02, columns=20)
    head.add(plates)

    fittings = Hull("HeadFittings")
    for side in (-1, 1):
        fittings.block((side * 0.3, -0.2, z + 0.08), (side * 0.36, 0.08, z + 0.26), "Trim")
        fittings.rod((side * 0.33, -0.24, z + 0.16), (side * 0.33, -0.2, z + 0.16), 0.05, "Frame", sides=16)
        fittings.rod((side * 0.3, 0.06, z + 0.34), (side * 0.3, 0.06, z + 0.5), 0.009, "Steel", sides=8)
    fittings.block((-0.1, -0.1, z + 0.36), (0.1, 0.12, z + 0.43), "Trim")
    head.add(fittings, bevel=0.004)

    visor = part("Visor", (0, -0.04, NECK_Z + 0.1), "Head")
    strip = Hull("Visor")
    band = [S(z + 0.135, 0.28, 0.331, 0, -0.14, 4.5), S(z + 0.17, 0.28, 0.331, 0, -0.14, 4.5)]
    strip.plate(band, -138, -42, "Glow", thickness=0.004, columns=24)
    for x in (-0.13, 0.13):
        strip.rod((x, -0.47, z + 0.105), (x, -0.484, z + 0.105), 0.016, "Lamp", sides=12)
    visor.add(strip, bevel=0)
    return neck, head, visor


def arm(side):
    tag = "L" if side > 0 else "R"
    x = SHOULDER_X

    # A closed, heavy housing, with a plate on top: it holds the whole arm's torque.
    shoulder = part(f"Shoulder{tag}", (x * side, 0, SHOULDER_Z), "Chest")
    ball = Hull("ShoulderBall", side)
    ball.drum((x - 0.24, 0, SHOULDER_Z), (1, 0, 0), 0.22, 0.2, "Frame", rim="Steel")
    ball.loft(
        [
            S(x - 0.2, 0.26, 0.25, 0, SHOULDER_Z, 3.4),
            S(x - 0.05, 0.31, 0.3, 0, SHOULDER_Z, 3.4),
            S(x + 0.2, 0.31, 0.3, 0, SHOULDER_Z, 3.4),
            S(x + 0.3, 0.27, 0.26, 0, SHOULDER_Z, 3.4),
        ],
        "Trim",
        axis="x",
    )
    shoulder.add(ball, bevel=0.005)
    pad = [
        S(x - 0.2, 0.27, 0.26, 0, SHOULDER_Z, 3.4),
        S(x - 0.05, 0.32, 0.31, 0, SHOULDER_Z, 3.4),
        S(x + 0.2, 0.32, 0.31, 0, SHOULDER_Z, 3.4),
        S(x + 0.3, 0.28, 0.27, 0, SHOULDER_Z, 3.4),
    ]
    plates = Hull("Pad", side)
    plates.panels(pad, 18, 162, "Paint", axis="x", cuts=[62, 118], rows=[0.5], thickness=0.03)
    plates.panels(pad, 200, 340, "Paint", axis="x", cuts=[270], thickness=0.024)
    plates.loft(
        [S(x + 0.31, 0.25, 0.24, 0, SHOULDER_Z, 3.4), S(x + 0.345, 0.2, 0.19, 0, SHOULDER_Z, 3.4)],
        "Paint",
        axis="x",
    )
    shoulder.add(plates)
    ink = Decal("ShoulderInk", side)
    flat = [S(SHOULDER_Z - 0.14, x + 0.349, 2.6, 0, 0, 2), S(SHOULDER_Z + 0.14, x + 0.349, 2.6, 0, 0, 2)]
    ink.place(flat, -3.2, 3.2, (0, 0), GRID, lift=0.001, columns=4)
    shoulder.print_on(ink)

    upper = part(f"UpperArm{tag}", (x * side, 0, SHOULDER_Z - 0.2), f"Shoulder{tag}")
    core = Hull("UpperCore", side)
    core.loft([S(SHOULDER_Z - 0.14, 0.15, 0.16, x), S(ELBOW_Z + 0.08, 0.12, 0.13, x)], "Frame")
    core.hose([(x - 0.12, 0.14, SHOULDER_Z - 0.26), (x - 0.18, 0.18, SHOULDER_Z - 0.46), (x - 0.1, 0.13, ELBOW_Z + 0.14)], 0.015, "Rubber")
    upper.add(core, bevel=0.005)
    shell = [S(SHOULDER_Z - 0.3, 0.19, 0.2, x), S(SHOULDER_Z - 0.48, 0.205, 0.215, x), S(ELBOW_Z + 0.12, 0.165, 0.175, x)]
    plates = Hull("UpperPlates", side)
    plates.panels(shell, -130, -50, "Paint", cuts=[-90], rows=[0.5])
    plates.panels(shell, -38, 40, "Paint", rows=[0.45])
    upper.add(plates)

    fore = part(f"ForeArm{tag}", (x * side, 0, ELBOW_Z), f"UpperArm{tag}")
    core = Hull("ForeCore", side)
    core.drum((x, 0, ELBOW_Z), (1, 0, 0), 0.15, 0.3, "Frame", rim="Steel")
    core.loft([S(ELBOW_Z - 0.08, 0.14, 0.15, x), S(WRIST_Z + 0.12, 0.12, 0.14, x), S(WRIST_Z, 0.1, 0.12, x)], "Frame")
    core.hose([(x + 0.16, -0.1, ELBOW_Z - 0.1), (x + 0.22, -0.17, ELBOW_Z - 0.34), (x + 0.12, -0.12, WRIST_Z + 0.1)], 0.015, "Rubber")
    fore.add(core, bevel=0.005)
    # A gauntlet: it's what lands the punches, so it's the heaviest thing on the arm.
    shell = [
        S(ELBOW_Z - 0.1, 0.19, 0.21, x),
        S(ELBOW_Z - 0.32, 0.245, 0.27, x),
        S(ELBOW_Z - 0.54, 0.225, 0.25, x),
        S(WRIST_Z + 0.06, 0.15, 0.17, x),
    ]
    plates = Hull("ForePlates", side)
    plates.panels(shell, -146, -86, "Paint", rows=[0.42], thickness=0.03)
    plates.panels(shell, -76, 8, "Paint", cuts=[-36], rows=[0.3, 0.68], thickness=0.03)
    plates.panels(shell, 20, 64, "Paint", rows=[0.5], thickness=0.03)
    plates.panels(shell, 150, 196, "Trim", rows=[0.5], thickness=0.024)
    plates.plate(shell[1:3], -44, -30, "Red", lift=0.034, thickness=0.006, columns=3)
    fore.add(plates)
    ink = Decal("ForeInk", side)
    ink.place([S(ELBOW_Z - 0.3, 0.245, 0.27, x), S(ELBOW_Z - 0.46, 0.235, 0.26, x)], -28, 6, (2, 1), GRID, lift=0.036)
    fore.print_on(ink)

    hand = part(f"Hand{tag}", (x * side, 0, WRIST_Z), f"ForeArm{tag}")
    palm = Hull("Palm", side)
    palm.drum((x, 0, WRIST_Z - 0.02), (0, 1, 0), 0.1, 0.22, "Frame")
    palm.loft([S(WRIST_Z - 0.06, 0.1, 0.15, x, 0, 4), S(WRIST_Z - 0.2, 0.115, 0.185, x, 0, 4), S(WRIST_Z - 0.32, 0.09, 0.18, x, 0, 4)], "Trim")
    palm.panels(
        [S(WRIST_Z - 0.07, 0.1, 0.155, x, 0, 4), S(WRIST_Z - 0.2, 0.115, 0.19, x, 0, 4), S(WRIST_Z - 0.31, 0.09, 0.185, x, 0, 4)],
        -62,
        62,
        "Paint",
        cuts=[0],
        thickness=0.02,
    )
    hand.add(palm)

    pieces = [shoulder, upper, fore, hand]
    # Three thick fingers and a thumb, each in two joints. The palm faces in.
    knuckle_z = WRIST_Z - 0.32
    for index, y in enumerate((-0.125, 0.0, 0.125)):
        base = part(f"Finger{index}{tag}", (x * side, y, knuckle_z), f"Hand{tag}")
        bone = Hull("FingerBase", side)
        bone.drum((x, y, knuckle_z), (0, 1, 0), 0.05, 0.1, "Frame")
        bone.loft([S(knuckle_z - 0.02, 0.05, 0.05, x, y, 3.4), S(knuckle_z - 0.17, 0.045, 0.048, x, y, 3.4)], "Paint", sides=16)
        base.add(bone, bevel=0.004)
        tip = part(f"Tip{index}{tag}", (x * side, y, knuckle_z - 0.18), f"Finger{index}{tag}")
        end = Hull("FingerTip", side)
        end.drum((x, y, knuckle_z - 0.18), (0, 1, 0), 0.042, 0.088, "Frame", sides=14)
        end.loft([S(knuckle_z - 0.19, 0.044, 0.046, x, y, 3.4), S(knuckle_z - 0.31, 0.03, 0.036, x, y, 3.4)], "Paint", sides=16)
        tip.add(end, bevel=0.004)
        pieces += [base, tip]
    thumb_at = (x - 0.08, -0.2, WRIST_Z - 0.14)
    thumb = part(f"Thumb{tag}", (thumb_at[0] * side, thumb_at[1], thumb_at[2]), f"Hand{tag}")
    bone = Hull("Thumb", side)
    bone.drum(thumb_at, (0, 0, 1), 0.056, 0.11, "Frame", sides=16)
    bone.rod(thumb_at, (thumb_at[0] - 0.05, thumb_at[1] - 0.05, thumb_at[2] - 0.22), 0.042, "Paint", sides=14)
    thumb.add(bone, bevel=0.004)
    pieces.append(thumb)

    pieces += piston("Elbow", tag, side, (x, 0.22, SHOULDER_Z - 0.34), (x, 0.24, ELBOW_Z - 0.3), f"UpperArm{tag}", f"ForeArm{tag}")
    return pieces


parts = [build_pelvis(), build_spine(), *build_chest()]
parts += list(build_head())
for side in (1, -1):
    parts += leg(side)
    parts += arm(side)

objects = {item.name: item.build() for item in parts}
triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in objects.values())
print("parts", len(objects), "triangles", triangles, flush=True)

# What moves with what. The page reads this hierarchy straight out of the file.
root = bpy.data.objects.new("Root", None)
collection.objects.link(root)
for item in parts:
    obj = objects[item.name]
    parent = root if item.parent == "Root" else objects[item.parent]
    obj.parent = parent
    for skin in [o for o in collection.objects if o.name.startswith(f"{item.name}_Print")]:
        skin.parent = obj
pivots = {item.name: item.pivot.copy() for item in parts}
for item in parts:
    obj = objects[item.name]
    origin = pivots.get(item.parent)
    if origin is not None:
        obj.location = item.pivot - origin
    for skin in [o for o in collection.objects if o.name.startswith(f"{item.name}_Print")]:
        skin.location = (0, 0, 0)
bpy.context.view_layer.update()

PAINT_ENEMY = {
    "Paint": (0.055, 0.058, 0.066),
    "Trim": (0.016, 0.017, 0.02),
    "Red": (0.42, 0.14, 0.012),
}


if MODE == "bake":
    size = int(args[2]) if len(args) > 2 else 4096
    samples = int(args[3]) if len(args) > 3 else 24
    use_gpu(scene, samples, denoise=False)
    scene.cycles.max_bounces = 2
    scene.render.bake.margin = 8

    glowing_parts = {"Visor", "ChestLamps"}
    solid = [obj for name, obj in objects.items() if name not in glowing_parts]
    for obj in collection.objects:
        if "_Print" in obj.name or obj.name in glowing_parts:
            obj.hide_render = True

    bpy.ops.object.select_all(action="DESELECT")
    for obj in solid:
        obj.data.uv_layers.new(name="Bake")
        obj.data.uv_layers.active = obj.data.uv_layers["Bake"]
        obj.select_set(True)
    bpy.context.view_layer.objects.active = solid[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.0016, rotate_method="AXIS_ALIGNED", scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.0016, rotate=True, shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")
    print("unwrapped", flush=True)

    painted = [M[key] for key in ("Paint", "Trim", "Red", "Frame", "Steel", "Rubber")]
    bake_pass("robot-albedo", size, "EMIT", solid, painted, BUILD, False, "Base Color")
    bake_pass("robot-rough", size, "EMIT", solid, painted, BUILD, True, "Roughness")
    bake_pass("robot-metal", size, "EMIT", solid, painted, BUILD, True, "Metallic")
    bake_pass("robot-normal", size, "NORMAL", solid, painted, BUILD, True)
    bake_pass("robot-ao", size // 2, "AO", solid, painted, BUILD, True)
    for key, colour in PAINT_ENEMY.items():
        M[key].node_tree.nodes["Tint"].outputs[0].default_value = (*colour, 1)
    bake_pass("enemy-albedo", size, "EMIT", solid, painted, BUILD, False, "Base Color")

    # Geometry only: the page puts the maps on itself, so two robots can share one mesh.
    for obj in collection.objects:
        if obj.type == "MESH" and "_Print" not in obj.name and obj.name not in glowing_parts:
            for layer in [layer for layer in obj.data.uv_layers if layer.name != "Bake"]:
                obj.data.uv_layers.remove(layer)
        obj.hide_render = False
    out = os.path.join(ROOT, "public/2090")
    os.makedirs(out, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out, "robot.glb"),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_apply=False,
        export_animations=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print("Exported robot", flush=True)

if MODE == "preview":
    out = os.path.abspath(args[2])
    degrees = float(args[3]) if len(args) > 3 else 28
    height = float(args[4]) if len(args) > 4 else 2.3
    lens = float(args[5]) if len(args) > 5 else 52
    target_z = float(args[6]) if len(args) > 6 else 2.0
    angle = math.radians(degrees)
    distance = 8.5
    add_camera(scene, (math.sin(angle) * distance, -math.cos(angle) * distance, height), (0, 0, target_z), lens=lens)
    use_gpu(scene, 64)

    # The Moon's light: one hard sun, and only what bounces off the ground to fill it.
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 6
    sun.angle = math.radians(0.54)
    sun_object = bpy.data.objects.new("Sun", sun)
    sun_object.rotation_euler = (math.radians(66), 0, math.radians(42))
    collection.objects.link(sun_object)
    world = bpy.data.worlds.new("Space")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.012, 0.016, 1)
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=80)
    ground = bpy.context.object
    regolith = bpy.data.materials.new("Regolith")
    regolith.use_nodes = True
    regolith.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*REGOLITH, 1)
    regolith.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.98
    ground.data.materials.append(regolith)

    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("Rendered", out, flush=True)

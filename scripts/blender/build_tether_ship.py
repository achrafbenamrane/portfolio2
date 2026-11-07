"""
The ships of /3d/2090. The Heron is a heavy armed spaceplane, original to this game: thirty
metres of slab-sided military dropship with a bay big enough to walk a four-metre robot into up
its rear ramp. It's flown remotely, like everything else, so there's no glass on it anywhere.
The Raider is the enemy's small unmanned fighter.

    blender --background --python scripts/blender/build_tether_ship.py -- <repo root> preview <heron|raider> <out.png> [degrees] [height]
    blender --background --python scripts/blender/build_tether_ship.py -- <repo root> bake <heron|raider> [size] [samples]
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
SHIP = args[2] if len(args) > 2 else "heron"
BUILD = os.path.join(ROOT, "assets-source/tether/build")
GRID = 4

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
collection = scene.collection

M = {
    "Paint": weathered("ShipPaint", (0.27, 0.28, 0.29), 0.5, wear=0.9, dust=0.5),
    "Trim": weathered("ShipTrim", (0.1, 0.106, 0.118), 0.5, wear=0.7, dust=0.5),
    "Red": weathered("ShipRed", (0.24, 0.008, 0.016), 0.42, dust=0.3),
    "Pale": weathered("ShipPale", (0.42, 0.415, 0.395), 0.48, wear=0.8, dust=0.9),
    "Frame": weathered("ShipFrame", (0.03, 0.032, 0.036), 0.46, 1.0, wear=0.4, dust=0.4),
    "Steel": weathered("ShipSteel", (0.55, 0.56, 0.58), 0.28, 1.0, wear=0.0, dust=0.2),
    "Rubber": weathered("ShipRubber", (0.013, 0.013, 0.014), 0.8, wear=0.0, dust=0.6),
    "Glow": glowing("ShipGlow", (0.5, 0.75, 1.0), 12),
    "Lamp": glowing("ShipLamp", (1.0, 0.7, 0.4), 8),
    "Decal": printed(os.path.join(BUILD, "decals.png")),
}


def part(name, pivot, parent):
    return Part(name, pivot, parent, M, collection)


def slab(hull, outline, z, thickness, colour, taper=1.0):
    """A flat shape with real thickness, for wings and fins. `outline` is x, y points."""
    top = [hull.bm.verts.new((x * hull.side, y, z + thickness / 2 * taper)) for x, y in outline]
    bottom = [hull.bm.verts.new((x * hull.side, y, z - thickness / 2 * taper)) for x, y in outline]
    faces = [hull.bm.faces.new(top), hull.bm.faces.new(list(reversed(bottom)))]
    for index in range(len(outline)):
        following = (index + 1) % len(outline)
        faces.append(hull.bm.faces.new((top[index], bottom[index], bottom[following], top[following])))
    hull._finish(faces, colour)


def fin(hull, points, thickness, colour):
    """An upright fin. `points` are x, y, z, and it's closed by offsetting it sideways."""
    a = [hull.bm.verts.new((x * hull.side - thickness / 2, y, z)) for x, y, z in points]
    b = [hull.bm.verts.new((x * hull.side + thickness / 2, y, z)) for x, y, z in points]
    faces = [hull.bm.faces.new(a), hull.bm.faces.new(list(reversed(b)))]
    for index in range(len(points)):
        following = (index + 1) % len(points)
        faces.append(hull.bm.faces.new((a[index], b[index], b[following], a[following])))
    hull._finish(faces, colour)


def build_heron():
    parts = []
    body = part("Hull", (0, 0, 0), "Root")

    # A slab-sided fuselage. Only the nose and the sections up to the bay are closed: past that
    # it's plates round an open hold, so the ramp has somewhere to lead to.
    nose = [
        S(-16.0, 0.3, 0.22, 0, 3.1, 3),
        S(-14.0, 1.4, 0.8, 0, 3.0, 3),
        S(-11.0, 2.5, 1.5, 0, 3.15, 3.4),
        S(-7.0, 3.3, 2.3, 0, 3.5, 3.6),
        S(-2.0, 3.8, 2.75, 0, 3.8, 3.8),
        S(3.0, 3.85, 2.85, 0, 3.85, 3.8),
    ]
    core = Hull("Fuselage")
    core.loft(nose, "Trim", axis="y", sides=36)
    body.add(core, bevel=0.03)

    plates = Hull("HullPlates")
    plates.panels(nose, 18, 162, "Paint", axis="y", cuts=[62, 90, 118], rows=[0.3, 0.55, 0.78], thickness=0.06, bolts=False, seam=0.5)
    plates.panels(nose, -22, 12, "Paint", axis="y", rows=[0.42, 0.74], thickness=0.06, bolts=False, seam=0.5)
    plates.panels(nose, 168, 202, "Paint", axis="y", rows=[0.42, 0.74], thickness=0.06, bolts=False, seam=0.5)
    plates.panels(nose, 208, 332, "Trim", axis="y", cuts=[270], rows=[0.5], thickness=0.05, bolts=False, seam=0.5)
    body.add(plates, bevel=0.024)

    # The hold: walls, a floor, and work lights, with the top and sides of the hull over it.
    hold = [S(3.0, 3.85, 2.85, 0, 3.85, 3.8), S(8.0, 3.8, 2.8, 0, 3.95, 3.8), S(12.0, 3.4, 2.5, 0, 4.2, 3.6), S(15.5, 2.8, 1.9, 0, 4.7, 3.2)]
    rear = Hull("HoldHull")
    rear.panels(hold, -32, 212, "Paint", axis="y", cuts=[20, 62, 118, 160], rows=[0.5], thickness=0.06, bolts=False, seam=0.5)
    rear.plate(hold, -32, 212, "Paint", axis="y", thickness=0.03, lift=-0.08, columns=24)
    body.add(rear, bevel=0.024)
    inside = Hull("Hold")
    inside.block((-3.3, 3.0, 1.3), (3.3, 13.4, 1.42), "Trim")
    inside.block((-3.4, 2.9, 1.2), (3.4, 3.1, 6.5), "Trim")

    # The far wall: a pressure door with its frame, and bars either side of it.
    inside.block((-1.75, 3.1, 1.42), (1.75, 3.2, 5.3), "Frame")
    inside.block((-1.55, 3.2, 1.5), (-0.03, 3.28, 5.1), "Paint")
    inside.block((0.03, 3.2, 1.5), (1.55, 3.28, 5.1), "Paint")
    for x in (-1, 1):
        for index in range(7):
            z = 1.6 + index * 0.62
            inside.block((x * 1.95, 3.1, z), (x * 2.5, 3.16, z + 0.3), "Red" if index % 2 else "Pale")
        inside.block((x * 2.65, 3.1, 1.42), (x * 3.3, 3.5, 5.6), "Trim")

    # Frames every couple of metres, tied across the roof, with the racks and pipes along them.
    for index in range(5):
        y = 3.8 + index * 2.1
        for x in (-2.9, 2.9):
            inside.rod((x, y, 1.42), (x * 0.92, y, 6.1), 0.09, "Frame", sides=10)
            inside.block((x - 0.14, y - 0.14, 1.42), (x + 0.14, y + 0.14, 1.9), "Trim")
        inside.rod((-2.67, y, 6.1), (2.67, y, 6.1), 0.07, "Frame", sides=8)
    for x in (-1, 1):
        inside.rod((x * 2.84, 3.1, 4.4), (x * 2.84, 12.6, 4.4), 0.05, "Steel", sides=8)
        inside.rod((x * 2.8, 3.1, 4.75), (x * 2.8, 12.6, 4.75), 0.035, "Red", sides=8)
        inside.block((x * 2.4, 3.3, 6.02), (x * 2.0, 12.8, 6.1), "Trim")
        # Racks down the walls, for what a machine like this carries.
        for index in range(4):
            y = 4.5 + index * 2.1
            inside.block((x * 2.9, y, 1.42), (x * 2.46, y + 1.25, 2.5), "Paint" if index % 2 else "Trim")
            inside.block((x * 2.46, y + 0.1, 2.02), (x * 2.44, y + 1.15, 2.1), "Red")

    # A deck that's been walked on: tread, tie-down rails, and a line to stay inside.
    for index in range(12):
        y = 3.6 + index * 0.82
        inside.block((-1.9, y, 1.42), (1.9, y + 0.14, 1.47), "Frame")
    for x in (-1, 1):
        inside.block((x * 2.0, 3.2, 1.42), (x * 2.12, 13.3, 1.45), "Red")
        inside.block((x * 2.26, 3.2, 1.42), (x * 2.38, 13.3, 1.5), "Steel")
    body.add(inside, bevel=0.012)

    # The stub wings and their engine pods, and the tail.
    for side in (-1, 1):
        wing = Hull("Wing", side)
        slab(wing, [(3.2, -5.0), (13.0, 7.5), (13.0, 11.5), (3.4, 11.5)], 2.8, 0.55, "Paint")
        slab(wing, [(3.3, 7.8), (12.8, 8.6), (12.8, 11.4), (3.6, 11.4)], 3.12, 0.1, "Trim")
        slab(wing, [(12.9, 7.2), (13.8, 9.0), (13.8, 12.2), (12.9, 11.6)], 2.8, 0.28, "Red")
        body.add(wing, bevel=0.02)

        pod = Hull("Pod", side)
        x = 7.0
        pod.loft(
            [
                S(1.8, 0.28, 0.28, x, 3.4, 2.4),
                S(3.4, 1.22, 1.15, x, 3.4, 2.6),
                S(7.0, 1.42, 1.34, x, 3.4, 2.8),
                S(11.0, 1.32, 1.24, x, 3.4, 2.8),
                S(12.6, 1.04, 0.98, x, 3.4, 2.6),
            ],
            "Paint",
            axis="y",
            sides=30,
        )
        pod.panels(
            [S(3.5, 1.24, 1.18, x, 3.4, 2.6), S(7.0, 1.44, 1.36, x, 3.4, 2.8), S(11.0, 1.34, 1.26, x, 3.4, 2.8)],
            -170,
            170,
            "Trim",
            axis="y",
            cuts=[-90, 0, 90],
            rows=[0.5],
            thickness=0.04,
            bolts=False,
            seam=1,
        )
        pod.loft(
            [S(12.6, 0.95, 0.9, x, 3.4, 2), S(13.6, 0.82, 0.78, x, 3.4, 2), S(13.75, 0.7, 0.66, x, 3.4, 2)],
            "Frame",
            axis="y",
            sides=30,
        )
        body.add(pod, bevel=0.016)

        tail = Hull("Tail", side)
        fin(tail, [(2.2, 8.5, 6.2), (3.6, 13.4, 10.8), (3.9, 15.8, 10.8), (3.0, 15.0, 6.2)], 0.3, "Paint")
        fin(tail, [(3.65, 13.6, 10.7), (3.9, 15.8, 10.7), (3.86, 15.6, 10.1), (3.55, 13.4, 10.1)], 0.34, "Red")
        body.add(tail, bevel=0.02)

        # Guns under the nose: this is the part that makes it a warship.
        gun = Hull("Gun", side)
        gun.rod((1.5, -7.6, 1.4), (1.5, -13.0, 1.4), 0.1, "Frame", sides=12)
        gun.rod((1.5, -7.0, 1.4), (1.5, -9.5, 1.4), 0.26, "Trim", sides=14)
        gun.block((1.2, -7.4, 1.4), (1.8, -5.0, 2.0), "Trim")
        body.add(gun, bevel=0.012)

    # Sensors instead of a cockpit: nobody is on board.
    sensors = Hull("Sensors")
    sensors.loft([S(-12.4, 0.8, 0.5, 0, 4.0, 3.2), S(-10.6, 0.92, 0.56, 0, 4.1, 3.2), S(-9.0, 0.5, 0.3, 0, 4.2, 3)], "Frame", axis="y", sides=20)
    sensors.block((-1.1, -2.0, 6.4), (1.1, 1.6, 6.9), "Trim")
    sensors.rod((0, 1.0, 6.9), (0, 1.0, 8.4), 0.04, "Steel", sides=8)
    body.add(sensors, bevel=0.012)

    ink = Decal("HeronInk")
    ink.place([S(-7.0, 3.3, 2.3, 0, 3.5, 3.6), S(-2.0, 3.8, 2.75, 0, 3.8, 3.8)], -8, 8, (3, 0), GRID, axis="y", lift=0.068, columns=6)
    body.print_on(ink)
    parts.append(body)

    glow = part("Glow", (0, 0, 0), "Hull")
    lights = Hull("Glow")
    lights.loft([S(11.8, 0.3, 0.3, 7.0, 3.4, 2), S(13.74, 0.68, 0.64, 7.0, 3.4, 2)], "Glow", axis="y", sides=28)
    mirrored = Hull("GlowMirror", -1)
    mirrored.loft([S(11.8, 0.3, 0.3, 7.0, 3.4, 2), S(13.74, 0.68, 0.64, 7.0, 3.4, 2)], "Glow", axis="y", sides=28)
    glow.add(lights, bevel=0)
    glow.add(mirrored, bevel=0)
    parts.append(glow)

    # The ramp: hinged at the floor of the hold, and swung down onto the ground by the page.
    ramp = part("Ramp", (0, 13.3, 1.4), "Hull")
    door = Hull("Ramp")
    door.block((-3.0, 13.3, 1.2), (3.0, 20.2, 1.42), "Paint")
    for index in range(9):
        y = 13.8 + index * 0.72
        door.block((-2.7, y, 1.42), (2.7, y + 0.12, 1.47), "Frame")

    # Its underside is the back of the ship once it's shut, so it's built like the structure it is:
    # a frame round the edge, ribs across, and plates that don't quite line up.
    for low, high in (
        ((-3.0, 13.3, 1.06), (-2.72, 20.2, 1.2)),
        ((2.72, 13.3, 1.06), (3.0, 20.2, 1.2)),
        ((-2.72, 13.3, 1.06), (2.72, 13.62, 1.2)),
        ((-2.72, 19.86, 1.06), (2.72, 20.2, 1.2)),
    ):
        door.block(low, high, "Trim")
    rows = ((13.72, 15.68), (15.86, 17.78), (17.96, 19.2))
    for row, (near, far) in enumerate(rows):
        for column, (left, right) in enumerate(((-2.62, -0.09), (0.09, 2.62))):
            sunk = 0.02 + 0.016 * ((row + column) % 3)
            door.block((left, near, 1.1 + sunk), (right, far, 1.2), "Paint" if (row + column) % 3 else "Pale")
    for near in (15.7, 17.8):
        door.block((-2.72, near, 1.03), (2.72, near + 0.14, 1.2), "Frame")
    door.block((-0.07, 13.62, 1.03), (0.07, 19.86, 1.2), "Frame")
    # Warning bars along the free edge, where it comes down on things.
    for index in range(10):
        left = -2.62 + index * 0.53
        door.block((left, 19.3, 1.14), (left + 0.5, 19.76, 1.2), "Red" if index % 2 else "Pale")
    # The rams that drive it, and the latches that hold it shut.
    for x in (-1.5, 1.5):
        door.block((x - 0.34, 13.66, 0.96), (x + 0.34, 15.2, 1.2), "Trim")
        door.rod((x, 13.7, 0.92), (x, 17.6, 0.92), 0.075, "Steel", sides=10)
        door.rod((x, 13.7, 0.92), (x, 15.5, 0.92), 0.13, "Frame", sides=12)
        door.block((x - 0.18, 17.5, 0.94), (x + 0.18, 17.74, 1.1), "Trim")
    for x in (-2.1, 2.1):
        door.block((x - 0.26, 19.84, 0.98), (x + 0.26, 20.22, 1.08), "Steel")
    door.bolts([(x * 0.5, 13.46, 1.06) for x in range(-5, 6)], (0, 0, -1), radius=0.05, height=0.03)
    door.bolts([(x * 0.5, 20.03, 1.06) for x in range(-5, 6) if abs(x) not in (4,)], (0, 0, -1), radius=0.05, height=0.03)
    door.bolts([(s * 2.86, 13.9 + i * 0.8, 1.06) for s in (-1, 1) for i in range(8)], (0, 0, -1), radius=0.05, height=0.03)
    ramp.add(door, bevel=0.012)
    parts.append(ramp)

    # Three legs, retracted by the page.
    for name, x, y in (("GearNose", 0, -10.0), ("GearL", 3.2, 5.0), ("GearR", -3.2, 5.0)):
        gear = part(name, (x, y, 1.6), "Hull")
        leg = Hull(name)
        leg.rod((x, y, 1.7), (x, y, 0.3), 0.15, "Frame", sides=14)
        leg.rod((x, y, 1.1), (x, y, 0.32), 0.09, "Steel", sides=12)
        leg.loft([S(0.0, 0.7, 0.7, x, y, 3), S(0.26, 0.56, 0.56, x, y, 3)], "Trim", sides=20)
        gear.add(leg, bevel=0.016)
        parts.append(gear)
    return parts


def build_raider():
    body = part("Raider", (0, 0, 0), "Root")
    core = Hull("RaiderCore")
    shape = [
        S(-5.2, 0.1, 0.08, 0, 0, 2.6),
        S(-3.0, 0.62, 0.34, 0, 0, 3),
        S(0.0, 1.05, 0.56, 0, 0.05, 3.4),
        S(3.0, 0.95, 0.6, 0, 0.1, 3.4),
        S(4.4, 0.7, 0.46, 0, 0.1, 3),
    ]
    core.loft(shape, "Trim", axis="y", sides=26)
    body.add(core, bevel=0.012)
    plates = Hull("RaiderPlates")
    plates.panels(shape, 16, 164, "Paint", axis="y", cuts=[66, 114], rows=[0.5], thickness=0.03, bolts=False, seam=1)
    body.add(plates, bevel=0.01)
    for side in (-1, 1):
        wing = Hull("RaiderWing", side)
        slab(wing, [(0.8, -1.8), (6.4, 2.6), (6.4, 3.6), (0.9, 3.2)], 0.0, 0.16, "Paint")
        slab(wing, [(6.0, 2.3), (6.5, 2.7), (6.5, 3.7), (6.0, 3.5)], 0.0, 0.2, "Red")
        fin(wing, [(0.9, 1.0, 0.3), (2.0, 3.4, 1.8), (2.3, 4.1, 1.8), (1.2, 3.6, 0.3)], 0.1, "Trim")
        wing.rod((4.0, 0.2, -0.2), (4.0, -2.8, -0.2), 0.05, "Frame", sides=8)
        body.add(wing, bevel=0.01)
    glow = part("Glow", (0, 0, 0), "Raider")
    lights = Hull("Glow")
    lights.loft([S(4.1, 0.2, 0.16, 0, 0.1, 2), S(4.46, 0.56, 0.36, 0, 0.1, 2)], "Lamp", axis="y", sides=20)
    glow.add(lights, bevel=0)
    return [body, glow]


def build_base():
    """The landing pad and the camp beside it. All one rigid thing, baked together."""
    base = part("Base", (0, 0, 0), "Root")

    # A pad of sintered regolith: octagonal slabs, burnt dark in the middle by every landing.
    pad = Hull("Pad")
    pad.loft([S(0.0, 25, 25, 0, 0, 1.3), S(0.24, 24.6, 24.6, 0, 0, 1.3)], "Trim", sides=8)
    for ring in range(3):
        radius = 8 + ring * 6
        for slab_index in range(8):
            start = slab_index * 45 + 0.8
            pad.plate([S(0.24, radius, radius, 0, 0, 1.3), S(0.25, radius, radius, 0, 0, 1.3)], start, start + 43.4, "Paint", thickness=5.6, lift=0.0, columns=3)
    pad.drum((0, 0, 0.3), (0, 0, 1), 7, 0.08, "Frame", sides=8)
    base.add(pad, bevel=0.03)

    marks = Hull("PadMarks")
    for index in range(8):
        turn = math.radians(index * 45 + 22.5)
        x, y = math.cos(turn) * 22.5, math.sin(turn) * 22.5
        marks.block((x - 0.6, y - 0.6, 0.26), (x + 0.6, y + 0.6, 0.31), "Red")
    base.add(marks, bevel=0.01)

    # Three habitat modules on legs, joined by a tunnel: the only warm place for a long way.
    camp = Hull("Camp")
    camp_x, camp_y = 46.0, 20.0
    for index, (dx, dy) in enumerate(((0, 0), (0, 15), (14, 7))):
        x, y = camp_x + dx, camp_y + dy
        shell = [
            S(-6.0, 0.6, 0.6, x, 3.4, 2),
            S(-5.3, 2.5, 2.5, x, 3.4, 2),
            S(-4.0, 2.9, 2.9, x, 3.4, 2),
            S(4.0, 2.9, 2.9, x, 3.4, 2),
            S(5.3, 2.5, 2.5, x, 3.4, 2),
            S(6.0, 0.6, 0.6, x, 3.4, 2),
        ]
        shifted = [dict(s, at=s["at"] + y) for s in shell]
        camp.loft(shifted, "Pale", axis="y", sides=30)
        for ring in (-3.2, 0.0, 3.2):
            camp.loft([S(y + ring - 0.08, 2.98, 2.98, x, 3.4, 2), S(y + ring + 0.08, 2.98, 2.98, x, 3.4, 2)], "Trim", axis="y", sides=30)
        for sx, sy in ((-2.0, -3.4), (2.0, -3.4), (-2.0, 3.4), (2.0, 3.4)):
            camp.rod((x + sx, y + sy, 0), (x + sx * 0.8, y + sy, 2), 0.14, "Frame", sides=8)
            camp.loft([S(0.0, 0.6, 0.6, x + sx, y + sy, 2.4), S(0.14, 0.4, 0.4, x + sx, y + sy, 2.4)], "Trim", sides=14)
    camp.rod((camp_x + 1.8, camp_y + 3.6, 3.4), (camp_x + 12.0, camp_y + 6.6, 3.4), 0.9, "Pale", sides=14)
    camp.rod((camp_x + 1.8, camp_y + 11.4, 3.4), (camp_x + 12.0, camp_y + 8.0, 3.4), 0.9, "Pale", sides=14)
    base.add(camp, bevel=0.03)

    # A mast, a dish, solar wings and fuel: the things a camp is really made of.
    gear = Hull("CampGear")
    mast_x, mast_y = 34.0, 40.0
    for sx, sy in ((-1.6, -1.6), (1.6, -1.6), (1.6, 1.6), (-1.6, 1.6)):
        gear.rod((mast_x + sx, mast_y + sy, 0), (mast_x + sx * 0.2, mast_y + sy * 0.2, 22), 0.1, "Steel", sides=6)
    for level in range(1, 11):
        z = level * 2
        spread = 1.6 * (1 - z / 27)
        for a, b in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            gear.rod((mast_x + a[0] * spread, mast_y + a[1] * spread, z), (mast_x + b[0] * spread, mast_y + b[1] * spread, z), 0.05, "Steel", sides=5)
    gear.rod((mast_x, mast_y, 22), (mast_x, mast_y, 26), 0.08, "Steel", sides=8)
    gear.loft([S(23.0, 0.3, 0.3, mast_x, mast_y - 1.4, 2), S(23.6, 2.1, 2.1, mast_x, mast_y - 2.2, 2), S(23.9, 2.5, 2.5, mast_x, mast_y - 2.6, 2)], "Pale", sides=24, caps=False)
    for index in range(3):
        y = -30 + index * 12
        gear.rod((-46, y, 3.2), (-34, y, 3.2), 2.2, "Pale", sides=20)
        for x in (-44, -36):
            gear.rod((x, y - 1.6, 0), (x, y, 2), 0.14, "Frame", sides=8)
            gear.rod((x, y + 1.6, 0), (x, y, 2), 0.14, "Frame", sides=8)
    for row in range(4):
        for column in range(3):
            x = 26 + column * 2.9
            y = -36 + row * 2.9
            height = 1.8 + ((row * 3 + column) % 3) * 0.6
            gear.block((x, y, 0), (x + 2.5, y + 2.5, height), "Red" if (row + column) % 5 == 0 else "Trim")
    base.add(gear, bevel=0.02)

    solar = Hull("Solar")
    for index in range(5):
        x = 62 + index * 7
        solar.rod((x, -18, 0), (x, -18, 3.2), 0.12, "Steel", sides=8)
        solar.block((x - 3, -26, 3.2), (x + 3, -10, 3.32), "Frame")
    base.add(solar, bevel=0.01)

    lights = part("Glow", (0, 0, 0), "Base")
    lamps = Hull("Lamps")
    for index in range(8):
        turn = math.radians(index * 45 + 22.5)
        x, y = math.cos(turn) * 22.5, math.sin(turn) * 22.5
        lamps.block((x - 0.26, y - 0.26, 0.31), (x + 0.26, y + 0.26, 0.42), "Lamp")
    lights.add(lamps, bevel=0)
    return [base, lights]


parts = {"heron": build_heron, "raider": build_raider, "base": build_base}[SHIP]()
objects = {item.name: item.build() for item in parts}
triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in objects.values())
print(SHIP, "parts", len(objects), "triangles", triangles, flush=True)

root = bpy.data.objects.new("Root", None)
collection.objects.link(root)
pivots = {item.name: item.pivot.copy() for item in parts}
for item in parts:
    obj = objects[item.name]
    obj.parent = root if item.parent == "Root" else objects[item.parent]
    if item.parent in pivots:
        obj.location = item.pivot - pivots[item.parent]
    for skin in [o for o in collection.objects if o.name.startswith(f"{item.name}_Print")]:
        skin.parent = obj
        skin.location = (0, 0, 0)

if MODE == "preview":
    out = os.path.abspath(args[3])
    degrees = float(args[4]) if len(args) > 4 else 215
    height = float(args[5]) if len(args) > 5 else 9
    angle = math.radians(degrees)
    reach = 62 if SHIP == "heron" else 24
    add_camera(scene, (math.sin(angle) * reach, -math.cos(angle) * reach, height), (0, 0, 4 if SHIP == "heron" else 0), lens=50)
    use_gpu(scene, 48)
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 6
    sun.angle = math.radians(0.54)
    sun_object = bpy.data.objects.new("Sun", sun)
    sun_object.rotation_euler = (math.radians(66), 0, math.radians(120))
    collection.objects.link(sun_object)
    world = bpy.data.worlds.new("Space")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.02, 0.026, 1)
    scene.world = world
    if SHIP == "heron":
        bpy.ops.mesh.primitive_plane_add(size=400)
        ground = bpy.context.object
        soil = bpy.data.materials.new("Regolith")
        soil.use_nodes = True
        soil.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*REGOLITH, 1)
        ground.data.materials.append(soil)
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("Rendered", out, flush=True)

if MODE == "bake":
    size = int(args[3]) if len(args) > 3 else 2048
    samples = int(args[4]) if len(args) > 4 else 12
    use_gpu(scene, samples, denoise=False)
    scene.cycles.max_bounces = 2
    glowing_parts = {"Glow"}
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
    painted = [M[key] for key in ("Paint", "Trim", "Pale", "Red", "Frame", "Steel", "Rubber")]
    bake_pass(f"{SHIP}-albedo", size, "EMIT", solid, painted, BUILD, False, "Base Color")
    bake_pass(f"{SHIP}-rough", size, "EMIT", solid, painted, BUILD, True, "Roughness")
    bake_pass(f"{SHIP}-metal", size, "EMIT", solid, painted, BUILD, True, "Metallic")
    bake_pass(f"{SHIP}-normal", size, "NORMAL", solid, painted, BUILD, True)
    bake_pass(f"{SHIP}-ao", size // 2, "AO", solid, painted, BUILD, True)
    for obj in collection.objects:
        obj.hide_render = False
        if obj.type == "MESH" and "_Print" not in obj.name and obj.name not in glowing_parts:
            for layer in [layer for layer in obj.data.uv_layers if layer.name != "Bake"]:
                obj.data.uv_layers.remove(layer)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(ROOT, f"public/2090/{SHIP}.glb"),
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
    print("Exported", SHIP, flush=True)

"""
The motorcycles of /3d: a supercharged track bike, drawn from photographs of one. 1,450 mm
wheelbase, 24.5 degrees of rake, 103 mm of trail, 17-inch wheels. Its shape and colours are copied.
It wears three real names and no other mark: see moto_marks.py. They're separate objects, named
`Marks*`, so hiding `Marks` leaves clean surface. Set MOTO_NO_MARKS=1 to render a shot without them.

    blender --background --python scripts/blender/build_moto.py -- <repo root> preview <out.png> [degrees] [height] [lens] [target y] [target z] [samples]
    blender --background --python scripts/blender/build_moto.py -- <repo root> shot <out.png> <view> [samples] [width] [white|studio]
    blender --background --python scripts/blender/build_moto.py -- <repo root> export public/moto/fang.glb

Needs the maps from scripts/moto_tyres.py. Exporting also writes src/content/moto-bike.json, the
places other parts of the game need to know: the exhaust tip, the lamps, the grips, the pegs, the seat.
"""

import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import add_area, add_camera, script_args, use_gpu  # noqa: E402
from moto_kit import Part, bolt, circle, extrude, frame_for, lathe, loft, ring_of, rounded, tube  # noqa: E402
from moto_body import PLACES, bodywork, controls  # noqa: E402
from moto_engine import engine, exhaust, final_drive, frame, slab, subframe  # noqa: E402
from moto_engine import PLACES as ENGINE_PLACES  # noqa: E402
from moto_marks import marks  # noqa: E402
from moto_paint import Graph, brushed, carbon, cast, heat_tinted, plain, rubber, weave_images  # noqa: E402
from moto_spec import AHEAD, AXIS, FORK_OFFSET, FORK_X, FRONT_AXLE, FRONT_R, REAR_AXLE, REAR_R, SWING_PIVOT, X, on_axis  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "preview"
BUILD = os.path.join(ROOT, "assets-source/moto/build")
os.makedirs(BUILD, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
collection = scene.collection


def load_image(name, colour_space):
    image = bpy.data.images.load(os.path.join(BUILD, name))
    image.colorspace_settings.name = colour_space
    return image


def radiator_core():
    """Thousands of folded fins are a surface, not geometry: tight ridges up the core."""
    g = Graph("Radiator").set(colour=(0.03, 0.03, 0.032), metal=0.9, rough=0.5)
    coords = g.node("ShaderNodeTexCoord")
    wave = g.node("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X")
    wave.inputs["Scale"].default_value = 330
    wave.inputs["Distortion"].default_value = 0
    g.link(coords.outputs["Object"], wave.inputs["Vector"])
    bump = g.node("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 0.003
    g.link(wave.outputs["Fac"], bump.inputs["Height"])
    g.link(bump.outputs[0], g.bsdf.inputs["Normal"])
    return g.material


def fading(name, colour, **more):
    """A finish whose brightness comes down through the panel's vertex colour."""
    material = plain(name, colour, **more)
    tree = material.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    shade = tree.nodes.new("ShaderNodeVertexColor")
    shade.layer_name = "Col"
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["A"].default_value = (*colour, 1)
    tree.links.new(shade.outputs["Color"], mix.inputs["B"])
    tree.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    return material


weave = weave_images(BUILD)
M = {
    # The real bike's mirror coating: chrome so dark it reads as black glass until light crosses it.
    "Chrome": fading("Chrome", (0.24, 0.245, 0.26), rough=0.18, metal=1.0),
    "Silver": fading("Silver", (0.3, 0.303, 0.318), rough=0.55, metal=0.35),
    "Black": plain("Black", (0.012, 0.012, 0.014), rough=0.42, coat=0.4, coat_rough=0.32),
    "FrameGreen": plain("FrameGreen", (0.2, 0.53, 0.012), rough=0.36, metal=0.25, coat=0.6, coat_rough=0.22),
    "Impeller": plain("Impeller", (0.55, 0.012, 0.016), rough=0.36, metal=0.6, coat=0.4, coat_rough=0.25),
    "Pinstripe": plain("Pinstripe", (0.18, 0.55, 0.02), rough=0.4),
    "Mark": plain("Mark", (0.62, 0.62, 0.6), rough=0.6),
    "Carbon": carbon("Carbon", weave),
    "Rim": plain("Rim", (0.012, 0.012, 0.014), rough=0.36, metal=0.4, coat=0.5, coat_rough=0.25),
    "TyreFront": rubber("TyreFront", (load_image("tyre-front-albedo.png", "sRGB"), load_image("tyre-front-normal.png", "Non-Color"))),
    "TyreRear": rubber("TyreRear", (load_image("tyre-rear-albedo.png", "sRGB"), load_image("tyre-rear-normal.png", "Non-Color"))),
    "Disc": brushed("Disc", (0.42, 0.42, 0.43), rough=0.32, grain=1800),
    "Carrier": brushed("Carrier", (0.05, 0.05, 0.055), rough=0.32),
    "Gold": plain("Gold", (0.72, 0.56, 0.3), rough=0.26, metal=1.0),
    "Anodised": brushed("Anodised", (0.02, 0.02, 0.023), rough=0.28),
    "Alloy": brushed("Alloy", (0.5, 0.5, 0.51), rough=0.3),
    "Stainless": brushed("Stainless", (0.62, 0.62, 0.63), rough=0.3),
    "Cast": cast("Cast", (0.3, 0.3, 0.31), rough=0.44),
    "Magnesium": cast("Magnesium", (0.06, 0.06, 0.066), rough=0.44),
    "Arm": cast("Arm", (0.03, 0.03, 0.034), rough=0.5, scale=1400),
    "Caliper": cast("Caliper", (0.05, 0.05, 0.055), rough=0.4, scale=1800),
    "Steel": plain("Steel", (0.6, 0.6, 0.61), rough=0.26, metal=1.0),
    "Bolt": plain("Bolt", (0.5, 0.5, 0.52), rough=0.3, metal=1.0),
    "Spring": plain("Spring", (0.5, 0.02, 0.03), rough=0.32, coat=1.0, coat_rough=0.1),
    "Rubber": plain("Rubber", (0.012, 0.012, 0.012), rough=0.7),
    "Plastic": cast("Plastic", (0.014, 0.014, 0.016), rough=0.56, metal=0.0, scale=2600),
    "Chain": plain("Chain", (0.3, 0.3, 0.31), rough=0.36, metal=1.0),
    "Grille": plain("Grille", (0.1, 0.1, 0.105), rough=0.4, metal=1.0),
    "Radiator": radiator_core(),
    "Seat": cast("Seat", (0.006, 0.006, 0.0065), rough=0.72, metal=0.0, scale=5200),
    "Screen": plain("Screen", (0.72, 0.74, 0.75), rough=0.03, transmission=1.0, ior=1.2),
    "Lens": plain("Lens", (0.9, 0.9, 0.92), rough=0.02, transmission=1.0, ior=1.5),
    "Reflector": plain("Reflector", (0.7, 0.7, 0.72), rough=0.12, metal=1.0),
    "Lamp": plain("Lamp", (1, 1, 1), emission=(1, 0.95, 0.88), glow=9.0),
    "TailLamp": plain("TailLamp", (0.5, 0.01, 0.01), rough=0.2, emission=(1, 0.03, 0.02), glow=5.0),
    "Dash": plain("Dash", (0.01, 0.01, 0.012), rough=0.08, emission=(0.8, 0.12, 0.12), glow=0.6),
    "Titanium": heat_tinted(
        "Titanium",
        [(0.0, (0.42, 0.33, 0.24)), (0.2, (0.5, 0.38, 0.24)), (0.42, (0.56, 0.48, 0.38)), (0.7, (0.6, 0.58, 0.56))],
        length=1.3,
    ),
}

# ── wheels ───────────────────────────────────────────────────────────────────────────────────


def tyre_profile(rim_half, width, height, bead=0.2159):
    """Bead to bead: a tight sidewall running into a round, sporty crown."""
    crown = width * 0.6
    outer = bead + height
    half = []
    # Crown, from the centre out to the shoulder.
    reach = math.asin(min(width * 0.47 / crown, 0.98))
    for t in np.linspace(0, reach, 26):
        half.append((outer - crown + crown * math.cos(t), crown * math.sin(t)))
    r0, x0 = half[-1]
    # Sidewall: a curve from the shoulder back in to the bead.
    for t in np.linspace(0, 1, 16)[1:]:
        a, b, c = np.array([r0, x0]), np.array([bead + height * 0.22, width * 0.5]), np.array([bead + 0.004, rim_half + 0.004])
        half.append(tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c))
    full = [(r, -x) for r, x in reversed(half[1:])] + half
    return full


def rim_profile(width):
    """One closed section of the rim, wound so its faces look outward."""
    half = width / 2 + 0.0055
    r = 0.2159
    top = [
        (r + 0.0125, half),
        (r + 0.0135, half - 0.0025),
        (r + 0.0115, half - 0.0055),
        (r + 0.002, half - 0.0085),
        (r + 0.0005, half - 0.018),
        (r - 0.012, half - 0.026),
        (r - 0.019, half * 0.34),
        (r - 0.019, 0),
    ]
    outer = top + [(a, -b) for a, b in reversed(top[:-1])]
    under = [(a - 0.0055, b * 0.96) for a, b in outer[1:-1]]
    return list(reversed(outer + list(reversed(under)) + [outer[0]]))


def pinstripe(part, axle, width):
    """The thin green line round the inside of the rim's lip, on both sides."""
    half = width / 2 + 0.0055
    r = 0.2159
    outer_r, inner_r = r + 0.0022, r - 0.0026
    near, far = 0.96 * (half - 0.0063), 0.96 * (half - 0.0082)
    lathe(part, "Pinstripe", [(inner_r, far), (outer_r, near)], axle, X, segments=128)
    lathe(part, "Pinstripe", [(outer_r, -near), (inner_r, -far)], axle, X, segments=128)


def spokes(part, centre, hub, rim, offset, count=5, stem=0.28, spread=0.3, wide=0.02, deep=0.019):
    """Forged star spokes: a stem off the hub that splits into two straight arms out to the rim."""
    c = np.array(centre, float)
    steps = 18
    sides = 12
    angles = np.linspace(0, math.tau, sides, endpoint=False)
    ca, sa = np.cos(angles), np.sin(angles)
    power = 0.55
    sx = np.sign(ca) * np.abs(ca) ** power
    sy = np.sign(sa) * np.abs(sa) ** power
    for k in range(count):
        base = k * math.tau / count + math.pi / 2
        for sign in (-1, 1):
            rings = []
            for i in range(steps):
                t = i / (steps - 1)
                radius = hub + (rim - hub) * t
                split = min(max((t - stem) / (1 - stem), 0.0), 1.0)
                angle = base + sign * spread * split**0.8
                w = wide * (1 - 0.52 * t) * (1.0 if t > stem else 1 + 0.25 * (stem - t) / stem)
                d = deep * (1 - 0.5 * t)
                radial = np.array([0, math.cos(angle), math.sin(angle)])
                tangent = np.array([0, -math.sin(angle), math.cos(angle)])
                at = c + radial * radius + np.array([offset * (1 - t), 0, 0])
                # Before the split the two arms lie side by side as one stem.
                shift = tangent * sign * w * 0.5 * (1 - split) if t < stem * 1.8 else 0
                rings.append(at + shift + sx[:, None] * tangent * w + sy[:, None] * np.array([1.0, 0, 0]) * d)
            loft(part, "Rim", rings)


def disc(part, centre, radius, inner, side, holes=3):
    """A floating disc: a steel ring drilled for cooling, hung off a black carrier on bobbins."""
    thickness = 0.0052
    c = np.array(centre, float)
    t = np.linspace(0, math.tau, 300, endpoint=False)
    outer = np.stack([radius * np.cos(t), radius * np.sin(t)], axis=1)
    drill = []
    columns = 24
    for k in range(columns):
        base = k / columns * math.tau
        for row in range(holes):
            r = inner + 0.0095 + (radius - inner - 0.019) * (row + 0.5) / holes
            a = base + row * 0.085
            drill.append(circle(0.0041, (r * math.cos(a), r * math.sin(a)), count=10))
    inner_ring = circle(inner, count=160)
    x = c[0] - thickness / 2
    extrude(part, "Disc", outer, thickness, (x, c[1], c[2]), (0, 1, 0), (0, 0, 1), holes=[inner_ring, *drill], chamfer=0.0004)

    # Carrier: machined from one plate, with windows between thin arms.
    spoke_count = 6
    windows = []
    for k in range(spoke_count):
        a = k / spoke_count * math.tau
        spread = math.tau / spoke_count * 0.36
        near, far = 0.05, inner - 0.011
        windows.append(
            rounded(
                [
                    (near * math.cos(a - spread * 0.62), near * math.sin(a - spread * 0.62), 0.006),
                    (far * math.cos(a - spread), far * math.sin(a - spread), 0.009),
                    (far * math.cos(a + spread), far * math.sin(a + spread), 0.009),
                    (near * math.cos(a + spread * 0.62), near * math.sin(a + spread * 0.62), 0.006),
                ],
                step=0.003,
            )
        )
    extrude(part, "Carrier", circle(inner + 0.0035, count=140), 0.0045, (x + 0.0004, c[1], c[2]), (0, 1, 0), (0, 0, 1), holes=[circle(0.03, count=48), *windows], chamfer=0.0006)
    for at in ring_of(c, X, inner + 0.0015, spoke_count * 2, math.tau / (spoke_count * 4)):
        lathe(part, "Steel", [(0.0, -0.0042), (0.0058, -0.0042), (0.0058, 0.0042), (0.0, 0.0042)], at, X, segments=14)
    for at in ring_of(c, X, 0.04, spoke_count):
        bolt(part, at + np.array([side * 0.004, 0, 0]), (side, 0, 0), size=0.0036)


def caliper(part, centre, angle, side, disc_radius):
    """A radial monobloc, machined from one billet: dark, and with nothing written on it."""
    a0, a1 = angle - 0.34, angle + 0.34
    outer, inner = disc_radius + 0.021, disc_radius - 0.044
    steps = 18
    arc = [(outer * math.cos(t), outer * math.sin(t)) for t in np.linspace(a0, a1, steps)]
    arc += [(inner * math.cos(t), inner * math.sin(t)) for t in np.linspace(a1, a0, steps)]
    outline = rounded([(*arc[0], 0.011), (*arc[steps // 2], 0.0), (*arc[steps - 1], 0.011), (*arc[steps], 0.011), (*arc[steps + steps // 2], 0.0), (*arc[-1], 0.011)], step=0.003)
    c = np.array(centre, float)
    width = 0.056
    x = c[0] - width / 2
    # Two halves of the billet and a bridge across the top of the disc.
    for start, depth in ((x, 0.0205), (x + width - 0.0205, 0.0205)):
        extrude(part, "Caliper", outline, depth, (start, c[1], c[2]), (0, 1, 0), (0, 0, 1), chamfer=0.0022)
    bridge = rounded([(*arc[1], 0.004), (*arc[steps - 2], 0.004), ((disc_radius + 0.008) * math.cos(a1 - 0.05), (disc_radius + 0.008) * math.sin(a1 - 0.05), 0.004), ((disc_radius + 0.008) * math.cos(a0 + 0.05), (disc_radius + 0.008) * math.sin(a0 + 0.05), 0.004)], step=0.003)
    extrude(part, "Caliper", bridge, width - 0.03, (x + 0.015, c[1], c[2]), (0, 1, 0), (0, 0, 1), chamfer=0.001)
    # Piston bores on the outer face, and the pad pins.
    for t in (angle - 0.17, angle + 0.17):
        r = disc_radius - 0.012
        at = c + np.array([side * (width / 2 - 0.0002), r * math.cos(t), r * math.sin(t)])
        lathe(part, "Anodised", [(0.0165, 0.0), (0.0165, 0.0012), (0.0145, 0.0015), (0.0, 0.0015)], at, (side, 0, 0), segments=28)
    for t in (angle - 0.27, angle, angle + 0.27):
        r = outer - 0.007
        at = c + np.array([side * (width / 2), r * math.cos(t), r * math.sin(t)])
        bolt(part, at, (side, 0, 0), size=0.0034)


def wheel(part, axle, rim_width, tyre_width, tyre_height, material, half_hub, offset=0.0):
    lathe(part, "Rim", rim_profile(rim_width), axle, X, segments=128)
    lathe(part, material, tyre_profile(rim_width / 2, tyre_width, tyre_height), axle, X, segments=160, fit=True)
    pinstripe(part, axle, rim_width)
    hub = [(0.016, half_hub), (0.016, -half_hub), (0.028, -half_hub), (0.03, -half_hub + 0.003), (0.05, -half_hub * 0.5), (0.05, half_hub * 0.5), (0.03, half_hub - 0.003), (0.028, half_hub), (0.016, half_hub)]
    lathe(part, "Rim", hub, axle + np.array([offset, 0, 0]), X, segments=64)
    spokes(part, axle, 0.04, 0.2005, offset)
    # The axle nut, on its own in the middle of the clean side.
    lathe(part, "Steel", [(0.0, -half_hub - 0.012), (0.024, -half_hub - 0.012), (0.026, -half_hub - 0.008), (0.026, -half_hub), (0.0, -half_hub)], axle + np.array([offset, 0, 0]), X, segments=6)
    # Valve, because it's there on a real one.
    tube(part, "Steel", [axle + np.array([0.0, 0.0, 0.2]), axle + np.array([0.012, 0.012, 0.183])], 0.0028, sides=8, smooth=False)


# ── the front end ────────────────────────────────────────────────────────────────────────────

FORK_TOP = 1.088  # Up the steering axis, the top of the fork caps.
FORK_COLLAR = 0.535  # Where the gold outer tube ends in its seal.
TOP_YOKE, BOTTOM_YOKE = 1.046, 0.862


def fork_leg(steer, lower, side):
    x = side * FORK_X
    top = on_axis(FORK_TOP, FORK_OFFSET) + np.array([x, 0, 0])
    collar = on_axis(FORK_COLLAR, FORK_OFFSET) + np.array([x, 0, 0])
    up = AXIS
    length = FORK_TOP - FORK_COLLAR
    # The outer tube: gold, up in the clamps, down to its seal and a sharp collar.
    lathe(
        steer,
        "Gold",
        [(0.0, 0.0), (0.0285, 0.0), (0.0285, 0.03), (0.027, 0.033), (0.027, length - 0.078), (0.0295, length - 0.074), (0.0295, length - 0.032), (0.0265, length - 0.028), (0.0265, length - 0.014), (0.0235, length - 0.01), (0.0235, length)],
        collar,
        up,
        segments=48,
    )
    # Preload and damping: a green cap, with two small gold adjusters in it.
    lathe(steer, "FrameGreen", [(0.0235, -0.012), (0.0265, -0.01), (0.0265, 0.006), (0.0235, 0.0085), (0.012, 0.0085), (0.0, 0.0085)], top, up, segments=28)
    for k in (-1, 1):
        at = top + up * 0.0085 + np.array([0.0, -0.009 * k, 0.0])
        lathe(steer, "Gold", [(0.0054, 0.0), (0.0054, 0.0048), (0.0048, 0.006), (0.0, 0.006)], at, up, segments=10)
    # The inner tube: dark, slim and hard-coated.
    lathe(lower, "Anodised", [(0.0215, -0.24), (0.0215, 0.05)], collar, up, segments=40)
    # Axle clamp: dark, machined, with its pinch bolts and the radial caliper lugs.
    base = FRONT_AXLE + np.array([x, 0, 0])
    foot_top = base + up * 0.118
    lathe(lower, "Caliper", [(0.0, -0.128), (0.0245, -0.122), (0.0295, -0.1), (0.0295, -0.012), (0.0275, -0.004), (0.0215, 0.002)], foot_top, up, segments=36)
    lathe(lower, "Caliper", [(0.0, -0.032), (0.0225, -0.032), (0.0255, -0.028), (0.0255, 0.028), (0.0225, 0.032), (0.0, 0.032)], base, X, segments=32)
    lathe(lower, "Steel", [(0.016, 0.032), (0.012, 0.0335), (0.0, 0.0335)], base, (side, 0, 0), segments=20)
    behind = -AHEAD
    for k in (0.006, 0.112):
        lug = base + up * k + behind * 0.0265
        tube(lower, "Caliper", [lug - behind * 0.03, lug + behind * 0.04], 0.0105, sides=14, smooth=False)
        lathe(lower, "Steel", [(0.0078, 0.0), (0.0078, 0.008), (0.0065, 0.0095), (0.0, 0.0095)], lug + behind * 0.04, behind, segments=6)
    for k in (0.03, 0.05):
        bolt(lower, base + up * (0.036 + k) + np.array([side * 0.0295, 0, 0]), (side, 0, 0), size=0.0035)
    # The brake line, down the back of the leg to the caliper, with a banjo at the end.
    line_top = collar + AHEAD * -0.03 + np.array([side * 0.018, 0, 0])
    tube(lower, "Rubber", [line_top, line_top - up * 0.08 + np.array([side * 0.012, 0, 0]), base + up * 0.13 + behind * 0.075 + np.array([side * -0.03, 0, 0])], 0.0032, sides=8)


def triple_clamps(steer):
    outline = [(-0.14, 0.012, 0.02), (-0.14, -0.038, 0.03), (0.0, -0.062, 0.02), (0.14, -0.038, 0.03), (0.14, 0.012, 0.02), (0.05, 0.05, 0.02), (-0.05, 0.05, 0.02)]
    for s, thick in ((TOP_YOKE, 0.024), (BOTTOM_YOKE, 0.034)):
        origin = on_axis(s, 0.0)
        forks = [circle(0.0278, (side * FORK_X, -FORK_OFFSET), count=40) for side in (-1, 1)]
        stem = circle(0.0145, (0, 0), count=28)
        # In the plane square to the steering axis: ex across the bike, ey backward.
        ey = -AHEAD
        extrude(steer, "Anodised", rounded([(x, -y, r) for x, y, r in outline], step=0.003), thick, origin, (1, 0, 0), ey, holes=[*forks, stem], chamfer=0.0016)
        if s == TOP_YOKE:
            for side in (-1, 1):
                pocket = rounded([(side * 0.03, 0.03, 0.006), (side * 0.03, -0.012, 0.006), (side * 0.07, -0.022, 0.006), (side * 0.07, 0.03, 0.006)], step=0.003)
                extrude(steer, "Carrier", pocket, 0.0016, origin + AXIS * (thick - 0.0002), (1, 0, 0), ey, chamfer=0.0003)
                bolt(steer, origin + AXIS * 0.012 + np.array([side * 0.1395, 0, 0]) + ey * 0.031, (side, 0, 0), size=0.0042)
            lathe(steer, "Alloy", [(0.0185, 0.0), (0.0185, 0.01), (0.017, 0.012), (0.0, 0.012)], origin + AXIS * thick, AXIS, segments=6)


# ── the back end ─────────────────────────────────────────────────────────────────────────────


def swingarm(part):
    """
    One-sided, on the left: a big cast arm that wraps round the chain, with a window in it, reaching
    back to the hub. It's cast in layers, which is what makes it look solid and deep.
    """
    silhouette = [
        (0.118, 0.47, 0.03),
        (0.165, 0.525, 0.03),
        (0.3, 0.585, 0.04),
        (0.385, 0.612, 0.02),
        (0.47, 0.606, 0.03),
        (0.6, 0.54, 0.05),
        (0.7, 0.5, 0.03),
        (0.74, 0.468, 0.02),
        (0.81, 0.4, 0.05),
        (0.83, 0.3, 0.05),
        (0.79, 0.215, 0.05),
        (0.705, 0.2, 0.04),
        (0.615, 0.222, 0.03),
        (0.52, 0.29, 0.02),
        (0.455, 0.335, 0.01),
        (0.4, 0.348, 0.03),
        (0.33, 0.342, 0.03),
        (0.27, 0.365, 0.03),
        (0.2, 0.385, 0.03),
        (0.13, 0.405, 0.03),
    ]
    window = rounded([(0.478, 0.455, 0.008), (0.545, 0.478, 0.012), (0.495, 0.505, 0.008)], step=0.003)
    lightening = rounded([(0.538, 0.31, 0.006), (0.6, 0.262, 0.006), (0.605, 0.345, 0.008)], step=0.003)
    inner = 0.098
    slab(part, "Arm", silhouette, inner, inner + 0.018, chamfer=0.006, holes=[window, lightening])

    # The outer skin, in pieces, so the chain runs inside it: the bridge in the middle, the top
    # branch out to the hub, and the triangle below.
    bridge = [(0.335, 0.598, 0.012), (0.385, 0.612, 0.02), (0.47, 0.606, 0.02), (0.462, 0.47, 0.012), (0.455, 0.335, 0.01), (0.4, 0.348, 0.02), (0.335, 0.342, 0.012), (0.325, 0.47, 0.02)]
    slab(part, "Arm", bridge, 0.108, 0.158, chamfer=0.007)
    plate = [(0.35, 0.585, 0.008), (0.45, 0.59, 0.008), (0.45, 0.36, 0.008), (0.385, 0.365, 0.008), (0.345, 0.42, 0.008)]
    slab(part, "Magnesium", plate, 0.158, 0.1625, chamfer=0.0016)
    branch = [(0.44, 0.61, 0.01), (0.47, 0.606, 0.02), (0.6, 0.54, 0.05), (0.7, 0.5, 0.02), (0.742, 0.466, 0.01), (0.7, 0.462, 0.01), (0.6, 0.492, 0.03), (0.5, 0.545, 0.03), (0.44, 0.555, 0.01)]
    slab(part, "Arm", branch, 0.116, 0.158, chamfer=0.007)
    low = [(0.455, 0.335, 0.008), (0.52, 0.348, 0.01), (0.585, 0.335, 0.01), (0.615, 0.222, 0.012), (0.575, 0.238, 0.01), (0.52, 0.285, 0.012)]
    slab(part, "Arm", low, 0.112, 0.15, chamfer=0.006)
    # The front block, ahead of the bridge, and the right leg that reaches round the tyre.
    nose = [(0.135, 0.5, 0.02), (0.165, 0.525, 0.03), (0.33, 0.59, 0.02), (0.335, 0.52, 0.02), (0.2, 0.53, 0.02)]
    slab(part, "Arm", nose, 0.1, 0.15, chamfer=0.006)
    under = [(0.13, 0.425, 0.02), (0.335, 0.41, 0.02), (0.335, 0.342, 0.02), (0.27, 0.365, 0.02), (0.2, 0.385, 0.02)]
    slab(part, "Arm", under, 0.1, 0.15, chamfer=0.006)
    leg = [(0.135, 0.5, 0.03), (0.33, 0.56, 0.03), (0.37, 0.53, 0.03), (0.37, 0.4, 0.03), (0.33, 0.38, 0.03), (0.135, 0.43, 0.03)]
    slab(part, "Arm", leg, -0.135, -0.105, chamfer=0.007)
    brace = [(0.3, 0.56, 0.02), (0.37, 0.57, 0.02), (0.375, 0.39, 0.02), (0.3, 0.385, 0.02)]
    slab(part, "Arm", brace, -0.135, 0.11, chamfer=0.006)

    # The spindle, through the frame.
    lathe(part, "Steel", [(0.0, -0.17), (0.011, -0.17), (0.0135, -0.168), (0.0135, 0.168), (0.011, 0.17), (0.0, 0.17)], SWING_PIVOT, X, segments=20)
    for x_from, x_to in ((-0.138, -0.102), (0.098, 0.152)):
        lathe(part, "Arm", [(0.0, x_from), (0.032, x_from), (0.034, x_from + 0.003), (0.034, x_to - 0.003), (0.032, x_to), (0.0, x_to)], SWING_PIVOT, X, segments=32)

    # Fasteners, because the casting is bolted together.
    for y, z in ((0.47, 0.59), (0.375, 0.385), (0.445, 0.375), (0.44, 0.565), (0.36, 0.58)):
        bolt(part, np.array([0.1625, y, z]), (1, 0, 0), size=0.0048, washer=True)
    bolt(part, np.array([0.15, 0.51, 0.31]), (1, 0, 0), size=0.0052, washer=True)
    for y, z in ((0.6, 0.52), (0.68, 0.495)):
        bolt(part, np.array([0.158, y, z]), (1, 0, 0), size=0.0034)

    # The big housing that carries the wheel on its own, like a car's.
    axle = REAR_AXLE
    lathe(part, "Arm", [(0.0, 0.088), (0.09, 0.088), (0.094, 0.092), (0.094, 0.11), (0.09, 0.116), (0.0, 0.116)], axle, X, segments=64)
    for at in ring_of(axle + np.array([0.116, 0, 0]), X, 0.079, 8):
        bolt(part, at, (1, 0, 0), size=0.0036)


def rear_brake(body):
    """The rear brake's master cylinder and its little bottle, tucked on the right behind the frame."""
    at = np.array([-0.17, 0.2, 0.54])
    lathe(body, "Anodised", [(0.0, 0.0), (0.0125, 0.0), (0.0135, 0.003), (0.0135, 0.075), (0.0118, 0.078), (0.0, 0.078)], at, (0, 0.25, -1), segments=18)
    res = np.array([-0.172, 0.228, 0.585])
    lathe(body, "Lens", [(0.0, 0.0), (0.0135, 0.0), (0.0145, 0.003), (0.0145, 0.03), (0.0135, 0.033), (0.0, 0.033)], res, (0, 0, 1), segments=18)
    lathe(body, "Anodised", [(0.0, 0.033), (0.0155, 0.033), (0.0155, 0.043), (0.013, 0.046), (0.0, 0.046)], res, (0, 0, 1), segments=18)
    tube(body, "Rubber", [res, res + np.array([0.01, -0.02, -0.03]), at + np.array([0, 0.0, -0.02])], 0.0028, sides=8)


def shock(body, part):
    top = np.array([0, 0.205, 0.665])
    foot = np.array([0, 0.27, 0.44])
    way = (top - foot) / np.linalg.norm(top - foot)
    lathe(body, "Anodised", [(0.0, -0.13), (0.0185, -0.13), (0.0185, -0.112), (0.0235, -0.11), (0.024, 0.0), (0.024, 0.03), (0.0, 0.03)], top, way, segments=28)
    lathe(part, "Steel", [(0.0075, 0.0), (0.0075, 0.22)], foot, way, segments=16)
    lathe(part, "Anodised", [(0.0, 0.0), (0.015, 0.0), (0.021, 0.018), (0.021, 0.03), (0.0, 0.03)], foot, way, segments=20)
    # The spring, a real helix, between its two collars.
    turns = 5.5
    a, u, v = frame_for(way)
    t = np.linspace(0, 1, 200)
    start, end = foot + way * 0.034, top - way * 0.102
    helix = start + (end - start) * t[:, None] + 0.0295 * (np.cos(t * turns * math.tau)[:, None] * u + np.sin(t * turns * math.tau)[:, None] * v)
    tube(part, "FrameGreen", helix, 0.0053, sides=10, smooth=False)
    lathe(part, "Alloy", [(0.017, 0.0), (0.036, 0.0), (0.036, 0.009), (0.017, 0.009)], foot + way * 0.024, way, segments=32)
    lathe(body, "Alloy", [(0.0186, 0.0), (0.0365, 0.0), (0.0365, 0.012), (0.0186, 0.012)], end - way * 0.004, way, segments=32)


# ── assemble ─────────────────────────────────────────────────────────────────────────────────

# The pieces that move, each hung from the one that carries it, with its real pivot.
body = Part("Body")
steer = Part("Steering", on_axis(0.9), body)
fork = Part("ForkLower", on_axis(0.9), steer)
front_wheel = Part("FrontWheel", FRONT_AXLE, fork)
arm = Part("Swingarm", SWING_PIVOT, body)
rear_wheel = Part("RearWheel", REAR_AXLE, arm)

wheel(front_wheel, FRONT_AXLE, 0.0889, 0.122, FRONT_R - 0.2159, "TyreFront", 0.058)
wheel(rear_wheel, REAR_AXLE, 0.1524, 0.2, REAR_R - 0.2159, "TyreRear", 0.06, offset=0.04)
for side in (-1, 1):
    disc(front_wheel, FRONT_AXLE + np.array([side * 0.0705, 0, 0]), 0.165, 0.118, side)
    fork_leg(steer, fork, side)
    caliper(fork, FRONT_AXLE + np.array([side * 0.0705, 0, 0]), math.radians(34), side, 0.165)
triple_clamps(steer)
swingarm(arm)
shock(body, arm)
rear_brake(body)
frame(body)
subframe(body)
engine(body)
exhaust(body)
final_drive(arm, rear_wheel, body)
bodywork(body, steer, fork, arm)
controls(body, steer)

# The marks: one group, each piece hung from what it rides on, so one switch hides them all.
badges = Part("Marks", (0, 0, 0), body)
tank_badge = Part("MarksTank", (0, 0, 0), badges)
tail_badge = Part("MarksTail", (0, 0, 0), badges)
can_badge = Part("MarksSilencer", (0, 0, 0), badges)
marks(tank_badge, tail_badge, can_badge)

parts = [body, steer, fork, front_wheel, arm, rear_wheel, badges, tank_badge, tail_badge, can_badge]
for item in parts:
    item.build(M, collection, tidy=True, shaded=("Chrome", "Silver"))

# ── a studio to judge it in ──────────────────────────────────────────────────────────────────


def strip(name, location, target, long, wide, power, colour=(1, 1, 1)):
    add_area(scene, name, location, target, long, power, colour)
    lamp = bpy.data.lights[name]
    lamp.shape = "RECTANGLE"
    lamp.size = wide
    lamp.size_y = long


def studio():
    """A photographer's cove: seamless, dark, and lit with long strips, because paint is judged by what it reflects."""
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.004, 0.004, 0.005, 1)
    scene.world = world

    cove = Part("Cove")
    profile = [(0.0, 0.0), (7.0, 0.0), (8.2, 0.12), (9.4, 0.7), (10.2, 1.9), (10.4, 3.4), (10.4, 12.0)]
    smooth = []
    for a, b in zip(profile, profile[1:]):
        for t in np.linspace(0, 1, 12, endpoint=False):
            smooth.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    lathe(cove, "Cove", smooth + [profile[-1]], (0, 0, 0), (0, 0, 1), segments=96)
    cove.build({"Cove": plain("Cove", (0.024, 0.024, 0.027), rough=0.5, specular=0.2)}, collection, angle=80)

    strip("Top", (0, 0.1, 3.0), (0, 0.1, 0.5), 4.6, 0.8, 210, (1, 0.98, 0.95))
    strip("Key", (2.5, -1.7, 2.1), (0, -0.2, 0.75), 3.6, 0.42, 150, (1, 0.96, 0.92))
    strip("Rim", (-2.7, 1.2, 1.9), (0, 0.2, 0.7), 3.6, 0.42, 120, (0.84, 0.9, 1))
    strip("Kick", (1.6, 3.2, 1.3), (0, 0.4, 0.6), 2.4, 0.5, 90, (1, 0.9, 0.84))
    add_area(scene, "Fill", (0.6, -4.2, 0.9), (0, 0, 0.5), 2.6, 26, (1, 0.97, 0.94))


def white_room():
    """The white sweep the reference photographs were shot on, to judge the shape against them."""
    world = bpy.data.worlds.new("White")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world
    floor = Part("Floor")
    lathe(floor, "Floor", [(30.0, 0.0), (0.0, 0.0)], (0, 0, 0), (0, 0, 1), segments=8)
    floor.build({"Floor": plain("Floor", (0.9, 0.9, 0.9), rough=0.6)}, collection, angle=80)
    strip("Top", (0, 0.1, 3.0), (0, 0.1, 0.5), 3.6, 1.6, 90, (1, 1, 1))
    # Black flags either side, out of shot, the way a photographer shapes a shiny subject.
    flag = plain("Flag", (0.01, 0.01, 0.01), rough=0.9)
    for name, at, spin in (("FlagLeft", (3.5, 0, 0.75), (0, math.pi / 2, 0)), ("FlagRight", (-3.5, 0, 0.75), (0, math.pi / 2, 0)), ("FlagFront", (0, -4.5, 0.75), (math.pi / 2, 0, 0))):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(-1.5, -6, 0), (1.5, -6, 0), (1.5, 6, 0), (-1.5, 6, 0)], [], [(0, 1, 2, 3)])
        mesh.materials.append(flag)
        item = bpy.data.objects.new(name, mesh)
        collection.objects.link(item)
        item.location = at
        item.rotation_euler = spin
        item.visible_camera = False
        item.visible_shadow = False


def split_room():
    """The front photograph's light: one half of the world bright, the other nearly black, on white."""
    world = bpy.data.worlds.new("Split")
    world.use_nodes = True
    tree = world.node_tree
    out = tree.nodes["World Output"]
    coords = tree.nodes.new("ShaderNodeTexCoord")
    parts = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coords.outputs["Generated"], parts.inputs[0])
    fall = tree.nodes.new("ShaderNodeMapRange")
    fall.inputs["From Min"].default_value = -0.3
    fall.inputs["From Max"].default_value = 0.25
    fall.inputs["To Min"].default_value = 1.1
    fall.inputs["To Max"].default_value = 0.035
    tree.links.new(parts.outputs["X"], fall.inputs["Value"])
    lit = tree.nodes["Background"]
    lit.inputs[0].default_value = (1, 1, 1, 1)
    tree.links.new(fall.outputs[0], lit.inputs["Strength"])
    white = tree.nodes.new("ShaderNodeBackground")
    white.inputs[0].default_value = (1, 1, 1, 1)
    white.inputs[1].default_value = 1.0
    path = tree.nodes.new("ShaderNodeLightPath")
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
    tree.links.new(lit.outputs[0], mix.inputs[1])
    tree.links.new(white.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], out.inputs["Surface"])
    scene.world = world
    floor = Part("Floor")
    lathe(floor, "Floor", [(30.0, 0.0), (0.0, 0.0)], (0, 0, 0), (0, 0, 1), segments=8)
    floor.build({"Floor": plain("Floor", (0.9, 0.9, 0.9), rough=0.6)}, collection, angle=80)
    bpy.data.objects["Floor"].visible_camera = False
    for item in bpy.data.objects["Floor"].children:
        item.visible_camera = False


def backfaces():
    """Paints every face seen from behind red: a wound-the-wrong-way check, since the game culls them."""
    for material in M.values():
        tree = material.node_tree
        check = tree.nodes.new("ShaderNodeNewGeometry")
        red = tree.nodes.new("ShaderNodeEmission")
        red.inputs[0].default_value = (1, 0, 0, 1)
        mix = tree.nodes.new("ShaderNodeMixShader")
        out = next(n for n in tree.nodes if n.type == "OUTPUT_MATERIAL")
        surface = out.inputs["Surface"].links[0].from_socket
        tree.links.new(check.outputs["Backfacing"], mix.inputs[0])
        tree.links.new(surface, mix.inputs[1])
        tree.links.new(red.outputs[0], mix.inputs[2])
        tree.links.new(mix.outputs[0], out.inputs["Surface"])


def places():
    """What the rest of the game needs to know, in Blender's axes and in the model's."""
    found = {**PLACES, **ENGINE_PLACES}
    model = lambda p: [round(float(p[0]), 4), round(float(p[2]), 4), round(float(-p[1]), 4)]  # noqa: E731
    bike = {name: [round(float(v), 4) for v in value] for name, value in found.items()}
    return {"blender": bike, "model": {name: model(value) for name, value in found.items()}}


if MODE == "export":
    out = os.path.abspath(args[2])
    bpy.context.view_layer.update()
    counts = {}
    for item in collection.objects:
        if item.type == "MESH":
            item.data.calc_loop_triangles()
            material = item.data.materials[0].name if item.data.materials else "none"
            counts[material] = counts.get(material, 0) + len(item.data.loop_triangles)
    print("triangles", sum(counts.values()), sorted(counts.items(), key=lambda kv: -kv[1]), flush=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_materials="EXPORT",
        export_image_format="NONE",
        export_normals=True,
        export_texcoords=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=True,
        export_yup=True,
        export_apply=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print("Exported", out, flush=True)
    with open(os.path.join(ROOT, "src/content/moto-bike.json"), "w", encoding="utf8") as sheet:
        json.dump(places(), sheet, indent=2)
        sheet.write("\n")

if MODE == "cover":
    # The bike and its rider for the cover, on nothing, with their shadow: the street goes in behind.
    out = os.path.abspath(args[2])
    samples = int(args[3]) if len(args) > 3 else 256
    wide = int(args[4]) if len(args) > 4 else 2000
    build = os.path.join(ROOT, "assets-source/moto/build")
    turn = bpy.data.objects.new("BikeTurn", None)
    collection.objects.link(turn)
    for item in list(collection.objects):
        if item is not turn and item.parent is None:
            item.parent = turn
    turn.location = (0.05, -0.46, 0)
    turn.rotation_euler = (0, 0, math.radians(60))
    with bpy.data.libraries.load(os.path.join(build, "rider-cover.blend")) as (source, target):
        target.objects = source.objects
    for item in target.objects:
        collection.objects.link(item)
        # The figure was fitted for a chef's whites: leathers fit closer.
        if item.name == "Rider":
            item.scale.x = 0.88

    world = bpy.data.worlds.new("City")
    world.use_nodes = True
    tree = world.node_tree
    sky = tree.nodes.new("ShaderNodeTexEnvironment")
    sky.image = bpy.data.images.load(os.path.join(ROOT, "assets-source/moto/dl/hdri/modern_buildings_night.hdr"))
    tree.links.new(sky.outputs["Color"], tree.nodes["Background"].inputs["Color"])
    tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    scene.world = world

    strip("Lamp", (-2.8, -3.0, 3.8), (0, -0.3, 1.1), 2.6, 1.0, 210, (1, 0.74, 0.48))
    strip("Shop", (3.2, -2.6, 1.0), (0, -0.4, 0.9), 2.6, 1.6, 46, (1, 0.7, 0.44))
    strip("Back", (1.6, 3.0, 3.2), (0, 0, 1.2), 2.4, 0.8, 320, (0.86, 0.88, 1))
    strip("Paint", (0.4, -2.4, 3.4), (0.2, -0.6, 0.7), 3.2, 0.5, 62, (1, 0.88, 0.74))

    ground = bpy.data.meshes.new("Ground")
    ground.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("Ground", ground)
    collection.objects.link(floor)
    floor.is_shadow_catcher = True

    camera = add_camera(scene, (0.1, -5.6, 1.3), (0.1, -0.2, 0.98), lens=50)
    use_gpu(scene, samples)
    scene.cycles.max_bounces = 8
    scene.render.film_transparent = True
    scene.render.resolution_x = wide
    scene.render.resolution_y = wide * 9 // 16
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = out
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.context.view_layer.update()
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector

    neck = json.load(open(os.path.join(build, "cover-neck.json")))["neck"]
    at = world_to_camera_view(scene, camera, Vector(neck))
    above = world_to_camera_view(scene, camera, Vector(neck) + Vector((0, 0, 0.1)))
    json.dump({"neck": [at.x, 1 - at.y], "tenth": (above.y - at.y) * scene.render.resolution_y}, open(os.path.join(build, "cover-place.json"), "w"))
    bpy.ops.render.render(write_still=True)
    print("Rendered", out, flush=True)

if MODE == "shot":
    # shot <out.png> <view> [samples] [width] [white|split|studio]. The views match the reference
    # photographs, and left and right are orthographic at the side photo's own scale. A close-up is
    # "cam:x,y,z:tx,ty,tz:lens". Set MOTO_BACKFACES=1 to paint wrongly wound faces red.
    out = os.path.abspath(args[2])
    view = args[3]
    samples = int(args[4]) if len(args) > 4 else 48
    wide = int(args[5]) if len(args) > 5 else 1200
    room = args[6] if len(args) > 6 else "white"
    {"white": white_room, "split": split_room}.get(room, studio)()
    if os.environ.get("MOTO_BACKFACES"):
        backfaces()
    if os.environ.get("MOTO_NO_MARKS"):
        for item in collection.objects:
            if item.name.startswith("Marks"):
                item.hide_render = True
    tall = wide * 3 // 4
    if view in ("left", "right"):
        sign = 1 if view == "left" else -1
        camera = add_camera(scene, (sign * 6, 0.0175, 0.558), (0, 0.0175, 0.558))
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 1200 / 543
    elif view == "top":
        camera = add_camera(scene, (0, -0.0, 6.0), (0, -0.0, 0.8))
        camera.rotation_euler = (0, 0, math.pi)
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 2.09
        tall = wide * 16 // 9
    elif view == "front":
        camera = add_camera(scene, (0, -4.6, 1.14), (0, -0.8, 0.565), lens=92)
        tall = wide * 3 // 2
    elif view == "rear":
        camera = add_camera(scene, (0, 6.5, 1.0), (0, 0.8, 0.62), lens=110)
        tall = wide * 3 // 2
    elif view == "q34":
        camera = add_camera(scene, (-3.3, -3.6, 1.35), (0, -0.05, 0.56), lens=70)
        tall = wide
    elif view == "q34l":
        camera = add_camera(scene, (3.3, -3.6, 1.35), (0, -0.05, 0.56), lens=70)
        tall = wide
    elif view == "chase":
        camera = add_camera(scene, (1.2, 4.6, 2.0), (0, 0, 0.72), lens=60)
        tall = wide * 9 // 16
    else:
        _, at, to, lens = view.split(":")
        camera = add_camera(scene, tuple(float(v) for v in at.split(",")), tuple(float(v) for v in to.split(",")), lens=float(lens))
    use_gpu(scene, samples)
    scene.cycles.max_bounces = 6
    scene.render.resolution_x = wide
    scene.render.resolution_y = tall
    scene.render.filepath = out
    scene.view_settings.view_transform = "AgX" if room == "studio" else "Standard"
    if room == "studio":
        scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)
    print("Rendered", out, flush=True)

if MODE == "preview":
    studio()
    out = os.path.abspath(args[2])
    degrees = float(args[3]) if len(args) > 3 else 62
    height = float(args[4]) if len(args) > 4 else 0.85
    lens = float(args[5]) if len(args) > 5 else 70
    target_y = float(args[6]) if len(args) > 6 else 0.0
    target_z = float(args[7]) if len(args) > 7 else 0.52
    samples = int(args[8]) if len(args) > 8 else 96
    wide = int(args[9]) if len(args) > 9 else 1600
    reach = min(4.6 * lens / 70, 7.6)
    angle = math.radians(degrees)
    add_camera(scene, (math.sin(angle) * reach, target_y - math.cos(angle) * reach, height), (0, target_y, target_z), lens=lens)
    use_gpu(scene, samples)
    scene.cycles.max_bounces = 8
    scene.render.resolution_x = wide
    scene.render.resolution_y = wide * 9 // 16
    scene.render.filepath = out
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)
    print("Rendered", out, flush=True)

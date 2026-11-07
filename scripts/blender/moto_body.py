"""
The bike's bodywork and the things the rider touches. Imported by build_moto.py, never run.

It's drawn from side, front and top photographs of a 2015-era supercharged track bike: the shape
and the colours are that bike's. The bodywork itself carries no lettering: the marks are a separate
layer on top of it, in moto_marks.py. Coordinates are read straight off the photographs, in metres:
x across (the rider's left is +x), y along (the front is -y), z up.
"""

import math

import numpy as np

from moto_kit import bolt, extrude, lathe, rounded, tube
from moto_shell import rows_cage, shell
from moto_spec import AXIS, FORK_OFFSET, FORK_X, FRONT_AXLE, FRONT_R, REAR_AXLE, X, on_axis


PLACES = {}
SURFACES = {}
GRIP_IN = np.array([0.245, -0.447, 0.878])
GRIP_OUT = np.array([0.345, -0.395, 0.792])
PEG = (0.275, 0.345)
SEAT_Y = 0.3


def smooth(edge0, edge1, value):
    """A soft step from 0 to 1, for the fades in the paint."""
    t = np.clip((np.asarray(value, float) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def side_fairing(body):
    """
    The big angular flank, in two pieces the way the real one reads: an upper arm and front band that
    fold over the top of the bike, and a scooped lower body set back underneath them, so the line
    between them is a real step with a shadow in it. The paint fades from silver to black down it.
    """
    arm = {
        "u0": (0.205, -0.790, 0.795),
        "u1": (0.226, -0.700, 0.806),
        "u2": (0.245, -0.620, 0.814),
        "u3": (0.268, -0.530, 0.793),
        "u4": (0.285, -0.440, 0.767),
        "u5": (0.272, -0.312, 0.718),
        "m0": (0.236, -0.700, 0.746),
        "m1": (0.272, -0.600, 0.748),
        "m2": (0.296, -0.440, 0.738),
        "r1": (0.280, -0.400, 0.665),
        "g1": (0.290, -0.500, 0.685),
        "g2": (0.280, -0.600, 0.705),
        "g3": (0.260, -0.655, 0.722),
        "h1": (0.240, -0.600, 0.625),
        "h2": (0.226, -0.520, 0.520),
        "h3": (0.194, -0.440, 0.420),
        "f1": (0.192, -0.755, 0.765),
        "f2": (0.174, -0.645, 0.690),
        "f3": (0.175, -0.600, 0.605),
        "f4": (0.180, -0.520, 0.495),
        "f5": (0.175, -0.495, 0.455),
        "f6": (0.155, -0.420, 0.385),
        "f7": (0.125, -0.372, 0.295),
    }
    faces = [
        "u0 u1 m0 f1",
        "u1 u2 m1 m0",
        "u2 u3 m2 m1",
        "u3 u4 m2",
        "u4 u5 m2",
        "m2 u5 r1 g1",
        "m1 m2 g1 g2",
        "m0 m1 g2 g3",
        "f1 m0 g3 f2",
        "f2 g3 h1 f3",
        "f3 h1 h2 f4",
        "f4 h2 h3 f6 f5",
        "f6 h3 f7",
    ]
    # The fold along the top of the flank is crisp, and everything else is one soft sheet.
    fold = [((a, b), 0.8) for a, b in (("m0", "m1"), ("m1", "m2"), ("m2", "u5"), ("f1", "m0"))]

    def arm_fade(p):
        down = smooth(0.32, 0.72, p[:, 2])
        return 0.34 + 0.66 * down

    panel = shell(body, "Silver", arm, faces, crease=0.12, soft=fold, levels=3, thick=0.004, roll=0.0018, fade=arm_fade)
    panel.fasten(body, [(-0.635, 0.732), (-0.53, 0.722), (-0.45, 0.722)], size=0.0034)

    # The bright facet high on the flank: a mirrored inlay, cut to a long thin triangle.
    a, b, c = np.array([-0.622, 0.752]), np.array([-0.492, 0.778]), np.array([-0.426, 0.758])
    grid = []
    for s in np.linspace(0.05, 1.0, 7):
        grid.append([panel.side(*(a + (b - a) * s + (c - b) * s * w))[0] + np.array([0.0016, 0.0, 0.0]) for w in np.linspace(0.0, 1.0, 4)])
    points, faces = rows_cage(grid)
    shell(body, "Chrome", points, faces, crease=0.0, levels=0, thick=0.0, roll=0.0)

    scoop = {
        "g3": (0.248, -0.668, 0.730),
        "g2": (0.268, -0.600, 0.714),
        "g1": (0.278, -0.500, 0.694),
        "r1": (0.268, -0.392, 0.674),
        "r2": (0.262, -0.385, 0.550),
        "r3": (0.232, -0.360, 0.475),
        "r4": (0.170, -0.360, 0.340),
        "f7": (0.118, -0.368, 0.302),
        "h3": (0.182, -0.450, 0.428),
        "h2": (0.214, -0.530, 0.528),
        "h1": (0.228, -0.612, 0.632),
        "b1": (0.246, -0.520, 0.628),
        "b2": (0.230, -0.450, 0.520),
        "b3": (0.200, -0.400, 0.420),
    }
    faces = [
        "g3 g2 b1 h1",
        "g2 g1 b1",
        "g1 r1 r2 b2 b1",
        "h1 b1 b2 h2",
        "h2 b2 b3 h3",
        "b2 r2 r3 b3",
        "h3 b3 r4 f7",
        "b3 r3 r4",
    ]

    def scoop_fade(p):
        return 0.06 + 0.5 * smooth(0.42, 0.7, p[:, 2]) * smooth(-0.34, -0.62, p[:, 1])

    lower = shell(body, "Silver", scoop, faces, crease=0.1, levels=3, thick=0.003, roll=0.0014, fade=scoop_fade)
    lower.fasten(body, [(-0.47, 0.60), (-0.40, 0.46)], size=0.0034)


def carbon_duct(body):
    """The long carbon duct that carries the ram air back to the compressor, seen below the tank."""
    p = {
        "a": (0.255, -0.400, 0.725),
        "b": (0.238, -0.300, 0.712),
        "c": (0.222, -0.190, 0.674),
        "d": (0.196, 0.035, 0.668),
        "e": (0.196, 0.032, 0.588),
        "f": (0.222, -0.120, 0.585),
        "g": (0.240, -0.250, 0.612),
        "h": (0.262, -0.385, 0.655),
    }
    panel = shell(body, "Carbon", p, ["a b g h", "b c f g", "c d e f"], crease=0.5, levels=2, thick=0.004, roll=0.0016)
    panel.fasten(body, [(-0.27, 0.68), (-0.14, 0.645), (-0.02, 0.645), (-0.02, 0.6), (-0.15, 0.6)], size=0.0028)


def mid_panel(body):
    """The second, smaller flank, under the duct and in front of the engine."""
    p = {
        "a": (0.215, -0.335, 0.598),
        "b": (0.215, -0.175, 0.606),
        "c": (0.205, -0.125, 0.556),
        "d": (0.190, -0.200, 0.500),
        "e": (0.190, -0.228, 0.474),
        "f": (0.190, -0.268, 0.480),
        "g": (0.200, -0.305, 0.530),
    }

    def fade(q):
        return 0.12 + 0.75 * smooth(0.47, 0.6, q[:, 2])

    panel = shell(body, "Silver", p, ["a b c d g", "d e f g"], crease=0.6, levels=2, thick=0.004, roll=0.0016, fade=fade)
    panel.fasten(body, [(-0.252, 0.527), (-0.31, 0.585), (-0.19, 0.59)], size=0.0036)


def upper_cowl(body):
    """The carbon spine, the blades running from the nose up beside the screen, the cheeks and the brow."""
    # The spine: a narrow strip from the tip of the nose to the point of the screen.
    spine = {
        "a0": (0.0, -0.912, 0.842),
        "a1": (0.0, -0.860, 0.872),
        "a2": (0.0, -0.805, 0.897),
        "a3": (0.0, -0.778, 0.912),
        "s0": (0.022, -0.902, 0.842),
        "s1": (0.038, -0.852, 0.868),
        "s2": (0.050, -0.800, 0.897),
        "s3": (0.030, -0.770, 0.917),
    }
    top = shell(body, "Carbon", spine, ["a0 a1 s1 s0", "a1 a2 s2 s1", "a2 a3 s3 s2"], whole=True, crease=0.3, levels=2, thick=0.003)

    # Two long leaf-shaped slits either side of the middle of it, under the point of the screen.
    for side in (1, -1):
        leaf = {}
        for k, (x, y) in enumerate(((0.016, -0.872), (0.022, -0.84), (0.028, -0.804), (0.037, -0.804), (0.032, -0.842), (0.022, -0.874))):
            at = top.down(side * x, y)[0]
            leaf[f"p{k}"] = at + np.array([0.0, 0.0, 0.0012])
        shell(body, "Rubber", leaf, [" ".join(leaf)], crease=0.0, levels=0, thick=0.0, roll=0.0, mirror=False)

    # The blades: one long raised strip each side, from the nose all the way up to the screen's corner.
    blade = {
        "i0": (0.022, -0.902, 0.846),
        "i1": (0.038, -0.852, 0.872),
        "i2": (0.050, -0.800, 0.901),
        "i3": (0.072, -0.660, 0.992),
        "i4": (0.125, -0.520, 1.066),
        "i5": (0.150, -0.440, 1.096),
        "o0": (0.044, -0.892, 0.838),
        "o1": (0.080, -0.840, 0.862),
        "o2": (0.098, -0.790, 0.894),
        "o3": (0.124, -0.655, 0.982),
        "o4": (0.178, -0.525, 1.052),
        "o5": (0.200, -0.450, 1.074),
    }
    panel = shell(body, "Carbon", blade, ["i0 i1 o1 o0", "i1 i2 o2 o1", "i2 i3 o3 o2", "i3 i4 o4 o3", "i4 i5 o5 o4"], crease=0.5, levels=2, thick=0.006, roll=0.0018)
    panel.fasten(body, [(-0.56, 1.03), (-0.495, 1.058), (-0.63, 0.995)], size=0.0028)

    # The cheek: one big face between the blade, the brow and the wing root, folded along a crease.
    cheek = {
        "c0": (0.044, -0.892, 0.834),
        "c1": (0.080, -0.840, 0.858),
        "c2": (0.098, -0.790, 0.890),
        "c3": (0.124, -0.655, 0.978),
        "c4": (0.178, -0.525, 1.048),
        "c5": (0.200, -0.450, 1.070),
        "b0": (0.046, -0.888, 0.832),
        "b1": (0.105, -0.826, 0.850),
        "b2": (0.170, -0.760, 0.860),
        "b3": (0.222, -0.700, 0.852),
        "b4": (0.256, -0.628, 0.872),
        "r": (0.222, -0.640, 0.950),
        "k1": (0.208, -0.560, 0.992),
        "k2": (0.205, -0.470, 1.036),
        "m": (0.158, -0.710, 0.930),
    }
    cover = shell(
        body,
        "Carbon",
        cheek,
        ["c0 c1 b1 b0", "c1 c2 b2 b1", "c2 m b3 b2", "c2 c3 m", "c3 r b3 m", "b3 r b4", "c3 c4 k1 r", "c4 c5 k2 k1"],
        crease=0.5,
        soft=[(("c1", "c2"), 1.0), (("c2", "c3"), 1.0)],
        levels=2,
        thick=0.003,
    )
    del cover
    vent = {
        "a": (0.150, -0.650, 0.972),
        "b": (0.190, -0.545, 1.030),
        "c": (0.197, -0.565, 0.985),
        "d": (0.170, -0.655, 0.958),
    }
    lifted = {k: np.array(v) + np.array([0.002, -0.002, 0.0035]) for k, v in vent.items()}
    shell(body, "Rubber", lifted, ["a b c d"], crease=0.0, levels=0, thick=0.0, roll=0.0)

    # The upper brow: a long carbon strip standing proud of the cheek, from the nose along the top of
    # the flank to a point. Its lower edge is what overhangs the eye.
    brow = {
        "a": (0.050, -0.893, 0.832),
        "b": (0.110, -0.831, 0.850),
        "c": (0.175, -0.765, 0.860),
        "d": (0.227, -0.705, 0.852),
        "e": (0.259, -0.632, 0.872),
        "f": (0.278, -0.565, 0.838),
        "g": (0.292, -0.470, 0.782),
        "h": (0.278, -0.540, 0.800),
        "i": (0.253, -0.620, 0.826),
        "j": (0.208, -0.706, 0.836),
        "k": (0.150, -0.792, 0.838),
        "l": (0.085, -0.858, 0.822),
        "m": (0.036, -0.900, 0.816),
    }
    shell(body, "Carbon", brow, ["a b l m", "b c k l", "c d j k", "d e i j", "e f h i", "f g h"], crease=0.55, levels=2, thick=0.009, roll=0.002)

    # The block that caps each blade: it stands proud at the screen's top corner, in two peaks.
    end = {
        "a": (0.150, -0.462, 1.062),
        "b": (0.152, -0.408, 1.106),
        "c": (0.205, -0.455, 1.050),
        "d": (0.205, -0.414, 1.072),
        "e": (0.200, -0.470, 1.030),
        "f": (0.198, -0.395, 1.050),
    }
    shell(body, "Carbon", end, ["a b d c", "c d f e"], crease=0.8, levels=1, thick=0.012, roll=0.0016)

    # The inner liner: the dark wall you see past the cheek and under the blade.
    liner = {
        "a": (0.195, -0.665, 0.860),
        "b": (0.160, -0.660, 0.962),
        "c": (0.170, -0.585, 1.000),
        "d": (0.190, -0.545, 0.985),
        "e": (0.215, -0.500, 0.900),
        "f": (0.245, -0.440, 0.800),
        "g": (0.240, -0.560, 0.830),
    }
    shell(body, "Plastic", liner, ["a b c d e g", "e f g"], crease=0.3, levels=1, thick=0.003, roll=0.0012)

    # Stepped vents in it.
    for k, (y, z, tall) in enumerate(((-0.635, 0.905, 0.05), (-0.6, 0.925, 0.055), (-0.565, 0.935, 0.05))):
        step = {
            "a": (0.205 - k * 0.002, y - 0.016, z - tall / 2),
            "b": (0.205 - k * 0.002, y + 0.016, z - tall / 2 + 0.01),
            "c": (0.195 - k * 0.002, y + 0.016, z + tall / 2 + 0.01),
            "d": (0.195 - k * 0.002, y - 0.016, z + tall / 2),
        }
        shell(body, "Plastic", step, ["a b c d"], crease=0.0, levels=0, thick=0.022, roll=0.0016)


def screen(body):
    """The short screen: it starts at a point on the nose and fans up between the blades."""
    p = {
        "a": (0.0, -0.785, 0.905),
        "b": (0.0, -0.660, 1.000),
        "c": (0.0, -0.540, 1.100),
        "d": (0.0, -0.445, 1.165),
        "e": (0.012, -0.780, 0.906),
        "f": (0.072, -0.660, 0.992),
        "g": (0.125, -0.520, 1.066),
        "h": (0.156, -0.425, 1.112),
        "i": (0.082, -0.432, 1.150),
    }
    shell(body, "Screen", p, ["a b f e", "b c g f", "c d i g", "i h g"], whole=True, crease=0.0, levels=3, thick=0.0025, roll=0.0008, limit=60)


def wings(body):
    """The carbon winglets either side of the upper cowl, and the small pair lower down."""
    # Leading edge low and trailing edge high, the way a wing that pushes down has to be, rising
    # about 20 degrees toward its tip.
    p = {
        "a": (0.172, -0.800, 0.905),
        "b": (0.205, -0.765, 0.915),
        "c": (0.300, -0.738, 0.938),
        "d": (0.385, -0.700, 0.968),
        "t": (0.425, -0.620, 1.022),
        "e": (0.385, -0.655, 1.032),
        "f": (0.300, -0.662, 1.000),
        "g": (0.205, -0.650, 0.968),
        "h": (0.150, -0.700, 0.925),
    }
    shell(body, "Carbon", p, ["a b g h", "b c f g", "c d e f", "d t e"], crease=0.35, levels=2, thick=0.006, roll=0.0016)
    fence = {
        "a": (0.425, -0.620, 1.022),
        "b": (0.385, -0.655, 1.032),
        "c": (0.385, -0.700, 0.968),
        "d": (0.428, -0.640, 0.958),
    }
    shell(body, "Carbon", fence, ["a b c d"], crease=0.0, levels=1, thick=0.004, roll=0.001)

    # The chin: a moustache of carbon under the eyes, lowest at its inner corner and swept up and back.
    chin = {
        "a": (0.050, -0.840, 0.668),
        "b": (0.052, -0.815, 0.722),
        "c": (0.105, -0.775, 0.726),
        "d": (0.165, -0.735, 0.732),
        "t": (0.218, -0.702, 0.742),
        "e": (0.160, -0.722, 0.700),
        "f": (0.100, -0.768, 0.680),
    }
    shell(body, "Carbon", chin, ["a b c f", "c d e f", "d t e"], crease=0.45, levels=2, thick=0.007, roll=0.0016)
    fence = {
        "a": (0.048, -0.846, 0.664),
        "b": (0.050, -0.820, 0.728),
        "c": (0.050, -0.786, 0.728),
        "d": (0.048, -0.800, 0.664),
    }
    shell(body, "Carbon", fence, ["a b c d"], crease=0.0, levels=0, thick=0.006, roll=0.0012)
    # A short green accent near its tip, as on the side photograph.
    edge = {
        "a": (0.130, -0.7445, 0.6905),
        "b": (0.160, -0.7245, 0.6985),
        "c": (0.214, -0.7035, 0.7395),
        "d": (0.160, -0.7295, 0.7045),
        "e": (0.130, -0.7495, 0.6965),
    }
    shell(body, "Pinstripe", edge, ["a b d e", "b c d"], crease=0.2, levels=1, thick=0.0, roll=0.0)

    # The low pair: a flat plate off the flank, tipped up at the back, with a raised end plate.
    for z, rise in ((0.555, 0.012), (0.475, 0.02)):
        plate = {
            "a": (0.205, -0.395, z),
            "b": (0.205, -0.265, z + rise),
            "c": (0.318, -0.270, z + rise + 0.004),
            "d": (0.318, -0.385, z + 0.004),
        }
        shell(body, "Carbon", plate, ["a b c d"], crease=0.0, levels=1, thick=0.006, roll=0.0012)
    end = {
        "a": (0.300, -0.525, 0.505),
        "b": (0.318, -0.400, 0.565),
        "c": (0.318, -0.262, 0.578),
        "d": (0.318, -0.262, 0.490),
        "e": (0.318, -0.400, 0.470),
    }
    shell(body, "Carbon", end, ["a b e", "b c d e"], crease=0.2, levels=1, thick=0.004, roll=0.0012)

    # The green lines along the nose and the blade.
    line = {
        "a": (0.056, -0.868, 0.8535),
        "b": (0.112, -0.810, 0.8775),
        "c": (0.113, -0.8115, 0.8735),
        "d": (0.058, -0.8695, 0.8495),
    }
    shell(body, "Pinstripe", line, ["a b c d"], crease=0.0, levels=0, thick=0.0, roll=0.0)
    line = {
        "a": (0.150, -0.700, 0.9465),
        "b": (0.190, -0.600, 1.0005),
        "c": (0.1915, -0.598, 0.9965),
        "d": (0.1515, -0.698, 0.9425),
    }
    shell(body, "Pinstripe", line, ["a b c d"], crease=0.0, levels=0, thick=0.0, roll=0.0)


def tank(body):
    """
    One big mirror-chromed pressing, in layers: the top shell, whose lower edge hooks up over the
    rider's knee, a brighter panel set back underneath it, and a bolted cover on each front shoulder
    that drops into a sharp valley beside the spine, with a dark slot along its back edge.
    """
    rows = [
        [(0.0, -0.395, 0.900), (0.030, -0.395, 0.900), (0.058, -0.392, 0.888), (0.082, -0.386, 0.878), (0.092, -0.382, 0.858), (0.095, -0.378, 0.838)],
        [(0.0, -0.330, 0.945), (0.046, -0.330, 0.945), (0.078, -0.330, 0.916), (0.158, -0.330, 0.902), (0.183, -0.330, 0.866), (0.190, -0.330, 0.845)],
        [(0.0, -0.250, 0.992), (0.056, -0.250, 0.990), (0.090, -0.250, 0.952), (0.176, -0.250, 0.936), (0.206, -0.250, 0.886), (0.211, -0.250, 0.838)],
        [(0.0, -0.150, 1.026), (0.062, -0.150, 1.024), (0.112, -0.150, 1.004), (0.186, -0.150, 0.958), (0.212, -0.150, 0.896), (0.216, -0.150, 0.826)],
        [(0.0, -0.050, 1.034), (0.068, -0.050, 1.032), (0.128, -0.050, 1.008), (0.178, -0.050, 0.958), (0.200, -0.050, 0.890), (0.205, -0.050, 0.822)],
        [(0.0, 0.040, 1.004), (0.058, 0.040, 1.000), (0.108, 0.040, 0.974), (0.138, 0.040, 0.945), (0.160, 0.040, 0.905), (0.176, 0.040, 0.874)],
        [(0.0, 0.110, 0.947), (0.046, 0.110, 0.942), (0.086, 0.110, 0.922), (0.106, 0.110, 0.925), (0.120, 0.110, 0.917), (0.132, 0.110, 0.908)],
        [(0.0, 0.165, 0.884), (0.032, 0.165, 0.880), (0.062, 0.165, 0.872), (0.080, 0.165, 0.868), (0.090, 0.165, 0.862), (0.100, 0.165, 0.856)],
        [(0.0, 0.195, 0.844), (0.025, 0.195, 0.842), (0.048, 0.195, 0.838), (0.064, 0.195, 0.832), (0.074, 0.195, 0.828), (0.082, 0.195, 0.822)],
    ]
    points, faces = rows_cage(rows)
    # The crease along the shoulder, and the hard valley either side of the spine.
    soft = [((f"r{i}_3", f"r{i + 1}_3"), 0.5) for i in range(3, 5)]
    soft += [((f"r{i}_2", f"r{i + 1}_2"), 0.9) for i in range(0, 3)]
    soft += [((f"r{i}_1", f"r{i + 1}_1"), 0.45) for i in range(0, 3)]

    def fall(p):
        return 0.42 + 0.58 * smooth(0.82, 0.96, p[:, 2])

    pressing = shell(body, "Chrome", points, faces, whole=True, crease=0.0, soft=soft, levels=3, thick=0.007, roll=0.002, limit=50, fade=fall)
    SURFACES["tank"] = pressing

    knee = {
        "t0": (0.188, -0.070, 0.835),
        "t1": (0.162, 0.040, 0.888),
        "t2": (0.120, 0.110, 0.900),
        "t3": (0.090, 0.170, 0.850),
        "b0": (0.204, -0.070, 0.806),
        "b1": (0.190, 0.040, 0.798),
        "b2": (0.164, 0.110, 0.790),
        "b3": (0.122, 0.170, 0.786),
    }
    side = shell(body, "Chrome", knee, ["t0 t1 b1 b0", "t1 t2 b2 b1", "t2 t3 b3 b2"], crease=0.1, levels=2, thick=0.0, roll=0.0)

    # The dark pocket under the rear point of that edge.
    pocket = {f"p{k}": side.side(*at)[0] + np.array([0.0016, 0.0, 0.0]) for k, at in enumerate(((0.074, 0.878), (0.112, 0.89), (0.118, 0.878), (0.088, 0.868)))}
    shell(body, "Rubber", pocket, [" ".join(pocket)], crease=0.0, levels=0, thick=0.0, roll=0.0)

    # The shoulder cover: a pointed plate, sitting proud of the tank and following its surface.
    inner = (np.array([0.082, -0.352]), np.array([0.102, -0.212]))
    tip, corner, front = np.array([0.102, -0.212]), np.array([0.182, -0.288]), np.array([0.186, -0.318])
    grid = []
    for s in np.linspace(0.0, 1.0, 7):
        left = inner[0] + (inner[1] - inner[0]) * s
        right = front + (corner - front) * (s / 0.22) if s < 0.22 else corner + (tip - corner) * ((s - 0.22) / 0.78)
        row = []
        for w in np.linspace(0.0, 1.0, 6):
            x, y = left + (right - left) * w
            row.append(pressing.down(x, y)[0] + np.array([0.0, 0.0, 0.0045]))
        grid.append(row)
    points, faces = rows_cage(grid)
    plate = shell(body, "Chrome", points, faces, crease=0.0, levels=1, thick=0.004, roll=0.0016, limit=50, fade=lambda p: np.full(len(p), 0.5))
    at, normal = plate.down(0.128, -0.276)
    for side in (1, -1):
        twin = np.array([side, 1.0, 1.0])
        bolt(body, at * twin, normal * twin, size=0.0036, washer=True)

    # The dark slot along the cover's back edge, down the flank of the tank.
    slot = []
    for s in np.linspace(0.0, 1.0, 7):
        x, y = tip + (corner - tip) * s
        near = pressing.down(x + 0.002, y + 0.002)[0] + np.array([0.0, 0.0, 0.0012])
        far = pressing.down(x + 0.0065, y + 0.0065)[0] + np.array([0.0, 0.0, 0.0012])
        slot.append([near, far])
    points, faces = rows_cage(slot)
    shell(body, "Rubber", points, faces, crease=0.0, levels=0, thick=0.0, roll=0.0, centre=(0.0, -0.25, 0.7))

    # The filler: a bright ring and a dark cap, flush in the top.
    cap = np.array([0.0, -0.105, 1.0225])
    up = np.array([0.0, -0.075, 1.0])
    lathe(body, "Alloy", [(0.069, 0.0), (0.0655, 0.0045), (0.058, 0.0075), (0.0505, 0.0085), (0.0, 0.009)], cap, up, segments=64)
    lathe(body, "Anodised", [(0.047, 0.0), (0.046, 0.0095), (0.043, 0.0115), (0.0, 0.0115)], cap, up, segments=48)
    for k in range(6):
        a = k / 6 * math.tau
        bolt(body, cap + np.array([0.0575 * math.cos(a), 0.0575 * math.sin(a), 0.0075]), up, size=0.0022)

    # The dark moulding that the tank's nose sits in, up by the steering head.
    nose = {
        "a": (0.140, -0.395, 0.868),
        "b": (0.205, -0.302, 0.926),
        "c": (0.232, -0.225, 0.905),
        "d": (0.236, -0.225, 0.822),
        "e": (0.228, -0.340, 0.800),
        "f": (0.190, -0.400, 0.790),
        "m": (0.245, -0.310, 0.860),
    }
    panel = shell(body, "Black", nose, ["a b m f", "b c d m", "d e f m"], crease=0.15, levels=3, thick=0.003, roll=0.0016)
    panel.fasten(body, [(-0.245, 0.85)], size=0.0034)


def tank_flank(body):
    """The black side cover under the tank: it laps over the tank's lower edge, down to the frame rail."""
    p = {
        "a": (0.234, -0.230, 0.840),
        "b": (0.226, -0.050, 0.817),
        "c": (0.176, 0.135, 0.792),
        "d": (0.132, 0.200, 0.806),
        "e": (0.172, 0.150, 0.725),
        "f": (0.192, 0.050, 0.752),
        "g": (0.206, -0.100, 0.790),
        "h": (0.206, -0.215, 0.822),
        "s": (0.222, -0.100, 0.812),
        "t": (0.190, 0.100, 0.782),
    }
    panel = shell(
        body,
        "Black",
        p,
        ["a b s h", "h s g", "b c t s", "s t f g", "t c e f", "c d e"],
        crease=0.25,
        soft=[(("a", "b"), 1.0), (("b", "c"), 1.0), (("s", "t"), 0.7), (("h", "s"), 0.7)],
        levels=2,
        thick=0.005,
        roll=0.0012,
        limit=30,
    )
    panel.fasten(body, [(-0.19, 0.825), (0.13, 0.76)], size=0.0034)


def seat(body):
    """Low and scooped, narrow at the tank so the rider's knees come together, wide at the back."""
    rows = [
        [(0.0, 0.135, 0.880), (0.040, 0.135, 0.878), (0.075, 0.135, 0.860), (0.095, 0.135, 0.820), (0.100, 0.135, 0.780)],
        [(0.0, 0.200, 0.838), (0.060, 0.200, 0.836), (0.105, 0.200, 0.822), (0.125, 0.200, 0.790), (0.130, 0.200, 0.760)],
        [(0.0, 0.300, 0.826), (0.080, 0.300, 0.828), (0.140, 0.300, 0.820), (0.168, 0.300, 0.790), (0.172, 0.300, 0.755)],
        [(0.0, 0.400, 0.848), (0.075, 0.400, 0.850), (0.135, 0.400, 0.842), (0.165, 0.400, 0.815), (0.170, 0.400, 0.785)],
        [(0.0, 0.470, 0.876), (0.060, 0.470, 0.878), (0.105, 0.470, 0.868), (0.128, 0.470, 0.845), (0.132, 0.470, 0.820)],
        [(0.0, 0.505, 0.900), (0.040, 0.505, 0.900), (0.075, 0.505, 0.890), (0.092, 0.505, 0.870), (0.095, 0.505, 0.850)],
    ]
    points, faces = rows_cage(rows)
    pad = shell(body, "Seat", points, faces, whole=True, crease=0.0, levels=2, thick=0.0, roll=0.0)
    PLACES["seat"] = pad.down(0.0, SEAT_Y)[0]


def tail(body):
    """The stubby tail: two raised fins that close to a point, a silver flank, and small red lamps."""
    # The trough between the fins.
    trough = {
        "a0": (0.0, 0.615, 0.942),
        "a1": (0.0, 0.730, 0.972),
        "a3": (0.0, 0.835, 1.008),
        "f0": (0.070, 0.535, 0.985),
        "f1": (0.055, 0.620, 0.996),
        "f2": (0.032, 0.730, 1.004),
        "g0": (0.0, 0.530, 0.930),
    }
    shell(body, "Black", trough, ["g0 a0 f1 f0", "a0 a1 f2 f1", "a1 a3 f2"], whole=True, crease=0.7, levels=2, thick=0.003)

    # The bright ridge along the top of each fin.
    ridge = {
        "a": (0.070, 0.535, 0.985),
        "b": (0.055, 0.620, 0.996),
        "c": (0.032, 0.730, 1.004),
        "d": (0.0, 0.835, 1.008),
        "e": (0.042, 0.740, 1.000),
        "f": (0.074, 0.625, 0.994),
        "g": (0.095, 0.540, 0.986),
    }
    shell(body, "Chrome", ridge, ["a b f g", "b c e f", "c d e"], crease=0.6, levels=2, thick=0.003)

    # The black side of each fin, above the silver.
    side = {
        "a": (0.095, 0.540, 0.986),
        "b": (0.074, 0.625, 0.994),
        "c": (0.042, 0.740, 1.000),
        "d": (0.0, 0.835, 1.008),
        "e": (0.065, 0.740, 0.975),
        "f": (0.095, 0.710, 0.972),
        "g": (0.122, 0.640, 0.958),
        "h": (0.145, 0.545, 0.945),
    }
    shell(body, "Black", side, ["a b g h", "b c f g", "c d e f"], crease=0.6, levels=2, thick=0.003)

    # The bright flank, clean: the name that goes on it is in moto_marks.py.
    flank = {
        "a": (0.205, 0.460, 0.855),
        "b": (0.185, 0.510, 0.900),
        "c": (0.145, 0.545, 0.945),
        "d": (0.122, 0.640, 0.958),
        "e": (0.095, 0.710, 0.972),
        "f": (0.128, 0.665, 0.878),
        "g": (0.165, 0.600, 0.868),
    }
    SURFACES["tail"] = shell(body, "Chrome", flank, ["a b g", "b c d g", "d e f g"], crease=0.3, levels=2, thick=0.003)

    # The black band and the lower grey panel.
    band = {
        "a": (0.208, 0.445, 0.842),
        "b": (0.205, 0.460, 0.855),
        "c": (0.165, 0.600, 0.868),
        "d": (0.128, 0.665, 0.878),
        "e": (0.122, 0.676, 0.864),
        "f": (0.160, 0.590, 0.845),
    }
    shell(body, "Black", band, ["a b c f", "f c d e"], crease=0.5, levels=1, thick=0.003)
    lower = {
        "a": (0.145, 0.360, 0.710),
        "b": (0.208, 0.445, 0.840),
        "c": (0.160, 0.590, 0.843),
        "d": (0.118, 0.665, 0.858),
        "e": (0.100, 0.630, 0.815),
        "f": (0.130, 0.495, 0.760),
        "g": (0.135, 0.405, 0.705),
    }
    shell(body, "Silver", lower, ["a b c f g", "c d e f"], crease=0.6, levels=2, thick=0.003)

    # The seat cowl's hump behind the rider, faceted, and the side wall that joins it to the flank.
    hump = {
        "a": (0.0, 0.505, 0.905),
        "b": (0.065, 0.510, 0.905),
        "c": (0.090, 0.550, 0.900),
        "d": (0.070, 0.615, 0.905),
        "e": (0.0, 0.625, 0.915),
        "f": (0.0, 0.530, 0.945),
        "g": (0.048, 0.535, 0.945),
        "h": (0.052, 0.585, 0.945),
        "i": (0.0, 0.595, 0.948),
    }
    shell(body, "Black", hump, ["a b g f", "b c h g", "c d h", "d e i h", "f g h i"], whole=True, crease=0.7, levels=1, thick=0.0, roll=0.0)
    wall = {
        "a": (0.160, 0.455, 0.850),
        "b": (0.185, 0.510, 0.900),
        "c": (0.145, 0.545, 0.945),
        "d": (0.095, 0.540, 0.986),
        "e": (0.090, 0.505, 0.905),
    }
    shell(body, "Black", wall, ["a b c d e"], crease=0.3, levels=1, thick=0.003)

    # Under the blade of the tip: a thin black wing, cut away so the lamp hangs in a notch.
    under = {
        "a": (0.128, 0.665, 0.878),
        "b": (0.095, 0.710, 0.972),
        "c": (0.065, 0.740, 0.975),
        "d": (0.0, 0.835, 1.004),
        "e": (0.0, 0.740, 0.925),
        "f": (0.040, 0.712, 0.895),
        "g": (0.0, 0.690, 0.862),
    }
    shell(body, "Black", under, ["a b c d e f", "e g f"], whole=True, crease=0.5, levels=1, thick=0.0, roll=0.0)
    lamp = {
        "a": (0.098, 0.712, 0.963),
        "b": (0.052, 0.790, 0.978),
        "c": (0.082, 0.722, 0.898),
    }
    shell(body, "TailLamp", lamp, ["a b c"], crease=0.0, levels=1, thick=0.0015, roll=0.0005)
    PLACES["tail_lamp_left"] = (0.077, 0.741, 0.946)
    PLACES["tail_lamp_right"] = (-0.077, 0.741, 0.946)


def subframe_cover(body):
    """The black mouldings that wrap the subframe, from the frame post up under the seat."""
    p = {
        "a": (0.112, 0.150, 0.790),
        "b": (0.160, 0.300, 0.770),
        "c": (0.165, 0.360, 0.790),
        "d": (0.195, 0.445, 0.838),
        "e": (0.140, 0.360, 0.705),
        "f": (0.135, 0.195, 0.575),
        "g": (0.150, 0.160, 0.600),
        "h": (0.140, 0.150, 0.715),
    }
    panel = shell(body, "Black", p, ["a b e f g h", "b c d e"], crease=0.5, levels=2, thick=0.003)
    panel.fasten(body, [(0.195, 0.72)], size=0.0052)

    # The long oval dished into the moulding.
    dish = {}
    for k in range(10):
        a = k / 10 * math.tau
        y, z = 0.25 + 0.075 * math.cos(a) + 0.018 * math.sin(a), 0.685 + 0.03 * math.sin(a) + 0.03 * math.cos(a)
        at, _ = panel.side(y, z)
        if at is not None:
            dish[f"p{k}~"] = at + np.array([0.0012, 0.0, 0.0])
    shell(body, "Plastic", dish, [" ".join(dish)], crease=0.0, levels=2, thick=0.001, roll=0.0005)

    # The undertray: the flat underside of the tail.
    under = {
        "a": (0.0, 0.360, 0.690),
        "b": (0.135, 0.380, 0.705),
        "c": (0.130, 0.495, 0.760),
        "d": (0.095, 0.630, 0.815),
        "e": (0.0, 0.690, 0.850),
    }
    shell(body, "Black", under, ["a b c d e"], whole=True, crease=0.3, levels=1, thick=0.0, roll=0.0)
    deck = {
        "a": (0.0, 0.300, 0.740),
        "b": (0.170, 0.300, 0.760),
        "c": (0.170, 0.400, 0.790),
        "d": (0.130, 0.470, 0.825),
        "e": (0.0, 0.505, 0.860),
    }
    shell(body, "Black", deck, ["a b c d e"], whole=True, crease=0.3, levels=1, thick=0.0, roll=0.0)


def fender(fork):
    """A black arch over the tyre, and the silver brackets that carry it, down each side of the wheel."""
    rows = []
    for y, width, drop in ((-0.905, 0.034, 0.008), (-0.87, 0.08, 0.018), (-0.80, 0.116, 0.03), (-0.72, 0.128, 0.042), (-0.65, 0.12, 0.038), (-0.60, 0.09, 0.022)):
        dy = y - FRONT_AXLE[1]
        reach = FRONT_R + 0.03
        top = FRONT_AXLE[2] + math.sqrt(max(reach**2 - dy**2, 0.0004))
        rows.append([(0.0, y, top), (width * 0.5, y, top - drop * 0.15), (width * 0.86, y, top - drop * 0.6), (width, y, top - drop * 1.25)])
    points, faces = rows_cage(rows)
    shell(fork, "Carbon", points, faces, whole=True, crease=0.1, levels=2, thick=0.003, roll=0.0014)

    # The silver wing under it, flared out from the fork, and the long bracket down to the axle clamp.
    wing = {
        "a": (0.094, -0.868, 0.590),
        "b": (0.116, -0.790, 0.606),
        "c": (0.122, -0.700, 0.596),
        "d": (0.136, -0.688, 0.530),
        "e": (0.142, -0.748, 0.524),
        "h": (0.134, -0.806, 0.562),
        "f": (0.132, -0.768, 0.385),
        "g": (0.134, -0.712, 0.385),
    }
    panel = shell(fork, "Silver", wing, ["a b h", "b c d e h", "e d g f"], crease=0.5, levels=2, thick=0.006, roll=0.002)
    panel.fasten(fork, [(-0.742, 0.475), (-0.732, 0.415), (-0.72, 0.555)], size=0.0038)


def lattice(part, material, outline, plane, gap=0.011, radius=0.001):
    """A diamond mesh across an opening: `outline` is (x, z) points, `plane` gives y for each x and z."""
    polygon = np.asarray(outline, float)
    span = float(np.max(np.abs(polygon))) + 1.0
    for sign in (1.0, -1.0):
        for c in np.arange(-span, span, gap * 1.41):
            # Each bar is the line z = sign * x + c, clipped to the opening.
            hits = []
            for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
                fa, fb = a[1] - sign * a[0] - c, b[1] - sign * b[0] - c
                if fa * fb < 0:
                    hits.append(a + (b - a) * fa / (fa - fb))
            hits.sort(key=lambda p: p[0])
            for p, q in zip(hits[0::2], hits[1::2]):
                ends = [(p[0], plane(p[0], p[1]), p[1]), (q[0], plane(q[0], q[1]), q[1])]
                tube(part, material, ends, radius, sides=4, smooth=False, cap=False)


def nose(body):
    """The prow, the ram-air mouth under it, and the deep eye sockets either side."""
    # The prow: a narrow keel of carbon, carrying the lip and the light.
    prow = {
        "a": (0.0, -0.910, 0.838),
        "b": (0.036, -0.898, 0.818),
        "c": (0.0, -0.893, 0.790),
        "d": (0.047, -0.864, 0.790),
        "e": (0.0, -0.875, 0.757),
        "f": (0.057, -0.843, 0.757),
        "g": (0.085, -0.855, 0.824),
        "h": (0.055, -0.838, 0.796),
    }
    shell(body, "Carbon", prow, ["a b d c", "c d f e", "b g h d", "d h f"], whole=True, crease=0.65, levels=2, thick=0.003, roll=0.0016)
    # Under the lip it runs back into the top of the mouth.
    throat = {
        "e": (0.0, -0.875, 0.757),
        "f": (0.057, -0.843, 0.757),
        "m0": (0.0, -0.805, 0.750),
        "m1": (0.056, -0.798, 0.752),
    }
    shell(body, "Carbon", throat, ["e f m1 m0"], whole=True, crease=0.3, levels=1, thick=0.0, roll=0.0)

    # A night street needs a light: one slim LED strip, along the bottom of the prow.
    strip = {
        "a": (0.0, -0.8815, 0.7675),
        "b": (0.052, -0.8515, 0.7665),
        "c": (0.054, -0.8465, 0.7595),
        "d": (0.0, -0.8765, 0.7605),
    }
    shell(body, "Lamp", strip, ["a b c d"], whole=True, crease=0.0, levels=0, thick=0.0, roll=0.0)
    PLACES["headlight"] = (0.0, -0.877, 0.764)

    # The mouth: a thin carbon lip, and a dark throat narrowing back into the duct.
    ring = [(0.0, -0.805, 0.750), (0.056, -0.798, 0.752), (0.064, -0.792, 0.716), (0.044, -0.798, 0.676), (0.0, -0.808, 0.666)]
    deep = [(0.0, -0.69, 0.765), (0.04, -0.69, 0.765), (0.046, -0.69, 0.742), (0.032, -0.69, 0.714), (0.0, -0.69, 0.708)]
    points = {f"r{k}": p for k, p in enumerate(ring)}
    points.update({f"d{k}": p for k, p in enumerate(deep)})
    faces = [f"r{k} r{k + 1} d{k + 1} d{k}" for k in range(4)]
    shell(body, "Rubber", points, faces, whole=True, crease=0.3, levels=1, thick=0.0, roll=0.0)
    tube(body, "Rubber", [(0, -0.69, 0.737), (0, -0.62, 0.76), (0, -0.56, 0.8)], [0.04, 0.05], sides=20, flat=0.7)
    lip = {f"r{k}": p for k, p in enumerate(ring)}
    lip.update({f"o{k}": np.array(p) + np.array([(0.009 if p[0] else 0.0), -0.006, 0.008 if k < 2 else (-0.008 if k > 2 else 0.0)]) for k, p in enumerate(ring)})
    shell(body, "Carbon", lip, [f"o{k} o{k + 1} r{k + 1} r{k}" for k in range(4)], whole=True, crease=0.2, levels=1, thick=0.0, roll=0.0)

    # The little chevron that divides the mouth, the only thing that catches light in there.
    fin = {
        "a": (0.0, -0.815, 0.720),
        "b": (0.026, -0.800, 0.732),
        "c": (0.030, -0.790, 0.712),
        "d": (0.0, -0.800, 0.698),
    }
    shell(body, "Carbon", fin, ["a b c d"], whole=True, crease=0.5, levels=1, thick=0.003, roll=0.001)
    keel = {
        "a": (0.0025, -0.812, 0.752),
        "b": (0.0025, -0.74, 0.752),
        "c": (0.0025, -0.74, 0.672),
        "d": (0.0025, -0.812, 0.668),
    }
    shell(body, "Plastic", keel, ["a b c d"], crease=0.0, levels=0, thick=0.005, roll=0.0, mirror=False, centre=(-1.0, -0.78, 0.71))

    # Each eye: a real hole, cut to an angry slant and leaning back under the brow, so from the side
    # it stays hidden behind the flank's leading edge.
    eye = [
        (0.050, -0.842, 0.792),
        (0.105, -0.800, 0.816),
        (0.175, -0.742, 0.838),
        (0.204, -0.706, 0.832),
        (0.196, -0.695, 0.812),
        (0.160, -0.700, 0.762),
        (0.095, -0.712, 0.732),
        (0.056, -0.730, 0.722),
    ]
    middle = np.mean(np.array(eye), axis=0)
    back = [middle + (np.array(p) - middle) * np.array([0.82, 0.7, 0.8]) + np.array([0.0, 0.07, 0.006]) for p in eye]
    n = len(eye)
    points = {f"e{k}": p for k, p in enumerate(eye)}
    points.update({f"b{k}": p for k, p in enumerate(back)})
    faces = [f"e{k} e{(k + 1) % n} b{(k + 1) % n} b{k}" for k in range(n)]
    shell(body, "Plastic", points, faces, crease=0.5, levels=1, thick=0.0, roll=0.0, centre=(0.12, -0.70, 0.78), flip=True)
    plate = {f"b{k}": p for k, p in enumerate(back)}
    shell(body, "Rubber", plate, [" ".join(plate)], crease=0.0, levels=0, thick=0.0, roll=0.0, centre=(0.12, -0.5, 0.78), flip=True)

    # The lower brow: a thin bright lip right round the opening, stacked under the upper brow.
    rim = {f"e{k}": p for k, p in enumerate(eye)}
    rim.update({f"o{k}": middle + (np.array(p) - middle) * np.array([1.09, 1.0, 1.14]) + np.array([0.0, -0.007, 0.0]) for k, p in enumerate(eye)})
    shell(body, "Carbon", rim, [f"o{k} o{(k + 1) % n} e{(k + 1) % n} e{k}" for k in range(n)], crease=0.35, levels=1, thick=0.004, roll=0.0012)

    # The mesh, set well back from the rim on the plane of the opening.
    rim_at = np.array(eye)
    fit = np.linalg.lstsq(np.column_stack([rim_at[:, 0], rim_at[:, 2], np.ones(n)]), rim_at[:, 1], rcond=None)[0]
    cut = rim_at[:, [0, 2]]
    centre_xz = cut.mean(0)
    opening = centre_xz + (cut - centre_xz) * 0.9

    def depth(x, z):
        return float(fit[0] * abs(x) + fit[1] * z + fit[2]) + 0.034

    for side in (1, -1):
        lattice(body, "Grille", opening * np.array([side, 1.0]), depth)

    # Dark bulkhead behind everything, so nothing shows through past the sockets.
    wall = {
        "a": (0.0, -0.615, 0.850),
        "b": (0.205, -0.600, 0.850),
        "c": (0.205, -0.600, 0.690),
        "d": (0.0, -0.615, 0.640),
    }
    shell(body, "Plastic", wall, ["a b c d"], whole=True, crease=0.0, levels=0, thick=0.0, roll=0.0)

    # The carbon that closes the nose between the brow and the flank, out past the eye.
    under = {
        "a": (0.195, -0.760, 0.846),
        "b": (0.224, -0.704, 0.836),
        "c": (0.250, -0.620, 0.824),
        "d": (0.244, -0.622, 0.814),
        "e": (0.218, -0.702, 0.802),
        "f": (0.203, -0.788, 0.794),
    }
    shell(body, "Carbon", under, ["a b e f", "b c d e"], crease=0.4, levels=1, thick=0.003)

    # A dark wall down the middle, between the two eyes, so you can't see through the nose from the side.
    septum = {
        "a": (0.0025, -0.846, 0.838),
        "b": (0.0025, -0.70, 0.868),
        "c": (0.0025, -0.70, 0.740),
        "d": (0.0025, -0.846, 0.796),
    }
    shell(body, "Plastic", septum, ["a b c d"], crease=0.0, levels=0, thick=0.005, roll=0.0, mirror=False, centre=(-1.0, -0.78, 0.8))
    cheekbone = {
        "a": (0.052, -0.838, 0.836),
        "b": (0.052, -0.742, 0.86),
        "c": (0.052, -0.742, 0.748),
        "d": (0.052, -0.838, 0.794),
    }
    shell(body, "Plastic", cheekbone, ["a b c d"], crease=0.0, levels=0, thick=0.0, roll=0.0, centre=(-1.0, -0.78, 0.8), flip=True)

    # The dark vee under the mouth, between the chin wings.
    vee = {
        "a": (0.0, -0.808, 0.666),
        "b": (0.052, -0.800, 0.672),
        "c": (0.058, -0.735, 0.662),
        "d": (0.0, -0.745, 0.650),
    }
    shell(body, "Plastic", vee, ["a b c d"], whole=True, crease=0.3, levels=1, thick=0.0, roll=0.0)


def hugger(arm):
    """Carbon over the front of the rear tyre, with the two sharp points that lie along the swingarm."""
    rows = []
    for angle in (98, 112, 126, 140, 152):
        a = math.radians(angle)
        reach = 0.3225 + 0.02
        y, z = REAR_AXLE[1] + reach * math.cos(a), REAR_AXLE[2] + reach * math.sin(a)
        rows.append([(0.13, y, z - 0.03), (0.105, y, z), (0.0, y, z + 0.004), (-0.09, y, z), (-0.115, y, z - 0.034)])
    points, faces = rows_cage(rows)
    shell(arm, "Carbon", points, faces, crease=0.15, levels=2, thick=0.003, mirror=False, centre=(0.0, 0.72, 0.32))
    fin = {
        "a": (0.122, 0.305, 0.583),
        "b": (0.125, 0.385, 0.628),
        "c": (0.128, 0.458, 0.668),
        "d": (0.125, 0.425, 0.634),
        "e": (0.128, 0.460, 0.638),
        "f": (0.125, 0.400, 0.590),
        "g": (0.122, 0.330, 0.572),
    }
    shell(arm, "Carbon", fin, ["a b d f g", "b c d", "d e f"], crease=1.0, levels=0, thick=0.012, roll=0.0016, mirror=False)


def rearsets(body):
    """The bright plates and hangers the rider's heels sit on, with their cut-outs, and the pegs."""
    from moto_engine import at_x, slab

    for s in (1, -1):
        heel = [(0.205, 0.462, 0.012), (0.24, 0.515, 0.012), (0.3, 0.552, 0.012), (0.36, 0.557, 0.008), (0.378, 0.54, 0.008), (0.32, 0.508, 0.012), (0.292, 0.466, 0.012), (0.255, 0.444, 0.012)]
        slot = rounded([(0.272, 0.51, 0.005), (0.335, 0.531, 0.005), (0.33, 0.541, 0.005), (0.268, 0.52, 0.005)], step=0.003)
        hole = rounded([(0.235, 0.47, 0.004), (0.262, 0.468, 0.004), (0.262, 0.492, 0.004), (0.245, 0.495, 0.004)], step=0.003)
        x0 = s * 0.176 if s > 0 else s * 0.176 - 0.007
        slab(body, "Alloy", heel, x0, x0 + 0.007, chamfer=0.0014, holes=[slot, hole], step=0.003)
        for y, z in ((0.218, 0.466), (0.272, 0.452), (0.36, 0.545)):
            bolt(body, at_x(s * 0.183, y, z), (s, 0, 0), size=0.0042, washer=True)

        hanger = [(0.163, 0.445, 0.012), (0.2, 0.44, 0.012), (0.255, 0.39, 0.012), (0.3, 0.378, 0.014), (0.31, 0.318, 0.014), (0.268, 0.3, 0.014), (0.245, 0.345, 0.012), (0.2, 0.375, 0.012), (0.163, 0.405, 0.012)]
        cut = rounded([(0.19, 0.417, 0.005), (0.232, 0.385, 0.005), (0.245, 0.36, 0.005), (0.21, 0.385, 0.005), (0.185, 0.402, 0.005)], step=0.003)
        cut2 = rounded([(0.268, 0.365, 0.005), (0.29, 0.36, 0.005), (0.294, 0.33, 0.005), (0.272, 0.322, 0.005)], step=0.003)
        x0 = s * 0.168 if s > 0 else s * 0.168 - 0.008
        slab(body, "Alloy", hanger, x0, x0 + 0.008, chamfer=0.0016, holes=[cut, cut2], step=0.003)
        for y, z in ((0.176, 0.43), (0.205, 0.415), (0.283, 0.345)):
            bolt(body, at_x(s * 0.176, y, z), (s, 0, 0), size=0.0042, washer=True)

        # The peg: a knurled bar on its folding mount, sticking straight out.
        peg = at_x(s * 0.176, PEG[0], PEG[1])
        lathe(body, "Anodised", [(0.0, -0.003), (0.0095, -0.003), (0.0105, 0.004), (0.0105, 0.088), (0.0085, 0.092), (0.0, 0.093)], peg, (s, 0, 0), segments=16)
        for t in np.linspace(0.012, 0.082, 7):
            lathe(body, "Steel", [(0.0105, t - 0.002), (0.0122, t), (0.0105, t + 0.002)], peg, (s, 0, 0), segments=14)
        PLACES["peg_left" if s > 0 else "peg_right"] = (s * 0.22, PEG[0], PEG[1])

        # The lever under the toe, and its link.
        lever = at_x(s * 0.2, 0.235, 0.37)
        tube(body, "Alloy", [lever, at_x(s * 0.215, 0.13, 0.33), at_x(s * 0.235, 0.075, 0.325)], 0.0055, sides=10)
        lathe(body, "Anodised", [(0.0, -0.002), (0.0068, -0.002), (0.0078, 0.003), (0.0078, 0.038), (0.0058, 0.042), (0.0, 0.043)], at_x(s * 0.218, 0.075, 0.325), (s, 0, 0), segments=12)
        tube(body, "Steel", [at_x(s * 0.2, 0.2, 0.3), at_x(s * 0.2, 0.13, 0.31)], 0.0036, sides=8, smooth=False)

    # The side stand, folded up along the left, with its foot.
    stand = [(0.122, 0.27, 0.012), (0.16, 0.282, 0.012), (0.4, 0.238, 0.006), (0.405, 0.21, 0.004), (0.38, 0.214, 0.004), (0.375, 0.226, 0.006), (0.16, 0.24, 0.012), (0.122, 0.246, 0.012)]
    slab(body, "Anodised", stand, 0.15, 0.164, chamfer=0.003)
    bolt(body, at_x(0.164, 0.145, 0.258), (1, 0, 0), size=0.0072, washer=True)


def bodywork(body, steer, fork, arm):
    side_fairing(body)
    carbon_duct(body)
    mid_panel(body)
    upper_cowl(body)
    nose(body)
    screen(body)
    wings(body)
    tank(body)
    tank_flank(body)
    seat(body)
    tail(body)
    subframe_cover(body)
    fender(fork)
    hugger(arm)
    rearsets(body)


def controls(body, steer):
    """What the rider touches: clip-ons, levers, the damper and the dash."""
    for side in (-1, 1):
        clamp = on_axis(1.0, FORK_OFFSET) + np.array([side * FORK_X, 0, 0])
        lathe(steer, "Anodised", [(0.0272, -0.018), (0.0332, -0.018), (0.0342, -0.014), (0.0342, 0.014), (0.0332, 0.018), (0.0272, 0.018)], clamp, AXIS, segments=32)
        grip_in = np.array([side * GRIP_IN[0], GRIP_IN[1], GRIP_IN[2]])
        grip_out = np.array([side * GRIP_OUT[0], GRIP_OUT[1], GRIP_OUT[2]])
        way = (grip_out - grip_in) / np.linalg.norm(grip_out - grip_in)
        length = float(np.linalg.norm(grip_out - grip_in))
        tube(steer, "Anodised", [clamp + np.array([side * 0.03, -0.004, -0.008]), grip_in - way * 0.04, grip_in], 0.0112, sides=16, step=0.012)
        profile = [(0.0112, 0.0), (0.0172, 0.0), (0.0178, 0.004)]
        for t in np.arange(0.013, length - 0.02, 0.009):
            profile += [(0.0165, t), (0.0178, t + 0.0045)]
        profile += [(0.0178, length), (0.016, length + 0.004)]
        lathe(steer, "Rubber", profile, grip_in, way, segments=20)
        lathe(steer, "Anodised", [(0.0, 0.0), (0.0185, 0.0), (0.0205, 0.003), (0.0205, 0.018), (0.0165, 0.021), (0.0, 0.022)], grip_out + way * 0.004, way, segments=24)
        PLACES["grip_left" if side > 0 else "grip_right"] = (grip_in + grip_out) / 2

        # The switch pod and the lever, with its reach adjuster.
        pod = grip_in - way * 0.002
        lathe(steer, "Plastic", [(0.0112, -0.032), (0.024, -0.032), (0.0265, -0.028), (0.0265, -0.006), (0.024, -0.002), (0.0112, -0.002)], pod, way, segments=20)
        for k in range(2):
            bolt(steer, pod - way * (0.008 + 0.012 * k) + np.array([0, 0.0, 0.0265]), (0, 0, 1), size=0.0022)
        pivot = pod + np.array([0, -0.042, 0.012])
        lever = rounded(
            [(0.0, 0.0, 0.006), (0.024, 0.016, 0.01), (0.09, 0.038, 0.008), (0.17, 0.05, 0.004), (0.172, 0.041, 0.004), (0.09, 0.027, 0.008), (0.03, 0.0, 0.006), (0.012, -0.012, 0.005)],
            step=0.004,
        )
        ex = way
        ey = np.array([0, -1.0, 0.1])
        ey = ey - ex * np.dot(ey, ex)
        ey /= np.linalg.norm(ey)
        if side < 0:
            lever = lever[::-1]
        extrude(steer, "Anodised", lever, 0.0075, pivot, ex, ey, chamfer=0.0012)
        # Master cylinder on the right, clutch perch on the left.
        lathe(steer, "Anodised", [(0.0, 0.0), (0.0135, 0.0), (0.0145, 0.003), (0.0145, 0.055), (0.0125, 0.058), (0.0, 0.058)], pod + np.array([0, -0.01, 0.005]), (side * -0.5, -1, 0.02), segments=20)
        # The cable or line up out of it, curving over toward the head.
        tube(steer, "Rubber", [pod + np.array([side * -0.03, -0.05, 0.01]), pod + np.array([side * -0.1, -0.09, 0.09]), on_axis(1.03, 0.1) + np.array([side * 0.05, 0, 0])], 0.0034, sides=8)

    # The brake fluid bottle, on the right of the top yoke.
    res = on_axis(1.05, 0.06) + np.array([-0.145, 0.02, 0.03])
    lathe(steer, "Lens", [(0.0, 0.0), (0.0145, 0.0), (0.0155, 0.003), (0.0155, 0.03), (0.0145, 0.033), (0.0, 0.033)], res, (0, 0, 1), segments=20)
    lathe(steer, "Anodised", [(0.0, 0.033), (0.0165, 0.033), (0.0165, 0.042), (0.014, 0.045), (0.0, 0.045)], res, (0, 0, 1), segments=20)

    # The steering damper, across the bike behind the yoke, with its green end caps.
    at = np.array([0.0, -0.372, 0.965])
    for k in (0.0155, -0.0155):
        lathe(body, "Stainless", [(0.0, -0.095), (0.0118, -0.095), (0.0128, -0.09), (0.0128, 0.09), (0.0118, 0.095), (0.0, 0.095)], at + np.array([0, k, 0]), X, segments=20)
    lathe(body, "Steel", [(0.0, 0.095), (0.0062, 0.095), (0.0062, 0.15), (0.0, 0.15)], at, X, segments=12)
    for k in (-0.1, 0.1):
        slab_at = at + np.array([k, 0, 0])
        extrude(body, "FrameGreen", rounded([(-0.03, -0.015, 0.012), (0.03, -0.015, 0.012), (0.03, 0.015, 0.012), (-0.03, 0.015, 0.012)], step=0.003), 0.008, slab_at - np.array([0.004, 0, 0]), (0, 1, 0), (0, 0, 1), chamfer=0.0012)
    for k in (-0.045, 0.045):
        extrude(body, "Anodised", rounded([(-0.032, -0.0145, 0.012), (0.032, -0.0145, 0.012), (0.032, 0.0145, 0.012), (-0.032, 0.0145, 0.012)], step=0.003), 0.012, at + np.array([k - 0.006, 0, 0]), (0, 1, 0), (0, 0, 1), chamfer=0.001)
    tube(body, "Anodised", [at + np.array([-0.02, 0.0, -0.015]), at + np.array([-0.02, 0.03, -0.05])], 0.008, sides=10, smooth=False)

    # The dash: a round tacho beside a small panel, in a dark shroud, tilted to the rider.
    dash = np.array([0.0, -0.585, 0.972])
    ey = np.array([0, -0.62, 0.78])
    ex = np.array([1.0, 0, 0])
    facing = -np.cross(ex, ey)
    outline = rounded([(-0.105, -0.055, 0.016), (0.105, -0.055, 0.016), (0.112, 0.06, 0.03), (-0.112, 0.06, 0.03)], step=0.004)
    extrude(body, "Plastic", outline, 0.03, dash, ex, ey, chamfer=0.003)
    tacho = dash + ex * 0.038
    lathe(body, "Alloy", [(0.05, 0.0), (0.05, 0.005), (0.046, 0.006), (0.044, 0.002)], tacho, facing, segments=40)
    lathe(body, "Rubber", [(0.044, 0.002), (0.0, 0.002)], tacho, facing, segments=40)
    needle = rounded([(-0.002, -0.006), (0.002, -0.006), (0.0008, 0.04), (-0.0008, 0.04)], step=0.01)
    extrude(body, "Dash", needle, 0.0006, tacho + facing * 0.0034, ex * 0.8 + ey * 0.6, ey * 0.8 - ex * 0.6, chamfer=0.0)
    panel = rounded([(-0.092, -0.03, 0.006), (-0.022, -0.03, 0.006), (-0.022, 0.034, 0.006), (-0.092, 0.034, 0.006)], step=0.006)
    extrude(body, "Rubber", panel, 0.0008, dash + facing * 0.0012, ex, ey, chamfer=0.0002)
    bar = rounded([(-0.086, 0.018), (-0.03, 0.018), (-0.03, 0.022), (-0.086, 0.022)], step=0.02)
    extrude(body, "Dash", bar, 0.0006, dash + facing * 0.0018, ex, ey, chamfer=0.0)
    # Under it, a dark floor between the blades, so the screen looks in on shadow.
    floor = {
        "a": (0.0, -0.770, 0.865),
        "b": (0.0, -0.470, 0.880),
        "c": (0.150, -0.470, 0.935),
        "d": (0.125, -0.640, 0.900),
    }
    shell(body, "Plastic", floor, ["a b c d"], whole=True, crease=0.2, levels=1, thick=0.0, roll=0.0)

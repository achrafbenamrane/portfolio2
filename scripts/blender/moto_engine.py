"""
The bike's middle: its trellis frame, supercharged inline four, exhaust and chain. Imported by
build_moto.py, never run.

Everything is placed from a side photograph, so the numbers are the bike's own. The engine is built
the way one's cast: side-view outlines stacked across the bike, each a little narrower or wider than
the last, with the round things turned and bolted on. That layering is what reads as machinery.
"""

import math

import numpy as np

from moto_kit import bolt, circle, extrude, frame_for, lathe, loft, ring_of, rounded, tube
from moto_spec import AXIS, REAR_AXLE, SWING_PIVOT, X, on_axis

YZ = ((0, 1, 0), (0, 0, 1))
CYLINDERS = (-0.171, -0.057, 0.057, 0.171)
RIGHT, LEFT = -1, 1
SPROCKET_X = 0.128
FRONT_SPROCKET = np.array([SPROCKET_X, 0.085, 0.45])
PLACES = {}
CAN = {}


def at_x(x, y=0.0, z=0.0):
    return np.array([x, y, z], float)


def slab(part, material, outline, x_from, x_to, chamfer=0.002, holes=(), step=0.004):
    """A casting's outline, in side view, filled in across the bike."""
    extrude(part, material, rounded(outline, step=step), x_to - x_from, (x_from, 0, 0), *YZ, holes=holes, chamfer=chamfer)


def turned(part, material, profile, centre, side, segments=48):
    """A profile of (radius, height out from the case), turned about the x axis on one side."""
    lathe(part, material, [(r, h) for r, h in profile], centre, (side, 0, 0), segments=segments)


# ── frame ────────────────────────────────────────────────────────────────────────────────────


def bead(part, out_end, in_end, radius, main_a, main_b, main_radius, material="FrameGreen", size=0.0024):
    """
    The weld where one tube lands on another: for each point round the end of the tube, walk in
    until it meets the other tube's skin. Those points are the joint, and a bead runs round them.
    """
    a, u, v = frame_for(np.asarray(in_end, float) - np.asarray(out_end, float))
    p0 = np.asarray(out_end, float)
    length = float(np.linalg.norm(np.asarray(in_end, float) - p0))
    m0 = np.asarray(main_a, float)
    md = np.asarray(main_b, float) - m0
    md_len = float(np.linalg.norm(md))
    md = md / md_len

    def gap(point):
        rel = point - m0
        t = min(max(float(rel @ md), -0.05), md_len + 0.05)
        return float(np.linalg.norm(rel - md * t)) - main_radius

    ring = []
    for angle in np.linspace(0, math.tau, 22, endpoint=False):
        off = radius * (math.cos(angle) * u + math.sin(angle) * v)
        low, high = 0.0, length
        if gap(p0 + off) < 0:
            ring.append(p0 + off)
            continue
        for _ in range(16):
            mid = (low + high) / 2
            if gap(p0 + a * mid + off) > 0:
                low = mid
            else:
                high = mid
        ring.append(p0 + a * low + off)
    ring.append(ring[0])
    tube(part, material, np.array(ring), size, sides=7, smooth=False, cap=False)


def boss(part, centre, side, radius=0.021, depth=0.02, bolt_size=0.0072, dark=False):
    """A welded boss on the frame with a bolt through it, the way the real one is held together."""
    c = np.asarray(centre, float)
    half = depth / 2
    lathe(part, "FrameGreen", [(0.0, -half), (radius - 0.002, -half), (radius, -half + 0.002), (radius, half - 0.002), (radius - 0.002, half), (radius * 0.72, half), (radius * 0.68, half - 0.002), (0.0, half - 0.002)], c, (side, 0, 0), segments=40)
    head = c + at_x(side * (half - 0.002))
    if dark:
        lathe(part, "Anodised", [(0.0, 0.003), (radius * 0.66, 0.003), (radius * 0.7, 0.0)], head, (side, 0, 0), segments=32)
    else:
        lathe(part, "Steel", [(radius * 0.7, 0.0), (radius * 0.62, 0.0022), (0.0, 0.0022)], head, (side, 0, 0), segments=32)
        lathe(part, "Bolt", [(bolt_size * 1.5, 0.0022), (bolt_size * 1.5, 0.0065), (bolt_size * 1.32, 0.0078), (0.0, 0.0078)], head, (side, 0, 0), segments=6)


def frame(part):
    """A steel trellis: tubes laid out as the photographs show them, welded where they land."""
    r = 0.0137
    head_top, head_foot = on_axis(1.012), on_axis(0.855)
    lathe(part, "FrameGreen", [(0.0, -0.004), (0.031, -0.004), (0.037, 0.0), (0.037, 0.157), (0.031, 0.161), (0.0, 0.161)], head_foot, AXIS, segments=40)

    for s in (LEFT, RIGHT):
        t0 = head_top + at_x(s * 0.024, 0.0, -0.022)
        t1 = at_x(s * 0.158, -0.358, 0.872)
        t2 = at_x(s * 0.188, -0.292, 0.846)
        t3 = at_x(s * 0.192, -0.215, 0.812)
        t4 = at_x(s * 0.176, 0.0, 0.748)
        t5 = at_x(s * 0.156, 0.135, 0.702)
        b0 = head_foot + at_x(s * 0.026, 0.002, 0.03)
        b1 = at_x(s * 0.158, -0.33, 0.745)
        b2 = at_x(s * 0.186, -0.18, 0.676)
        b3 = at_x(s * 0.176, -0.125, 0.664)
        l0 = head_foot + at_x(s * 0.022, 0.0, 0.004)
        l1 = at_x(s * 0.165, -0.355, 0.622)
        l2 = at_x(s * 0.186, -0.32, 0.565)
        l3 = at_x(s * 0.196, -0.262, 0.502)
        p1 = at_x(s * 0.158, 0.147, 0.542)
        p2 = at_x(s * 0.158, 0.14, 0.44)
        p3 = at_x(s * 0.158, 0.108, 0.335)
        mid = at_x(s * 0.165, 0.02, 0.625)

        # The top rail bends out round the tank and runs straight back to the post.
        tube(part, "FrameGreen", [t0, t0 + at_x(s * 0.05, 0.022, -0.012), t1, t2, t3], r, sides=18, step=0.012)
        tube(part, "FrameGreen", [t3, t4], r, sides=18, smooth=False)
        tube(part, "FrameGreen", [t4, t5], r, sides=18, smooth=False)
        # The lower rail, and the short struts that triangulate the two.
        tube(part, "FrameGreen", [b0, b0 + at_x(s * 0.055, 0.03, -0.02), b1, b2], r, sides=18, step=0.012)
        tube(part, "FrameGreen", [t3, b2], r * 0.92, sides=16, smooth=False)
        tube(part, "FrameGreen", [b2, b3], r * 0.92, sides=16, smooth=False)
        tube(part, "FrameGreen", [b3, t4], r * 0.92, sides=16, smooth=False)
        tube(part, "FrameGreen", [b3, mid, p1], r * 0.92, sides=16, smooth=False)
        tube(part, "FrameGreen", [t4, mid], r * 0.86, sides=16, smooth=False)
        tube(part, "FrameGreen", [l0, l0 + at_x(s * 0.05, 0.025, -0.022), l1, l2, l3], r * 0.95, sides=18, step=0.012)

        bead(part, b2, t3, r * 0.92, t3, t4, r)
        bead(part, t3, b2, r * 0.92, b1, b2, r)
        bead(part, b3, t4, r * 0.92, t4, t5, r)
        bead(part, mid, t4, r * 0.86, t4, t5, r)
        bead(part, b2, b3, r * 0.92, t3, b2, r * 0.92)

        # The rear post: straight down from the rail through three bolted bosses.
        tube(part, "FrameGreen", [t5, p1, p2, p3], r * 1.06, sides=18, smooth=False)
        bead(part, p1, t5, r * 1.06, t4, t5, r)
        boss(part, t5 + at_x(s * 0.004), s, radius=0.0225, depth=0.034, dark=True)
        boss(part, p1 + at_x(s * 0.006), s, radius=0.0215, depth=0.03)
        boss(part, p2 + at_x(s * 0.006), s, radius=0.0245, depth=0.03)
        boss(part, p3 + at_x(s * 0.006), s, radius=0.0195, depth=0.03)

        # The bolted plates either side of the swingarm pivot, tying the post to the engine.
        plate = [(0.13, 0.515, 0.012), (0.182, 0.51, 0.018), (0.205, 0.475, 0.016), (0.196, 0.432, 0.016), (0.135, 0.42, 0.012)]
        start = s * 0.152 if s > 0 else s * 0.152 - 0.012
        slab(part, "Magnesium", plate, start, start + 0.012, chamfer=0.002, step=0.003)
        lathe(part, "Steel", [(0.021, 0.0), (0.019, 0.0024), (0.0, 0.0024)], SWING_PIVOT + at_x(s * 0.164), (s, 0, 0), segments=28)
        lathe(part, "Bolt", [(0.0125, 0.0024), (0.0125, 0.0085), (0.011, 0.0098), (0.0, 0.0098)], SWING_PIVOT + at_x(s * 0.164), (s, 0, 0), segments=6)
        for y, z in ((0.19, 0.5), (0.192, 0.442)):
            bolt(part, at_x(s * 0.164, y, z), (s, 0, 0), size=0.0042, washer=True)

    # Cross tubes that tie the two sides together behind the engine.
    tube(part, "FrameGreen", [at_x(-0.156, 0.135, 0.702), at_x(0.156, 0.135, 0.702)], 0.0125, sides=16, smooth=False)
    tube(part, "FrameGreen", [at_x(-0.158, 0.147, 0.56), at_x(0.158, 0.147, 0.56)], 0.0125, sides=16, smooth=False)
    tube(part, "FrameGreen", [at_x(-0.158, 0.108, 0.335), at_x(0.158, 0.108, 0.335)], 0.012, sides=16, smooth=False)


def subframe(part):
    """The black tubes that carry the seat and tail: they stay out of sight, inside the covers."""
    for s in (LEFT, RIGHT):
        tube(part, "Anodised", [at_x(s * 0.14, 0.15, 0.71), at_x(s * 0.095, 0.34, 0.77), at_x(s * 0.07, 0.56, 0.875)], 0.0105, sides=12, smooth=False)
        tube(part, "Anodised", [at_x(s * 0.145, 0.16, 0.6), at_x(s * 0.09, 0.34, 0.74)], 0.0095, sides=12, smooth=False)


def engine(part):
    # Crankcases: a dark casting, wide round the crank, narrower at the gearbox behind it, so the
    # frame's post stands clear of it, in layers from the middle out.
    case = [(-0.255, 0.525, 0.02), (-0.268, 0.36, 0.03), (-0.205, 0.312, 0.03), (-0.105, 0.285, 0.03), (-0.035, 0.28, 0.01), (-0.035, 0.61, 0.01), (-0.2, 0.61, 0.03)]
    slab(part, "Magnesium", case, -0.185, 0.185, chamfer=0.004)
    inset = [(-0.245, 0.515, 0.02), (-0.256, 0.365, 0.03), (-0.198, 0.322, 0.03), (-0.1, 0.298, 0.03), (-0.045, 0.292, 0.01), (-0.045, 0.585, 0.01), (-0.19, 0.585, 0.03)]
    slab(part, "Magnesium", inset, -0.2, 0.2, chamfer=0.003)
    box = [(-0.05, 0.6, 0.01), (-0.05, 0.28, 0.01), (0.06, 0.27, 0.03), (0.13, 0.305, 0.03), (0.135, 0.42, 0.03), (0.12, 0.55, 0.03), (0.02, 0.6, 0.03)]
    slab(part, "Magnesium", box, -0.13, 0.13, chamfer=0.004)
    inset = [(-0.04, 0.585, 0.01), (-0.04, 0.292, 0.01), (0.052, 0.284, 0.03), (0.118, 0.315, 0.03), (0.122, 0.415, 0.03), (0.105, 0.535, 0.03), (0.01, 0.585, 0.03)]
    slab(part, "Magnesium", inset, -0.142, 0.142, chamfer=0.003)

    for side in (LEFT, RIGHT):
        outer = side * 0.2
        for at in ((-0.24, 0.47), (-0.245, 0.385), (-0.19, 0.335), (-0.1, 0.308), (-0.1, 0.572), (-0.19, 0.568)):
            bolt(part, at_x(outer, *at), (side, 0, 0), size=0.0034, washer=True)
        for at in ((0.05, 0.295), (0.108, 0.33), (0.112, 0.4), (0.09, 0.525)):
            bolt(part, at_x(side * 0.142, *at), (side, 0, 0), size=0.0034, washer=True)
        # The ribs that run across real castings.
        for path in (
            [(-0.235, 0.375), (-0.19, 0.345), (-0.13, 0.325)],
            [(-0.2, 0.55), (-0.13, 0.558), (-0.06, 0.552)],
            [(-0.075, 0.36), (-0.06, 0.45), (-0.075, 0.53)],
        ):
            tube(part, "Magnesium", [at_x(outer, *q) for q in path], 0.0048, sides=8, flat=0.9)
        for path in ([(0.03, 0.31), (0.08, 0.33), (0.1, 0.365)], [(0.0, 0.56), (0.05, 0.545), (0.09, 0.51)]):
            tube(part, "Magnesium", [at_x(side * 0.142, *q) for q in path], 0.0048, sides=8, flat=0.9)

    # Alternator on the left, where the photographs show one big round cover.
    c1 = at_x(0.2, -0.165, 0.425)
    turned(part, "Magnesium", [(0.083, 0.0), (0.083, 0.009), (0.078, 0.013), (0.074, 0.03), (0.066, 0.034), (0.0, 0.036)], c1, LEFT, segments=72)
    turned(part, "Magnesium", [(0.05, 0.034), (0.052, 0.04), (0.05, 0.043), (0.0, 0.043)], c1, LEFT, segments=56)
    slab(part, "Magnesium", [(-0.176, 0.487, 0.004), (-0.154, 0.487, 0.004), (-0.158, 0.455, 0.003), (-0.172, 0.455, 0.003)], 0.232, 0.2445, chamfer=0.0012)
    for at in ring_of(c1 + at_x(0.01), X, 0.082, 7, 0.5):
        bolt(part, at, (LEFT, 0, 0), size=0.0042, washer=True)

    # Starter and sprocket cover, the second round shape on the left.
    c2 = at_x(0.142, 0.038, 0.432)
    turned(part, "Magnesium", [(0.078, 0.0), (0.078, 0.008), (0.073, 0.012), (0.068, 0.03), (0.058, 0.034), (0.0, 0.035)], c2, LEFT, segments=64)
    for at in ring_of(c2 + at_x(0.009), X, 0.073, 6, 0.3):
        bolt(part, at, (LEFT, 0, 0), size=0.0036, washer=True)
    # The little cap between them, and the clutch arm above it.
    lathe(part, "Magnesium", [(0.021, 0.0), (0.021, 0.03), (0.019, 0.034), (0.0, 0.034)], at_x(0.19, -0.012, 0.47), (LEFT, 0, 0), segments=24)
    bolt(part, at_x(0.224, -0.012, 0.47), (LEFT, 0, 0), size=0.005)
    slab(part, "Alloy", [(-0.058, 0.507, 0.003), (0.0, 0.512, 0.003), (0.0, 0.5, 0.003), (-0.058, 0.497, 0.003)], 0.196, 0.204, chamfer=0.0012)
    tube(part, "Steel", [at_x(0.2, -0.012, 0.545), at_x(0.2, -0.012, 0.47)], 0.0042, sides=10, smooth=False)

    # The bright upper case, showing between the duct and the covers.
    for x0, x1, s in ((0.13, 0.17, 1), (-0.17, -0.13, -1)):
        slab(part, "Cast", [(-0.04, 0.588, 0.006), (0.08, 0.588, 0.006), (0.09, 0.535, 0.006), (0.02, 0.516, 0.008), (-0.04, 0.53, 0.006)], x0, x1, chamfer=0.003)
        for y, z in ((-0.025, 0.572), (0.03, 0.572), (0.07, 0.565), (0.0, 0.54), (0.05, 0.54)):
            bolt(part, at_x(s * 0.17, y, z), (s, 0, 0), size=0.0034)

    # Clutch cover on the right: a big turned dome with its bolt circle.
    c3 = at_x(-0.142, 0.015, 0.415)
    turned(part, "Magnesium", [(0.112, 0.0), (0.112, 0.022), (0.106, 0.03), (0.096, 0.05), (0.08, 0.062), (0.05, 0.066), (0.0, 0.066)], c3, RIGHT, segments=72)
    turned(part, "Alloy", [(0.038, 0.0656), (0.034, 0.0695), (0.0, 0.0705)], c3, RIGHT, segments=40)
    for at in ring_of(c3 + at_x(-0.03), X, 0.108, 11):
        bolt(part, at, (RIGHT, 0, 0), size=0.0036, washer=True)
    for at in ring_of(c3 + at_x(-0.0695), X, 0.05, 6):
        bolt(part, at, (RIGHT, 0, 0), size=0.0028)
    c4 = at_x(-0.2, -0.185, 0.43)
    turned(part, "Magnesium", [(0.052, 0.0), (0.052, 0.008), (0.046, 0.02), (0.0, 0.022)], c4, RIGHT, segments=56)
    for at in ring_of(c4 + at_x(-0.009), X, 0.047, 6):
        bolt(part, at, (RIGHT, 0, 0), size=0.0032)

    sump(part)

    # Oil filter, low on the front.
    lathe(part, "Anodised", [(0.0, -0.002), (0.0325, -0.002), (0.0335, 0.0), (0.0335, 0.07), (0.031, 0.074), (0.0, 0.074)], at_x(-0.03, -0.235, 0.33), (0, -0.7, -0.7), segments=28)

    # Cylinder block, with ribs round it, then head and cam cover.
    block = [(-0.285, 0.6, 0.008), (-0.3, 0.7, 0.004), (-0.075, 0.74, 0.004), (-0.04, 0.6, 0.008)]
    slab(part, "Cast", block, -0.178, 0.178, chamfer=0.002)
    for k in np.arange(0.0, 1.0, 0.16):
        a = (-0.292 - 0.012 * k, 0.615 + 0.09 * k)
        b = (-0.045 - 0.03 * k, 0.615 + 0.11 * k)
        slab(part, "Cast", [(a[0] - 0.01, a[1], 0.002), (a[0] - 0.01, a[1] + 0.006, 0.002), (b[0] + 0.01, b[1] + 0.006, 0.002), (b[0] + 0.01, b[1], 0.002)], -0.186, 0.186, chamfer=0.0008)
    head = [(-0.31, 0.7, 0.008), (-0.325, 0.765, 0.01), (-0.07, 0.8, 0.01), (-0.06, 0.735, 0.008)]
    slab(part, "Magnesium", head, -0.172, 0.172, chamfer=0.003)
    cover = [(-0.315, 0.765, 0.012), (-0.3, 0.81, 0.02), (-0.09, 0.84, 0.02), (-0.075, 0.8, 0.012)]
    slab(part, "Magnesium", cover, -0.158, 0.158, chamfer=0.004)
    for x in CYLINDERS:
        cap = at_x(x * 0.9, -0.2, 0.828)
        lathe(part, "Spring", [(0.0225, -0.002), (0.0225, 0.006), (0.0195, 0.0095), (0.012, 0.0095), (0.0115, 0.006), (0.0, 0.006)], cap, (0, -0.08, 1), segments=24)
        bolt(part, cap + at_x(0, 0, 0.006), (0, -0.08, 1), size=0.0036)
    for x in np.linspace(-0.145, 0.145, 7):
        for y, z in ((-0.29, 0.812), (-0.1, 0.84)):
            bolt(part, at_x(x, y, z), (0, -0.08, 1), size=0.0028)

    # The intake chamber behind the block, its four dark runners held on with bright clamps.
    tube(part, "Magnesium", [at_x(-0.16, -0.09, 0.735), at_x(0.16, -0.09, 0.735)], 0.03, sides=20, smooth=False)
    for x in CYLINDERS:
        tube(part, "Anodised", [at_x(x, -0.09, 0.735), at_x(x * 0.96, -0.15, 0.78)], 0.016, sides=14, smooth=False)
        collar(part, "Steel", at_x(x * 0.98, -0.12, 0.7575), (0.0, -0.8, 0.6), 0.0168, wide=0.004)

    supercharger(part)
    radiator(part)
    casting(part)
    plumbing(part)
    loom(part)


def supercharger(part):
    """The red impeller housing on the left of the engine: a smooth scroll growing round to its outlet."""
    centre = at_x(0.155, 0.04, 0.648)
    # Behind it, the gear drive housing it bolts to.
    lathe(part, "Magnesium", [(0.0, -0.11), (0.05, -0.11), (0.05, -0.022), (0.058, -0.02), (0.058, 0.0), (0.0, 0.0)], centre, X, segments=48)
    scroll = []
    sides = 26
    angles = np.linspace(0, math.tau, sides, endpoint=False)
    steps = 72
    for i in range(steps):
        t = i / (steps - 1)
        a = t * math.tau * 0.98 + 2.4
        section = 0.017 + 0.0165 * t
        radius = 0.038 + section
        along = np.array([0.0, math.cos(a), math.sin(a)])
        middle = centre + along * radius + at_x(-0.002)
        scroll.append(middle + np.cos(angles)[:, None] * along * section - np.sin(angles)[:, None] * np.array([1.0, 0, 0]) * section * 1.15)
    loft(part, "Impeller", scroll)
    # The outlet, curling back toward the chamber.
    tube(part, "Impeller", [centre + at_x(-0.002, -0.052, 0.042), centre + at_x(-0.03, -0.086, 0.01), centre + at_x(-0.07, -0.09, -0.05)], 0.0315, sides=20, step=0.012)
    # The cover plate, and the dark nose of the shaft in the middle.
    lathe(part, "Impeller", [(0.0, -0.005), (0.044, -0.005), (0.046, 0.002), (0.044, 0.018), (0.034, 0.03), (0.03, 0.034), (0.0, 0.034)], centre, X, segments=56)
    lathe(part, "Anodised", [(0.0305, 0.024), (0.0305, 0.03), (0.0285, 0.05), (0.0255, 0.053), (0.0, 0.053)], centre, X, segments=40)
    for at in ring_of(centre + at_x(0.024), X, 0.0385, 8, 0.3):
        bolt(part, at, (LEFT, 0, 0), size=0.0026)
    # The bracket that ties the housing to the frame.
    slab(part, "Anodised", [(-0.01, 0.655, 0.004), (0.02, 0.67, 0.004), (0.02, 0.655, 0.004), (-0.005, 0.64, 0.004)], 0.2, 0.208, chamfer=0.001)


def radiator(part):
    """A wide radiator behind the fairing, with its fine metal grille in front of it."""
    foot = np.array([0.0, -0.355, 0.325])
    top = np.array([0.0, -0.405, 0.67])
    up = (top - foot) / np.linalg.norm(top - foot)
    tall = float(np.linalg.norm(top - foot))
    out = [(-0.2, 0.0, 0.014), (-0.2, tall, 0.014), (0.2, tall, 0.014), (0.2, 0.0, 0.014)]
    window = rounded([(-0.184, 0.014, 0.005), (-0.184, tall - 0.014, 0.005), (0.184, tall - 0.014, 0.005), (0.184, 0.014, 0.005)], step=0.006)
    extrude(part, "Cast", rounded(out, step=0.006), 0.032, foot, (1, 0, 0), up, holes=[window], chamfer=0.0012)
    core = rounded([(-0.186, 0.012, 0.003), (-0.186, tall - 0.012, 0.003), (0.186, tall - 0.012, 0.003), (0.186, 0.012, 0.003)], step=0.02)
    extrude(part, "Radiator", core, 0.022, foot + np.cross(X, up) * -0.005, (1, 0, 0), up, chamfer=0.0002)

    # The grille: a real mesh of fine bars just ahead of the core.
    ahead = np.cross(up, X)
    if ahead[1] > 0:
        ahead = -ahead
    plate = foot + ahead * 0.016
    for x in np.arange(-0.18, 0.1805, 0.0095):
        a, b = plate + at_x(x) + up * 0.012, plate + at_x(x) + up * (tall - 0.012)
        tube(part, "Grille", [a, b], 0.0009, sides=4, smooth=False, cap=False)
    for k in np.arange(0.012, tall - 0.011, 0.0095):
        a, b = plate + at_x(-0.182) + up * k, plate + at_x(0.182) + up * k
        tube(part, "Grille", [a, b], 0.0009, sides=4, smooth=False, cap=False)

    # Hoses: thick and black, as they are on the real thing.
    tube(part, "Rubber", [foot + at_x(0.15, 0.03, 0.09), at_x(0.205, -0.312, 0.41), at_x(0.215, -0.262, 0.335), at_x(0.215, -0.205, 0.285), at_x(0.215, -0.135, 0.28), at_x(0.215, -0.065, 0.325), at_x(0.21, -0.03, 0.362)], 0.0165, sides=16, step=0.012)
    lathe(part, "Rubber", [(0.0, -0.016), (0.026, -0.016), (0.029, -0.01), (0.029, 0.01), (0.026, 0.016), (0.0, 0.016)], at_x(0.21, -0.012, 0.372), (0.1, 1, 1), segments=24)
    tube(part, "Rubber", [top + at_x(-0.14, 0.03, -0.03), at_x(-0.18, -0.3, 0.61), at_x(-0.17, -0.26, 0.59)], 0.0145, sides=14)
    for at in (at_x(0.205, -0.312, 0.41), at_x(0.215, -0.065, 0.325)):
        lathe(part, "Steel", [(0.0175, -0.005), (0.0185, -0.004), (0.0185, 0.004), (0.0175, 0.005)], at, (0, 1, 0.3), segments=18)


def exhaust(part):
    """Four stainless headers, down in front of the engine and four into one, out to a short can on the right."""
    drops = (0.0, 0.03, 0.058, 0.086)
    for index, x in enumerate(CYLINDERS):
        port = at_x(x, -0.312, 0.635)
        order = (2, 0, 1, 3)[index]
        low = 0.197 + drops[order]
        path = [
            port,
            at_x(x, -0.335, 0.57),
            at_x(x * 0.98, -0.345, 0.47),
            at_x(x * 0.94, -0.343, 0.375),
            at_x(x * 0.86, -0.318 + 0.012 * order, low + 0.075),
            at_x(x * 0.66, -0.265 + 0.012 * order, low + 0.01),
            at_x(x * 0.4, -0.18, low),
            at_x(x * 0.2, -0.1, 0.205 + 0.5 * drops[order]),
            at_x(x * 0.1, -0.055, 0.215 + 0.2 * drops[order]),
        ]
        tube(part, "Titanium", path, 0.0178, sides=18, step=0.012)
        lathe(part, "Alloy", [(0.0182, -0.006), (0.0225, -0.006), (0.0225, 0.006), (0.0182, 0.006)], port + at_x(0, -0.012, -0.03), (0, -0.33, -0.94), segments=20)
        # The flange and its two studs.
        lathe(part, "Steel", [(0.0185, -0.003), (0.03, -0.003), (0.03, 0.003), (0.0185, 0.003)], port, (0, -0.33, -0.94), segments=20)

    # Four into one: a tapered collector, a slip joint with its spring hooks, and the link pipe.
    joint = at_x(0.0, -0.06, 0.226)
    way = at_x(-0.02, 1.0, -0.06)
    lathe(part, "Titanium", [(0.0, 0.0), (0.056, 0.0), (0.05, 0.05), (0.034, 0.115), (0.032, 0.125)], joint, way, segments=32)
    tip = joint + (way / np.linalg.norm(way)) * 0.125
    can_in = at_x(-0.19, 0.3, 0.335)
    can_out = at_x(-0.228, 0.70, 0.515)
    tube(part, "Titanium", [tip, tip + at_x(-0.006, 0.09, -0.002), at_x(-0.07, 0.185, 0.235), at_x(-0.15, 0.26, 0.295), can_in], 0.0315, sides=22, step=0.012)
    lathe(part, "Steel", [(0.0325, -0.012), (0.0355, -0.008), (0.0355, 0.008), (0.0325, 0.012)], tip + at_x(0, 0.02, 0), (0, 1, 0), segments=24)
    can(part, can_in, can_out)


def can(part, start, end):
    """A short, fat silencer: a carbon sleeve, a stainless cone in, and a stainless cap with a deep outlet."""
    way = (end - start) / np.linalg.norm(end - start)
    length = float(np.linalg.norm(end - start))
    # An oval sleeve, deeper than it's wide, slightly tapered like the real one.
    rings = []
    angles = np.linspace(0, math.tau, 56, endpoint=False)
    ca, sa = np.cos(angles), np.sin(angles)
    up = np.cross(way, np.cross(np.array([0, 0, 1.0]), way))
    up /= np.linalg.norm(up)
    across = np.cross(way, up)
    CAN.update(start=start, way=way, across=across, up=up, length=length)
    uvs = []
    for t, wide, tall in ((0.0, 0.042, 0.05), (0.03, 0.05, 0.06), (0.09, 0.058, 0.07), (0.3, 0.062, 0.075), (0.55, 0.064, 0.077), (0.82, 0.064, 0.078), (0.93, 0.063, 0.077), (0.935, 0.06, 0.074)):
        c = start + way * (length * t)
        rings.append(c + ca[:, None] * across * wide + sa[:, None] * up * tall)
        uvs.append(np.stack([angles * 0.066, np.full(56, length * t)], axis=1))
    loft(part, "Carbon", rings, cap=False, uvs=np.vstack(uvs))
    # The stainless entry cone and band.
    lathe(part, "Stainless", [(0.031, -0.03), (0.035, -0.024), (0.05, 0.03)], start, way, segments=40)
    for t in (0.17,):
        c = start + way * (length * t)
        ring = np.stack([c + ca[:, None] * across * 0.0635 + sa[:, None] * up * 0.0765 - way * 0.008, c + ca[:, None] * across * 0.0635 + sa[:, None] * up * 0.0765 + way * 0.008])
        loft(part, "Stainless", ring, cap=False)
        for k in (-0.8, 0.8, 2.3, 3.9):
            bolt(part, c + across * (0.0635 * math.cos(k)) + up * (0.0765 * math.sin(k)), across * math.cos(k) + up * math.sin(k), size=0.0024)
    # The end cap: a short stainless ring round a deep black outlet.
    c = start + way * (length * 0.93)
    rings = []
    for t, wide, tall in ((0.0, 0.0645, 0.0785), (0.012, 0.0655, 0.0795), (0.03, 0.063, 0.077), (0.036, 0.058, 0.071)):
        q = c + way * t
        rings.append(q + ca[:, None] * across * wide + sa[:, None] * up * tall)
    loft(part, "Stainless", rings, cap=False)
    q = c + way * 0.036
    lathe(part, "Stainless", [(0.056, 0.0), (0.04, -0.002), (0.036, -0.012)], q, way, segments=40)
    lathe(part, "Anodised", [(0.036, -0.012), (0.036, -0.09), (0.0, -0.09)], q, way, segments=32)
    for k in range(8):
        a = k / 8 * math.tau
        bolt(part, q - way * 0.0015 + across * (0.0485 * math.cos(a)) + up * (0.0585 * math.sin(a)), way, size=0.0018)
    PLACES["exhaust_tip"] = q
    PLACES["exhaust_direction"] = way

    # The strap and the two struts up to the subframe.
    mount = start + way * (length * 0.3) + up * 0.074
    for k in (-0.012, 0.012):
        tube(part, "Carbon", [mount + at_x(0, k, 0), at_x(-0.15, 0.3 + k, 0.655)], 0.0065, sides=10, smooth=False)
    lathe(part, "Steel", [(0.016, 0.0), (0.016, 0.01), (0.014, 0.014), (0.0, 0.014)], at_x(-0.156, 0.3, 0.652), (RIGHT, 0, 0), segments=20)


def strake(part, material, x, side, a, b, wide=0.0042, tall=0.0036):
    """A cast rib standing off a case, between two side-view points: wider at its foot than its crown."""
    a, b = np.array(a, float), np.array(b, float)
    d = (b - a) / np.linalg.norm(b - a)
    n = np.array([-d[1], d[0]])
    rings = []
    for p in (a, b):
        rings.append(
            [
                (x - side * 0.001, *(p + n * wide)),
                (x + side * tall, *(p + n * wide * 0.5)),
                (x + side * tall, *(p - n * wide * 0.5)),
                (x - side * 0.001, *(p - n * wide)),
            ]
        )
    loft(part, material, rings)


def casting(part):
    """What a real casting has: a flange round each half, a boss under every bolt, and ribs in the corners."""
    crank = [(-0.245, 0.515, 0.02), (-0.256, 0.365, 0.03), (-0.198, 0.322, 0.03), (-0.1, 0.298, 0.03), (-0.045, 0.292, 0.01), (-0.045, 0.585, 0.01), (-0.19, 0.585, 0.03)]
    gearbox = [(-0.04, 0.585, 0.01), (-0.04, 0.292, 0.01), (0.052, 0.284, 0.03), (0.118, 0.315, 0.03), (0.122, 0.415, 0.03), (0.105, 0.535, 0.03), (0.01, 0.585, 0.03)]
    for side in (LEFT, RIGHT):
        for outline, x in ((crank, side * 0.2), (gearbox, side * 0.142)):
            line = rounded(outline, step=0.012)
            line = np.vstack([line, line[:1]])
            tube(part, "Magnesium", [at_x(x + side * 0.0006, y, z) for y, z in line], 0.0034, sides=6, smooth=False, cap=False)
        for at in ((-0.24, 0.47), (-0.245, 0.385), (-0.19, 0.335), (-0.1, 0.308), (-0.1, 0.572), (-0.19, 0.568)):
            lathe(part, "Magnesium", [(0.0135, 0.0), (0.0125, 0.0032), (0.0085, 0.0032), (0.0075, 0.0)], at_x(side * 0.2, *at), (side, 0, 0), segments=16)
        for at in ((0.05, 0.295), (0.108, 0.33), (0.112, 0.4), (0.09, 0.525)):
            lathe(part, "Magnesium", [(0.0135, 0.0), (0.0125, 0.0032), (0.0085, 0.0032), (0.0075, 0.0)], at_x(side * 0.142, *at), (side, 0, 0), segments=16)
        # The seam where the two halves of the crankcase meet, running right across the engine.
        strake(part, "Magnesium", side * 0.2, side, (-0.25, 0.522), (-0.046, 0.53), wide=0.0028, tall=0.0024)
        strake(part, "Magnesium", side * 0.142, side, (-0.04, 0.53), (0.112, 0.522), wide=0.0028, tall=0.0024)

    # Left: ribs in the corners the two big covers leave, fanning out from them.
    for a, b in (
        ((-0.082, 0.54), (-0.052, 0.565)),
        ((-0.093, 0.522), (-0.05, 0.548)),
        ((-0.078, 0.348), (-0.052, 0.318)),
        ((-0.09, 0.335), (-0.066, 0.31)),
        ((-0.232, 0.54), (-0.2, 0.517)),
        ((-0.244, 0.525), (-0.215, 0.503)),
        ((-0.236, 0.345), (-0.208, 0.365)),
    ):
        strake(part, "Magnesium", 0.2, LEFT, a, b)
    for a, b in (((-0.03, 0.51), (-0.03, 0.56)), ((-0.012, 0.525), (-0.012, 0.562)), ((0.098, 0.5), (0.078, 0.54)), ((0.108, 0.485), (0.092, 0.525))):
        strake(part, "Magnesium", 0.142, LEFT, a, b)
    for a, b in (((-0.03, 0.31), (-0.03, 0.36)), ((-0.012, 0.3), (-0.012, 0.345)), ((0.1, 0.345), (0.086, 0.33)), ((0.112, 0.37), (0.092, 0.345))):
        strake(part, "Magnesium", 0.142, LEFT, a, b)

    # Right: the crank half is more open, so its ribs run the length of it.
    for z, y0, y1 in ((0.54, -0.235, -0.062), (0.505, -0.238, -0.1), (0.36, -0.24, -0.11), (0.335, -0.2, -0.09)):
        strake(part, "Magnesium", -0.2, RIGHT, (y0, z), (y1, z + 0.006))
    for y in (-0.12, -0.105, -0.09, -0.075):
        strake(part, "Magnesium", -0.2, RIGHT, (y, 0.375), (y + 0.004, 0.495))

    # The big covers carry a raised plate, the left one with the tab that makes it look cast, not turned.
    t = np.linspace(0, math.tau, 96, endpoint=False)
    reach = 0.05 + 0.022 * np.exp(-(((t - math.radians(128) + math.pi) % math.tau - math.pi) / 0.3) ** 2)
    extrude(part, "Magnesium", np.stack([reach * np.cos(t), reach * np.sin(t)], axis=1), 0.0052, (0.2428, -0.165, 0.425), *YZ, chamfer=0.0016)
    for at in ring_of(at_x(0.248, -0.165, 0.425), X, 0.04, 3, 0.4):
        bolt(part, at, (LEFT, 0, 0), size=0.0034)
    lathe(part, "Magnesium", [(0.05, 0.0), (0.05, 0.002), (0.047, 0.0035), (0.0, 0.0035)], at_x(0.177, 0.038, 0.432), (LEFT, 0, 0), segments=48)

    # The bracket low behind the engine that carries the side stand, with its big pivot bolt.
    slab(part, "Magnesium", [(0.062, 0.312, 0.008), (0.186, 0.292, 0.01), (0.186, 0.232, 0.01), (0.1, 0.232, 0.01), (0.062, 0.262, 0.008)], 0.126, 0.15, chamfer=0.003)
    for y, z in ((0.078, 0.292), (0.172, 0.28), (0.172, 0.246)):
        bolt(part, at_x(0.15, y, z), (LEFT, 0, 0), size=0.0042, washer=True)


def sump(part):
    """The oil pan: a bolted flange, a ribbed upper tier, and a narrower pan tucked up over the headers."""
    slab(part, "Cast", [(-0.122, 0.304, 0.006), (0.076, 0.304, 0.006), (0.082, 0.282, 0.006), (-0.126, 0.282, 0.006)], -0.144, 0.144, chamfer=0.0024)
    slab(part, "Cast", [(-0.11, 0.284, 0.006), (0.066, 0.284, 0.006), (0.06, 0.244, 0.012), (-0.114, 0.25, 0.012)], -0.132, 0.132, chamfer=0.006)
    slab(part, "Cast", [(-0.102, 0.254, 0.012), (0.058, 0.25, 0.012), (0.036, 0.202, 0.018), (-0.08, 0.204, 0.018)], -0.11, 0.11, chamfer=0.009)
    for side in (LEFT, RIGHT):
        for y in (-0.112, -0.07, -0.028, 0.014, 0.056, 0.076):
            bolt(part, at_x(side * 0.144, y, 0.294), (side, 0, 0), size=0.0036, washer=True)
        for y in np.arange(-0.098, 0.056, 0.0155):
            strake(part, "Cast", side * 0.132, side, (y, 0.28), (y - 0.002, 0.252), wide=0.003, tall=0.0048)
        for y in np.arange(-0.07, 0.03, 0.021):
            strake(part, "Cast", side * 0.11, side, (y - 0.008, 0.248), (y + 0.002 * (y / 0.03), 0.212), wide=0.0034, tall=0.004)
    # The level window on the right, the drain plug underneath, and a boss for the oil feed.
    lathe(part, "Alloy", [(0.0175, 0.0), (0.0175, 0.003), (0.0145, 0.0042), (0.0125, 0.0042), (0.0125, 0.0)], at_x(-0.132, -0.03, 0.264), (RIGHT, 0, 0), segments=24)
    lathe(part, "Lens", [(0.0125, 0.0), (0.0, 0.0)], at_x(-0.132, -0.03, 0.2652), (RIGHT, 0, 0), segments=20)
    lathe(part, "Alloy", [(0.0, 0.0), (0.0115, 0.0), (0.0115, 0.0055), (0.0095, 0.0065), (0.0, 0.0065)], at_x(0.0, -0.03, 0.2), (0, 0, -1), segments=6)
    lathe(part, "Cast", [(0.016, 0.0), (0.016, 0.012), (0.0125, 0.016), (0.0, 0.016)], at_x(0.132, 0.03, 0.264), (LEFT, 0, 0), segments=20)


def banjo(part, at, way):
    """The bolted end of a hard oil line."""
    lathe(part, "Steel", [(0.0, -0.0048), (0.0072, -0.0048), (0.0078, 0.0), (0.0072, 0.0048), (0.0, 0.0048)], at, way, segments=12)
    lathe(part, "Alloy", [(0.0058, 0.0048), (0.0058, 0.0092), (0.0048, 0.0104), (0.0, 0.0104)], at, way, segments=6)


def collar(part, material, at, way, radius, wide=0.0035):
    """A clip, or a hose clamp, round something."""
    lathe(part, material, [(radius - 0.0012, -wide), (radius + 0.0006, -wide), (radius + 0.0012, -wide * 0.4), (radius + 0.0012, wide * 0.4), (radius + 0.0006, wide), (radius - 0.0012, wide)], at, way, segments=14)


def plumbing(part):
    """The pipes that read from two metres away: bright hard oil lines, and the second coolant hose."""
    # Left: out of the bright upper case, along over the alternator, and down in front of it.
    line = [at_x(0.214, -0.052, 0.532), at_x(0.226, -0.075, 0.535), at_x(0.228, -0.14, 0.532), at_x(0.226, -0.215, 0.522), at_x(0.226, -0.262, 0.47), at_x(0.222, -0.268, 0.4), at_x(0.206, -0.262, 0.352)]
    tube(part, "Stainless", line, 0.0034, sides=8, step=0.012)
    banjo(part, line[0], (LEFT, 0, 0))
    banjo(part, line[-1], (LEFT, 0, 0))
    for at, way in ((line[2], (0, 1, 0)), (line[4], (0, 0.1, 1))):
        collar(part, "Anodised", at, way, 0.0056)

    # Left, behind: a short loop from the top of the gearbox round to the rear of its cover.
    line = [at_x(0.176, 0.082, 0.556), at_x(0.184, 0.112, 0.548), at_x(0.178, 0.126, 0.5), at_x(0.158, 0.118, 0.46), at_x(0.146, 0.112, 0.452)]
    tube(part, "Stainless", line, 0.003, sides=8, step=0.012)
    banjo(part, line[0], (LEFT, 0, 0))

    # Right: the same again, running along the top of the crank half to the head.
    line = [at_x(-0.206, -0.082, 0.56), at_x(-0.222, -0.11, 0.565), at_x(-0.224, -0.2, 0.555), at_x(-0.222, -0.255, 0.53), at_x(-0.206, -0.268, 0.47), at_x(-0.2, -0.272, 0.42)]
    tube(part, "Stainless", line, 0.0034, sides=8, step=0.012)
    banjo(part, line[0], (RIGHT, 0, 0))
    collar(part, "Anodised", line[2], (0, 1, 0), 0.0056)

    # The pump's boss, and a second hose rising from it up the front of the gearbox.
    lathe(part, "Magnesium", [(0.0, 0.0), (0.034, 0.0), (0.034, 0.006), (0.03, 0.012), (0.02, 0.016), (0.0, 0.016)], at_x(0.142, 0.004, 0.345), (LEFT, 0, 0), segments=24)
    for at in ring_of(at_x(0.15, 0.004, 0.345), X, 0.0285, 4, 0.5):
        bolt(part, at, (LEFT, 0, 0), size=0.003)
    hose = [at_x(0.2, -0.005, 0.385), at_x(0.208, -0.03, 0.42), at_x(0.206, -0.05, 0.47), at_x(0.205, -0.056, 0.525), at_x(0.19, -0.07, 0.585)]
    tube(part, "Rubber", hose, 0.0105, sides=12, step=0.012)
    collar(part, "Steel", hose[0] + at_x(0.002, -0.005, 0.008), (0.3, -0.6, 0.74), 0.0115, wide=0.0045)
    collar(part, "Steel", at_x(0.205, -0.056, 0.54), (0, -0.1, 1), 0.0115, wide=0.0045)


def loom(part):
    """The wiring: three strands taped together, following the frame, with a branch down to the alternator."""
    for side in (LEFT, RIGHT):
        s = side
        rail = [at_x(s * 0.135, -0.34, 0.815), at_x(s * 0.158, -0.255, 0.79), at_x(s * 0.155, -0.12, 0.748), at_x(s * 0.15, 0.0, 0.72), at_x(s * 0.14, 0.095, 0.69), at_x(s * 0.136, 0.118, 0.63), at_x(s * 0.14, 0.115, 0.575)]
        for k, (dy, dz, radius) in enumerate(((0.0, -0.0045, 0.0036), (0.0052, 0.0022, 0.0028), (-0.0048, 0.0028, 0.0024))):
            path = [p + at_x(0.0, dy * (1 + 0.5 * math.sin(i * 1.7 + k)), dz * (1 + 0.5 * math.cos(i * 1.3 + k))) for i, p in enumerate(rail)]
            tube(part, "Rubber", path, radius, sides=6, step=0.02)
        for a, b in zip(rail[1:], rail[2:]):
            collar(part, "Plastic", (a + b) / 2, b - a, 0.0085, wide=0.0065)
        for at in (rail[2], rail[4]):
            collar(part, "Anodised", at, (0.0, 1.0, -0.3), 0.0092, wide=0.0042)

    # The branch: under the rail, behind the duct, to a connector on top of the alternator.
    branch = [at_x(0.17, -0.025, 0.71), at_x(0.195, -0.05, 0.64), at_x(0.21, -0.09, 0.565), at_x(0.214, -0.125, 0.542), at_x(0.216, -0.15, 0.527)]
    for dy, dz, radius in ((0.0, 0.0, 0.0032), (0.0048, 0.0026, 0.0024)):
        tube(part, "Rubber", [p + at_x(0.0, dy, dz) for p in branch], radius, sides=6, step=0.02)
    plug = rounded([(-0.012, -0.008, 0.002), (0.012, -0.008, 0.002), (0.012, 0.008, 0.002), (-0.012, 0.008, 0.002)], step=0.004)
    extrude(part, "Plastic", plug, 0.012, at_x(0.21, -0.155, 0.522), *YZ, chamfer=0.001)

    # Plugs and a relay box, up under the tank where the trellis shows them.
    for s, y, z in ((LEFT, -0.075, 0.76), (LEFT, 0.04, 0.705), (RIGHT, -0.06, 0.755)):
        lathe(part, "Plastic", [(0.0, -0.016), (0.0095, -0.016), (0.0105, -0.012), (0.0105, 0.012), (0.0095, 0.016), (0.0, 0.016)], at_x(s * 0.148, y, z), (0, 0.92, -0.38), segments=8)
    box = rounded([(-0.2, 0.74, 0.004), (-0.11, 0.74, 0.004), (-0.11, 0.795, 0.004), (-0.2, 0.795, 0.004)], step=0.01)
    extrude(part, "Plastic", box, 0.09, (-0.045, 0, 0), *YZ, chamfer=0.003)


def sprocket(part, material, centre, teeth, radius, thickness, windows=0):
    """Real teeth, and lightening windows cut between the arms."""
    pts = []
    pitch = math.tau / teeth
    for k in range(teeth):
        base = k * pitch
        for t, r in ((-0.5, radius - 0.0062), (-0.24, radius - 0.0052), (-0.1, radius + 0.0028), (0.1, radius + 0.0028), (0.24, radius - 0.0052)):
            a = base + t * pitch
            pts.append((r * math.cos(a), r * math.sin(a)))
    holes = [circle(0.0185 if windows else 0.012, count=28)]
    for k in range(windows):
        a = k / windows * math.tau
        spread = math.tau / windows * 0.34
        inner, outer = 0.042, radius - 0.019
        shape = [
            (inner * math.cos(a - spread * 0.55), inner * math.sin(a - spread * 0.55), 0.005),
            (outer * math.cos(a - spread), outer * math.sin(a - spread), 0.008),
            (outer * math.cos(a + spread), outer * math.sin(a + spread), 0.008),
            (inner * math.cos(a + spread * 0.55), inner * math.sin(a + spread * 0.55), 0.005),
        ]
        holes.append(rounded(shape, step=0.003))
    c = np.array(centre, float)
    extrude(part, material, np.array(pts), thickness, (c[0] - thickness / 2, c[1], c[2]), *YZ, holes=holes, chamfer=0.0007)


def chain(part, front_centre, front_r, rear_centre, rear_r, x):
    """A real chain: bright outer plates, darker inner ones and rollers, walked round both sprockets."""
    a = np.array(front_centre[1:], float)
    b = np.array(rear_centre[1:], float)
    d = b - a
    length = np.linalg.norm(d)
    base = math.atan2(d[1], d[0])
    wrap = math.asin((rear_r - front_r) / length)
    pitch = 0.015875
    top_a = base + math.pi / 2 + wrap
    bottom_a = base - math.pi / 2 - wrap
    path = []
    for t in np.linspace(top_a, top_a - (math.pi + 2 * wrap) * 1.0, 60):
        path.append(b + rear_r * np.array([math.cos(t), math.sin(t)]))
    for t in np.linspace(bottom_a, bottom_a - (math.pi - 2 * wrap), 30):
        path.append(a + front_r * np.array([math.cos(t), math.sin(t)]))
    path.append(path[0])
    path = np.array(path)
    along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    count = int(along[-1] / pitch)
    count -= count % 2
    at = np.linspace(0, along[-1], count, endpoint=False)
    ys, zs = np.interp(at, along, path[:, 0]), np.interp(at, along, path[:, 1])
    points = np.stack([ys, zs], axis=1)
    faces = [(0, 2, 4, 6, 8, 10, 12, 14), (1, 15, 13, 11, 9, 7, 5, 3)]
    faces += [(2 * k, 2 * k + 1, (2 * k + 3) % 16, (2 * k + 2) % 16) for k in range(8)]
    for i in range(count):
        p, q = points[i], points[(i + 1) % count]
        direction = (q - p) / max(np.linalg.norm(q - p), 1e-9)
        normal = np.array([-direction[1], direction[0]])
        outer = i % 2 == 0
        # A link plate is waisted: fat round each pin and narrower between them.
        reach = 0.0058 if outer else 0.0052
        half, waist = (0.0052, 0.0038) if outer else (0.0046, 0.0034)
        outline = [
            p - direction * reach + normal * half * 0.55,
            p + normal * half,
            (p + q) / 2 + normal * waist,
            q + normal * half,
            q + direction * reach + normal * half * 0.55,
            q + direction * reach - normal * half * 0.55,
            q - normal * half,
            (p + q) / 2 - normal * waist,
        ]
        outline.insert(8, p - normal * half)
        outline.insert(9, p - direction * reach - normal * half * 0.55)
        outline = outline[:8]
        wide = 0.0098 if outer else 0.0066
        for side in (-1, 1):
            verts = []
            for pt in outline:
                for offset in (0.0, 0.0015):
                    verts.append((x + side * (wide + offset), pt[0], pt[1]))
            part.add("Steel" if outer else "Chain", np.array(verts), faces)
        lathe(part, "Anodised", [(0.0, -0.0064), (0.0042, -0.0064), (0.0042, 0.0064), (0.0, 0.0064)], (x, p[0], p[1]), X, segments=8)
        if outer:
            for pin in (p, q):
                lathe(part, "Steel", [(0.0, -0.0118), (0.0024, -0.0118), (0.0024, 0.0118), (0.0, 0.0118)], (x, pin[0], pin[1]), X, segments=6)


def final_drive(arm, wheel, body):
    rear = REAR_AXLE + at_x(SPROCKET_X)
    sprocket(wheel, "Anodised", rear, 44, 0.1115, 0.0058, windows=6)
    sprocket(body, "Steel", FRONT_SPROCKET, 17, 0.0432, 0.0078)
    chain(arm, FRONT_SPROCKET, 0.0432, rear, 0.1115, SPROCKET_X)

    # The big silver centre: a machined dish with windows, and the splined nut in the middle.
    x = 0.136
    windows = []
    for k in range(6):
        a = k / 6 * math.tau + 0.3
        spread = 0.36
        inner, outer = 0.044, 0.069
        windows.append(
            rounded(
                [
                    (inner * math.cos(a - spread * 0.8), inner * math.sin(a - spread * 0.8), 0.004),
                    (outer * math.cos(a - spread), outer * math.sin(a - spread), 0.006),
                    (outer * math.cos(a + spread), outer * math.sin(a + spread), 0.006),
                    (inner * math.cos(a + spread * 0.8), inner * math.sin(a + spread * 0.8), 0.004),
                ],
                step=0.003,
            )
        )
    centre = at_x(x, REAR_AXLE[1], REAR_AXLE[2])
    extrude(wheel, "Alloy", circle(0.078, count=96), 0.013, centre, *YZ, holes=[circle(0.029, count=36), *windows], chamfer=0.0022)
    lathe(wheel, "Anodised", [(0.0, -0.02), (0.08, -0.02), (0.08, 0.0), (0.0, 0.0)], centre, X, segments=48)
    lathe(wheel, "Alloy", [(0.029, 0.0), (0.029, 0.016), (0.0255, 0.021), (0.0, 0.022)], centre, X, segments=40)
    star = []
    for k in range(24):
        r = 0.0215 if k % 2 else 0.0172
        star.append((r * math.cos(k / 24 * math.tau), r * math.sin(k / 24 * math.tau)))
    extrude(wheel, "Steel", np.array(star), 0.009, centre + at_x(0.0185), *YZ, chamfer=0.0008)
    for at in ring_of(centre + at_x(0.013), X, 0.0375, 6, 0.3 + math.tau / 12):
        bolt(wheel, at, (LEFT, 0, 0), size=0.0034)
    for at in ring_of(centre + at_x(0.013), X, 0.0735, 12):
        bolt(wheel, at, (LEFT, 0, 0), size=0.0022)

    # The rear disc, inboard of the swingarm, and its small caliper hanging under it.
    disc_x = 0.078
    t = np.linspace(0, math.tau, 200, endpoint=False)
    outer = np.stack([0.125 * np.cos(t), 0.125 * np.sin(t)], axis=1)
    drill = []
    for k in range(24):
        for row in range(2):
            r = 0.1 + 0.015 * row
            a = k / 24 * math.tau + row * 0.11
            drill.append(circle(0.0028, (r * math.cos(a), r * math.sin(a)), count=8))
    extrude(wheel, "Disc", outer, 0.005, (disc_x, REAR_AXLE[1], REAR_AXLE[2]), *YZ, holes=[circle(0.078, count=96), *drill], chamfer=0.0004)
    lathe(wheel, "Carrier", [(0.0, -0.012), (0.084, -0.012), (0.084, 0.004), (0.0, 0.004)], at_x(disc_x, REAR_AXLE[1], REAR_AXLE[2]), X, segments=48)
    slab(arm, "Caliper", [(0.66, 0.178, 0.008), (0.738, 0.176, 0.008), (0.75, 0.215, 0.01), (0.72, 0.232, 0.01), (0.67, 0.228, 0.01), (0.648, 0.205, 0.01)], disc_x - 0.018, disc_x + 0.024, chamfer=0.003)

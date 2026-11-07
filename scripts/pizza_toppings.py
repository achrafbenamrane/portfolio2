"""
The toppings, each as a small stamp: height, colour, roughness and so on, with an alpha.

A stamp is what the page drops onto the pizza, so a topping here and a topping under a
visitor's hand are the same thing. Every call with a new `rng` gives a new one: no two
slices of a mushroom match, and a pizza of copies is the fastest way to look fake.

Each topping can be asked for raw or baked. Call it twice with generators in the same
state and the two line up, because everything that sets the shape happens first.
"""

import numpy as np
from scipy import ndimage as ndi


def linear(rgb):
    c = np.array(rgb, dtype=np.float32) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def ramp(value, stops):
    positions = [s[0] for s in stops]
    colours = np.array([linear(s[1]) for s in stops])
    return np.stack([np.interp(value, positions, colours[:, c]) for c in range(3)], axis=-1)


def mix(a, b, t):
    return a * (1 - t[..., None]) + b * t[..., None]


def flat(colour, like):
    return np.broadcast_to(linear(colour), like.shape)


class Canvas:
    """A square of `extent` metres at `px` metres a pixel, with its own noise."""

    def __init__(self, extent, px, rng):
        self.px = px
        self.rng = rng
        self.n = int(extent / px) | 1
        axis = (np.arange(self.n) - (self.n - 1) / 2) * px
        self.x, self.y = np.meshgrid(axis, axis)
        self.r = np.hypot(self.x, self.y)
        self.angle = np.arctan2(self.y, self.x)

    def noise(self, fine, coarse, slope=1.0):
        white = self.rng.standard_normal((self.n, self.n)).astype(np.float32)
        fx = np.fft.fftfreq(self.n, self.px)
        fy = np.fft.rfftfreq(self.n, self.px)
        f = np.hypot(fx[:, None], fy[None, :])
        f[0, 0] = 1e-9
        shape = (f >= 1 / coarse * 0.7) * (f <= 1 / fine * 1.4) / f**slope
        out = np.fft.irfft2(np.fft.rfft2(white) * shape, s=(self.n, self.n)).astype(np.float32)
        return out / (out.std() + 1e-9)

    def wobble(self, amount, harmonics=(2, 3, 5)):
        out = np.zeros_like(self.angle)
        for k in harmonics:
            out += np.sin(k * self.angle + self.rng.uniform(0, 6.283)) / k**0.5
        return out / np.abs(out).max() * amount

    def blur(self, a, metres):
        return ndi.gaussian_filter(a, metres / self.px)

    def inward(self, mask):
        """Metres from each point of `mask` to its edge."""
        return ndi.distance_transform_edt(mask).astype(np.float32) * self.px


def pepperoni(px, rng, baked=True):
    radius = 0.0182 * rng.uniform(0.84, 1.14)
    c = Canvas(radius * 2.5, px, rng)
    edge = radius * (1 + c.wobble(0.035, (2, 3, 5, 7)))
    u = c.r / edge
    alpha = 1 - smooth(0.97, 1.0, u)
    curl = 1 + 0.4 * np.sin(c.angle * rng.integers(2, 4) + rng.uniform(0, 6.283))
    grain = c.noise(0.0018, 0.009)
    fat = smooth(0.85, 1.45, c.noise(0.0009, 0.0032))
    pepper_specks = smooth(1.9, 2.4, c.noise(0.0004, 0.0012))
    ripple = c.noise(0.0025, 0.01)

    if not baked:
        # Straight from the slicer: flat, pink and dry.
        meat = ramp(
            np.clip(0.5 + 0.2 * grain, 0, 1),
            [(0.0, (160, 42, 36)), (0.55, (186, 58, 46)), (1.0, (206, 84, 66))],
        )
        colour = mix(meat, flat((238, 176, 152), meat), fat * 0.72)
        colour = mix(colour, flat((40, 22, 18), meat), pepper_specks)
        return {
            "height": 0.0017 + ripple * 0.00003,
            "albedo": colour,
            "rough": 0.46 + 0.03 * grain,
            "scatter": np.full_like(u, 0.14),
            "gloss": np.full_like(u, 0.03),
            "alpha": alpha,
        }

    # Heat curls the edge up into a cup, never evenly, and the fat runs into it.
    height = 0.0012 + 0.0024 * u**3 * curl + ripple * 0.00006
    pool = 1 - smooth(0.34, 0.74, u + 0.16 * c.noise(0.004, 0.02))
    height = height * (1 - pool) + c.blur(height, 0.002) * pool

    meat = ramp(
        np.clip(0.5 + 0.22 * grain, 0, 1),
        [(0.0, (104, 18, 13)), (0.55, (146, 30, 18)), (1.0, (182, 54, 26))],
    )
    colour = mix(meat, flat((226, 132, 94), meat), fat * 0.42)
    colour = mix(colour, flat((26, 16, 13), meat), pepper_specks)

    # The curled lip stands closest to the fire.
    lip = smooth(0.76, 1.0, u + 0.1 * c.noise(0.0018, 0.009))
    colour = mix(colour, flat((74, 18, 11), meat), lip * 0.9)
    burnt = smooth(0.9, 1.04, u + 0.13 * c.noise(0.0012, 0.006))
    colour = mix(colour, flat((22, 11, 9), meat), burnt * 0.8)

    colour = mix(colour, colour * 1.25 * linear((255, 190, 120)), pool * 0.8)
    rough = 0.45 - 0.24 * pool + 0.18 * burnt + 0.03 * c.noise(0.002, 0.01)
    return {
        "height": height,
        "albedo": colour,
        "rough": rough,
        "scatter": 0.07 * (1 - burnt),
        "gloss": 0.08 + 0.4 * pool,
        "alpha": alpha,
    }


def mushroom(px, rng, baked=True):
    width = 0.0152 * rng.uniform(0.86, 1.14)
    c = Canvas(width * 3.1, px, rng)
    x = c.x + c.noise(0.01, 0.04) * 0.00028
    y = c.y + c.noise(0.01, 0.04) * 0.00028 - width * 0.22
    stem_width = width * rng.uniform(0.24, 0.33)

    cap = ((x / width) ** 2 + (np.clip(y, 0, None) / (width * 0.82)) ** 2 < 1) & (y > -width * 0.06)
    stem = (np.abs(x) < stem_width) & (y < 0.0) & (y > -width * 0.6)
    shape = c.blur((cap | stem).astype(np.float32), 0.0006) > 0.5
    alpha = c.blur(shape.astype(np.float32), 0.00022)
    inward = c.inward(shape)
    ripple = c.noise(0.003, 0.012)
    tone = 0.2 * c.noise(0.002, 0.012) + 0.14 * c.noise(0.0006, 0.002)
    fan = np.arctan2(y + width * 0.42, x)
    gills = 0.5 + 0.5 * np.sin(fan * 74 + c.noise(0.002, 0.01) * 1.2)
    gill_zone = (
        smooth(-width * 0.16, width * 0.04, y)
        * (1 - smooth(width * 0.16, width * 0.36, y))
        * (np.abs(x) > stem_width * 0.92)
    )
    skin = np.exp(-inward / 0.0008) * (y > -width * 0.1)

    if baked:
        stops = [(0.0, (176, 124, 70)), (0.5, (216, 168, 104)), (1.0, (238, 204, 146))]
        gill_colour, skin_colour, line_colour = (104, 72, 50), (88, 58, 38), (128, 92, 60)
        height = 0.0023 * (1 - np.exp(-inward / 0.0011)) + 0.0004 + ripple * 0.00008
    else:
        stops = [(0.0, (222, 204, 172)), (0.5, (238, 226, 202)), (1.0, (248, 240, 224))]
        gill_colour, skin_colour, line_colour = (168, 138, 112), (146, 112, 86), (198, 174, 146)
        height = 0.0026 * (1 - np.exp(-inward / 0.0008)) + 0.0004 + ripple * 0.00004

    flesh = ramp(np.clip(0.5 + tone, 0, 1), stops)
    colour = mix(flesh, flat(gill_colour, flesh), gill_zone * (0.42 + 0.5 * gills))
    colour = mix(colour, flat(skin_colour, flesh), np.clip(skin, 0, 1) * 0.88)
    colour = mix(colour, flat(line_colour, flesh), np.exp(-inward / 0.0006) * (1 - skin) * 0.5)
    return {
        "height": height,
        "albedo": colour,
        "rough": (0.32 if baked else 0.5) + 0.05 * ripple,
        "scatter": np.full_like(height, 0.35),
        "gloss": np.full_like(height, 0.2 if baked else 0.02),
        "alpha": alpha,
    }


def olive(px, rng, baked=True):
    radius = 0.0089 * rng.uniform(0.9, 1.1)
    c = Canvas(radius * 2.7, px, rng)
    squash = rng.uniform(0.86, 1.0)
    r = np.hypot(c.x, c.y / squash) * (1 + c.wobble(0.04))
    hole = radius * rng.uniform(0.34, 0.44)
    middle = (radius + hole) / 2
    half = (radius - hole) / 2
    across = np.clip((r - middle) / half, -1, 1)
    alpha = smooth(hole * 0.92, hole * 1.06, r) * (1 - smooth(radius * 0.96, radius * 1.02, r))

    wrinkle = c.noise(0.0012, 0.005)
    dome = np.sqrt(np.clip(1 - across**2, 0, 1))
    height = 0.0033 * dome + 0.0006 + wrinkle * (0.00009 if baked else 0.00002)

    skin = ramp(np.clip(0.42 + 0.25 * c.noise(0.002, 0.008), 0, 1), [(0, (16, 10, 14)), (1, (54, 36, 44))])
    flesh = 1 - smooth(hole * 1.02, hole * 1.42, r)
    colour = mix(skin, flat((94, 72, 62) if baked else (126, 100, 84), skin), flesh * 0.82)
    return {
        "height": height,
        "albedo": colour,
        "rough": 0.2 + (0.06 * np.clip(wrinkle, 0, 2) if baked else 0.0) + 0.12 * flesh,
        "scatter": 0.1 + 0.2 * flesh,
        "gloss": (0.42 if baked else 0.3) * (1 - flesh),
        "alpha": alpha,
    }


def onion(px, rng, baked=True):
    """A curved piece of a red onion ring."""
    radius = 0.0155 * rng.uniform(0.76, 1.24)
    width = 0.0037 * rng.uniform(0.8, 1.25)
    c = Canvas((radius + width) * 2.5, px, rng)
    span = np.radians(rng.uniform(150, 280))
    start = rng.uniform(-3.14, 3.14)
    bend = c.noise(0.02, 0.06) * 0.0006
    r = c.r + bend
    across = (r - radius) / (width / 2)
    turn = np.mod(c.angle - start + np.pi, 2 * np.pi)
    along = np.minimum(turn, span - turn) * radius  # metres from the nearer end
    inside = (np.abs(across) < 1) & (turn < span)
    shape = c.blur(inside.astype(np.float32), 0.0005) > 0.5
    alpha = c.blur(shape.astype(np.float32), 0.0002)
    grain = c.noise(0.0008, 0.003)
    tip_noise = c.noise(0.002, 0.01)

    dome = np.sqrt(np.clip(1 - across**2, 0, 1))
    height = (0.0012 if baked else 0.0019) * dome + 0.0003 + grain * 0.00002
    ring_fibres = 0.5 + 0.5 * np.sin(across * 9 + grain * 0.5)

    if baked:
        flesh = ramp(np.clip(0.5 + 0.3 * across, 0, 1), [(0, (214, 170, 150)), (1, (168, 104, 118))])
        colour = mix(flesh, flat((96, 40, 66), flesh), smooth(0.45, 1.0, across))
        tips = np.exp(-along / 0.0035) * smooth(-0.4, 0.8, tip_noise)
        colour = mix(colour, flat((46, 24, 18), flesh), np.clip(tips, 0, 1) * 0.85)
        rough = 0.3 + 0.05 * grain
        gloss = 0.26
    else:
        flesh = ramp(np.clip(0.5 + 0.3 * across, 0, 1), [(0, (244, 232, 240)), (1, (226, 196, 222))])
        colour = mix(flesh, flat((122, 34, 104), flesh), smooth(0.5, 0.95, across))
        colour = mix(colour, flat((214, 176, 208), flesh), ring_fibres * 0.16)
        rough = 0.24 + 0.03 * grain
        gloss = 0.14
    return {
        "height": height,
        "albedo": colour,
        "rough": rough,
        "scatter": np.full_like(height, 0.62),
        "gloss": np.full_like(height, gloss),
        "alpha": alpha,
    }


def pepper(px, rng, baked=True):
    """A strip of green pepper: curved along its length, with the skin side up."""
    length = 0.034 * rng.uniform(0.74, 1.24)
    width = 0.0078 * rng.uniform(0.8, 1.2)
    c = Canvas(length * 1.34, px, rng)
    bend = rng.uniform(-0.28, 0.28) / length
    across = (c.y - bend * c.x**2 + c.noise(0.012, 0.05) * 0.0003) / (width / 2)
    along = c.x / (length / 2)
    shape = (np.abs(across) < 1 - 0.25 * along**6) & (np.abs(along) < 1)
    shape = c.blur(shape.astype(np.float32), 0.0006) > 0.5
    alpha = c.blur(shape.astype(np.float32), 0.0002)
    inward = c.inward(shape)

    dome = np.sqrt(np.clip(1 - np.clip(across, -1, 1) ** 2, 0, 1))
    blisters = c.noise(0.0022, 0.009)
    slow = c.noise(0.006, 0.03)
    height = 0.0016 * dome + 0.0005 + (blisters * 0.00011 if baked else slow * 0.00004)

    if baked:
        skin = ramp(np.clip(0.5 + 0.24 * blisters, 0, 1), [(0, (40, 72, 22)), (1, (92, 128, 40))])
        burn = smooth(0.95, 1.75, blisters + 0.5 * slow)
        colour = mix(skin, flat((26, 22, 14), skin), burn * 0.9)
        rough = 0.28 + 0.1 * burn
        gloss = 0.26
    else:
        skin = ramp(np.clip(0.5 + 0.2 * slow, 0, 1), [(0, (46, 118, 30)), (1, (96, 168, 44))])
        colour = mix(skin, flat((168, 196, 96), skin), np.exp(-inward / 0.0005) * 0.7)
        rough = np.full_like(height, 0.17)
        gloss = 0.32
    return {
        "height": height,
        "albedo": colour,
        "rough": rough,
        "scatter": np.full_like(height, 0.4),
        "gloss": np.full_like(height, gloss),
        "alpha": alpha,
    }


def basil(px, rng, baked=True):
    length = 0.037 * rng.uniform(0.78, 1.2)
    c = Canvas(length * 1.32, px, rng)
    bend = rng.uniform(-0.16, 0.16)
    s = c.x / length + 0.5
    middle = bend * (s - 0.5) ** 2 * length + c.noise(0.012, 0.05) * 0.0005
    dy = c.y - middle
    inside = np.clip(s, 0, 1)
    half = 0.36 * length * np.sin(np.pi * inside**0.74) ** 0.92 * (1 + 0.05 * c.noise(0.004, 0.02))
    shape = c.blur(((np.abs(dy) < half) & (s > 0) & (s < 1)).astype(np.float32), 0.0004) > 0.5
    alpha = c.blur(shape.astype(np.float32), 0.0002)
    edge = c.inward(shape)

    side = np.abs(dy) / np.maximum(half, 1e-4)
    rib = np.exp(-((dy / 0.00062) ** 2))
    phase = s * 6.4 - side * 1.7
    vein_gap = np.abs(phase - np.round(phase)) / np.maximum(0.09 + 0.15 * side, 1e-3)
    veins = np.exp(-(vein_gap**2) * 3.2) * (1 - smooth(0.82, 1.0, side))

    # The leaf is quilted between its veins and it droops at the sides as it wilts.
    quilt = (1 - np.abs(np.sin(np.pi * phase))) * -0.00015
    height = 0.0009 + 0.0012 * (1 - side**2) + quilt * (1 - rib) + c.noise(0.006, 0.024) * 0.0001
    height = c.blur(height, 0.00035)

    tone = 0.22 * c.noise(0.004, 0.02) + 0.1 * c.noise(0.0009, 0.003)
    wilt_noise = c.noise(0.004, 0.02)
    rough = 0.34 + 0.04 * c.noise(0.003, 0.012)
    if baked:
        leaf = ramp(np.clip(0.46 + tone, 0, 1), [(0.0, (12, 34, 11)), (0.5, (28, 64, 18)), (1.0, (60, 100, 28))])
        colour = mix(leaf, flat((88, 124, 50), leaf), np.clip(rib * 0.8 + veins * 0.3, 0, 1))
        wilt = np.exp(-edge / 0.0014) * smooth(0.1, 1.2, wilt_noise)
        colour = mix(colour, flat((22, 30, 12), leaf), np.clip(wilt, 0, 1) * 0.7)
    else:
        leaf = ramp(np.clip(0.5 + tone, 0, 1), [(0.0, (30, 84, 22)), (0.5, (52, 122, 32)), (1.0, (92, 160, 46))])
        colour = mix(leaf, flat((132, 182, 80), leaf), np.clip(rib * 0.8 + veins * 0.34, 0, 1))
    return {
        "height": height,
        "albedo": colour,
        "rough": rough,
        "scatter": np.full_like(height, 0.5),
        "gloss": np.full_like(height, 0.16),
        "alpha": alpha,
    }

"""
What the chef wears over his clothes: the green apron, the red neckerchief and the toque.

They're cut to the body in pizza_chef_human.py, so that has to run first. Each is a signed
distance field, because soft things that blend into themselves are what those are good at.

    python scripts/pizza_chef_body.py

Writes assets-source/pizza/chef/body.npz. Z up, facing -Y, in metres.
"""

from pathlib import Path

import numpy as np
from scipy import ndimage as ndi
from skimage import measure

CHEF = Path("assets-source/pizza/chef")
STEP = 0.005
rng = np.random.default_rng(4)

human = np.load(CHEF / "human.npz")
suit = human["Suit_v"]
names = list(human["bone_names"])
heads = human["bone_heads"]


def joint(name):
    return heads[names.index(name)]


def around(points, z, band=0.02):
    """The half width and half depth of something at a height, and where its middle is."""
    ring = points[np.abs(points[:, 2] - z) < band]
    return np.ptp(ring[:, 0]) / 2, np.ptp(ring[:, 1]) / 2, ring[:, 1].min() + np.ptp(ring[:, 1]) / 2


class Space:
    def __init__(self, low, high):
        self.low = np.array(low, np.float32)
        axes = [np.arange(a, b, STEP, dtype=np.float32) for a, b in zip(low, high)]
        self.x, self.y, self.z = np.meshgrid(*axes, indexing="ij")

    def noise(self, wavelength):
        field = rng.standard_normal(self.x.shape).astype(np.float32)
        field = ndi.gaussian_filter(field, wavelength / STEP / 2.4)
        return field / (field.std() + 1e-9)

    def capsule(self, a, b, radius_a, radius_b):
        a, b = np.array(a, np.float32), np.array(b, np.float32)
        ba = b - a
        px, py, pz = self.x - a[0], self.y - a[1], self.z - a[2]
        h = np.clip((px * ba[0] + py * ba[1] + pz * ba[2]) / float(ba @ ba), 0, 1)
        distance = np.sqrt((px - h * ba[0]) ** 2 + (py - h * ba[1]) ** 2 + (pz - h * ba[2]) ** 2)
        return distance - (radius_a + (radius_b - radius_a) * h)

    def ellipsoid(self, centre, radii):
        px, py, pz = ((axis - c) / r for axis, c, r in zip((self.x, self.y, self.z), centre, radii))
        k0 = np.sqrt(px**2 + py**2 + pz**2)
        k1 = np.sqrt((px / radii[0]) ** 2 + (py / radii[1]) ** 2 + (pz / radii[2]) ** 2)
        return k0 * (k0 - 1) / np.maximum(k1, 1e-5)


def soft_union(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def to_mesh(space, field):
    vertices, faces, _, _ = measure.marching_cubes(field, 0.0, spacing=(STEP, STEP, STEP))
    return (vertices + space.low).astype(np.float32), faces.astype(np.int32)


parts = {}

# The apron: tied at the waist, all the way round, hanging straight to below the knee.
waist_z = float(joint("Spine")[2]) - 0.045
hem_z = float(joint("ShinL")[2]) - 0.04

# Its shape comes from the trunk alone: the sleeves hang at this height and would count as
# width. It follows the body down to the hips, and from there only ever hangs.
trunk = [names.index(bone) for bone in ("Hips", "Spine", "Chest", "ThighL", "ThighR")]
torso = suit[human["Suit_w"][:, trunk].sum(axis=1) > 0.6]
levels = np.arange(hem_z - 0.04, waist_z + STEP, STEP)
profile = np.array([around(torso, float(z), 0.03) for z in levels])
fall = slice(None, None, -1)
widest_x = ndi.gaussian_filter1d(np.maximum.accumulate(profile[fall, 0])[fall], 5)
widest_y = ndi.gaussian_filter1d(np.maximum.accumulate(profile[fall, 1])[fall], 5)
centre_y = ndi.gaussian_filter1d(profile[:, 2], 8)
half_x = float(np.interp(waist_z, levels, widest_x))
half_y = float(np.interp(waist_z, levels, widest_y))
middle_y = float(np.interp(waist_z, levels, centre_y))

space = Space((-0.34, -0.3, hem_z - 0.03), (0.34, 0.3, waist_z + 0.05))
heights = space.z[0, 0]
reach_x = np.interp(heights, levels, widest_x)[None, None, :]
reach_y = np.interp(heights, levels, widest_y)[None, None, :]
angle = np.arctan2(space.y - middle_y, space.x)
hanging = np.clip((waist_z - space.z) / 0.28, 0, 1)
ease = 0.006 + 0.024 * hanging
radial = np.sqrt((space.x / (reach_x + ease)) ** 2 + ((space.y - middle_y) / (reach_y + ease)) ** 2)
drape = (radial - 1) * 0.15
drape = drape + np.sin(angle * 9 + space.noise(0.16) * 1.1) * 0.0072 * hanging + space.noise(0.06) * 0.0016
apron = np.abs(drape) - 0.004
apron = np.maximum(apron, hem_z - space.z)
apron = np.maximum(apron, space.z - waist_z)
ring = np.sqrt((space.x / (half_x + 0.008)) ** 2 + ((space.y - middle_y) / (half_y + 0.008)) ** 2)
band = np.maximum(np.abs((ring - 1) * 0.15) - 0.005, np.abs(space.z - waist_z) - 0.02)
parts["Apron"] = to_mesh(space, soft_union(apron, band, 0.005))

# The neckerchief: a roll round the neck, a knot, and two short tails.
neck = joint("Neck")
head = joint("Head")
neck_z = float(neck[2]) + 0.006
body = human["Body_v"]
throat = body[(np.abs(body[:, 0]) < 0.08) & (np.abs(body[:, 1] - float(head[1])) < 0.09)]
neck_x, neck_y, neck_middle = around(throat, neck_z, 0.008)
radius = (neck_x + neck_y) / 2 + 0.004
space = Space((-0.15, neck_middle - 0.17, neck_z - 0.1), (0.15, neck_middle + 0.15, neck_z + 0.05))
ring = np.sqrt(space.x**2 + (space.y - neck_middle) ** 2)
# A folded band of cloth, flat against the neck, not a rope.
scarf = np.sqrt(((ring - radius) * 2.4) ** 2 + ((space.z - neck_z) * 0.72) ** 2) - 0.0165
scarf = scarf + space.noise(0.025) * 0.0014
front = neck_middle - radius
scarf = soft_union(scarf, space.ellipsoid((0, front - 0.004, neck_z - 0.004), (0.015, 0.009, 0.0125)), 0.004)
for lean in (-1, 1):
    tail = space.capsule(
        (lean * 0.003, front - 0.008, neck_z - 0.012),
        (lean * 0.022, front - 0.016, neck_z - 0.058),
        0.005,
        0.0125,
    )
    tail = np.maximum(tail, np.abs(space.y - (front - 0.012)) - 0.0026)
    scarf = soft_union(scarf, tail, 0.002)
parts["Scarf"] = to_mesh(space, scarf)

# The toque: a band, then pleats gathering out to a soft crown. build_chef.py fits it to the head.
toque_points = 128
toque_rows = 60
turn = np.linspace(0, 2 * np.pi, toque_points, endpoint=False)
rise = np.linspace(0, 1, toque_rows)
th, t = np.meshgrid(turn, rise)
band_top = 0.19
flare = np.clip((t - band_top) / (1 - band_top), 0, 1)
puff = 1 + 0.26 * np.sin(np.minimum(flare, 1) * np.pi * 0.62) ** 1.1
pleats = 1 + 0.05 * np.abs(np.sin(th * 7)) ** 0.7 * np.clip(flare * 4.5, 0, 1) * (1 - flare**5)
close = np.sqrt(np.clip(1 - np.clip((t - 0.9) / 0.1, 0, 1) ** 2, 0, 1))
radial = puff * pleats * close
sag = np.clip((t - 0.9) / 0.1, 0, 1) ** 2 * 0.012
vertices = np.stack([np.sin(th) * radial, -np.cos(th) * radial, t * 0.152 - sag], axis=-1).reshape(-1, 3).astype(np.float32)
a = np.arange(toque_rows - 1)[:, None] * toque_points + np.arange(toque_points)[None, :]
b = np.arange(toque_rows - 1)[:, None] * toque_points + (np.arange(toque_points)[None, :] + 1) % toque_points
faces = np.concatenate(
    [
        np.stack([a, b, a + toque_points], axis=-1).reshape(-1, 3),
        np.stack([b, b + toque_points, a + toque_points], axis=-1).reshape(-1, 3),
    ]
).astype(np.int32)
parts["Toque"] = (vertices, faces)

payload = {}
for name, (points, triangles) in parts.items():
    payload[f"{name}_v"] = points
    payload[f"{name}_f"] = triangles
    print(f"{name}: {len(triangles)} triangles")
np.savez_compressed(CHEF / "body.npz", **payload)
print(f"waist {waist_z:.2f} m, {half_x * 2:.2f} wide, hem {hem_z:.2f}")

"""
Simulates a baked pizza as a height field, with the maps a renderer needs.

A pizza is nearly flat, so one height field can hold all of it. What sells it is the
order things happened in: the rim rises and blisters, the cheese melts into rounded
pools, bubbles lift and brown at the top, oil settles in the dips. Each of those is
modelled below rather than painted on, so the colours land where the heat would have
put them.

    python scripts/pizza_maps.py [size] [seed] [hero]

Writes float32 .npy maps to assets-source/pizza/maps/: one folder per stage of the pizza
(dough, sauced, cheesed, baked), and order.npy, which says what happens where first.
With `hero` it scatters toppings on the baked pizza instead, for the reference render.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).parent))
import pizza_toppings as toppings  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2048
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 7
HERO = len(sys.argv) > 3 and sys.argv[3] == "hero"
OUT = Path("assets-source/pizza/maps")

SIZE = 0.38  # metres across the map
PX = SIZE / N

rng = np.random.default_rng(SEED)
axis = (np.arange(N) + 0.5) * PX - SIZE / 2
X, Y = np.meshgrid(axis, axis)
R = np.hypot(X, Y)
THETA = np.arctan2(Y, X)


# Noise and shaping ---------------------------------------------------------------


def band(fine, coarse, slope=1.0):
    """Noise with wavelengths between `fine` and `coarse` metres, unit deviation."""
    white = rng.standard_normal((N, N)).astype(np.float32)
    fx = np.fft.fftfreq(N, PX)
    fy = np.fft.rfftfreq(N, PX)
    f = np.hypot(fx[:, None], fy[None, :])
    f[0, 0] = 1e-9
    shape = (f >= 1 / coarse * 0.7) * (f <= 1 / fine * 1.4) / f**slope
    out = np.fft.irfft2(np.fft.rfft2(white) * shape, s=(N, N)).astype(np.float32)
    return out / (out.std() + 1e-9)


def ring(amplitude, low, high):
    """A wobble around the circle: harmonics `low` to `high`, peak about `amplitude`."""
    out = np.zeros_like(THETA)
    for k in range(low, high + 1):
        out += np.sin(k * THETA + rng.uniform(0, 6.283)) * rng.uniform(0.4, 1.0) / k**0.8
    return out / np.abs(out).max() * amplitude


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, metres):
    return ndi.gaussian_filter(a, metres / PX)


def linear(rgb):
    c = np.array(rgb, dtype=np.float32) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def ramp(value, stops):
    """Maps 0..1 through (position, sRGB) stops, blending in linear light."""
    positions = [s[0] for s in stops]
    colours = np.array([linear(s[1]) for s in stops])
    return np.stack([np.interp(value, positions, colours[:, c]) for c in range(3)], axis=-1)


def mix(a, b, t):
    return a * (1 - t[..., None]) + b * t[..., None]


def bubbles(count, place, radius, height, field, top, power=0.7, crater=0.0, warp=None):
    """
    Lifts `count` domes into `field`. `top` records how exposed each point is, because a
    bubble's skin is the first thing to brown. Steep-sided, like a real blister: a smooth
    bump reads as a lump.
    """
    for _ in range(count):
        x, y = place()
        r = radius()
        h = height(r)
        lo_i = max(int((y + SIZE / 2 - r * 1.3) / PX), 0)
        hi_i = min(int((y + SIZE / 2 + r * 1.3) / PX) + 2, N)
        lo_j = max(int((x + SIZE / 2 - r * 1.3) / PX), 0)
        hi_j = min(int((x + SIZE / 2 + r * 1.3) / PX) + 2, N)
        if hi_i <= lo_i or hi_j <= lo_j:
            continue
        window = (slice(lo_i, hi_i), slice(lo_j, hi_j))
        turn = rng.uniform(0, 3.14)
        stretch = rng.uniform(0.72, 1.0)
        dx = X[window] - x
        dy = Y[window] - y
        along = dx * np.cos(turn) + dy * np.sin(turn)
        across = (-dx * np.sin(turn) + dy * np.cos(turn)) / stretch
        u2 = (along**2 + across**2) / r**2
        if warp is not None:
            u2 = u2 * (1 + 0.38 * np.tanh(warp[window]))
        profile = np.clip(1 - u2, 0, 1) ** power
        if crater and rng.random() < 0.3:
            profile = profile - crater * np.exp(-u2 / 0.16) * (u2 < 1)
        field[window] = np.maximum(field[window], profile * h)
        heat = rng.uniform(0.45, 1.0)
        top[window] = np.maximum(top[window], np.clip(1 - u2 * 1.25, 0, 1) ** 1.3 * heat)


# The dough -----------------------------------------------------------------------

edge = 0.150 + ring(0.0045, 2, 9)
inside = edge - R  # metres in from the edge of the pizza

rim_width = 0.031 + ring(0.0055, 3, 14)
rim_height = 0.0118 + ring(0.0028, 3, 17)
t = np.clip(inside / rim_width, 0, 1)
PEAK = 0.5
rising = 1 - np.clip((PEAK - t) / PEAK, 0, 1) ** 1.8
falling = 1 - smooth(PEAK, 1.0, t)
crust = rim_height * np.where(t < PEAK, rising, falling)
base = 0.0052 * smooth(0, 0.004, inside)
dough = base + crust + band(0.02, 0.09) * 0.00055 * (inside > 0)


def on_rim():
    while True:
        angle = rng.uniform(0, 6.283)
        r = 0.150 - rng.uniform(0.002, 0.024)
        return r * np.cos(angle), r * np.sin(angle)


warp = band(0.004, 0.02)
blister = np.zeros((N, N), np.float32)
skin = np.zeros((N, N), np.float32)
bubbles(
    95,
    on_rim,
    lambda: float(np.clip(rng.lognormal(np.log(0.0062), 0.5), 0.0026, 0.017)),
    lambda r: r * rng.uniform(0.22, 0.46),
    blister,
    skin,
    power=0.7,
    warp=warp,
)
bubbles(
    260,
    on_rim,
    lambda: rng.uniform(0.0009, 0.0026),
    lambda r: r * rng.uniform(0.3, 0.6),
    blister,
    skin,
    power=0.6,
    warp=warp,
)
rim_mask = smooth(0.0, 0.003, inside) * (1 - smooth(0.6, 1.0, t))
dough = dough + blister * rim_mask

dough_detail = (
    band(0.003, 0.012) * 0.00038 + band(0.0009, 0.003) * 0.00006 + band(0.0003, 0.0009) * 0.000012
)
dough = (dough + dough_detail * smooth(0, 0.002, inside)) * (inside > -0.0005)


# Sauce and cheese ----------------------------------------------------------------

boundary_wobble = band(0.006, 0.05) * 0.0034
sauce_line = inside - rim_width * 0.8 + boundary_wobble
sauce = smooth(0, 0.0022, sauce_line)
sauce_height = sauce * (0.0011 + band(0.003, 0.014) * 0.00005)

# Slices of mozzarella that melted towards each other and stopped: pools, with gaps
# where the sauce shows through.
cheese_seed = band(0.028, 0.12) + 0.33 * band(0.007, 0.028)
cheese_area = sauce_line > 0.0032
level = np.quantile(cheese_seed[cheese_area], 0.11)
melted = (cheese_seed > level) & cheese_area
melted = ndi.binary_opening(melted, iterations=max(int(0.0008 / PX), 1))
labels, found = ndi.label(melted)
sizes = ndi.sum(melted, labels, range(1, found + 1))
melted = np.isin(labels, 1 + np.flatnonzero(sizes * PX * PX > 2e-5))

# Surface tension rounds the edge of a pool instead of letting it taper to nothing.
reach = ndi.distance_transform_edt(melted).astype(np.float32) * PX
pool_depth = 0.0031 + band(0.02, 0.08) * 0.00045
cheese = pool_depth * (1 - np.exp(-reach / 0.0021))
cheese = blur(cheese, 0.00035)

cheese_skin = np.zeros((N, N), np.float32)
lift = np.zeros((N, N), np.float32)
pool_points = np.argwhere(reach > 0.0022)


def in_cheese():
    i, j = pool_points[rng.integers(len(pool_points))]
    return axis[j], axis[i]


bubbles(
    105,
    in_cheese,
    lambda: float(np.clip(rng.lognormal(np.log(0.0062), 0.5), 0.0024, 0.017)),
    lambda r: r * rng.uniform(0.16, 0.34),
    lift,
    cheese_skin,
    power=0.75,
    crater=0.42,
    warp=warp,
)
bubbles(
    130,
    in_cheese,
    lambda: rng.uniform(0.0009, 0.0022),
    lambda r: r * rng.uniform(0.16, 0.3),
    lift,
    cheese_skin,
    power=0.8,
    warp=warp,
)
in_pool = smooth(0.0002, 0.0016, reach)
cheese = cheese + blur(lift, 0.00055) * in_pool
cheese_detail = band(0.009, 0.035) * 0.00007
cheese = np.where(melted, cheese + cheese_detail * in_pool, 0)
cheese = np.maximum(blur(cheese, 0.0003), 0)

flowed = smooth(0.0, 0.5, sauce)
height = dough * (1 - flowed) + blur(dough, 0.006) * flowed + sauce_height + cheese
wet = smooth(0.0002, 0.0012, cheese)
height = height * (1 - wet) + blur(height, 0.0007) * wet


# Colour --------------------------------------------------------------------------

proud = dough - blur(dough, 0.0065)  # how far a point stands out: it's nearest the fire
proud = np.clip(proud / 0.0024, -0.5, 1.5)
heat = 0.3 + 0.2 * proud + 0.1 * band(0.006, 0.035) + 0.05 * band(0.0012, 0.005) + 0.3 * skin
heat = heat - 0.05 * (1 - smooth(0.0, 0.25, t))
heat = heat + 0.10 * smooth(0.55, 1.0, t)
crust_colour = ramp(
    np.clip(heat, 0, 1),
    [
        (0.0, (238, 212, 168)),
        (0.22, (228, 186, 124)),
        (0.42, (205, 142, 76)),
        (0.62, (158, 96, 48)),
        (0.8, (98, 56, 30)),
        (1.0, (52, 32, 22)),
    ],
)

# Leopard spots: small burns, sat on whatever stood proud.
burn = 0.3 * proud + 0.42 * skin + 0.34 * band(0.0014, 0.0075) + 0.14 * band(0.012, 0.05)
char = smooth(0.82, 1.0, burn) * rim_mask
crust_colour = mix(crust_colour, ramp(np.clip(burn - 0.7, 0, 1), [(0, (44, 28, 20)), (1, (16, 12, 11))]), char)

flour_cover = smooth(0.2, 1.3, band(0.012, 0.06)) * (1 - smooth(0.3, 0.75, t))
flour = smooth(1.05, 1.9, band(0.00025, 0.0009)) * flour_cover
crust_colour = mix(crust_colour, np.broadcast_to(linear((246, 238, 222)), crust_colour.shape), flour * 0.75)

reduced = 1 - smooth(0, 0.007, sauce_line)  # the sauce cooks down hardest at its edge
sauce_colour = ramp(
    np.clip(0.42 + 0.14 * band(0.004, 0.02) + 0.5 * reduced, 0, 1),
    [(0.0, (196, 46, 20)), (0.5, (158, 30, 14)), (1.0, (88, 20, 12))],
)
herb = smooth(1.75, 2.3, band(0.0005, 0.0016))
sauce_colour = mix(sauce_colour, np.broadcast_to(linear((36, 42, 16)), sauce_colour.shape), herb * 0.6)

# Browning: bubble skins first, then the thin edges of each pool, then blotches where
# the deck ran hot.
hot = band(0.03, 0.12)
blotch_warp = band(0.0012, 0.006)
blotch = smooth(0.95, 1.7, band(0.0028, 0.016) + 0.5 * blotch_warp + 0.45 * hot)
pool_edge = np.exp(-reach / 0.0022) * melted
rim_side = 1 - smooth(0.004, 0.03, sauce_line)
brown = (
    1.05 * cheese_skin**1.25
    + 0.5 * blotch
    + 0.55 * pool_edge * smooth(-0.6, 0.8, band(0.002, 0.012))
    + 0.32 * rim_side
    + 0.06 * blotch_warp
    + 0.1
)
cheese_colour = ramp(
    np.clip(brown, 0, 1),
    [
        (0.0, (246, 218, 158)),
        (0.2, (244, 204, 124)),
        (0.42, (234, 170, 76)),
        (0.62, (202, 120, 42)),
        (0.8, (146, 78, 28)),
        (1.0, (70, 36, 18)),
    ],
)

# Thin cheese lets the sauce through.
thin = 1 - smooth(0.0002, 0.0013, cheese)
cheese_colour = mix(cheese_colour, np.broadcast_to(linear((232, 124, 58)), cheese_colour.shape), thin * 0.4)

# Oil runs out of the cheese and settles in the dips.
dip = blur(cheese, 0.005) - cheese
oil = smooth(0.00005, 0.0005, dip) * in_pool
oil = np.clip(oil + 0.5 * thin * melted, 0, 1)
cheese_colour = mix(cheese_colour, cheese_colour * linear((255, 196, 120)), oil * 0.8)

covered = smooth(0.00005, 0.0005, cheese)
albedo = mix(mix(crust_colour, sauce_colour, sauce), cheese_colour, covered)

# Sauce and oil creep a little way up the inside of the rim.
stain = np.exp(-np.clip(-sauce_line, 0, None) / 0.0028) * (1 - sauce) * smooth(0.3, 1.0, t)
albedo = mix(albedo, albedo * linear((226, 120, 74)), stain * 0.65)


slope = np.hypot(*np.gradient(dough, PX))
steep = smooth(0.9, 2.4, slope) * (1 - sauce)
softened = np.stack([blur(albedo[..., c], 0.0022) for c in range(3)], axis=-1)
albedo = mix(albedo, softened, steep)


# Surface -------------------------------------------------------------------------

rough = np.full((N, N), 0.56, np.float32)
rough = rough - 0.08 * sauce
rough = rough * (1 - sauce) + (0.26 + 0.05 * band(0.003, 0.02)) * sauce
rough = rough * (1 - covered) + (0.31 + 0.02 * band(0.006, 0.03) + 0.2 * np.clip(brown, 0, 1)) * covered
rough = rough * (1 - oil * covered) + 0.2 * oil * covered
rough = rough + 0.2 * char * (1 - covered)
rough = np.clip(rough, 0.08, 0.95)

scatter = 0.32 * (1 - sauce) + 0.5 * sauce
scatter = scatter * (1 - covered) + 1.0 * covered
scatter = scatter * (1 - char * 0.9) * (1 - 0.65 * np.clip(brown, 0, 1) * covered)

gloss = (0.08 + 0.34 * oil) * covered + 0.16 * sauce * (1 - covered)


# Toppings ------------------------------------------------------------------------

if HERO:
    def blur_px(a, pixels):
        return ndi.gaussian_filter(a, pixels)


    def place(sprite, x, y, turn, settled, sink, creep=0.0):
        """Lays a stamp on the pizza. It rests on the local shape, not on every small bump."""
        layers = {}
        for name, data in sprite.items():
            data = np.asarray(data, np.float32)
            if data.ndim == 0:
                data = np.full(sprite["alpha"].shape, data, np.float32)
            layers[name] = ndi.rotate(data, turn, axes=(0, 1), reshape=False, order=1, mode="nearest")
        layers["alpha"] = ndi.rotate(np.asarray(sprite["alpha"], np.float32), turn, reshape=False, order=1, mode="constant")

        n = layers["alpha"].shape[0]
        i0 = int((y + SIZE / 2) / PX) - n // 2
        j0 = int((x + SIZE / 2) / PX) - n // 2
        window = (slice(i0, i0 + n), slice(j0, j0 + n))
        a = np.clip(layers["alpha"], 0, 1)
        if creep:
            ragged = blotch_warp[window] * 0.11
            a = a * smooth(0.5 + ragged, 0.8 + ragged, blur_px(a, creep / PX))

        height[window] = height[window] * (1 - a) + (settled[window] + layers["height"] - sink) * a
        albedo[window] = mix(albedo[window], layers["albedo"], a)
        for target, name in ((rough, "rough"), (scatter, "scatter"), (gloss, "gloss")):
            target[window] = target[window] * (1 - a) + layers[name] * a
        return window, a


    def scatter_points(count, gap, limit, taken):
        """Random spots that keep their distance, as a cook's hand does without thinking."""
        found = []
        tries = 0
        while len(found) < count and tries < 8000:
            tries += 1
            angle = rng.uniform(0, 6.283)
            r = limit * np.sqrt(rng.random())
            x, y = r * np.cos(angle), r * np.sin(angle)
            if all(np.hypot(x - a, y - b) > gap + c for a, b, c in taken):
                found.append((x, y))
                taken.append((x, y, gap))
        return found


    height = height.astype(np.float32)
    albedo = albedo.astype(np.float32)
    rough = rough.astype(np.float32)
    scatter = scatter.astype(np.float32)
    gloss = gloss.astype(np.float32)

    settled = blur(height, 0.005)
    taken = []
    pressed = np.zeros((N, N), np.float32)
    greasy = np.zeros((N, N), np.float32)
    for x, y in scatter_points(17, 0.0196, 0.114, taken):
        window, a = place(toppings.pepperoni(PX, rng), x, y, rng.uniform(0, 360), settled, 0.0006, 0.0009)
        pressed[window] = np.maximum(pressed[window], a)
        greasy[window] = np.maximum(greasy[window], a)
    for x, y in scatter_points(10, 0.0145, 0.114, taken):
        window, a = place(toppings.mushroom(PX, rng), x, y, rng.uniform(0, 360), settled, 0.0005, 0.0007)
        pressed[window] = np.maximum(pressed[window], a)
    for x, y in scatter_points(12, 0.0095, 0.116, taken):
        window, a = place(toppings.olive(PX, rng), x, y, rng.uniform(0, 360), settled, 0.0009, 0.0005)
        pressed[window] = np.maximum(pressed[window], a)

    # Cheese rises in a collar around whatever sank into it, and pepperoni bleeds orange fat.
    collar = np.clip(blur(pressed, 0.0017) - pressed, 0, 1)
    height = height + collar * 0.0014 * covered
    bleed = np.clip(blur(greasy, 0.0065) * 1.9, 0, 1) * (1 - pressed) * covered
    albedo = mix(albedo, albedo * linear((255, 176, 92)), bleed * 0.8)
    rough = rough * (1 - bleed * 0.5) + 0.2 * bleed * 0.5
    gloss = np.clip(gloss + bleed * 0.22, 0, 1)

    lip = blur(pressed, 0.0005)
    lip = np.clip(4 * lip * (1 - lip), 0, 1)
    height = height * (1 - lip) + blur(height, 0.0005) * lip

    # Basil goes on after the oven, so it lies on top of everything and stays fresh.
    settled = blur(height, 0.004)
    leaves = [(0.008, 0.012), (-0.062, -0.046), (0.07, -0.034), (-0.026, 0.082)]
    for x, y in leaves:
        place(toppings.basil(PX, rng), x, y, rng.uniform(0, 360), settled, 0.0002)


# Out -----------------------------------------------------------------------------


def write(stage, **maps):
    folder = OUT / stage
    folder.mkdir(parents=True, exist_ok=True)
    for name, data in maps.items():
        np.save(folder / f"{name}.npy", np.asarray(data, np.float32))


write("hero" if HERO else "baked", height=height, albedo=albedo, rough=rough, scatter=scatter, gloss=gloss)
print(f"{N}px, {PX * 1000:.3f} mm a pixel, top {height.max() * 1000:.1f} mm, cheese covers {covered[cheese_area].mean():.0%}")
if HERO:
    sys.exit(0)


# The raw pizza -------------------------------------------------------------------
#
# The same outline, the same sauce line and the same pools of cheese to come, so the oven
# only has to change what's already there. Raw dough is lower and paler, and it's wet.

footprint = inside > -0.0005
raw_rim = rim_height * 0.62 * np.where(t < PEAK, rising, falling)
raw_dough = 0.0040 * smooth(0, 0.004, inside) + raw_rim + band(0.012, 0.05) * 0.00022 * (inside > 0)
raw_dough = np.where(footprint, raw_dough + band(0.002, 0.009) * 0.00004 + 3e-5, 0)

flour_on_dough = smooth(1.2, 2.1, band(0.0003, 0.0011)) * smooth(-0.5, 1.2, band(0.015, 0.07))
dough_colour = ramp(
    np.clip(0.5 + 0.2 * band(0.006, 0.03) + 0.12 * band(0.001, 0.004), 0, 1),
    [(0.0, (222, 192, 146)), (0.5, (236, 210, 168)), (1.0, (245, 228, 194))],
)
dough_colour = mix(dough_colour, np.broadcast_to(linear((250, 244, 232)), dough_colour.shape), flour_on_dough * 0.7)
plain = np.ones((N, N), np.float32)
write(
    "dough",
    height=raw_dough,
    albedo=dough_colour,
    rough=0.6 * plain,
    scatter=0.62 * plain,
    gloss=0 * plain,
)

# A ladle leaves a spiral.
turns = R / 0.0105 * 6.283 - THETA + band(0.02, 0.08) * 1.1
swirl = np.sin(turns)
raw_sauce_height = sauce * (0.0010 + swirl * 0.00011 + band(0.004, 0.02) * 0.00005)
sauced_height = np.where(footprint, blur(raw_dough, 0.003) * sauce + raw_dough * (1 - sauce) + raw_sauce_height, 0)
fresh_sauce = ramp(
    np.clip(0.46 + 0.16 * band(0.003, 0.015) + 0.14 * swirl, 0, 1),
    [(0.0, (160, 26, 13)), (0.5, (188, 38, 17)), (1.0, (212, 60, 25))],
)
pulp = smooth(1.6, 2.2, band(0.0008, 0.0026))
fresh_sauce = mix(fresh_sauce, np.broadcast_to(linear((226, 92, 44)), fresh_sauce.shape), pulp * 0.6)
fresh_sauce = mix(fresh_sauce, np.broadcast_to(linear((36, 42, 16)), fresh_sauce.shape), herb * 0.7)
sauced_colour = mix(dough_colour, fresh_sauce, sauce)
sauced_rough = 0.6 * (1 - sauce) + 0.2 * sauce
sauced_gloss = 0.3 * sauce
sauced_scatter = 0.62 * (1 - sauce) + 0.5 * sauce
write(
    "sauced",
    height=sauced_height,
    albedo=sauced_colour,
    rough=sauced_rough,
    scatter=sauced_scatter,
    gloss=sauced_gloss,
)

# Shredded mozzarella, thrown by hand: strands that land across each other, thickest
# where the pools will be. `shred_turn` is the order they land in.
shreds = np.zeros((N, N), np.float32)
shred_tone = np.zeros((N, N), np.float32)
shred_turn = np.zeros((N, N), np.float32)
landing = np.argwhere(melted)
STRANDS = 5200
for number in range(STRANDS):
    i, j = landing[rng.integers(len(landing))]
    x, y = axis[j] + rng.normal(0, 0.003), axis[i] + rng.normal(0, 0.003)
    length = rng.uniform(0.011, 0.028)
    width = rng.uniform(0.0019, 0.0034)
    reach_px = int((length * 0.62) / PX) + 3
    lo_i, hi_i = max(i - reach_px, 0), min(i + reach_px, N)
    lo_j, hi_j = max(j - reach_px, 0), min(j + reach_px, N)
    window = (slice(lo_i, hi_i), slice(lo_j, hi_j))
    turn = rng.uniform(0, 3.14)
    dx, dy = X[window] - x, Y[window] - y
    along = dx * np.cos(turn) + dy * np.sin(turn)
    across = -dx * np.sin(turn) + dy * np.cos(turn) - rng.uniform(-14, 14) * along**2
    gap = np.hypot(np.clip(np.abs(along) - length / 2, 0, None), across)
    profile = np.sqrt(np.clip(1 - (gap / (width / 2)) ** 2, 0, 1))
    land = shreds[window].mean() * 0.72 + 0.0002
    top = land + profile * width * 0.42
    lying = (profile > 0) & (top > shreds[window])
    shreds[window] = np.where(lying, top, shreds[window])
    shred_tone[window] = np.where(lying, rng.uniform(0.2, 1.0) * (0.8 + 0.2 * profile), shred_tone[window])
    shred_turn[window] = np.where(lying, (number + 1) / STRANDS, shred_turn[window])

strand = smooth(0.00002, 0.00018, shreds)
cheesed_height = np.where(footprint, sauced_height + shreds, 0)
strand_colour = ramp(
    np.clip(shred_tone + 0.08 * band(0.0008, 0.003), 0, 1),
    [(0.0, (238, 224, 192)), (0.5, (248, 238, 214)), (1.0, (254, 249, 234))],
)
write(
    "cheesed",
    height=cheesed_height,
    albedo=mix(sauced_colour, strand_colour, strand),
    rough=sauced_rough * (1 - strand) + 0.42 * strand,
    scatter=sauced_scatter * (1 - strand) + 1.0 * strand,
    gloss=sauced_gloss * (1 - strand) + 0.05 * strand,
)

# Red: how the ladle travels, from the middle out. Green: which strand lands when. Blue:
# where the heat arrives first, the rim and the high spots ahead of the rest.
sauce_order = np.clip(R / 0.135 + 0.03 * band(0.01, 0.05), 0, 1)
heat_order = np.clip(0.62 - 0.46 * smooth(0.25, 0.7, 1 - t) * 0 - 0.42 * (1 - smooth(0.2, 1.0, t)) + 0.16 * band(0.012, 0.05), 0, 1)
np.save(OUT / "order.npy", np.stack([sauce_order, shred_turn, heat_order], axis=-1).astype(np.float32))
print("raw stages written")

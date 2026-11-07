"""
Packs the pizza's maps and baked light into web textures, in public/pizza/.

    python scripts/pizza_web.py

The page gets its light from the bakes and draws the reflections itself from the rest,
because reflections are the one part of a wet surface that has to move with the viewer.
Rows are flipped here: the maps start at the bottom, images at the top.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

MAPS = Path("assets-source/pizza/maps")
BAKE = Path("assets-source/pizza/bake")
OUT = Path("public/pizza")
METRES = 0.38

# The bakes are squeezed into 0..1 by these. src/content/pizza.ts undoes it.
BEAUTY_RANGE = 2.0
HEIGHT_RANGE = 0.03
STAMP_HEIGHT_RANGE = 0.008

# The sheets are lit from overhead and the pizza from a window, so they're matched by eye.
STAMP_GAIN = {"raw": 1.0, "baked": 0.82}


def srgb(linear):
    linear = np.clip(linear, 0, 1)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055)


def load(stage, name):
    return np.load(MAPS / stage / f"{name}.npy")


def save(name, data, size=None, quality=90, alpha_quality=90):
    """`data` is 0..1, with row 0 at the bottom."""
    data = np.flipud(np.clip(data, 0, 1))
    image = Image.fromarray((data * 255 + 0.5).astype(np.uint8))
    if size and image.size[0] != size:
        image = image.resize((size, size), Image.LANCZOS)
    path = OUT / f"{name}.webp"
    image.save(path, quality=quality, method=6, alpha_quality=alpha_quality)
    print(f"{name}: {path.stat().st_size // 1024} KB")


def spread(colour, solid):
    """Runs colour out past an outline, so a soft edge never picks up the black outside."""
    nearest = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    return colour[nearest[0], nearest[1]]


def slopes(height, pixel, soften=1.2):
    gy, gx = np.gradient(ndi.gaussian_filter(height.astype(np.float64), soften), pixel)
    normal = np.stack([-gx, -gy, np.ones_like(gx)], axis=-1)
    return normal / np.linalg.norm(normal, axis=-1, keepdims=True)


OUT.mkdir(parents=True, exist_ok=True)
baked_height = load("baked", "height")
n = baked_height.shape[0]
pixel = METRES / n
outline = baked_height > 1e-5
solid = ndi.binary_erosion(outline, iterations=2)

# The bakes come out of Blender with their top row first.
for stage, size in (("dough", 1536), ("sauced", 1536), ("cheesed", 2048), ("baked", 2048)):
    colour = np.load(BAKE / f"{stage}.npy").astype(np.float32)[::-1]
    print(stage, "99.9% brightness", round(float(np.quantile(colour, 0.999)), 2))
    save(stage, srgb(spread(colour, solid) / BEAUTY_RANGE), size, 90)

raw_height = load("cheesed", "height")
save("normal-raw", slopes(raw_height, pixel) * 0.5 + 0.5, 2048, 90)
save("normal-baked", slopes(baked_height, pixel) * 0.5 + 0.5, 2048, 94)

# A graphics card only promises 16 textures to a shader, and the pizza is right at that.
# So this is one map, not two, and the outline rides in the alpha of `order`.
save("surface", np.stack([load("baked", "gloss"), load("baked", "rough"), load("cheesed", "rough")], axis=-1), 2048, 88)

# Shape only: every fine bump is already in the normals, and a mesh that tries to carry
# them turns the rim into torn paper.
soften = 0.0011 / pixel
heights = np.stack(
    [
        ndi.gaussian_filter(load("sauced", "height"), soften) / HEIGHT_RANGE,
        ndi.gaussian_filter(baked_height, soften) / HEIGHT_RANGE,
        0 * baked_height,
    ],
    axis=-1,
)
save("heights", heights, 1024, 96)
save("order", np.concatenate([np.load(MAPS / "order.npy"), outline[..., None]], axis=-1), 2048, 92, 96)

table = np.load(BAKE / "table.npy").astype(np.float32)[::-1]
save("table", srgb(table / BEAUTY_RANGE), None, 86)

# The oven. Dark brick bands badly in eight bits, so it gets a little noise on top.
for part in ("dome", "floor", "bed"):
    path = BAKE / f"oven-{part}.npy"
    if not path.exists():
        continue
    light = np.load(path).astype(np.float32)[::-1]
    light = ndi.gaussian_filter(light, (0.7, 0.7, 0))
    grain = np.random.default_rng(5).normal(0, 0.0035, light.shape[:2])[..., None]
    save(f"oven-{part}", srgb(light / BEAUTY_RANGE) + grain, None, 88)

# The restaurant. A 128-sample bake has a little grain in it, and a touch of blur takes
# it out without losing the plaster or the tiles.
for part, size in (("floor", 2048), ("hero", 2048), ("oven", 2048), ("walls", 4096), ("props", 4096)):
    path = BAKE / f"room-{part}.npy"
    if not path.exists():
        continue
    light = np.load(path).astype(np.float32)[::-1]
    light = ndi.gaussian_filter(light, (0.8, 0.8, 0))
    save(f"room-{part}", srgb(light / BEAUTY_RANGE), size, 84)

# The topping sheets ---------------------------------------------------------------

stamp_alpha = load("stamps-baked", "alpha")
stamp_height = load("stamps-baked", "height")
sheet = stamp_alpha.shape[0]
stamp_solid = ndi.binary_erosion(stamp_alpha > 0.5, iterations=1)

# In the oven the cheese runs over the edge of whatever is lying in it. The cut is ragged
# so it reads as flow, not as a trimmed edge.
rng = np.random.default_rng(3)
noise = ndi.gaussian_filter(rng.standard_normal((sheet, sheet)), 3.2)
noise /= noise.std()
soft = ndi.gaussian_filter(stamp_alpha, 3.0)
ragged = stamp_alpha * np.clip((soft - 0.46 - noise * 0.08) / 0.2, 0, 1)

for stage, alpha in (("raw", load("stamps-raw", "alpha")), ("baked", ragged)):
    colour = np.load(BAKE / f"stamps-{stage}.npy").astype(np.float32)[::-1] * STAMP_GAIN[stage]
    print(f"stamps-{stage}", "99.9% brightness", round(float(np.quantile(colour[stamp_solid], 0.999)), 2))
    rgb = srgb(spread(colour, stamp_solid) / BEAUTY_RANGE)
    save(f"stamps-{stage}", np.concatenate([rgb, alpha[..., None]], axis=-1), None, 90, 95)

resting = np.where(stamp_alpha > 0.5, stamp_height, 0)
normal = slopes(ndi.gaussian_filter(resting, 0.8), METRES / 2048, 0.6)
shape = np.stack([normal[..., 0] * 0.5 + 0.5, normal[..., 1] * 0.5 + 0.5, resting / STAMP_HEIGHT_RANGE], axis=-1)
save("stamps-shape", shape, None, 92)
save(
    "stamps-surface",
    np.stack([load("stamps-baked", "gloss"), load("stamps-baked", "rough"), 0 * stamp_height], axis=-1),
    None,
    86,
)

# The pans: a few of the raw pieces piled up, for the tray.
layout = json.loads(Path("src/content/pizza-stamps.json").read_text())
cell = layout["cell"]
raw_rgb = spread(np.load(BAKE / "stamps-raw.npy").astype(np.float32)[::-1], stamp_solid)
raw_alpha = load("stamps-raw", "alpha")
for row, topping in enumerate(layout["toppings"]):
    width, height_px = 336, 264
    picture = np.zeros((height_px, width, 3), np.float32)
    cover = np.zeros((height_px, width), np.float32)
    spots = [(0.05, 0.22), (0.42, 0.0), (0.34, 0.44)]
    for column, (top, across) in enumerate(spots):
        window = (slice(row * cell, (row + 1) * cell), slice(column * cell, (column + 1) * cell))
        turn = rng.uniform(0, 360)
        piece_alpha = ndi.rotate(raw_alpha[window], turn, reshape=False, order=1)
        piece_rgb = ndi.rotate(raw_rgb[window], turn, axes=(0, 1), reshape=False, order=1, mode="nearest")
        scale = {"olive": 0.72, "pepperoni": 0.5}.get(topping, 0.6)
        piece_alpha = ndi.zoom(piece_alpha, scale, order=1)
        piece_rgb = ndi.zoom(piece_rgb, (scale, scale, 1), order=1)
        size = piece_alpha.shape[0]
        i = min(int(top * height_px), height_px - size)
        j = min(int(across * width), width - size)
        box = (slice(i, i + size), slice(j, j + size))
        a = piece_alpha
        picture[box] = picture[box] * (1 - a[..., None]) + piece_rgb * a[..., None]
        cover[box] = np.maximum(cover[box], a)
    gain = 3.4 if topping == "olive" else 1.7
    rgba = np.concatenate([srgb(picture * gain), cover[..., None]], axis=-1)
    image = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8))
    image.save(OUT / f"pan-{topping}.webp", quality=86, method=6, alpha_quality=90)

poster = Path("assets-source/pizza/renders/room-poster.png")
if poster.exists():
    Image.open(poster).convert("RGB").save(OUT / "poster.webp", quality=84, method=6)

total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
print(f"textures: {total / 1048576:.1f} MB")

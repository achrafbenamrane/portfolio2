"""
The pictures in the menu: each pizza on it, seen from above, made from the same baked
pizza and the same topping sheet the visitor builds with. So what the book shows is what
the kitchen can make.

    python scripts/pizza_menu.py

Writes public/pizza/menu-<id>.webp. Keep the recipes in step with MENU_PIZZAS in
src/content/pizza.ts.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

MAPS = Path("assets-source/pizza/maps")
BAKE = Path("assets-source/pizza/bake")
OUT = Path("public/pizza")
SIZE = 640
METRES = 0.38
PORTIONS = {"pepperoni": 13, "mushroom": 10, "olive": 12, "onion": 9, "pepper": 9, "basil": 5}
RECIPES = {
    "margherita": ["basil"],
    "diavola": ["pepperoni", "olive"],
    "funghi": ["mushroom", "onion"],
    "ortolana": ["pepper", "onion", "mushroom", "olive"],
    "casa": ["pepperoni", "mushroom", "olive", "basil"],
    "tua": [],
}

layout = json.loads(Path("src/content/pizza-stamps.json").read_text())
cell = layout["cell"]
rng = np.random.default_rng(12)

base = np.load(BAKE / "baked.npy").astype(np.float32)[::-1]
height = np.load(MAPS / "baked/height.npy")
outline = height[:: height.shape[0] // base.shape[0], :: height.shape[0] // base.shape[0]] > 1e-5
solid = ndi.binary_erosion(outline, iterations=2)
pixel = METRES / base.shape[0]

sheet = np.load(BAKE / "stamps-baked.npy").astype(np.float32)[::-1] * 0.82
sheet_alpha = np.load(MAPS / "stamps-baked/alpha.npy")
stamp_solid = ndi.binary_erosion(sheet_alpha > 0.5, iterations=1)
nearest = ndi.distance_transform_edt(~stamp_solid, return_distances=False, return_indices=True)
sheet = sheet[nearest[0], nearest[1]]


def filmic(colour):
    """Near enough to the page's grade for a small picture."""
    exposed = colour * 1.12
    mapped = exposed * (1 + exposed / 9) / (1 + exposed)
    mapped = np.clip(mapped * 1.32, 0, 1)
    grey = mapped.mean(axis=-1, keepdims=True)
    mapped = np.clip(grey + (mapped - grey) * 1.14, 0, 1)
    return np.where(mapped <= 0.0031308, mapped * 12.92, 1.055 * mapped ** (1 / 2.4) - 0.055)


def place(picture, row, count, taken):
    reach = layout["reachMetres"][layout["toppings"][row]]
    limit = 0.116 - reach * 0.55
    for _ in range(count):
        best, room = (0.0, 0.0), -1e9
        for _ in range(16):
            angle = rng.uniform(0, 6.283)
            r = limit * np.sqrt(rng.random())
            x, y = r * np.cos(angle), r * np.sin(angle)
            gap = min((np.hypot(x - a, y - b) - c for a, b, c in taken), default=1.0) - reach * 0.6
            if gap > room:
                best, room = (x, y), gap
        x, y = best
        taken.append((x, y, reach * 0.6))
        column = int(rng.integers(layout["variants"]))
        window = (slice(row * cell, (row + 1) * cell), slice(column * cell, (column + 1) * cell))
        turn = rng.uniform(0, 360)
        a = ndi.rotate(sheet_alpha[window], turn, reshape=False, order=1)[..., None]
        rgb = ndi.rotate(sheet[window], turn, axes=(0, 1), reshape=False, order=1, mode="nearest")
        i = int((y + METRES / 2) / pixel) - cell // 2
        j = int((x + METRES / 2) / pixel) - cell // 2
        box = (slice(i, i + cell), slice(j, j + cell))
        shadow = np.clip(ndi.gaussian_filter(a[..., 0], 6), 0, 1)[..., None] * 0.42
        picture[box] = picture[box] * (1 - shadow)
        picture[box] = picture[box] * (1 - a) + rgb * a


for name, recipe in RECIPES.items():
    picture = base.copy()
    taken = []
    for topping in recipe:
        place(picture, layout["toppings"].index(topping), PORTIONS[topping], taken)
    rgba = np.concatenate([filmic(picture), outline[..., None].astype(np.float32)], axis=-1)
    image = Image.fromarray((np.flipud(np.clip(rgba, 0, 1)) * 255 + 0.5).astype(np.uint8))
    image = image.resize((SIZE, SIZE), Image.LANCZOS)
    path = OUT / f"menu-{name}.webp"
    image.save(path, quality=84, method=6, alpha_quality=90)
    print(path.name, path.stat().st_size // 1024, "KB")

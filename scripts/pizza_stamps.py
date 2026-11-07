"""
Lays the toppings out in a grid, raw and baked, ready for Blender to light.

Row by topping, column by variant, and the same cell in both sheets is the same piece, so
the oven only has to fade one into the other.

    python scripts/pizza_stamps.py

Writes assets-source/pizza/maps/stamps-raw/, stamps-baked/ and src/content/pizza-stamps.json.
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import pizza_toppings as toppings  # noqa: E402

CELL = 320  # pixels, at the pizza map's web scale
PX = 0.38 / 2048
VARIANTS = 6
TOPPINGS = ["pepperoni", "mushroom", "olive", "onion", "pepper", "basil"]
MAPS = Path("assets-source/pizza/maps")
LAYOUT = Path("src/content/pizza-stamps.json")

side = CELL * len(TOPPINGS)


def blank():
    return {
        "height": np.zeros((side, side), np.float32),
        "albedo": np.zeros((side, side, 3), np.float32),
        "rough": np.full((side, side), 0.5, np.float32),
        "scatter": np.zeros((side, side), np.float32),
        "gloss": np.zeros((side, side), np.float32),
        "alpha": np.zeros((side, side), np.float32),
    }


def paste(sheet, stamp, row, column):
    """Centres a stamp in its cell. Rows count up from the bottom, as the maps do."""
    size = stamp["alpha"].shape[0]
    if size > CELL:
        raise ValueError(f"a stamp of {size}px doesn't fit a {CELL}px cell")
    i = row * CELL + (CELL - size) // 2
    j = column * CELL + (CELL - size) // 2
    window = (slice(i, i + size), slice(j, j + size))
    for name, data in stamp.items():
        sheet[name][window] = np.broadcast_to(data, sheet[name][window].shape)


raw, baked = blank(), blank()
reach = {}
for row, name in enumerate(TOPPINGS):
    make = getattr(toppings, name)
    widest = 0.0
    for column in range(VARIANTS):
        seed = 1000 * row + column
        paste(raw, make(PX, np.random.default_rng(seed), baked=False), row, column)
        stamp = make(PX, np.random.default_rng(seed), baked=True)
        paste(baked, stamp, row, column)
        ys, xs = np.nonzero(stamp["alpha"] > 0.5)
        centre = (stamp["alpha"].shape[0] - 1) / 2
        widest = max(widest, float(np.hypot(xs - centre, ys - centre).max()) * PX)
    reach[name] = round(widest, 4)

for name, sheet in (("stamps-raw", raw), ("stamps-baked", baked)):
    out = MAPS / name
    out.mkdir(parents=True, exist_ok=True)
    # Blender cuts the mesh wherever the height is zero, so that's the outline.
    sheet["height"] = np.where(sheet["alpha"] > 0.5, sheet["height"] + 1e-4, 0).astype(np.float32)
    for key, data in sheet.items():
        np.save(out / f"{key}.npy", data.astype(np.float32))

LAYOUT.write_text(
    json.dumps(
        {
            "cell": CELL,
            "variants": VARIANTS,
            "toppings": TOPPINGS,
            "cellMetres": round(CELL * PX, 5),
            "reachMetres": reach,
        },
        indent=2,
    )
    + "\n"
)
print("sheet", side, "px;", reach)

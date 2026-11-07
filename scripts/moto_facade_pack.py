"""
Packs the baked facade cells into one sheet for the game, and draws the wrought iron of the
balcony rails. Run scripts/blender/build_moto_atlas.py first.

    python scripts/moto_facade_pack.py

Writes public/moto/city/facade-atlas.webp and facade-rail.webp.
"""

import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "assets-source/moto/build/atlas"
OUT = ROOT / "public/moto/city"
CELL = 512


def rail_texture():
    """Wrought iron, drawn large and shrunk: bars and scrolls between a top and bottom rail."""
    wide, tall = 2048, 512
    picture = Image.new("L", (wide, tall), 0)
    draw = ImageDraw.Draw(picture)
    bar = 7

    def scroll(cx, cy, size, flip):
        points = []
        for t in np.linspace(0, 3.4 * math.pi, 60):
            r = size * (1 - t / (3.8 * math.pi))
            points.append((cx + flip * math.cos(t) * r, cy + math.sin(t) * r))
        draw.line(points, fill=255, width=bar)

    draw.rectangle((0, 0, wide, 22), fill=255)
    draw.rectangle((0, tall - 20, wide, tall), fill=255)
    draw.rectangle((0, 86, wide, 96), fill=255)
    draw.rectangle((0, tall - 92, wide, tall - 84), fill=255)
    panel = wide // 8
    for k in range(8):
        x = k * panel
        draw.rectangle((x - 5, 0, x + 5, tall), fill=255)
        middle = x + panel // 2
        draw.rectangle((middle - 4, 96, middle + 4, tall - 92), fill=255)
        for flip in (-1, 1):
            scroll(middle + flip * 62, tall // 2 - 58, 50, flip)
            scroll(middle + flip * 62, tall // 2 + 62, 50, -flip)
        # A band of small rings along the top.
        for dx in range(16, panel, 32):
            draw.ellipse((x + dx - 15, 34, x + dx + 15, 76), outline=255, width=5)
            draw.ellipse((x + dx - 15, tall - 80, x + dx + 15, tall - 36), outline=255, width=5)
    small = picture.resize((1024, 256), Image.LANCZOS)
    rgba = Image.merge("RGBA", (Image.new("L", small.size, 26), Image.new("L", small.size, 26), Image.new("L", small.size, 30), small))
    rgba.save(OUT / "facade-rail.webp", quality=86, method=5, exact=True)


def atlas():
    sheet = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    # The arcade takes the last column's bottom two cells, so shift what follows it past them.
    places = {name: (i % 4, i // 4) for i, name in enumerate(("hood", "pediment", "segment", "attic", "rich", "deco", "moorish", "modern", "rustic", "shop", "shut"))}
    places.update({"mansard": (0, 3), "cornice": (1, 3), "soffit": (2, 3)})
    for name, (col, row) in places.items():
        rgb = Image.open(BUILD / f"{name}.png").convert("RGB").resize((CELL, CELL), Image.LANCZOS)
        mask = Image.open(BUILD / f"{name}-mask.png").convert("L").resize((CELL, CELL), Image.LANCZOS)
        sheet.paste(Image.merge("RGBA", (*rgb.split(), mask)), (col * CELL, row * CELL))
    rgb = Image.open(BUILD / "arcade.png").convert("RGB").resize((CELL, CELL * 2), Image.LANCZOS)
    mask = Image.open(BUILD / "arcade-mask.png").convert("L").resize((CELL, CELL * 2), Image.LANCZOS)
    sheet.paste(Image.merge("RGBA", (*rgb.split(), mask)), (3 * CELL, 2 * CELL))
    sheet.save(OUT / "facade-atlas.webp", quality=86, method=5, exact=True)
    sheet.convert("RGB").save(BUILD / "atlas-rgb.png")
    print("Atlas", os.path.getsize(OUT / "facade-atlas.webp") / 1e6, "MB", flush=True)


rail_texture()
atlas()

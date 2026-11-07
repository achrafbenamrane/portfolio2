"""
The land under the rider's map: the sea, the land, the parks and the buildings as faint shapes. The
streets aren't in it: the game draws those itself, so they stay sharp. Run scripts/moto_city.py first.

    python -I scripts/moto_map.py

Writes public/moto/city/map.webp. Map data is (c) OpenStreetMap contributors, ODbL.
"""

import json
import math
import site
import sys
from pathlib import Path

sys.path.append(site.getusersitepackages())
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

from moto_route import DL, ROOT, to_xy  # noqa: E402

PUBLIC = ROOT / "public/moto/city"
city = json.load(open(ROOT / "src/content/moto-city.json"))
WEST, SOUTH, EAST, NORTH = city["bounds"]
SCALE = 0.3  # pixels to the metre
WIDE = int((EAST - WEST) * SCALE)
TALL = int((NORTH - SOUTH) * SCALE)
SEA = (14, 26, 38)
LAND = (28, 28, 32)
GREEN = (26, 42, 32)
BUILT = (38, 38, 43)


def pixel(point):
    return (point[0] - WEST) * SCALE, (NORTH - point[1]) * SCALE


def main():
    low, high = city["ground"]
    raw = np.asarray(Image.open(PUBLIC / "ground.png").convert("RGB"), np.float32)
    height = low + (raw[..., 0] * 256 + raw[..., 1]) / 65535 * (high - low)
    water = Image.fromarray(((height < 1.0) * 255).astype(np.uint8)).resize((WIDE, TALL), Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.8))

    picture = Image.new("RGB", (WIDE, TALL), LAND)
    draw = ImageDraw.Draw(picture)
    for way in json.load(open(DL / "world/green.json", encoding="utf-8"))["elements"]:
        geometry = way.get("geometry")
        if geometry and len(geometry) > 2:
            draw.polygon([pixel(to_xy(p["lat"], p["lon"])) for p in geometry], fill=GREEN)
    for way in json.load(open(DL / "osm/buildings.json", encoding="utf-8"))["elements"]:
        geometry = way.get("geometry")
        if geometry and len(geometry) > 2:
            draw.polygon([pixel(to_xy(p["lat"], p["lon"])) for p in geometry], fill=BUILT)
    picture.paste(SEA, mask=water.point(lambda v: 255 if v > 127 else 0))
    picture.save(PUBLIC / "map.webp", quality=80, method=6)
    print("map", WIDE, TALL, round((PUBLIC / "map.webp").stat().st_size / 1e3), "KB", flush=True)


if __name__ == "__main__":
    main()

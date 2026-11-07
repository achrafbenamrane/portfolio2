"""
Packs what /3d/2090 draws into public/2090/: the robot's bakes, the ground's fine detail, and
the Earth, the Moon and the stars.

    python -I scripts/tether_pack.py [robot] [ground] [space]

The downloads are other people's files, so this runs isolated, and finds Pillow for itself.

Earth, Moon and star maps are by Solar System Scope, under CC BY 4.0, from NASA data: the page
credits them. The ground and rocks are Poly Haven's, CC0.
"""

import site
import sys

sys.path.append(site.getusersitepackages())

from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

Image.MAX_IMAGE_PIXELS = None

BUILD = Path("assets-source/tether/build")
DOWNLOADS = Path("assets-source/tether/dl")
OUT = Path("public/2090")
OUT.mkdir(parents=True, exist_ok=True)
wanted = set(sys.argv[1:]) or {"robot", "ground", "space"}


def save(image, name, quality=86):
    path = OUT / name
    image.save(path, quality=quality, method=5)
    print(f"{name}: {image.size[0]} px, {path.stat().st_size / 1e6:.2f} MB", flush=True)


if "robot" in wanted:
    albedo = Image.open(BUILD / "robot-albedo.png").convert("RGB")
    size = albedo.size
    save(albedo, "robot-albedo.webp")
    save(Image.open(BUILD / "enemy-albedo.png").convert("RGB"), "enemy-albedo.webp")
    save(Image.open(BUILD / "robot-normal.png").convert("RGB"), "robot-normal.webp", 90)
    # Occlusion, roughness and metal in one picture, in the channels glTF and three expect.
    ao = Image.open(BUILD / "robot-ao.png").convert("L").resize(size, Image.BILINEAR)
    rough = Image.open(BUILD / "robot-rough.png").convert("L")
    metal = Image.open(BUILD / "robot-metal.png").convert("L")
    save(Image.merge("RGB", (ao, rough, metal)), "robot-orm.webp")
    # A phone has neither the memory nor the screen for the full paint.
    for name in ("robot-albedo", "enemy-albedo", "robot-normal", "robot-orm"):
        full = Image.open(OUT / f"{name}.webp")
        save(full.resize((2048, 2048), Image.LANCZOS), f"{name}-small.webp", 86)
    decals = Image.open(BUILD / "decals.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    decals.save(OUT / "decals.webp", quality=90, alpha_quality=95, method=5)

for ship in ("heron", "raider", "base"):
    if ship in wanted:
        albedo = Image.open(BUILD / f"{ship}-albedo.png").convert("RGB")
        save(albedo, f"{ship}-albedo.webp")
        save(Image.open(BUILD / f"{ship}-normal.png").convert("RGB"), f"{ship}-normal.webp", 88)
        ao = Image.open(BUILD / f"{ship}-ao.png").convert("L").resize(albedo.size, Image.BILINEAR)
        rough = Image.open(BUILD / f"{ship}-rough.png").convert("L")
        metal = Image.open(BUILD / f"{ship}-metal.png").convert("L")
        save(Image.merge("RGB", (ao, rough, metal)), f"{ship}-orm.webp")

if "ground" in wanted:
    source = DOWNLOADS / "ground/moon_dusted_05"
    save(Image.open(source / "moon_dusted_05_diff_2k.jpg").convert("RGB").resize((1024, 1024), Image.LANCZOS), "soil-albedo.webp", 84)
    save(Image.open(source / "moon_dusted_05_nor_2k.jpg").convert("RGB").resize((1024, 1024), Image.LANCZOS), "soil-normal.webp", 88)

if "space" in wanted:
    space = DOWNLOADS / "space"
    save(Image.open(space / "8k_earth_daymap.jpg").convert("RGB").resize((4096, 2048), Image.LANCZOS), "earth-day.webp", 84)
    save(Image.open(space / "8k_earth_nightmap.jpg").convert("RGB").resize((2048, 1024), Image.LANCZOS), "earth-night.webp", 80)
    save(Image.open(space / "8k_earth_clouds.jpg").convert("L").resize((2048, 1024), Image.LANCZOS), "earth-clouds.webp", 80)
    save(Image.open(space / "8k_moon.jpg").convert("RGB").resize((4096, 2048), Image.LANCZOS), "moon.webp", 84)
    stars = np.asarray(Image.open(space / "8k_stars_milky_way.jpg").convert("RGB").resize((4096, 2048), Image.LANCZOS)).astype(np.float32) / 255
    save(Image.fromarray((np.clip(stars, 0, 1) * 255).astype(np.uint8)), "stars.webp", 82)

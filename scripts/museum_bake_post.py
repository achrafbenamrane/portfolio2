"""
Turns the museum's linear bakes into the textures the page draws.

    python scripts/museum_bake_post.py

Reads the .npy files from assets-source/museum/build and writes public/museum/bake/*.webp
and public/museum/poster.webp. Exposure lives here, so it can be tuned without a bake.

Near black, eight bits are not enough: a dark wall fading to darker shows bands. A
little noise is added before rounding, which dissolves the steps into grain.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "assets-source" / "museum" / "build"
OUT = ROOT / "public" / "museum"

EXPOSURE = 1.15
SHOULDER = 0.8


def tone(linear):
    x = np.maximum(linear * EXPOSURE, 0)
    span = 1 - SHOULDER
    x = np.where(x > SHOULDER, SHOULDER + span * (1 - np.exp(-(x - SHOULDER) / span)), x)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def export(name, target, sigma, quality, size=None):
    linear = np.load(BUILD / f"{name}.npy").astype(np.float32)
    if sigma:
        linear = np.stack([gaussian_filter(linear[..., c], sigma) for c in range(3)], axis=-1)
    picture = np.clip(tone(linear), 0, 1) * 255
    noise = np.random.default_rng(7).uniform(-0.7, 0.7, picture.shape[:2])[..., None]
    image = Image.fromarray(np.clip(picture + noise + 0.5, 0, 255).astype(np.uint8))
    if size:
        image = image.resize(size, Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, quality=quality, method=6)
    print(f"{target.name}: {image.size}, {target.stat().st_size // 1024} KB")


def main():
    export("framewood", OUT / "bake" / "frame.webp", 0.8, 88)
    export("floor", OUT / "bake" / "floor.webp", 2.0, 90)
    export("props", OUT / "bake" / "props.webp", 1.0, 90)
    export("walls", OUT / "bake" / "walls.webp", 2.2, 90)
    export("walls", OUT / "bake" / "walls-2k.webp", 2.2, 88, size=(2048, 2048))
    export("poster", OUT / "poster.webp", 0, 90)
    Image.open(BUILD / "logo-wall.png").convert("RGB").save(OUT / "logo.webp", quality=92, method=6)


if __name__ == "__main__":
    main()

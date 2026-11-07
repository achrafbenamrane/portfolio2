"""
Turns the store's linear bakes into the textures the page draws.

    python scripts/store_bake_post.py

Reads walls.npy, floor.npy, props.npy and poster.npy from assets-source/store/build
and writes public/store/bake/*.webp and public/store/poster.webp.

Kept apart from the bake, because exposure is a matter of taste and the bake takes
minutes: this takes seconds, so it can be tuned by eye.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "assets-source" / "store" / "build"
OUT = ROOT / "public" / "store"

EXPOSURE = 1.3
SHOULDER = 0.82  # where highlights start to roll off, in linear light


def tone(linear):
    """Exposure, a soft shoulder instead of a hard clip, then the sRGB curve."""
    x = np.maximum(linear * EXPOSURE, 0)
    over = x > SHOULDER
    span = 1 - SHOULDER
    x = np.where(over, SHOULDER + span * (1 - np.exp(-(x - SHOULDER) / span)), x)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def denoise(linear, sigma):
    """Light is soft, so a small blur removes noise and nothing else."""
    if sigma == 0:
        return linear
    return np.stack([gaussian_filter(linear[..., c], sigma) for c in range(3)], axis=-1)


def export(name, target, sigma, quality, size=None):
    linear = np.load(BUILD / f"{name}.npy").astype(np.float32)
    image = Image.fromarray((np.clip(tone(denoise(linear, sigma)), 0, 1) * 255 + 0.5).astype(np.uint8))
    if size:
        image = image.resize(size, Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, quality=quality, method=6)
    print(f"{target.name}: {image.size}, {target.stat().st_size // 1024} KB, mean {np.mean(linear):.3f}")


def main():
    export("floor", OUT / "bake" / "floor.webp", 1.2, 84)
    export("props", OUT / "bake" / "props.webp", 0.8, 86)
    export("walls", OUT / "bake" / "walls.webp", 1.6, 82)
    export("walls", OUT / "bake" / "walls-2k.webp", 1.6, 80, size=(2048, 2048))
    export("poster", OUT / "poster.webp", 0, 86)


if __name__ == "__main__":
    main()

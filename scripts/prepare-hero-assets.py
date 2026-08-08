"""
Cuts the two hero textures out of their backgrounds.

Run once after replacing either source image:

    python scripts/prepare-hero-assets.py

Two different techniques, because the images are two different problems:

* The portrait sits on a lit grey studio backdrop, so separating it needs an
  actual segmentation model — no threshold survives hair against grey.
* The origami sits on near-black, which a luminance key separates far more
  cleanly than any saliency model would, and with exact edges rather than a
  model's guess at them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets-source"
PUBLIC = ROOT / "public"

TARGET_SIZE = 1024


def main() -> int:
    PUBLIC.mkdir(exist_ok=True)

    portrait_src = SOURCE / "hand-open.jpg"
    origami_src = SOURCE / "hand-closed.jpg"

    for path in (portrait_src, origami_src):
        if not path.exists():
            print(f"missing source image: {path}", file=sys.stderr)
            return 1

    print("- segmenting portrait (first run downloads the model)…")
    portrait = cut_out_person(Image.open(portrait_src))
    save(portrait, "portrait")

    print("- keying origami off black…")
    origami = key_off_black(Image.open(origami_src))
    save(origami, "origami")

    return 0


def cut_out_person(image: Image.Image) -> Image.Image:
    from rembg import new_session, remove

    # The human-specific model beats the general one on a headshot, and alpha
    # matting is what keeps hair from turning into a hard cut-out edge.
    session = new_session("u2net_human_seg")
    result = remove(
        image.convert("RGB"),
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=15,
        alpha_matting_erode_size=8,
    )
    return result.convert("RGBA")


def key_off_black(image: Image.Image, lo: float = 0.045, hi: float = 0.16) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

    # Fill holes before picking the largest blob, so the ball's own dark facets
    # stay opaque instead of being punched out as background.
    solid = ndimage.binary_fill_holes(luma > hi)
    labels, count = ndimage.label(solid)
    if count:
        sizes = ndimage.sum(solid, labels, range(1, count + 1))
        solid = labels == (int(np.argmax(sizes)) + 1)

    ramp = np.clip((luma - lo) / (hi - lo), 0.0, 1.0)
    reach = ndimage.binary_dilation(solid, iterations=3)
    alpha = np.where(reach, np.maximum(ramp, solid.astype(np.float32)), 0.0)
    alpha = ndimage.gaussian_filter(alpha, 0.7)

    # The JPEG was composited over black, so edge pixels arrive darkened by
    # their own coverage. Dividing it back out is what prevents a grey halo
    # once the ball is drawn over a different background.
    safe = np.maximum(alpha, 1e-3)[..., None]
    unpremultiplied = np.clip(rgb / safe, 0.0, 1.0)
    straight = np.where(alpha[..., None] > 0.02, unpremultiplied, rgb)

    rgba = np.concatenate([straight, alpha[..., None]], axis=-1)
    return crop_to_content(Image.fromarray((rgba * 255).astype(np.uint8), "RGBA"))


def crop_to_content(image: Image.Image, margin: float = 0.04) -> Image.Image:
    """Squares the crop around the subject so the texture isn't mostly empty."""
    alpha = np.asarray(image)[..., 3]
    rows = np.where(alpha.max(axis=1) > 5)[0]
    cols = np.where(alpha.max(axis=0) > 5)[0]
    if not len(rows) or not len(cols):
        return image

    cy = (rows[0] + rows[-1]) / 2
    cx = (cols[0] + cols[-1]) / 2
    half = max(rows[-1] - rows[0], cols[-1] - cols[0]) / 2
    half *= 1 + margin

    return image.crop(
        (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
    )


def save(image: Image.Image, stem: str) -> None:
    image = image.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)

    png = PUBLIC / f"{stem}.png"
    webp = PUBLIC / f"{stem}.webp"
    image.save(png, optimize=True)
    image.save(webp, quality=90, method=6)

    print(
        f"  {stem}: png {png.stat().st_size // 1024} KB · "
        f"webp {webp.stat().st_size // 1024} KB"
    )


if __name__ == "__main__":
    raise SystemExit(main())

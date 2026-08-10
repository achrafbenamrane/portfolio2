"""
Cuts the assistant's robot portrait out of its background.

Run once after replacing the source image:

    python scripts/prepare-robot.py

Produces two crops from one source, because they are used at very different
sizes:

* robot        — the full bust, for anywhere it is shown large.
* robot-head   — a square crop around the head, for the assistant avatar. At
                 ~110 px the shoulder plating is unreadable noise, and cropping
                 in is what keeps the face legible instead of shrinking it.

The same `u2net_human_seg` model as the hero assets, deliberately: it segments
this humanoid bust as cleanly as the general-purpose model does (both keep
51.6% of the frame), so there is no reason to carry a second 179 MB download.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets-source"
PUBLIC = ROOT / "public"

BUST_SIZE = 768
HEAD_SIZE = 512

#: Where the head ends, as a fraction of the bust height.
#:
#: Measured, not guessed. Sampling the silhouette width every 5% shows it
#: widening to 588 px at 35%, pinching to 459 px around 50–60% — the neck — and
#: then flaring past 1200 px at the shoulders. Cutting at 0.62 keeps the whole
#: head and stops before the shoulders, which is what lets the crop centre on
#: the face: the shoulders span the full frame and would drag the centre away
#: from it in this three-quarter pose.
HEAD_FRACTION = 0.62


def main() -> int:
    src = SOURCE / "robot.png"
    if not src.exists():
        print(f"missing source image: {src}", file=sys.stderr)
        return 1

    print("- segmenting robot…")
    cut = cut_out(Image.open(src))

    bust = crop_to_content(cut)
    save(bust, "robot", BUST_SIZE)

    save(crop_head(cut), "robot-head", HEAD_SIZE)
    return 0


def cut_out(image: Image.Image) -> Image.Image:
    from rembg import new_session, remove

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


def content_box(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = np.asarray(image)[..., 3]
    rows = np.where(alpha.max(axis=1) > 5)[0]
    cols = np.where(alpha.max(axis=0) > 5)[0]
    if not len(rows) or not len(cols):
        return 0, 0, image.width, image.height
    return int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])


def crop_to_content(image: Image.Image, margin: float = 0.04) -> Image.Image:
    """Squares the crop around the subject so the texture isn't mostly empty."""
    x0, y0, x1, y1 = content_box(image)
    cy = (y0 + y1) / 2
    cx = (x0 + x1) / 2
    half = max(y1 - y0, x1 - x0) / 2 * (1 + margin)
    return image.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))


def crop_head(image: Image.Image, margin: float = 0.17) -> Image.Image:
    """
    A square around the head alone.

    Both the centre and the size come from the head band rather than the whole
    silhouette. The shoulders touch both edges of the frame, so anything
    measured across the full bust centres on the armour and pushes the face out
    of shot — which is exactly what the first attempt did.

    A box that runs past the edge is fine: PIL pads with transparent, and an
    off-centre face would be worse than a little empty space.

    The margin is sized for a CIRCULAR mask, not a square one. At a tight crop
    the head spans the full width, so the inscribed circle the avatar uses
    would slice both cheeks off.
    """
    x0, y0, x1, y1 = content_box(image)
    alpha = np.asarray(image)[..., 3]

    head_bottom = y0 + int((y1 - y0) * HEAD_FRACTION)
    band = alpha[y0:head_bottom]
    cols = np.where(band.max(axis=0) > 5)[0]
    if not len(cols):
        return crop_to_content(image)

    hx0, hx1 = int(cols[0]), int(cols[-1])
    side = int(max(hx1 - hx0, head_bottom - y0) * (1 + margin))

    cx = (hx0 + hx1) // 2
    cy = (y0 + head_bottom) // 2

    return image.crop(
        (cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)
    )


def save(image: Image.Image, stem: str, size: int) -> None:
    image = image.resize((size, size), Image.LANCZOS)

    png = PUBLIC / f"{stem}.png"
    webp = PUBLIC / f"{stem}.webp"
    image.save(png, optimize=True)
    image.save(webp, quality=90, method=6)

    print(
        f"  {stem}: {size}px · png {png.stat().st_size // 1024} KB · "
        f"webp {webp.stat().st_size // 1024} KB"
    )


if __name__ == "__main__":
    raise SystemExit(main())

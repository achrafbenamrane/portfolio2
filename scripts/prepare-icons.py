"""
Builds the site icons from the cut-out portrait.

Run after replacing the portrait:

    python scripts/prepare-icons.py

A favicon is displayed at 16–32px, so the full headshot is useless at that size —
the head is cropped out of the frame using the portrait's own alpha channel, and
composited onto a solid tile. The tile matters: the cut-out is transparent and
the suit is near-black, so on a dark browser tab the whole thing would otherwise
vanish and leave a floating face with no edges.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "portrait.png"
APP = ROOT / "src" / "app"

# surface-1 from the design tokens, so the icon belongs to the same palette.
TILE = (64, 82, 97, 255)  # #405261

ALPHA_THRESHOLD = 8


def main() -> int:
    if not SOURCE.exists():
        print(f"missing {SOURCE} — run prepare-hero-assets.py first", file=sys.stderr)
        return 1

    portrait = Image.open(SOURCE).convert("RGBA")
    head = crop_head(portrait)

    tile = Image.new("RGBA", head.size, TILE)
    tile.alpha_composite(head)
    icon = tile.convert("RGB")

    APP.mkdir(parents=True, exist_ok=True)

    # Next.js App Router picks these up by filename and emits the link tags.
    icon.resize((512, 512), Image.LANCZOS).save(APP / "icon.png", optimize=True)
    icon.resize((180, 180), Image.LANCZOS).save(
        APP / "apple-icon.png", optimize=True
    )
    # Still worth shipping: some browsers and most feed readers ask for
    # /favicon.ico by path regardless of the link tags.
    #
    # Written from the RGBA tile, not the flattened RGB one — Next's image
    # pipeline decodes the ICO at build time and rejects a non-RGBA payload
    # outright ("The PNG is not in RGBA format"), failing the whole build.
    tile.resize((256, 256), Image.LANCZOS).save(
        APP / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )

    print("OK wrote icon.png (512), apple-icon.png (180), favicon.ico")
    return 0


def crop_head(portrait: Image.Image) -> Image.Image:
    """
    Squares a crop around the head, located from the alpha channel rather than
    hardcoded — so it still lands correctly if the portrait is reframed.
    """
    alpha = np.asarray(portrait)[..., 3]
    height, width = alpha.shape

    rows = np.where(alpha.max(axis=1) > ALPHA_THRESHOLD)[0]
    if not len(rows):
        return portrait
    top = int(rows[0])

    # The widest span in the top third of the subject is the head, before the
    # shoulders flare out and drag the centre off the face.
    band = alpha[top : top + int(height * 0.30)]
    cols = np.where(band.max(axis=0) > ALPHA_THRESHOLD)[0]
    if not len(cols):
        return portrait

    centre_x = (int(cols[0]) + int(cols[-1])) / 2
    head_width = int(cols[-1]) - int(cols[0])

    # A head runs roughly 1.35× its own width from hairline to chin, so a square
    # of 1.5× puts the chin right on the bottom edge and reads as a mis-crop.
    # 1.66 leaves air under it while keeping the face dominant at 16px.
    side = head_width * 1.66
    centre_y = top + side * 0.46

    box = (
        int(centre_x - side / 2),
        int(centre_y - side / 2),
        int(centre_x + side / 2),
        int(centre_y + side / 2),
    )
    print(f"  head crop {box} from {width}×{height}")
    return portrait.crop(box)


if __name__ == "__main__":
    raise SystemExit(main())

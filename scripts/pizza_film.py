"""
Packs what build_pizzeria.py filmed for the page: the two clips, a still of each for when
video can't or shouldn't play, and the chef's cut-out for the wide view of the room.

    python scripts/pizza_film.py [card | cover]

Reads assets-source/pizza/film/{serve,meet}/ and renders/chef-card.png. Writes into public/pizza/.
`card` and `cover` do only that picture, which doesn't have to wait for the films.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path("assets-source/pizza")
OUT = Path("public/pizza")
NOTES = json.loads(Path("src/content/pizza-film.json").read_text(encoding="utf-8"))

SHADOW_DARK = 150

# Marked as what it is, so every browser turns it back into the same colours.
COLOUR = [
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
]  # fmt: skip



def pack_card():
    """The cut-out, on the soft shadow he'd throw on the floor, falling away from the windows."""
    card = Image.open(ASSETS / "renders/chef-card.png").convert("RGBA").crop(NOTES["card"]["box"])
    solid = np.asarray(card)[..., 3] > 128
    rows = np.flatnonzero(solid.any(axis=1))
    bottom = int(rows[-1])
    tall = bottom - int(rows[0])
    feet = float(np.flatnonzero(solid[bottom - int(tall * 0.05) : bottom].any(axis=0)).mean())

    shadow = Image.new("L", card.size, 0)
    across, down = tall * 0.25, tall * 0.055
    centre = (feet + tall * 0.05, bottom - tall * 0.012)
    ImageDraw.Draw(shadow).ellipse(
        (centre[0] - across, centre[1] - down, centre[0] + across, centre[1] + down),
        fill=SHADOW_DARK,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(tall * 0.022))
    under = Image.new("RGBA", card.size, (0, 0, 0, 0))
    under.putalpha(shadow)
    Image.alpha_composite(under, card).save(OUT / "chef-card.webp", quality=90, alpha_quality=100, method=6)
    print("card", card.size, "he is", tall, "px tall")


def pack_cover():
    Image.open(ASSETS / "renders/cover.png").convert("RGB").save(OUT / "cover.webp", quality=86, method=6)
    print("cover", (OUT / "cover.webp").stat().st_size // 1000, "KB")


if sys.argv[1:] == ["card"]:
    pack_card()
    sys.exit(0)

if sys.argv[1:] == ["cover"]:
    pack_cover()
    sys.exit(0)

for name, quality, still in (("serve", 20, 66), ("meet", 20, 1)):
    frames = ASSETS / "film" / name
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", str(NOTES["fps"]),
            "-i", str(frames / "f%04d.png"),
            *COLOUR,
            "-c:v", "libx264", "-preset", "slow", "-crf", str(quality),
            "-movflags", "+faststart", "-an",
            str(OUT / f"film-{name}.mp4"),
        ],  # fmt: skip
        check=True,
    )
    Image.open(frames / f"f{still:04d}.png").convert("RGB").save(OUT / f"film-{name}.webp", quality=88, method=6)
    size = (OUT / f"film-{name}.mp4").stat().st_size / 1e6
    print(f"{name}: {size:.1f} MB")

pack_card()
pack_cover()

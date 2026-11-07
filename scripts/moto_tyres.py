"""
Draws the tyres' surface for /3d's motorcycles: a sport tread, ribs and plain size markings on the
sidewall, as height, then as a normal map. The map runs round the tyre one way and from bead to
bead the other, the same way the tyre's mesh is unwrapped.

    python scripts/moto_tyres.py

Writes tyre-front and tyre-rear, albedo and normal, to assets-source/moto/build.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[1] / "assets-source/moto/build"
OUT.mkdir(parents=True, exist_ok=True)
WIDE, TALL = 8192, 1024
FONT = "C:/Windows/Fonts/arialbd.ttf"


def lettering(height, text, size, v_centre, repeat, u_start=0.0):
    """Raised letters round the sidewall, on both sides."""
    font = ImageFont.truetype(FONT, size)
    box = font.getbbox(text)
    w, h = box[2] - box[0], box[3] - box[1]
    stamp = Image.new("L", (w + 8, h + 8), 0)
    ImageDraw.Draw(stamp).text((4 - box[0], 4 - box[1]), text, fill=255, font=font)
    for centre, flip in ((v_centre, False), (1 - v_centre, True)):
        piece = stamp.transpose(Image.ROTATE_180) if flip else stamp
        for k in range(repeat):
            x = int((u_start + k / repeat) * WIDE) % WIDE
            y = int(centre * TALL - stamp.height / 2)
            height.paste(255, (x, y), piece)


def tyre(name, grooves, spec):
    u = np.linspace(0, 1, WIDE, endpoint=False, dtype=np.float32)[None, :]
    v = np.linspace(0, 1, TALL, dtype=np.float32)[:, None]
    side = np.abs(v - 0.5) * 2  # 0 on the crown, 1 at the bead

    height = np.full((TALL, WIDE), 0.5, np.float32)

    # Sidewall: a rim protector, then rings.
    for ring, width, lift in ((0.93, 0.012, 0.25), (0.81, 0.004, -0.12), (0.62, 0.004, -0.12)):
        height += lift * np.exp(-(((side - ring) / width) ** 2))

    # Tread. Long raked grooves leave the centre of the crown clear, the way a sport tyre does, and
    # alternate side to side, so the tyre has a direction.
    tread = np.zeros((TALL, WIDE), np.float32)
    for k in range(grooves):
        for sign in (-1.0, 1.0):
            start = (k + (0.5 if sign > 0 else 0.0)) / grooves
            t = np.clip((side - 0.09) / 0.34, 0, 1)  # along the groove, from the crown outward
            centre = start + 0.052 * t + 0.03 * t * t
            du = (u - centre + 0.5) % 1 - 0.5
            width = (0.0011 + 0.0012 * np.sin(np.pi * t)) * (t > 0) * (t < 1)
            half = (v > 0.5) if sign > 0 else (v <= 0.5)
            groove = np.exp(-((du / np.maximum(width, 1e-4)) ** 4)) * half * ((side > 0.09) & (side < 0.43))
            tread = np.maximum(tread, groove)
    height -= tread * 0.55

    # The compound itself: a very fine grain, worn smooth where the tyre has been working.
    rng = np.random.default_rng(7)
    grain = rng.standard_normal((TALL, WIDE)).astype(np.float32)
    worn = np.clip(1 - side / 0.5, 0, 1)
    height += grain * 0.012 * (1 - 0.7 * worn)

    letters = Image.new("L", (WIDE, TALL), 0)
    # Only what every tyre has to carry: its size and construction. No maker's name, real or ours.
    lettering(letters, spec, 30, 0.14, 3, 0.08)
    lettering(letters, "RADIAL  TUBELESS", 18, 0.12, 3, 0.2)
    raised = np.asarray(letters.filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
    height += raised * 0.2

    gx = np.roll(height, -1, 1) - np.roll(height, 1, 1)
    gy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
    strength = 6.0
    normal = np.stack([-gx * strength, gy * strength, np.ones_like(height)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    Image.fromarray(((normal * 0.5 + 0.5) * 255).astype(np.uint8)).save(OUT / f"tyre-{name}-normal.png")

    # Rubber is nearly black, a little paler where it's scrubbed, and the letters catch dust.
    tone = 0.022 + 0.012 * worn + 0.012 * raised + 0.006 * np.clip(grain, -1, 1)
    colour = np.clip(tone, 0, 1) ** (1 / 2.2)
    Image.fromarray((np.repeat(colour[..., None], 3, axis=2) * 255).astype(np.uint8)).save(OUT / f"tyre-{name}-albedo.png")
    print("drew", name, flush=True)


tyre("front", 22, "120/60 ZR17")
tyre("rear", 26, "190/65 R17")

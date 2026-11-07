"""
Paints the rider's race suit. Every texel knows where it sits on the standing body, from the
position map build_moto_rider.py writes, so the suit is designed the way a real one is: in panels
on a person, not on a flat sheet. Seams run across the UV islands without a break.

    python scripts/moto_suit.py

Writes public/moto/suit-albedo.webp, suit-normal.webp and suit-rough.webp.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "assets-source/moto/build"
OUT = ROOT / "public/moto"
FONT = str(BUILD / "wordmark.ttf")
SIZE = 2048

position = np.load(BUILD / "suit-position.npy")
filled = np.load(BUILD / "suit-filled.npy")

# Spread the edges outward, so filtering at an island's border never picks up the empty sheet.
for _ in range(10):
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        moved = np.roll(position, (dr, dc), (0, 1))
        moved_filled = np.roll(filled, (dr, dc), (0, 1))
        grow = moved_filled & ~filled
        position[grow] = moved[grow]
        filled = filled | grow

x, y, z = position[..., 0], position[..., 1], position[..., 2]
ax = np.abs(x)
front = y < 0.0


def segment(px, pz, qx, qz):
    """How far along a limb and how far from its line each point is, in the side-on x and z plane."""
    dx, dz = qx - px, qz - pz
    length2 = dx * dx + dz * dz
    t = ((ax - px) * dx + (z - pz) * dz) / length2
    tc = np.clip(t, 0, 1)
    gap = np.hypot(ax - (px + tc * dx), z - (pz + tc * dz))
    return t, gap


upper_t, upper_gap = segment(0.193, 1.433, 0.364, 1.237)
fore_t, fore_gap = segment(0.364, 1.237, 0.5, 1.107)
arm = ((upper_gap < 0.1) & (upper_t > 0.05)) | (fore_gap < 0.085)
arm &= ax > 0.17
leg = (z < 0.97) & ~arm
thigh = leg & (z > 0.52)
shin = leg & (z <= 0.52)
torso = ~arm & ~leg

# A professional black suit is several blacks: smooth hide, grained hide, and matt stretch panels.
# Nothing else shows the shape of a body at night.
RED = np.array([0.034, 0.034, 0.037])
DEEP = np.array([0.022, 0.022, 0.024])
BLACK = np.array([0.014, 0.014, 0.016])
GREY = np.array([0.06, 0.06, 0.064])
WHITE = np.array([0.1, 0.1, 0.105])
LETTER = np.array([0.8, 0.78, 0.74])
THREAD = np.array([0.2, 0.2, 0.21])

albedo = np.ones((SIZE, SIZE, 3), np.float32) * BLACK
rough = np.full((SIZE, SIZE), 0.42, np.float32)
height = np.zeros((SIZE, SIZE), np.float32)
seams = np.zeros((SIZE, SIZE), np.float32)
thread = np.zeros((SIZE, SIZE), np.float32)


def paint(mask, colour, roughness=None):
    albedo[mask] = colour
    if roughness is not None:
        rough[mask] = roughness


def seam(field, mask, width=0.0016):
    """A stitched seam where a field crosses zero: a groove with a double row of stitches beside it."""
    global seams
    groove = np.exp(-((field / width) ** 2)) * mask
    seams = np.maximum(seams, groove)
    # Stitches are small dashes running along the seam, either side of it.
    run = (x * 3.0 + y * 5.0 + z * 7.0) * 330
    dash = (np.sin(run) > 0.1).astype(np.float32)
    for offset in (-0.0052, 0.0052):
        row = np.exp(-(((field - offset) / 0.0011) ** 2)) * mask * dash
        height[:] += row * 0.5
        np.maximum(thread, row, out=thread)


# ── torso ──
paint(torso, RED, 0.4)
sides = torso & (ax > 0.118 - 0.02 * np.clip((z - 1.25) / 0.3, -1, 1))
paint(sides, BLACK, 0.4)
waist = torso & (z < 1.11)
paint(waist, BLACK)
back_panel = torso & ~front & (ax < 0.07) & (z > 1.3)
paint(back_panel, DEEP, 0.38)
chevron = torso & front & (np.abs(z - (1.4 - ax * 0.9)) < 0.016)
paint(chevron, WHITE, 0.46)
collar = torso & (z > 1.53)
paint(collar, BLACK)

# ── arms ──
paint(arm, RED, 0.4)
cap = arm & (upper_t < 0.34)
paint(cap, WHITE, 0.34)
paint(arm & (fore_gap < 0.085) & (fore_t > -0.02), BLACK)
elbow_pad = arm & (fore_t > -0.2) & (fore_t < 0.16) & (y > -0.03)
paint(elbow_pad, GREY, 0.32)
stripe = arm & (fore_gap < 0.085) & (fore_t > 0.1) & (y < -0.02) & (np.abs(fore_t - 0.5) < 0.1)
paint(stripe, RED, 0.4)

# ── legs ──
paint(leg, BLACK)
outer = thigh & (ax > 0.168 - (0.97 - z) * -0.05)
paint(outer, RED, 0.4)
paint(thigh & (z > 0.82) & (ax < 0.13) & ~front, DEEP, 0.38)
knee = leg & (np.abs(z - 0.52) < 0.062) & front
paint(knee, GREY, 0.3)
slider = leg & (np.abs(z - 0.52) < 0.05) & (ax > 0.176)
paint(slider, WHITE, 0.32)
paint(shin & (ax > 0.17), RED, 0.4)

# ── seams ──
seam(ax - (0.118 - 0.02 * np.clip((z - 1.25) / 0.3, -1, 1)), torso)
seam(z - 1.11, torso)
seam(z - 0.97, leg | torso)
seam(z - 1.53, torso)
seam(upper_t - 0.34, arm)
seam(fore_t - 0.0, arm)
seam(ax - 0.168 + (0.97 - z) * -0.05, thigh)
seam(z - 0.582, leg)
seam(z - 0.458, leg)
seam(z - 0.82, thigh)
seam(ax - 0.07, torso & ~front & (z > 1.3))

# ── stretch panels: ribbed, so the suit can bend ──
ribs = np.sin(z * 2 * np.pi / 0.0105)
stretch = (waist & ~front) | (leg & (np.abs(z - 0.65) < 0.05) & front) | (arm & (np.abs(fore_t + 0.28) < 0.11) & ~elbow_pad)
height += stretch * ribs * 0.55
rough[stretch] = 0.56
albedo[stretch] *= 0.82

# ── perforations, down the chest sides and inside the thigh ──
holes = (np.sin(x * 2 * np.pi / 0.0078) * np.sin(z * 2 * np.pi / 0.0078)) > 0.72
perforated = (sides & front & (z > 1.14) & (z < 1.45)) | (thigh & (ax < 0.12) & front & (z < 0.9) & (z > 0.62))
height -= holes * perforated * 0.6
albedo[holes & perforated] *= 0.34


def stamp(text, mask_of, u, v, wide, tall):
    """Lettering, projected straight onto the body."""
    canvas = Image.new("L", (int(wide * 3000), int(tall * 3000)), 0)
    font_size = int(tall * 3000 * 0.84)
    font = ImageFont.truetype(FONT, font_size)
    box = font.getbbox(text)
    scale = min(canvas.width / (box[2] - box[0]), 1.0)
    font = ImageFont.truetype(FONT, int(font_size * scale))
    box = font.getbbox(text)
    ImageDraw.Draw(canvas).text(((canvas.width - (box[2] - box[0])) / 2 - box[0], (canvas.height - (box[3] - box[1])) / 2 - box[1]), text, fill=255, font=font)
    pixels = np.asarray(canvas, np.float32) / 255
    cols = ((u / wide + 0.5) * (canvas.width - 1)).astype(int)
    rows = ((0.5 - v / tall) * (canvas.height - 1)).astype(int)
    inside = (cols >= 0) & (cols < canvas.width) & (rows >= 0) & (rows < canvas.height) & mask_of
    out = np.zeros((SIZE, SIZE), np.float32)
    out[inside] = pixels[rows[inside], cols[inside]]
    return out


# The rider's name, big across the shoulders, where the chase camera reads it.
letters = stamp("ACHRAF", torso & ~front, -x, z - 1.41, 0.31, 0.076)
albedo[:] = albedo * (1 - letters[..., None]) + LETTER * letters[..., None]

# ── the leather itself: a fine pebbled grain, a little creased, and worn where it rubs ──
rng = np.random.default_rng(24)
grain = rng.standard_normal((SIZE, SIZE)).astype(np.float32)
soft = (grain + np.roll(grain, 1, 0) + np.roll(grain, 1, 1) + np.roll(grain, (1, 1), (0, 1))) / 4
height += soft * 0.1
wide_noise = np.sin(x * 61 + z * 37) * np.sin(y * 53 - z * 29) * np.sin(x * 23 + y * 31 + z * 11)
albedo *= (1 + wide_noise[..., None] * 0.05).clip(0.8, 1.2)
worn = (np.abs(z - 0.52) < 0.05) & (ax > 0.17)
albedo[worn] = albedo[worn] * 0.72 + np.array([0.05, 0.05, 0.05])
height -= seams * 1.1
albedo *= (1 - seams[..., None] * 0.6)
# Grey thread: on black, the stitching is what says this was made by hand.
albedo[:] = albedo * (1 - thread[..., None] * 0.8) + THREAD * thread[..., None] * 0.8

gx = np.roll(height, -1, 1) - np.roll(height, 1, 1)
gy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
strength = 1.5
normal = np.stack([-gx * strength, gy * strength, np.ones_like(height)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)

albedo_image = (np.clip(albedo, 0, 1) * 255).astype(np.uint8)
# The map was drawn with v up, and images run from the top, so each goes out flipped.
Image.fromarray(albedo_image[::-1]).save(OUT / "suit-albedo.webp", quality=90, method=5)
Image.fromarray(((normal * 0.5 + 0.5) * 255).astype(np.uint8)[::-1]).save(OUT / "suit-normal.webp", quality=74, method=5)
g = (rough.clip(0, 1) * 255).astype(np.uint8)[::-1]
Image.fromarray(np.stack([g, g, g], axis=-1)).save(OUT / "suit-rough.webp", quality=86, method=5)
print("painted the suit:", round(float(filled.mean()), 3), "of the sheet used", flush=True)

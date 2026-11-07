"""
The cover of Alger la Nuit: the rider's own face on a picture of them standing behind the Fang,
helmet in hand, on a street in the centre of Algiers at night, under the flag.

Three layers. The street is the game itself, shot with the lens the rest of the picture uses, then
given real lens blur with bright lamps opening into discs. The bike and the rider's body are a
Cycles render with their shadow on nothing (scripts/blender/build_moto.py ... cover). The head is
the rider's real portrait, cut out and relit to match the street: warm from the lamp at their right,
falling away into shadow on the far side.

    python scripts/moto_cover.py <street shot> <bike and rider render> <out.webp>

Reads assets-source/portrait-original.jpg and assets-source/moto/build/cover-place.json.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "assets-source/moto/build"
WIDE, TALL = 2000, 1125


def linear(values):
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def display(values):
    values = np.clip(values, 0, None)
    return np.where(values <= 0.0031308, values * 12.92, 1.055 * np.power(values, 1 / 2.4) - 0.055)


def lens_blur(picture, radius):
    """A round lens: light adds up in linear space, so lamps open out into bright discs."""
    data = linear(np.asarray(picture, np.float32) / 255)
    # What the 8-bit shot clipped was far brighter than white: give the lamps their energy back.
    data = data * (1 + 7 * np.clip((data.max(axis=2, keepdims=True) - 0.72) / 0.28, 0, 1) ** 2)
    size = int(radius * 2 + 1)
    yy, xx = np.mgrid[-radius : radius + 1, -radius : radius + 1]
    disc = np.clip(radius + 0.5 - np.hypot(xx, yy), 0, 1)
    disc /= disc.sum()
    kernel = np.zeros(data.shape[:2], np.float32)
    kernel[:size, :size] = disc
    kernel = np.roll(kernel, (-radius, -radius), (0, 1))
    spectrum = np.fft.rfft2(kernel)
    out = np.stack([np.fft.irfft2(np.fft.rfft2(data[..., c]) * spectrum, s=data.shape[:2]) for c in range(3)], axis=2)
    return out


def street(path):
    shot = Image.open(path).convert("RGB").resize((WIDE, TALL), Image.LANCZOS)
    far = lens_blur(shot, 7)
    # Nearer the camera, the road falls out of focus less: the ground under the bike stays sharp.
    near = linear(np.asarray(shot.filter(ImageFilter.GaussianBlur(1.6)), np.float32) / 255)
    rows = np.linspace(0, 1, TALL)[:, None, None]
    share = np.clip((rows - 0.56) / 0.3, 0, 1)
    colour = far * (1 - share) + near * share
    # The game's road is lit for riding on. Seen from here it's a night street: dark, and a little
    # cool. Only what's grey changes, so the warm fronts of the buildings keep their light.
    band = np.clip((rows - 0.39) / 0.07, 0, 1)
    top = colour.max(axis=2, keepdims=True)
    tint = (top - colour.min(axis=2, keepdims=True)) / np.maximum(top, 1e-4)
    road = band * (1 - np.clip((tint - 0.1) / 0.14, 0, 1))
    tar = colour.mean(axis=2, keepdims=True) * np.array([0.92, 0.95, 1.04])[None, None, :]
    colour = colour * (1 - road) + tar * road * 0.8
    return colour * 0.82


def cut_head():
    """The rider's head and neck from the portrait, on transparent."""
    portrait = Image.open(ROOT / "assets-source/portrait-original.jpg").convert("RGB")
    data = np.asarray(portrait, np.float32) / 255
    # The backdrop is a plain grey: anything saturated or dark isn't backdrop.
    high = data.max(axis=2)
    low = data.min(axis=2)
    subject = (((high - low) > 0.06) | (high < 0.42)).astype(np.uint8) * 255
    matte = Image.fromarray(subject).filter(ImageFilter.MedianFilter(5))
    # Only the head and the neck: the jacket stays behind.
    keep = Image.new("L", portrait.size, 0)
    ImageDraw.Draw(keep).polygon(
        [(395, 40), (860, 40), (880, 420), (850, 520), (800, 640), (806, 760), (720, 860), (630, 905), (540, 860), (478, 760), (470, 640), (420, 520), (390, 420)],
        fill=255,
    )
    alpha = np.minimum(np.asarray(matte, np.float32), np.asarray(keep.filter(ImageFilter.GaussianBlur(5)), np.float32))
    # Everything inside the face and hair is solid, whatever its colour: fill it from the middle.
    solid = Image.new("L", portrait.size, 0)
    ImageDraw.Draw(solid).ellipse((452, 120, 806, 700), fill=255)
    alpha = np.maximum(alpha, np.asarray(solid.filter(ImageFilter.GaussianBlur(4)), np.float32))
    edge = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.6))
    return portrait, np.asarray(edge, np.float32) / 255


def place_head(colour, place):
    portrait, alpha = cut_head()
    neck_x, neck_y = place["neck"]
    tenth = abs(place["tenth"]) * WIDE / 2000
    # Crown to chin in the portrait, in pixels. With the hair, a real head is about 27 cm.
    scale = tenth * 2.72 / 610
    size = (int(portrait.width * scale), int(portrait.height * scale))
    head = np.asarray(portrait.resize(size, Image.LANCZOS), np.float32) / 255
    matte = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize(size, Image.LANCZOS), np.float32) / 255
    # The top of the neck sits just under the ear, here in the portrait.
    left = int(neck_x * WIDE - 628 * scale)
    top = int(neck_y * TALL - 512 * scale)
    h, w = head.shape[:2]

    # Relight it for the street: the lamp is up to the rider's right, so that cheek stays warm and
    # bright, the far side falls away, and a little of the night comes into the shadows.
    head = linear(head)
    across = np.linspace(-1, 1, w)[None, :, None]
    down = np.linspace(0, 1, h)[:, None, None]
    key = np.clip(0.6 - across * 0.52, 0.16, 1.2) * (1.0 - 0.14 * down)
    warm = np.array([1.02, 0.8, 0.6])[None, None, :]
    night = np.array([0.05, 0.06, 0.1])[None, None, :]
    head = head * (key * warm * 0.92 + night)
    # A line of light from the lamps behind, on the shadow side.
    soft = np.asarray(Image.fromarray((matte * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9 * max(scale, 0.4))), np.float32) / 255
    rim = np.clip(matte - soft, 0, 1)[..., None] * np.clip(across, 0, 1) * np.array([1.0, 0.82, 0.62])[None, None, :]
    head = head + rim * 0.5

    region = colour[top : top + h, left : left + w]
    a = matte[..., None]
    colour[top : top + h, left : left + w] = region * (1 - a) + head * a
    return colour


def main():
    shot, render, out = sys.argv[1:4]
    place = json.load(open(BUILD / "cover-place.json"))
    colour = street(shot)
    layer = Image.open(render).convert("RGBA").resize((WIDE, TALL), Image.LANCZOS)
    data = np.asarray(layer, np.float32) / 255
    alpha = data[..., 3:4]
    # Blender's PNG isn't premultiplied, and its AgX is already display-referred.
    subject = linear(data[..., :3]) * 0.86
    colour = colour * (1 - alpha) + subject * alpha
    colour = place_head(colour, place)

    # One lens over everything: a soft glow off the lights, a darker edge, a little grain.
    picture = display(colour)
    glow = np.asarray(Image.fromarray((np.clip(picture - 0.68, 0, 1) * 255 * 3).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(26)), np.float32) / 255
    picture = 1 - (1 - picture) * (1 - glow * 0.34)
    yy, xx = np.mgrid[0:TALL, 0:WIDE]
    edge = np.hypot((xx - WIDE / 2) / (WIDE / 2), (yy - TALL / 2) / (TALL / 2))
    picture = picture * (1 - 0.3 * np.clip(edge - 0.55, 0, 1) ** 1.6)[..., None]
    grain = np.random.default_rng(1962).normal(0, 0.008, picture.shape[:2])[..., None]
    picture = np.clip(picture + grain, 0, 1)
    final = Image.fromarray((picture * 255).astype(np.uint8)).resize((1600, 900), Image.LANCZOS)
    final.save(out, quality=88, method=6)
    final.save(str(Path(out).with_suffix(".png")))
    print("Cover", Path(out).stat().st_size / 1e3, "KB", flush=True)


if __name__ == "__main__":
    main()

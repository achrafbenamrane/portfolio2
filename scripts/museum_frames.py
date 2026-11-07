"""
Takes the six ONEFRAME frames apart, so the museum can put them back together in 3D.

    python scripts/museum_frames.py

A photo of a shadow box is flat: the car and the print behind it are one picture. To
look into the box they have to be separate, so each frame is cut into

    plate    the printed backdrop, with the car painted out behind where it stood
    subject  the car or bike alone, with a clean edge
    relief   how far each part of the subject stands out, as a height map

Reads public/projects/oneframe/products.webp, the largest photo of the set. Writes
public/museum/frames/*.webp and src/content/museum-frames.json.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "projects" / "oneframe" / "products.webp"
OUT = ROOT / "public" / "museum" / "frames"
LAYOUT = ROOT / "src" / "content" / "museum-frames.json"
HALL = ROOT / "src" / "content" / "museum-layout.json"

PLATE_WIDTH = 1024

# Each frame in the source photo, and the printed plate inside it, in source pixels.
#
# `search` is where the subject stands, as fractions of the plate, so the cut-out model
# can't wander off onto a logo. It can run past 1: some subjects stand on the frame's
# floor, below the print.
#
# `colour` adds what the model can't see. It finds the Camaro's black bonnet and misses
# the yellow car on a yellow plate, so that is found by hue instead.
#
# `fill` is how the print runs behind the subject, for painting it back in: stripes
# run down the plate and horizons run across it.
FRAMES = [
    {"slug": "camaro", "box": (128, 126, 912, 1033), "plate": (103, 131, 690, 790), "search": (0.1, 0.2, 0.9, 0.705), "colour": "amber", "fill": "down"},
    {"slug": "amg", "box": (1001, 128, 1778, 1031), "plate": (91, 136, 686, 800), "search": (0.24, 0.17, 0.76, 0.76), "fill": "down"},
    {"slug": "lotus", "box": (1862, 125, 2646, 1033), "plate": (88, 136, 670, 786), "search": (0.115, 0.27, 0.385, 0.87), "colour": "vivid", "fill": "down"},
    {"slug": "brezina", "box": (2728, 124, 3510, 1035), "plate": (99, 131, 692, 793), "search": (0.14, 0.72, 0.84, 1.14), "fill": "across"},
    {"slug": "just-go-out", "box": (3592, 125, 4374, 1034), "plate": (104, 133, 706, 851), "search": (0.1, 0.6, 0.9, 0.98), "fill": "across"},
    {"slug": "bike-life", "box": (4462, 130, 5238, 1032), "plate": (104, 148, 665, 798), "search": (0.02, 0.2, 0.98, 0.98), "fill": "soft"},
]


def enlarge(image, width):
    """Upscale with a touch of sharpening: the source is a little soft for close-ups."""
    height = round(image.height * width / image.width)
    large = image.resize((width, height), Image.LANCZOS)
    return large.filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))


def by_colour(pixels, kind):
    """What a hue alone can pick out, where the model sees nothing."""
    r, g, b = (pixels[..., i].astype(np.float32) for i in range(3))
    high = np.maximum(np.maximum(r, g), b)
    low = np.minimum(np.minimum(r, g), b)
    if kind == "amber":
        # The plate is lime, green at least as strong as red. The car is warmer.
        return (r - g > 20) & (high > 70)
    # Anything vivid or dark on a pale grey board.
    return ((high - low) / np.maximum(high, 1) > 0.24) | (high < 85)


def cut_subject(picture, plate_box, frame, session):
    """The subject's alpha, 0..1, the size of the picture."""
    x0, y0, x1, y1 = plate_box
    sx0, sy0, sx1, sy1 = frame["search"]
    box = (
        round(x0 + sx0 * (x1 - x0)),
        round(y0 + sy0 * (y1 - y0)),
        round(x0 + sx1 * (x1 - x0)),
        min(picture.height, round(y0 + sy1 * (y1 - y0))),
    )
    area = picture.crop(box)
    found = np.asarray(remove(area, session=session, only_mask=True, post_process_mask=True), dtype=np.float32) / 255

    if frame.get("colour"):
        # The two together, closed up: the hue misses the black parts, the model the rest.
        hue = by_colour(np.asarray(area), frame["colour"])
        hue = ndimage.binary_opening(hue, iterations=2)
        both = ndimage.binary_closing((found > 0.5) | hue, iterations=5)
        both = ndimage.binary_fill_holes(both)
        found = np.maximum(found, ndimage.gaussian_filter(both.astype(np.float32), 1.2))

    array = np.zeros((picture.height, picture.width), dtype=np.float32)
    array[box[1] : box[3], box[0] : box[2]] = found

    # Keep the largest piece, with whatever touches it: stray specks are print, not car.
    labels, count = ndimage.label(array > 0.5)
    if count > 1:
        sizes = ndimage.sum(array > 0.5, labels, range(1, count + 1))
        keep = 1 + int(np.argmax(sizes))
        near = ndimage.binary_dilation(labels == keep, iterations=10)
        array = array * near
    return array


def run_through(array, hole, axis):
    """Fills each line of the hole by fading between the good pixels at its two ends."""
    work = np.moveaxis(array, axis, 0).copy()
    gap = np.moveaxis(hole, axis, 0)
    positions = np.arange(work.shape[0])
    for line in range(work.shape[1]):
        bad = gap[:, line]
        if not bad.any() or bad.all():
            continue
        for channel in range(3):
            work[bad, line, channel] = np.interp(positions[bad], positions[~bad], work[~bad, line, channel])
    return np.moveaxis(work, 0, axis)


def paint_out(plate, alpha, how):
    """Fills in where the subject stood, for the sliver revealed when you look past it."""
    array = np.asarray(plate, dtype=np.float32)
    hole = ndimage.binary_dilation(alpha > 0.12, iterations=9)
    if how == "down":
        filled = run_through(array, hole, 0)
    elif how == "across":
        filled = run_through(array, hole, 1)
    else:
        # Each hole pixel takes the nearest good pixel.
        indices = ndimage.distance_transform_edt(hole, return_distances=False, return_indices=True)
        filled = array[indices[0], indices[1]]
    blurred = np.stack([ndimage.gaussian_filter(filled[..., c], 5) for c in range(3)], axis=-1)
    weight = ndimage.gaussian_filter(hole.astype(np.float32), 2.5)[..., None]
    return Image.fromarray((array * (1 - weight) + blurred * weight).clip(0, 255).astype(np.uint8))


def carry_up(plate, height):
    """
    Runs the print up behind the LED bar, to the top of the box.

    The photo stops at the bar, but the real print doesn't, and looking up into the box
    shows the difference. Repeating the top row draws streaks, so it is taken smooth.
    """
    array = np.asarray(plate, dtype=np.float32)
    missing = height - array.shape[0]
    if missing <= 0:
        return plate
    top = array[:8].mean(axis=0)
    smooth = np.stack([ndimage.gaussian_filter1d(top[:, c], 26) for c in range(3)], axis=-1)
    fade = np.linspace(0.72, 1.0, missing)[:, None, None]
    above = smooth[None, :, :] * fade
    # Ease across the join, so the print doesn't end in a line.
    joined = np.concatenate([above, array], axis=0)
    seam = missing
    band = 14
    weight = np.linspace(1, 0, band)[:, None, None]
    joined[seam : seam + band] = joined[seam : seam + band] * (1 - weight) + above[-1:] * weight
    return Image.fromarray(joined.clip(0, 255).astype(np.uint8))


def relief(alpha):
    """A rounded height from the outline: high in the middle, falling away at the edge."""
    inside = alpha > 0.5
    distance = ndimage.distance_transform_edt(inside)
    top = distance.max() or 1
    height = np.sqrt(np.clip(distance / top, 0, 1))
    return ndimage.gaussian_filter(height, 5)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    session = new_session("isnet-general-use")
    layout = {}
    shape = json.loads(HALL.read_text())["frame"]
    box_shape = shape["openingHeight"] / shape["plateWidth"]

    for frame in FRAMES:
        slug = frame["slug"]
        whole = source.crop(frame["box"])
        px0, py0, px1, py1 = frame["plate"]
        scale = PLATE_WIDTH / (px1 - px0)
        picture = enlarge(whole, round(whole.width * scale))
        plate_box = tuple(round(v * scale) for v in frame["plate"])
        plate = picture.crop(plate_box)

        alpha = cut_subject(picture, plate_box, frame, session)
        print(slug, plate.size, "subject covers", round(float((alpha > 0.5).mean()), 3))

        ys, xs = np.where(alpha > 0.04)
        pad = 6
        left, right = max(0, xs.min() - pad), min(picture.width, xs.max() + pad)
        top, bottom = max(0, ys.min() - pad), min(picture.height, ys.max() + pad)

        rgba = np.dstack([np.asarray(picture), (alpha * 255).astype(np.uint8)])
        subject = Image.fromarray(rgba[top:bottom, left:right], "RGBA")
        subject.save(OUT / f"{slug}-subject.webp", quality=92, method=6, exact=True)

        height = relief(alpha)[top:bottom, left:right]
        Image.fromarray((height * 255).astype(np.uint8)).save(OUT / f"{slug}-relief.webp", quality=88, method=6)

        on_plate = alpha[plate_box[1] : plate_box[3], plate_box[0] : plate_box[2]]
        painted = paint_out(plate, on_plate, frame["fill"])
        full_height = round(PLATE_WIDTH * box_shape)
        carry_up(painted, full_height).save(OUT / f"{slug}-plate.webp", quality=88, method=6)

        # What the plate throws on the wall: its colour, away from the black of the print.
        small = np.asarray(painted.resize((32, 40), Image.BOX), dtype=np.float32) / 255
        saturated = small.reshape(-1, 3)
        weights = saturated.max(axis=1) - saturated.min(axis=1) + 0.05
        glow = (saturated * weights[:, None]).sum(axis=0) / weights.sum()
        layout[slug] = {
            "plate": {"width": plate.width, "height": plate.height},
            # In plate pixels, measured from its top left. Can run past its bottom.
            "subject": {
                "x": int(left - plate_box[0]),
                "y": int(top - plate_box[1]),
                "width": int(right - left),
                "height": int(bottom - top),
            },
            "glow": [round(float(c), 3) for c in glow],
        }

    LAYOUT.write_text(json.dumps(layout, indent=2))


if __name__ == "__main__":
    main()

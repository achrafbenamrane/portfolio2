"""
Paints the store's kits onto the shirt's pattern.

    python scripts/store_kits.py

Reads the pattern and the ambient-occlusion bake from assets-source/store/jersey
and writes public/store/kits/<slug>{,-1k,-4k}.webp, plus the two normal maps every
kit shares: the seams (jersey-normal.webp) and the knit (jersey-knit.webp).

The kits borrow a club's colours and the layout of its shirt, never its marks:
the crest is a plain monogram and the sponsor is Wolfexo. Club badges and sponsor
logos are other people's trademarks, and this is a public agency site. To show a
licensed badge, drop a PNG at assets-source/store/crests/<slug>.png and re-run;
it replaces the monogram.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets-source" / "store" / "jersey"
CRESTS = ROOT / "assets-source" / "store" / "crests"
OUT = ROOT / "public" / "store"
SIZE = 4096
FONT = "C:/Windows/Fonts/bahnschrift.ttf"

LAYOUT = json.loads((SOURCE / "jersey_layout.json").read_text())
UV = LAYOUT["uv"]
TIP = np.array(LAYOUT["points"]["tip"])
S1 = np.array(LAYOUT["points"]["s1"])
S2 = np.array(LAYOUT["points"]["s2"])
ARMPIT = np.array((0.292, 0.458))

# The free strip, as laid out in finish_jersey.py.
COLLAR_UV = (0.592, 0.935, 0.40, 0.04)
LABEL_UV = (0.60, 0.80, 0.09, 0.05)


def rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def uv_to_px(u, v):
    return u * SIZE, (1 - v) * SIZE


def pattern_to_px(panel, x, z):
    px = x if panel == "front" else -x
    v0 = UV["frontV"] if panel == "front" else UV["backV"]
    return uv_to_px(UV["left"] + (px + UV["x"]) * UV["scale"], v0 + (z + UV["z"]) * UV["scale"])


def panel_box(panel):
    """The panel's pixel rectangle, generously padded so colour bleeds past the edge."""
    v0 = UV["frontV"] if panel == "front" else UV["backV"]
    top = int((1 - min(1.0, v0 + 0.49)) * SIZE)
    bottom = int((1 - max(0.0, v0 - 0.004)) * SIZE)
    left = 0
    right = int((UV["left"] + 2 * UV["x"] * UV["scale"] + 0.012) * SIZE)
    return left, top, right, bottom


def panel_grid(panel):
    """Pattern coordinates, in metres, of every pixel in the panel's box."""
    left, top, right, bottom = panel_box(panel)
    cols = (np.arange(left, right) + 0.5) / SIZE
    rows = 1 - (np.arange(top, bottom) + 0.5) / SIZE
    v0 = UV["frontV"] if panel == "front" else UV["backV"]
    x = (cols - UV["left"]) / UV["scale"] - UV["x"]
    if panel == "back":
        x = -x
    z = (rows - v0) / UV["scale"] - UV["z"]
    return np.meshgrid(x, z)


def smooth(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def armhole_curve(steps=48):
    """The set-in sleeve's seam: not on the mesh, so it is painted where it would be."""
    t = np.linspace(0, 1, steps)[:, None]
    p0, p1, p2 = TIP, np.array((0.214, 0.545)), ARMPIT
    return (1 - t) ** 2 * p0 + 2 * t * (1 - t) * p1 + t**2 * p2


def sleeve_mask(panel):
    left, top, right, bottom = panel_box(panel)
    mask = Image.new("L", (right - left, bottom - top), 0)
    draw = ImageDraw.Draw(mask)
    curve = armhole_curve()
    for sign in (1, -1):
        outline = [(sign * x, z) for x, z in curve]
        outline += [
            (sign * 0.55, ARMPIT[1] - 0.2),
            (sign * 0.55, TIP[1] + 0.2),
            (sign * TIP[0], TIP[1] + 0.2),
        ]
        points = []
        for x, z in outline:
            px, py = pattern_to_px(panel, x, z)
            points.append((px - left, py - top))
        draw.polygon(points, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(mask, dtype=np.float32) / 255


def sleeve_axes(x, z):
    """Along the sleeve from the cuff inward, and across it, in metres."""
    point_x, point_z = np.abs(x), z
    axis = (S1 - TIP) / np.linalg.norm(S1 - TIP)
    across = np.array((-axis[1], axis[0]))
    from_cuff = (S1[0] - point_x) * axis[0] + (S1[1] - point_z) * axis[1]
    side = (point_x - TIP[0]) * across[0] + (point_z - TIP[1]) * across[1]
    return from_cuff, side


# --- The kits ---------------------------------------------------------------


@dataclass
class Kit:
    slug: str
    monogram: str
    number: str
    base: str
    collar: str
    tip: str
    print_colour: str
    sleeve: str = ""
    cuff: str = ""
    cuff_line: str = ""
    stripes: list = field(default_factory=list)
    stripe_width: float = 0.0
    band: tuple = ()
    weave: str = ""
    number_outline: str = ""
    crest_fill: str = ""
    crest_ink: str = ""


KITS = [
    Kit(
        "barcelona",
        "FCB",
        "10",
        base="#A50044",
        collar="#0C1C46",
        tip="#EDBB00",
        print_colour="#EDBB00",
        sleeve="#A50044",
        cuff="#0C1C46",
        cuff_line="#EDBB00",
        stripes=["#A50044", "#004D98"],
        stripe_width=0.098,
        number_outline="#0C1C46",
        crest_fill="#F4F1E8",
        crest_ink="#0C1C46",
    ),
    Kit(
        "real-madrid",
        "RM",
        "7",
        base="#F4F3EE",
        collar="#F4F3EE",
        tip="#B8912F",
        print_colour="#1B2559",
        sleeve="#F4F3EE",
        cuff="#F4F3EE",
        cuff_line="#B8912F",
        weave="pinstripe",
        crest_fill="#1B2559",
        crest_ink="#E8C75A",
    ),
    Kit(
        "man-city",
        "MC",
        "17",
        base="#74B3E3",
        collar="#14305A",
        tip="#FFFFFF",
        print_colour="#FFFFFF",
        sleeve="#74B3E3",
        cuff="#14305A",
        cuff_line="#FFFFFF",
        weave="chevron",
        crest_fill="#14305A",
        crest_ink="#FFFFFF",
    ),
    Kit(
        "liverpool",
        "LFC",
        "11",
        base="#C8102E",
        collar="#C8102E",
        tip="#F2E9C9",
        print_colour="#F7F3E6",
        sleeve="#C8102E",
        cuff="#C8102E",
        cuff_line="#F2E9C9",
        weave="pinstripe",
        crest_fill="#F7F3E6",
        crest_ink="#C8102E",
    ),
    Kit(
        "bayern",
        "BAY",
        "9",
        base="#DC052D",
        collar="#FFFFFF",
        tip="#0B2A5B",
        print_colour="#FFFFFF",
        sleeve="#DC052D",
        cuff="#FFFFFF",
        cuff_line="#0B2A5B",
        weave="diamond",
        crest_fill="#FFFFFF",
        crest_ink="#0B2A5B",
    ),
    Kit(
        "juventus",
        "JUV",
        "10",
        base="#F2F2EF",
        collar="#141414",
        tip="#F2F2EF",
        print_colour="#C9A44C",
        sleeve="#141414",
        cuff="#141414",
        cuff_line="#F2F2EF",
        stripes=["#F2F2EF", "#141414"],
        stripe_width=0.062,
        number_outline="#141414",
        crest_fill="#141414",
        crest_ink="#F2F2EF",
    ),
    Kit(
        "paris",
        "PSG",
        "7",
        base="#0B2147",
        collar="#0B2147",
        tip="#DA291C",
        print_colour="#FFFFFF",
        sleeve="#0B2147",
        cuff="#0B2147",
        cuff_line="#DA291C",
        band=("#DA291C", "#F5F5F5", 0.095, 0.014),
        crest_fill="#FFFFFF",
        crest_ink="#0B2147",
    ),
    Kit(
        "milan",
        "ACM",
        "22",
        base="#C4142B",
        collar="#101010",
        tip="#C4142B",
        print_colour="#F5F2E8",
        sleeve="#101010",
        cuff="#101010",
        cuff_line="#C4142B",
        stripes=["#C4142B", "#101010"],
        stripe_width=0.05,
        number_outline="#101010",
        crest_fill="#F5F2E8",
        crest_ink="#101010",
    ),
]


def body_colour(kit, x, z):
    canvas = np.empty((*x.shape, 3), dtype=np.float32)
    canvas[:] = rgb(kit.base)
    if kit.stripes:
        # Centred on a stripe, as on a real striped shirt.
        phase = (x / kit.stripe_width + 0.5) % 2
        for colour, low in zip(kit.stripes, (0.0, 1.0)):
            near = np.abs(phase - low - 0.5)
            mask = smooth(0.502, 0.498, near)[..., None]
            canvas = canvas * (1 - mask) + rgb(colour) * mask
    if kit.band:
        centre, edge, width, edge_width = kit.band
        half = width / 2
        rim = smooth(half + edge_width + 0.0006, half + edge_width - 0.0006, np.abs(x))[..., None]
        canvas = canvas * (1 - rim) + rgb(edge) * rim
        core = smooth(half + 0.0006, half - 0.0006, np.abs(x))[..., None]
        canvas = canvas * (1 - core) + rgb(centre) * core
    return canvas


def weave(kit, x, z):
    """A tone-on-tone jacquard, as a brightness multiplier."""
    if kit.weave == "pinstripe":
        lines = np.abs((x / 0.012) % 1 - 0.5) < 0.09
        return np.where(lines, 0.965, 1.0).astype(np.float32)
    if kit.weave == "chevron":
        wave = ((z + np.abs(x) * 0.8) / 0.036) % 1
        return np.where(wave < 0.5, 0.965, 1.0).astype(np.float32)
    if kit.weave == "diamond":
        a = ((x + z) / 0.05) % 1 < 0.5
        b = ((x - z) / 0.05) % 1 < 0.5
        return np.where(a ^ b, 0.955, 1.0).astype(np.float32)
    return np.ones_like(x, dtype=np.float32)


def paint_panel(kit, panel, atlas):
    left, top, right, bottom = panel_box(panel)
    x, z = panel_grid(panel)
    colour = body_colour(kit, x, z)

    sleeve = sleeve_mask(panel)[..., None]
    sleeve_rgb = np.empty_like(colour)
    sleeve_rgb[:] = rgb(kit.sleeve or kit.base)
    from_cuff, _ = sleeve_axes(x, z)
    if kit.cuff:
        cuff = smooth(0.0262, 0.0258, from_cuff)[..., None]
        sleeve_rgb = sleeve_rgb * (1 - cuff) + rgb(kit.cuff) * cuff
    if kit.cuff_line:
        line = (smooth(0.0225, 0.0222, from_cuff) * smooth(0.0145, 0.0148, from_cuff))[..., None]
        sleeve_rgb = sleeve_rgb * (1 - line) + rgb(kit.cuff_line) * line
    colour = colour * (1 - sleeve) + sleeve_rgb * sleeve

    colour *= weave(kit, x, z)[..., None]
    atlas[top:bottom, left:right] = colour


def font(size, weight=700, width=100):
    face = ImageFont.truetype(FONT, size)
    face.set_variation_by_axes([weight, width])
    return face


def text_image(text, height, fill, weight=700, width=100, stretch=1.0, outline=None, outline_px=0):
    """Text on a transparent tile, cropped to its ink, `height` pixels tall."""
    probe = font(height * 2, weight, width)
    box = probe.getbbox(text, stroke_width=outline_px * 2)
    w = box[2] - box[0] + 8
    h = box[3] - box[1] + 8
    tile = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    kwargs = {}
    if outline:
        kwargs = {"stroke_width": outline_px * 2, "stroke_fill": outline}
    draw.text((4 - box[0], 4 - box[1]), text, font=probe, fill=fill, **kwargs)
    return tile.resize((max(1, round(w / 2 * stretch)), max(1, h // 2)), Image.LANCZOS)


def crest(kit, height):
    """A plain shield with the club's initials. Nobody's badge, on purpose."""
    custom = CRESTS / f"{kit.slug}.png"
    if custom.exists():
        image = Image.open(custom).convert("RGBA")
        scale = height / image.height
        return image.resize((round(image.width * scale), height), Image.LANCZOS)

    scale = 3
    h = height * scale
    w = round(h * 0.82)
    tile = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)

    def shield(inset):
        steps = []
        t_values = np.linspace(0, 1, 40)
        top = inset
        for t in t_values:
            # Sides curve in to a point.
            yy = top + (h * 0.98 - 2 * inset - top) * t
            xx = (w / 2 - inset) * np.cos(t**2.2 * np.pi / 2)
            steps.append((w / 2 + xx, yy))
        left_side = [(w - a, b) for a, b in reversed(steps)]
        return [(inset, top), (w - inset, top), *steps[1:], *left_side[:-1]]

    draw.polygon(shield(0), fill=kit.crest_ink)
    draw.polygon(shield(h * 0.032), fill=kit.crest_fill)
    draw.polygon(shield(h * 0.058), outline=kit.crest_ink, width=max(1, round(h * 0.008)))

    letters = text_image(
        kit.monogram,
        round(h * (0.3 if len(kit.monogram) > 2 else 0.36)),
        kit.crest_ink,
        weight=700,
        width=75,
    )
    limit = w * 0.68
    if letters.width > limit:
        letters = letters.resize(
            (round(limit), round(letters.height * limit / letters.width)), Image.LANCZOS
        )
    tile.alpha_composite(
        letters, (round((w - letters.width) / 2), round(h * 0.42 - letters.height / 2))
    )
    return tile.resize((round(w / scale), height), Image.LANCZOS)


def place(atlas_image, tile, panel, x, z):
    px, py = pattern_to_px(panel, x, z)
    atlas_image.alpha_composite(tile, (round(px - tile.width / 2), round(py - tile.height / 2)))


def metres(value):
    return round(value * UV["scale"] * SIZE)


def paint_prints(kit, image):
    place(image, crest(kit, metres(0.078)), "front", 0.098, 0.522)

    mark = text_image("W", metres(0.03), kit.print_colour, weight=700, width=100, stretch=1.25)
    place(image, mark, "front", -0.098, 0.532)

    outline = kit.number_outline or None
    sponsor = text_image(
        "WOLFEXO",
        metres(0.05),
        kit.print_colour,
        weight=700,
        width=100,
        stretch=1.28,
        outline=outline,
        outline_px=metres(0.0018) if outline else 0,
    )
    place(image, sponsor, "front", 0.0, 0.405)

    name = text_image(
        "WOLFEXO",
        metres(0.032),
        kit.print_colour,
        stretch=1.2,
        outline=outline,
        outline_px=metres(0.0014) if outline else 0,
    )
    place(image, name, "back", 0.0, 0.585)

    number = text_image(
        kit.number,
        metres(0.235),
        kit.print_colour,
        weight=700,
        width=75,
        outline=outline,
        outline_px=metres(0.0042) if outline else 0,
    )
    place(image, number, "back", 0.0, 0.405)

    number_small = text_image(
        kit.number, metres(0.045), kit.print_colour, weight=700, width=75,
        outline=outline, outline_px=metres(0.001) if outline else 0,
    )
    place(image, number_small, "front", 0.0, 0.32)


def paint_strip(kit, atlas):
    u, v, width, height = COLLAR_UV
    x0, y1 = uv_to_px(u - 0.004, v - 0.004)
    x1, y0 = uv_to_px(u + width + 0.004, v + height + 0.004)
    x0, x1, y0, y1 = int(x0), int(x1), int(y0), int(y1)
    rows = (np.arange(y0, y1) + 0.5) / SIZE
    fraction = ((1 - rows) - v) / height
    band = np.abs(fraction - 0.5) < 0.17
    atlas[y0:y1, x0:x1] = rgb(kit.collar)
    atlas[y0:y1, x0:x1][band] = rgb(kit.tip)


def paint_label(kit, image):
    u, v, width, height = LABEL_UV
    x0, y1 = uv_to_px(u, v)
    x1, y0 = uv_to_px(u + width, v + height)
    box = (round(x0), round(y0), round(x1), round(y1))
    draw = ImageDraw.Draw(image)
    draw.rectangle(box, fill=(246, 244, 238, 255))
    tile = text_image("WOLFEXO", round((box[3] - box[1]) * 0.28), (40, 27, 28, 255), stretch=1.2)
    image.alpha_composite(
        tile,
        (round((box[0] + box[2] - tile.width) / 2), round(box[1] + (box[3] - box[1]) * 0.2)),
    )
    size = text_image("SIZE M", round((box[3] - box[1]) * 0.15), (102, 86, 87, 255))
    image.alpha_composite(
        size,
        (round((box[0] + box[2] - size.width) / 2), round(box[1] + (box[3] - box[1]) * 0.64)),
    )


def seam_lines():
    """Every stitched line, as (panel, [points in metres], stitch width in metres)."""
    lines = []
    curve = [tuple(point) for point in armhole_curve()]
    for panel in ("front", "back"):
        for sign in (1, -1):
            lines.append((panel, [(sign * x, z) for x, z in curve], 0.0028))
            lines.append((panel, [(sign * (x + 0.006), z) for x, z in curve], 0.0012))
            cuff = [S2, S1]
            axis = (S1 - TIP) / np.linalg.norm(S1 - TIP)
            for inset in (0.014, 0.018):
                lines.append(
                    (panel, [(sign * (p[0] - axis[0] * inset), p[1] - axis[1] * inset) for p in cuff], 0.0011)
                )
        for z in (0.016, 0.0205):
            lines.append((panel, [(-0.3, z), (0.3, z)], 0.0011))
    return lines


def height_field():
    """Shared relief at 2048: seam lines and the collar's ribs."""
    size = 2048
    scale = size / SIZE
    image = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(image)
    for panel, points, width in seam_lines():
        pixels = []
        for x, z in points:
            px, py = pattern_to_px(panel, x, z)
            pixels.append((px * scale, py * scale))
        draw.line(pixels, fill=200, width=max(1, round(width * UV["scale"] * size)))

    relief = np.asarray(image.filter(ImageFilter.GaussianBlur(1.1)), dtype=np.float32) / 255

    u, v, width, height = COLLAR_UV
    x0, y1 = uv_to_px(u - 0.004, v - 0.004)
    x1, y0 = uv_to_px(u + width + 0.004, v + height + 0.004)
    x0, x1, y0, y1 = (round(n * scale) for n in (x0, x1, y0, y1))
    columns = np.arange(x0, x1)
    relief[y0:y1, x0:x1] = (0.5 + 0.5 * np.sin(columns * 2 * np.pi / 7.0))[None, :] * 0.9
    return relief


def to_normal(height, strength):
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    length = np.sqrt(dx * dx + dy * dy + 1)
    # Image rows run down, texture v runs up, so the y term keeps its sign.
    normal = np.stack((-dx / length, dy / length, 1 / length), axis=-1)
    return ((normal * 0.5 + 0.5) * 255).astype(np.uint8)


def knit_tile(size=256, cells=8):
    """A sports mesh: rows of tiny eyelets. Tiles, and is sampled at about 1mm a cell."""
    y, x = np.mgrid[0:size, 0:size] / size
    height = np.ones((size, size), dtype=np.float32)
    for offset in (0.0, 0.5):
        fx = (x * cells + offset) % 1 - 0.5
        fy = (y * cells + offset) % 1 - 0.5
        height -= 0.75 * np.exp(-(fx * fx + fy * fy) / 0.018)
    return height


def main():
    (OUT / "kits").mkdir(parents=True, exist_ok=True)

    ao_image = Image.open(SOURCE / "jersey_ao.png").convert("L").resize((SIZE, SIZE), Image.BICUBIC)
    ao = np.asarray(ao_image, dtype=np.float32) / 255
    # Lift the blacks: only the folds should read, not the bake's overall grey.
    low, high = np.percentile(ao[ao > 0.02], (2, 96))
    ao = np.clip((ao - low) / (high - low), 0, 1)
    shade = (0.60 + 0.40 * ao**0.85)[..., None]

    # Stitches sit a touch darker than the cloth they hold.
    stitch = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(stitch)
    for panel, points, width in seam_lines():
        draw.line(
            [pattern_to_px(panel, x, z) for x, z in points],
            fill=255,
            width=max(1, round(width * UV["scale"] * SIZE)),
        )
    stitch_shade = 1 - 0.16 * (np.asarray(stitch.filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255)[..., None]

    for kit in KITS:
        atlas = np.empty((SIZE, SIZE, 3), dtype=np.float32)
        atlas[:] = rgb(kit.base)
        paint_panel(kit, "front", atlas)
        paint_panel(kit, "back", atlas)

        painted = Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8)).convert("RGBA")
        paint_prints(kit, painted)
        flat = np.asarray(painted.convert("RGB"), dtype=np.float32).copy()
        paint_strip(kit, flat)
        flat = flat * shade * stitch_shade

        final = Image.fromarray(np.clip(flat, 0, 255).astype(np.uint8)).convert("RGBA")
        paint_label(kit, final)
        final = final.convert("RGB")

        final.save(OUT / "kits" / f"{kit.slug}-4k.webp", quality=84, method=5)
        final.resize((2048, 2048), Image.LANCZOS).save(OUT / "kits" / f"{kit.slug}.webp", quality=84, method=5)
        final.resize((1024, 1024), Image.LANCZOS).save(OUT / "kits" / f"{kit.slug}-1k.webp", quality=80, method=5)
        print("painted", kit.slug)

    Image.fromarray(to_normal(height_field(), 2.4)).save(
        OUT / "jersey-normal.webp", quality=88, method=5
    )
    Image.fromarray(to_normal(knit_tile(), 2.6)).save(
        OUT / "jersey-knit.webp", quality=92, method=5
    )


if __name__ == "__main__":
    main()

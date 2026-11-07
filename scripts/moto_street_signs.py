"""
Paints what the street furniture of Algiers carries: the road signs, Arabic above French, and the
foliage, which is all cut-out cards. Two sheets, each laid out in cells:

    python scripts/moto_street_signs.py

Writes public/moto/city/street-signs.webp and street-leaves.webp.

scripts/blender/build_moto_street.py imports this file for the cell tables, so that a sign's shape
and the place it's painted are only written down once. Blender's Python has no PIL, which is why the
imports that paint are held back until this runs as a script.
"""

import math
from pathlib import Path

if __name__ == "__main__":
    import arabic_reshaper
    import numpy as np
    from bidi.algorithm import get_display
    from PIL import Image, ImageDraw, ImageFont
    from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/moto/city"
FONTS = "C:/Windows/Fonts/"
ARABIC = FONTS + "majallab.ttf"
LATIN = FONTS + "arialbd.ttf"
NARROW = FONTS + "ARIALNB.TTF"

# ── the signs sheet ──────────────────────────────────────────────────────────────────────────

SIGNS_SIZE = (2048, 2048)

# A direction plate, in metres: a box with a point at one end.
PLATE_CELL = (512, 136)
PLATE_LENGTH = 1.35
PLATE_TALL = PLATE_LENGTH * PLATE_CELL[1] / PLATE_CELL[0]
PLATE_TIP = 0.235
PLATE_CORNER = 0.03

# Every place named on a plate, Arabic above French, as the city spells them.
PLACES = {
    "BabElOued": ("باب الوادي", "BAB EL OUED"),
    "Bologhine": ("بولوغين", "BOLOGHINE"),
    "RaisHamidou": ("رايس حميدو", "RAIS HAMIDOU"),
    "ElBiar": ("الأبيار", "EL BIAR"),
    "Hydra": ("حيدرة", "HYDRA"),
    "ElMouradia": ("المرادية", "EL MOURADIA"),
    "PlaceDesMartyrs": ("ساحة الشهداء", "PLACE DES MARTYRS"),
    "GrandePoste": ("البريد المركزي", "GRANDE POSTE"),
    "MaqamEchahid": ("مقام الشهيد", "MAQAM ECHAHID"),
    "DjamaaElDjazair": ("جامع الجزائر", "DJAMAA EL DJAZAIR"),
}

# The motorway panels, which fill the sheet's full width, and how big they stand in metres.
GANTRY_CELL = (2048, 880)
GANTRY_GREEN_CELL = (2048, 480)
GANTRY_WIDE = 9.6
GANTRY_TALL = GANTRY_WIDE * GANTRY_CELL[1] / GANTRY_CELL[0]
GANTRY_GREEN_TALL = GANTRY_WIDE * GANTRY_GREEN_CELL[1] / GANTRY_GREEN_CELL[0]

SIGN_CELLS = {
    "GantryBlue": (0, 0, *GANTRY_CELL),
    "GantryGreen": (0, GANTRY_CELL[1], *GANTRY_GREEN_CELL),
}
for index, place in enumerate(PLACES):
    for way, side in enumerate("RL"):
        slot = index * 2 + way
        SIGN_CELLS[f"{place}.{side}"] = (
            (slot % 4) * PLATE_CELL[0],
            GANTRY_CELL[1] + GANTRY_GREEN_CELL[1] + (slot // 4) * PLATE_CELL[1],
            *PLATE_CELL,
        )


def rounded_corner(p, a, b, radius, count=4):
    """A corner at p between neighbours a and b, as a short run of points."""
    da = (a[0] - p[0], a[1] - p[1])
    db = (b[0] - p[0], b[1] - p[1])
    la, lb = math.hypot(*da), math.hypot(*db)
    s = (p[0] + da[0] / la * radius, p[1] + da[1] / la * radius)
    e = (p[0] + db[0] / lb * radius, p[1] + db[1] / lb * radius)
    out = []
    for i in range(count + 1):
        t = i / count
        out.append(tuple((1 - t) ** 2 * s[k] + 2 * (1 - t) * t * p[k] + t * t * e[k] for k in (0, 1)))
    return out


def plate_outline(inset=0.0, corners=2):
    """
    A plate with its point to the right, from its lower left corner, anticlockwise, in metres. The
    painted keyline and the model's edge both come from here, so the one follows the other.
    """
    length, tall, tip, r = PLATE_LENGTH, PLATE_TALL, PLATE_TIP, PLATE_CORNER
    # An inset point moves back along the axis by more than the inset, to keep its edges parallel.
    slope = math.hypot(tip, tall / 2) / (tall / 2)
    shoulder = length - tip
    points = [(inset, inset), (shoulder, inset), (length - inset * slope, tall / 2), (shoulder, tall - inset), (inset, tall - inset)]
    out = []
    for i, p in enumerate(points):
        a, b = points[i - 1], points[(i + 1) % len(points)]
        radius = r * (0.7 if i == 2 else 1.0)
        out.extend(rounded_corner(p, a, b, radius, corners))
    return out


# ── the leaves sheet ─────────────────────────────────────────────────────────────────────────

LEAVES_SIZE = (2048, 1536)

LEAF_CELLS = {
    # Half a palm frond each: the rib along the cell's bottom edge, base at the left.
    "Frond0": (0, 0, 1536, 176),
    "Frond1": (0, 176, 1536, 176),
    "Frond2": (0, 352, 1536, 176),
    # The pierced gilding between a candelabra's scrolls, on a cut-out card in the plane of an arm.
    "Lace": (1536, 0, 512, 512),
    # One run of chain, links flat in the middle of the strip. Pitch in CHAIN_SPAN and CHAIN_LINKS.
    "Chain": (0, 528, 2048, 40),
    # Clumps of small leaves, from lit to in shade.
    "Ficus0": (0, 568, 400, 400),
    "Ficus1": (400, 568, 400, 400),
    "Ficus2": (800, 568, 400, 400),
    "Ficus3": (1200, 568, 400, 400),
    # Solid shade, to stop you seeing through a crown. Opaque.
    "Shade": (1600, 568, 256, 256),
    # A long strap leaf, tip at the top, for the planter's little palm. Opaque.
    "Blade": (1856, 568, 128, 400),
    # A fan palm's leaf, stem at the bottom middle, and the dead one that hangs under the crown.
    "Fan0": (0, 968, 512, 512),
    "FanDead": (512, 968, 384, 384),
    # Bark, running along the cell: ground at the left, top at the right. Opaque.
    "BarkDate": (1024, 968, 1024, 256),
    "BarkFan": (1024, 1224, 1024, 128),
    "BarkFicus": (1024, 1352, 512, 128),
    "BarkBoot": (1536, 1352, 512, 128),
}
# Where the lace card stands on a candelabra: out from the stem, and up from the ground, in metres.
LACE_IN, LACE_OUT = 0.0, 0.76
LACE_FOOT, LACE_TOP = 5.1, 6.06
# The lines of a candelabra arm, as (out from the stem, height): the arm itself, which sags on its
# way out, and the edge of the shield, running in to its point. The real scrolls and the lace behind
# them both follow these.
SHIELD_ARM = ((0.17, 5.47), (0.3, 5.495), (0.42, 5.575), (0.54, 5.6), (0.64, 5.575), (0.72, 5.54), (0.78, 5.53))
ARM_CURL = (0.815, 5.625)
SHIELD_EDGE = ((0.03, 5.12), (0.1, 5.19), (0.2, 5.26), (0.29, 5.335), (0.33, 5.385))
EDGE_CURL = (0.39, 5.4)
CHAIN_LINKS = 40  # Links in the strip's first CHAIN_SPAN of its length.
CHAIN_SPAN = 2000 / 2048
FROND_LEAFLETS = 150


def cell_uv(cells, size, name, s, t, inset=1.0):
    """
    Where (s, t) of a cell falls on the sheet as a Blender UV: s runs right, t runs up. glTF stores v
    as 1 - v, so with flipY off a texture lands the right way up without any help.
    """
    x, y, w, h = cells[name]
    u = (x + inset + s * (w - 2 * inset)) / size[0]
    v = (y + inset + (1 - t) * (h - 2 * inset)) / size[1]
    return u, 1 - v


# ── painting signs ───────────────────────────────────────────────────────────────────────────


def arabic(text):
    return get_display(arabic_reshaper.reshape(text))


def fitted(draw, text, path, size, width):
    """The biggest size up to `size` at which a line fits a width."""
    while size > 8:
        font = ImageFont.truetype(path, size)
        if draw.textlength(text, font=font) <= width:
            return font
        size -= 1
    return font


def centred(draw, text, font, x, y, ink):
    """Text with its ink box centred on a point, not its line box."""
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((x - (box[0] + box[2]) / 2, y - (box[1] + box[3]) / 2), text, font=font, fill=ink)


def smudged(image, rng, amount=5.0):
    """A sign that's stood in the street for a while: never quite one flat colour."""
    w, h = image.size
    field = ndimage.gaussian_filter(rng.standard_normal((h // 4 + 1, w // 4 + 1)), 7)
    field = np.asarray(Image.fromarray(field.astype(np.float32)).resize((w, h), Image.BICUBIC))
    field = field / (np.abs(field).max() + 1e-6)
    pixels = np.asarray(image, np.float32) + field[..., None] * amount
    return Image.fromarray(pixels.clip(0, 255).astype(np.uint8))


def paint_plate(arabic_text, french, pointing):
    """A plate's face. Its keyline follows its outline; `pointing` says which end the point is at."""
    scale = 3
    w, h = PLATE_CELL
    image = Image.new("RGB", (w * scale, h * scale), "#f3f1e8")
    draw = ImageDraw.Draw(image)
    per_metre = w * scale / PLATE_LENGTH
    line = [(x * per_metre, (PLATE_TALL - y) * per_metre) for x, y in plate_outline(0.036, 5)]
    if pointing == "L":
        line = [(w * scale - x, y) for x, y in line]
    draw.line([*line, line[0], line[1]], fill="#101012", width=int(3.4 * scale), joint="curve")

    # Words sit on the body of the plate, clear of the point.
    body = (PLATE_LENGTH - PLATE_TIP * 0.72) * per_metre
    middle = body / 2 + 0.03 * per_metre
    if pointing == "L":
        middle = w * scale - middle
    room = body - 0.13 * per_metre
    shaped = arabic(arabic_text)
    centred(draw, shaped, fitted(draw, shaped, ARABIC, 76 * scale, room), middle, h * scale * 0.345, "#0c0c0e")
    font = fitted(draw, french, LATIN, 35 * scale, room)
    if font.size < 29 * scale:
        font = fitted(draw, french, NARROW, 38 * scale, room)
    centred(draw, french, font, middle, h * scale * 0.745, "#0c0c0e")
    return image.resize((w, h), Image.LANCZOS)


def arrow_down(draw, x, top, tall, ink):
    """The blocky white arrow that stands under each column of a motorway sign."""
    head = tall * 0.56
    half = tall * 0.47
    stem = tall * 0.13
    draw.polygon(
        [
            (x - stem, top),
            (x + stem, top),
            (x + stem, top + tall - head),
            (x + half, top + tall - head),
            (x, top + tall),
            (x - half, top + tall - head),
            (x - stem, top + tall - head),
        ],
        fill=ink,
    )


def panel_ground(size, colour, border, scale):
    image = Image.new("RGB", size, colour)
    draw = ImageDraw.Draw(image)
    inset = 15 * scale
    draw.rounded_rectangle((inset, inset, size[0] - inset, size[1] - inset), radius=30 * scale, outline=border, width=8 * scale)
    return image, draw


def paint_blue_gantry():
    scale = 2
    w, h = GANTRY_CELL
    ink = "#f6f6f0"
    image, draw = panel_ground((w * scale, h * scale), "#123c97", ink, scale)
    column = (w - 80) / 3 * scale
    xs = [(40 * scale) + column * (i + 0.5) for i in range(3)]
    room = column - 70 * scale

    def line(i, y, text, path, size):
        centred(draw, text, fitted(draw, text, path, size * scale, room), xs[i], y * scale, ink)

    heads = [("الجزائر وسط", "ALGER CENTRE"), ("باب الوادي", "BAB EL OUED"), ("حسين داي", "HUSSEIN DEY")]
    for i, (a, f) in enumerate(heads):
        line(i, 82, arabic(a), ARABIC, 112)
        line(i, 166, f, LATIN, 58)
    draw.rectangle((18 * scale, 214 * scale, (w - 18) * scale, 221 * scale), fill=ink)

    rows = [
        ("القصبة", "ساحة الشهداء", "CASBAH", "PLACE DES MARTYRS"),
        ("الأبيار", "ساحة أول ماي", "EL BIAR", "PLACE 1er MAI"),
        ("القبة", "بئر مراد رايس", "KOUBA", "BIR MOURAD RAIS"),
    ]
    for i, (a1, a2, f1, f2) in enumerate(rows):
        line(i, 296, arabic(a1), ARABIC, 128)
        line(i, 396, arabic(a2), ARABIC, 104)
        line(i, 494, f1, LATIN, 84)
        line(i, 576, f2, NARROW, 74)
        arrow_down(draw, xs[i], 640 * scale, 190 * scale, ink)
    return image.resize((w, h), Image.LANCZOS)


def paint_green_gantry():
    scale = 2
    w, h = GANTRY_GREEN_CELL
    ink = "#f6f6f0"
    image, draw = panel_ground((w * scale, h * scale), "#0c6a3b", ink, scale)
    column = (w - 80) / 3 * scale
    xs = [(40 * scale) + column * (i + 0.5) for i in range(3)]
    room = column - 70 * scale
    names = [("الدار البيضاء", "DAR EL BEIDA"), ("المطار", "AEROPORT"), ("الحراش", "EL HARRACH")]
    for i, (a, f) in enumerate(names):
        shaped = arabic(a)
        centred(draw, shaped, fitted(draw, shaped, ARABIC, 140 * scale, room), xs[i], 112 * scale, ink)
        centred(draw, f, fitted(draw, f, LATIN, 84 * scale, room), xs[i], 232 * scale, ink)
        arrow_down(draw, xs[i], 296 * scale, 148 * scale, ink)
    return image.resize((w, h), Image.LANCZOS)


def paint_signs():
    rng = np.random.default_rng(1954)
    sheet = Image.new("RGB", SIGNS_SIZE, "#f3f1e8")
    sheet.paste(smudged(paint_blue_gantry(), rng, 3.0), SIGN_CELLS["GantryBlue"][:2])
    sheet.paste(smudged(paint_green_gantry(), rng, 3.0), SIGN_CELLS["GantryGreen"][:2])
    for place, (word, french) in PLACES.items():
        for side in "RL":
            sheet.paste(smudged(paint_plate(word, french, side), rng, 4.0), SIGN_CELLS[f"{place}.{side}"][:2])
    sheet.save(OUT / "street-signs.webp", quality=88, method=6)
    return sheet


# ── painting leaves ──────────────────────────────────────────────────────────────────────────


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


def bled(image):
    """
    The colour under the transparent parts, spread out from the leaves' edges. Filtering a cut-out
    mixes in the colour next to it, so what's under the clear parts mustn't be black.
    """
    pixels = np.asarray(image, np.float32) / 255
    alpha = pixels[..., 3]
    solid = alpha > 0.5
    # The nearest solid pixel's colour, everywhere.
    index = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    rgb = pixels[..., :3][index[0], index[1]]
    rgb = np.where(solid[..., None], pixels[..., :3], rgb)
    out = np.dstack([rgb, alpha])
    return Image.fromarray((out * 255).clip(0, 255).astype(np.uint8), "RGBA")


def leaflet(draw, base, angle, length, width, light, dark):
    """One palm leaflet, folded along its middle: a narrow blade with a lit half and a dark half."""
    ca, sa = math.cos(angle), math.sin(angle)
    # Across the blade.
    nx, ny = -sa, ca
    bend = length * 0.05
    points_a, points_b, spine = [], [], []
    for t in (0.0, 0.18, 0.5, 0.8, 1.0):
        half = width * (0.55 + 0.45 * math.sin(min(t * 2.4, 1) * math.pi / 2)) * (1 - t**2.6)
        x = base[0] + ca * length * t + nx * bend * t * t
        y = base[1] + sa * length * t + ny * bend * t * t
        spine.append((x, y))
        points_a.append((x + nx * half, y + ny * half))
        points_b.append((x - nx * half, y - ny * half))
    draw.polygon(points_a + spine[::-1], fill=light)
    draw.polygon(points_b + spine[::-1], fill=dark)


def paint_frond(w, h, rng):
    """Half a date palm frond: the rib along the bottom, stiff leaflets raking forward from it."""
    s = 2
    image = Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    bottom = h * s - 1
    reach = (h - 4) * s
    count = FROND_LEAFLETS
    order = rng.permutation(count)
    for k in order:
        t = (k + rng.random() * 0.8) / count
        x = (0.02 + 0.97 * t) * w * s
        # A frond's foot carries only thorns, its middle the longest leaflets, its tip a tuft.
        if t < 0.1:
            size = 0.10 + 0.5 * (t / 0.1) ** 2
        else:
            size = 0.6 + 0.4 * math.sin(min((t - 0.1) / 0.32, 1) * math.pi / 2)
            size *= 1 - 0.62 * max(0.0, (t - 0.5) / 0.5) ** 1.5
        rake = math.radians(mix((62,), (20,), t ** 0.75)[0] + rng.normal(0, 3.0))
        length = reach * size / math.sin(rake) * (0.93 + rng.random() * 0.1)
        length = min(length, reach / math.sin(rake))
        width = (5.0 if t > 0.1 else 3.2) * s * (0.85 + rng.random() * 0.35) * (1 - 0.3 * t)
        tone = rng.random()
        light = mix((96, 124, 66), (128, 146, 82), tone)
        dark = mix((40, 62, 34), (58, 80, 42), tone)
        # Older leaflets at the foot go yellow.
        if t < 0.16:
            light = mix(light, (150, 134, 74), 1 - t / 0.16)
        leaflet(
            draw,
            (x, bottom),
            -rake,
            length,
            width,
            tuple(int(c) for c in light) + (255,),
            tuple(int(c) for c in dark) + (255,),
        )
    # The rib, yellow-green and tapering to nothing.
    rib = [(x, bottom - 1) for x in np.linspace(0, w * s, 40)]
    for i in range(len(rib) - 1):
        t = i / (len(rib) - 1)
        draw.line([rib[i], rib[i + 1]], fill=(170, 164, 104, 255), width=max(int((1 - t) * 7 * s), 2))
    return image.resize((w, h), Image.LANCZOS)


def small_leaf(draw, x, y, angle, length, colour, edge):
    """One glossy ficus leaf: a pointed oval with a pale midrib."""
    ca, sa = math.cos(angle), math.sin(angle)
    wide = length * 0.26
    outline = []
    for t in np.linspace(0, 1, 9):
        half = wide * math.sin(math.pi * t) ** 0.8
        outline.append((x + ca * length * (t - 0.5) - sa * half, y + sa * length * (t - 0.5) + ca * half))
    for t in np.linspace(1, 0, 9):
        half = wide * math.sin(math.pi * t) ** 0.8
        outline.append((x + ca * length * (t - 0.5) + sa * half, y + sa * length * (t - 0.5) - ca * half))
    draw.polygon(outline, fill=colour)
    draw.line(
        [(x - ca * length * 0.42, y - sa * length * 0.42), (x + ca * length * 0.42, y + sa * length * 0.42)],
        fill=edge,
        width=2,
    )


def paint_clump(w, h, rng, bright, count=620):
    """A clump of ficus: a few hundred small leaves, darkest deepest, ragged round the edge."""
    s = 2
    image = Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cx, cy = w * s / 2, h * s / 2
    radius = w * s * 0.47
    lobes = [(rng.random() * math.tau, 0.1 + rng.random() * 0.12, 2 + int(rng.random() * 4)) for _ in range(4)]
    for i in range(count):
        depth = i / count
        a = rng.random() * math.tau
        edge = 1.0 + sum(amp * math.sin(k * a + phase) for phase, amp, k in lobes)
        r = radius * edge * (rng.random() ** 0.62) * 0.9
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        # Lit from above: leaves high in the clump are lighter, and so are the last ones laid.
        up = 0.5 - (y - cy) / (radius * 2)
        tone = max(0.0, min(1.0, 0.18 + 0.5 * depth + 0.42 * (up - 0.5) + rng.normal(0, 0.1)))
        colour = mix((12, 30, 16), mix((40, 76, 36), (74, 112, 52), bright), tone)
        length = (19 + rng.random() * 11) * s
        angle = a + rng.normal(0, 0.8)
        small_leaf(
            draw,
            x,
            y,
            angle,
            length,
            tuple(int(c) for c in colour) + (255,),
            tuple(int(c * 1.3 + 8) for c in colour) + (255,),
        )
    return image.resize((w, h), Image.LANCZOS)


def paint_fan(w, h, rng, dead=False):
    """A washingtonia leaf from above: pleats running out from the stem, splitting at their ends."""
    s = 2
    image = Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    origin = (w * s / 2, h * s * 0.965)
    reach = h * s * 0.93
    pleats = 38
    spread = math.radians(90)
    for k in range(pleats):
        t = (k + 0.5) / pleats
        a = -spread + 2 * spread * t
        half = spread / pleats * 1.06
        end = reach * (0.88 + 0.12 * math.cos((t - 0.5) * math.pi) + rng.normal(0, 0.03))
        split = end * (0.4 + rng.random() * 0.16)
        light = k % 2 == 0
        if dead:
            colour = mix((112, 84, 52), (150, 118, 76), rng.random()) if light else mix((70, 50, 32), (96, 72, 46), rng.random())
        else:
            colour = mix((86, 120, 62), (120, 150, 78), rng.random()) if light else mix((34, 58, 34), (54, 84, 44), rng.random())
        colour = tuple(int(c) for c in colour) + (255,)

        def at(angle, r):
            return origin[0] + math.sin(angle) * r, origin[1] - math.cos(angle) * r

        droop = rng.normal(0, 0.02)
        draw.polygon(
            [
                at(a - half * 0.2, 0),
                at(a + half * 0.2, 0),
                at(a + half, split),
                at(a + half * 0.34 + droop, end * 0.92),
                at(a + droop, end),
                at(a - half * 0.34 + droop, end * 0.92),
                at(a - half, split),
            ],
            fill=colour,
        )
    draw.ellipse((origin[0] - 15 * s, origin[1] - 15 * s, origin[0] + 15 * s, origin[1] + 8 * s), fill=(130, 118, 76, 255))
    return image.resize((w, h), Image.LANCZOS)


def noise(h, w, rng, sigma):
    field = ndimage.gaussian_filter(rng.standard_normal((h, w)), sigma, mode="wrap")
    return field / (field.std() + 1e-6)


def paint_blade(w, h, rng):
    """A strap leaf, lengthwise: a dark blade with a paler rib and a faint fibre."""
    x = np.linspace(-1, 1, w)[None, :]
    y = np.linspace(1, 0, h)[:, None]
    fibre = noise(h, w, rng, (22, 0.8))
    tone = 0.5 + 0.12 * fibre + 0.3 * x + 0.2 * (1 - y)
    colour = np.array([34, 62, 34])[None, None, :] + np.array([60, 80, 40])[None, None, :] * tone[..., None]
    rib = np.exp(-((x / 0.09) ** 2))
    colour = colour * (1 - 0.45 * rib[..., None]) + np.array([150, 164, 96]) * 0.45 * rib[..., None]
    rgba = np.dstack([colour.clip(0, 255), np.full((h, w), 255.0)])
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def paint_shade(w, h, rng):
    """What you see through the gaps in a crown: the dark inside of it, with a faint leafy break."""
    base = Image.new("RGBA", (w, h), (8, 18, 11, 255))
    draw = ImageDraw.Draw(base)
    for _ in range(420):
        tone = rng.random()
        small_leaf(
            draw,
            rng.random() * w,
            rng.random() * h,
            rng.random() * math.tau,
            18 + rng.random() * 14,
            (int(10 + 16 * tone), int(24 + 30 * tone), int(14 + 14 * tone), 255),
            (int(16 + 20 * tone), int(34 + 36 * tone), int(20 + 18 * tone), 255),
        )
    return base


def paint_date_bark(w, h, rng):
    """
    A date palm's trunk: the cut stumps of old leaves, wrapping it in a lattice of overlapping
    diamonds, worn and uneven. Along the cell is up the trunk.
    """
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    columns, rows = 4.0, 19.0
    wander = noise(h, w, rng, 22) * 0.2
    # Sheared lattice: each stump sits between the two below it.
    a = (x / w * rows + y / h * columns + wander) % 1.0
    b = (x / w * rows - y / h * columns + wander) % 1.0
    lip = np.minimum(a, b)
    # Height of a scale: steepest at its lower lip, which is where the shadow falls.
    height = lip**0.55 * 0.75 + 0.25 * np.maximum(a, b)
    shadow = np.clip(lip * 6, 0, 1) ** 0.8
    fibre = noise(h, w, rng, (0.7, 7))
    patch = noise(h, w, rng, 26)
    tone = (0.5 + 0.38 * height + 0.1 * fibre + 0.13 * patch) * (0.34 + 0.66 * shadow)
    return np.array([98, 80, 62])[None, None, :] * (0.3 + tone[..., None] * 0.95)


def paint_fan_bark(w, h, rng):
    """A washingtonia's trunk: grey, ringed close, and cracked lengthwise."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    rings = 0.5 + 0.5 * np.sin(x / w * math.tau * 62 + noise(h, w, rng, 12) * 1.6)
    cracks = np.clip(noise(h, w, rng, (0.8, 24)) - 0.9, 0, 3)
    tone = 0.45 + 0.28 * rings + 0.1 * noise(h, w, rng, (0.8, 5)) - 0.34 * cracks
    return np.array([84, 74, 62])[None, None, :] * (0.55 + tone[..., None] * 0.9)


def paint_ficus_bark(w, h, rng):
    """Ficus bark: smooth and pale, with long soft folds."""
    tone = 0.56 + 0.16 * noise(h, w, rng, (1.4, 26)) + 0.07 * noise(h, w, rng, 3)
    return np.array([118, 110, 98])[None, None, :] * (0.5 + tone[..., None] * 0.8)


def paint_boots(w, h, rng):
    """The woven tan fibre under a palm's crown, where the leaf bases stay on."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    weave = np.sin(x * 0.42 + y * 0.8) * np.sin(x * 0.42 - y * 0.8)
    tone = 0.48 + 0.24 * weave + 0.17 * noise(h, w, rng, 1.0)
    return np.array([124, 96, 64])[None, None, :] * (0.4 + tone[..., None] * 0.9)


def paint_chain():
    """
    One straight chain seen from the side. Links stand at right angles to their neighbours, so here
    every other link is an open ring and the ones between are seen edge-on, as bars. Crossing two
    of these strips a link apart makes a real chain from any side.
    """
    x0, y0, w, h = LEAF_CELLS["Chain"]
    s = 4
    image = Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pitch = w * CHAIN_SPAN / CHAIN_LINKS * s
    mid = h * s / 2
    wire = 0.2 * pitch
    half = h * s * 0.42
    iron, shine = (26, 26, 29, 255), (72, 72, 78, 255)
    links = int(w * s / pitch) + 2
    for i in range(0, links, 2):
        cx = i * pitch
        box = (cx - pitch * 0.72, mid - half, cx + pitch * 0.72, mid + half)
        draw.rounded_rectangle(box, radius=half, outline=iron, width=int(wire))
        draw.arc(box, 200, 340, fill=shine, width=int(wire * 0.22))
    for i in range(1, links, 2):
        cx = i * pitch
        draw.rounded_rectangle((cx - pitch * 0.72, mid - wire / 2, cx + pitch * 0.72, mid + wire / 2), radius=wire / 2, fill=iron)
        draw.line((cx - pitch * 0.6, mid - wire * 0.2, cx + pitch * 0.6, mid - wire * 0.2), fill=shine, width=int(wire * 0.2))
    return image.resize((w, h), Image.LANCZOS)


def spiral(centre, radius, start, turns, shrink, way=-1, count=70):
    """Points of a spiral winding in on a centre."""
    t = np.linspace(0, 1, count)
    angle = math.radians(start) + way * turns * math.tau * t
    r = radius * shrink ** (turns * t)
    return np.stack([centre[0] + r * np.cos(angle), centre[1] + r * np.sin(angle)], axis=1)


def paint_lace():
    """
    The pierced gilding between a candelabra's scrolls, in the plane of one arm: x is out from the
    stem, up is up. Small spirals and leaves are drawn as strokes, then embossed: how far a pixel
    is from the edge of its stroke is how high it stands, and that height is lit like a casting.
    """
    x0, y0, w, h = LEAF_CELLS["Lace"]
    s = 3
    width, height = w * s, h * s
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    wide = LACE_OUT - LACE_IN
    tall = LACE_TOP - LACE_FOOT

    def pixel(p):
        return ((p[0] - LACE_IN) / wide * width, (LACE_TOP - p[1]) / tall * height)

    def stroke(points, start, end=None, swell=0.0):
        """A brush along a line, its radius in metres going from `start` to `end`."""
        end = start if end is None else end
        points = np.asarray(points, float)
        # Cutting the corners a few times turns a rough line into a curve.
        for _ in range(3):
            q = points[:-1] * 0.75 + points[1:] * 0.25
            r = points[:-1] * 0.25 + points[1:] * 0.75
            points = np.vstack([points[:1], np.stack([q, r], axis=1).reshape(-1, 2), points[-1:]])
        along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))])
        steps = np.linspace(0, 1, max(int(along[-1] / wide * width / 1.5), 8))
        xs = np.interp(steps * along[-1], along, points[:, 0])
        ys = np.interp(steps * along[-1], along, points[:, 1])
        for t, x, y in zip(steps, xs, ys):
            r = (start + (end - start) * t) * (1 + swell * math.sin(t * math.pi)) / wide * width
            cx, cy = pixel((x, y))
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)

    def leaf(at, angle, length, fat=0.016):
        """An acanthus lobe: a stroke that swells, curves and comes to a point."""
        a = math.radians(angle)
        ts = np.linspace(0, 1, 16)
        bend = 0.5
        xs = at[0] + np.cos(a + bend * ts) * length * ts
        ys = at[1] + np.sin(a + bend * ts) * length * ts
        stroke(np.stack([xs, ys], axis=1), fat * 0.5, 0.002, swell=1.4)

    # The ribs that hold it all to the real scrolls.
    stroke(SHIELD_ARM, 0.02)
    stroke(SHIELD_EDGE, 0.018)
    stroke(spiral((0.29, 5.645), 0.2, 95, 1.0, 0.42), 0.016)
    stroke([(0.05, 6.03), (0.14, 5.97), (0.27, 5.84)], 0.016)
    stroke([(0.04, 5.12), (0.05, 6.02)], 0.022)

    # Small spirals packed into every gap, each with a stem back to something solid.
    fill = (
        ((0.135, 5.385), 0.08, 215, 1.35, -1, ((0.07, 5.26), (0.085, 5.32))),
        ((0.52, 5.46), 0.062, 60, 1.3, 1, ((0.42, 5.57), (0.47, 5.53))),
        ((0.65, 5.45), 0.05, 50, 1.25, 1, ((0.6, 5.58), (0.63, 5.52))),
        ((0.105, 5.76), 0.05, 330, 1.25, 1, ((0.06, 5.64), (0.1, 5.7))),
        ((0.125, 5.875), 0.042, 170, 1.2, -1, ((0.06, 5.98), (0.08, 5.92))),
        ((0.47, 5.86), 0.075, 180, 1.3, -1, ((0.32, 5.87), (0.385, 5.86))),
        ((0.615, 5.685), 0.05, 250, 1.2, -1, ((0.55, 5.6), (0.58, 5.63))),
        ((0.27, 5.28), 0.04, 300, 1.1, 1, ((0.2, 5.27), (0.23, 5.25))),
    )
    for centre, radius, start, turns, way, stem in fill:
        line = spiral(centre, radius, start, turns, 0.42, way=way)
        stroke(np.vstack([np.array(stem), line[:1]]), 0.012, 0.011)
        stroke(line, 0.0115, 0.0065, swell=0.3)
        cx, cy = pixel(line[-1])
        r = 0.016 / wide * width
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)

    # Leaves off the backs of the ribs.
    for at, angle, length in (
        ((0.14, 5.21), 285, 0.07),
        ((0.25, 5.3), 300, 0.09),
        ((0.33, 5.39), 305, 0.09),
        ((0.45, 5.59), 290, 0.11),
        ((0.58, 5.595), 300, 0.11),
        ((0.7, 5.55), 290, 0.09),
        ((0.47, 5.675), 20, 0.09),
        ((0.47, 5.72), 60, 0.09),
        ((0.4, 5.8), 40, 0.09),
        ((0.34, 5.84), 75, 0.1),
        ((0.2, 5.94), 60, 0.1),
        ((0.26, 5.89), 70, 0.1),
        ((0.11, 6.0), 40, 0.07),
        ((0.06, 5.52), 340, 0.09),
        ((0.06, 5.44), 20, 0.07),
        ((0.06, 5.62), 10, 0.07),
    ):
        leaf(at, angle, length)

    solid = np.asarray(mask, np.float32) / 255 > 0.5
    distance = ndimage.distance_transform_edt(solid) / s
    rise = np.sqrt(np.clip(1 - (1 - np.clip(distance / 7.0, 0, 1)) ** 2, 0, 1))
    rise = ndimage.gaussian_filter(rise, 1.6 * s / 2)
    gy, gx = np.gradient(rise)
    normal = np.dstack([-gx * 9 * s, -gy * 9 * s, np.ones_like(rise)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    # Lit from below and to one side, the way a street light catches it.
    light = np.array([-0.35, 0.62, 0.7])
    light /= np.linalg.norm(light)
    facing = np.clip(normal @ light, 0, 1)
    tone = 0.2 + 0.62 * facing + 0.5 * facing**14
    dark, mid, bright = np.array([58.0, 34, 12]), np.array([196.0, 142, 62]), np.array([255.0, 232, 158])
    t = np.clip(tone, 0, 1.15)[..., None]
    rgb = np.where(t < 0.6, dark + (mid - dark) * (t / 0.6), mid + (bright - mid) * ((t - 0.6) / 0.55))
    rgba = np.dstack([rgb.clip(0, 255), np.asarray(mask, np.float32)])
    image = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    return image.resize((w, h), Image.LANCZOS)


def opaque(rgb):
    h, w = rgb.shape[:2]
    return Image.fromarray(np.dstack([rgb.clip(0, 255), np.full((h, w), 255.0)]).astype(np.uint8), "RGBA")


def paint_leaves():
    rng = np.random.default_rng(1830)
    sheet = Image.new("RGBA", LEAVES_SIZE, (22, 34, 20, 0))

    def put(name, image):
        sheet.paste(image, LEAF_CELLS[name][:2])

    size = lambda name: LEAF_CELLS[name][2:]  # noqa: E731
    for name in ("Frond0", "Frond1", "Frond2"):
        put(name, paint_frond(*size(name), rng))
    put("Chain", paint_chain())
    for name, bright in (("Ficus0", 1.0), ("Ficus1", 0.72), ("Ficus2", 0.45), ("Ficus3", 0.15)):
        put(name, paint_clump(*size(name), rng, bright))
    put("Fan0", paint_fan(*size("Fan0"), rng))
    put("Lace", paint_lace())
    put("FanDead", paint_fan(*size("FanDead"), rng, dead=True))
    put("Blade", paint_blade(*size("Blade"), rng))
    put("Shade", paint_shade(*size("Shade"), rng))
    w, h = size("BarkDate")
    put("BarkDate", opaque(paint_date_bark(w, h, rng)))
    w, h = size("BarkFan")
    put("BarkFan", opaque(paint_fan_bark(w, h, rng)))
    w, h = size("BarkFicus")
    put("BarkFicus", opaque(paint_ficus_bark(w, h, rng)))
    w, h = size("BarkBoot")
    put("BarkBoot", opaque(paint_boots(w, h, rng)))
    sheet = bled(sheet)
    sheet.save(OUT / "street-leaves.webp", quality=54, alpha_quality=70, method=6, exact=True)
    return sheet


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    paint_signs()
    paint_leaves()
    for name in ("street-signs.webp", "street-leaves.webp"):
        print(name, round((OUT / name).stat().st_size / 1024), "KB")

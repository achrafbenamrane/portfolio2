"""
The printing on the machines in /3d/2090: unit numbers, stencils and warnings. Small type is
most of what gives a big machine its scale, so there's a lot of it.

    python scripts/tether_decals.py

Writes assets-source/tether/build/decals.png: a 4 by 4 sheet, transparent where there's no ink.
Each cell is named in CELLS, and build_tether_robot.py asks for them by position.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 2048
GRID = 4
CELL = SIZE // GRID
OUT = Path("assets-source/tether/build")
OUT.mkdir(parents=True, exist_ok=True)

BOLD = "C:/Windows/Fonts/bahnschrift.ttf"
INK = (22, 22, 24, 235)
RED = (143, 16, 36, 240)
PALE = (232, 230, 224, 235)

sheet = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def cell(column, row):
    return column * CELL, row * CELL


def font(size, weight=700):
    face = ImageFont.truetype(BOLD, size)
    try:
        face.set_variation_by_axes([weight, 100])
    except OSError:
        pass
    return face


def text(column, row, lines, size, fill=INK, spacing=1.15):
    draw = ImageDraw.Draw(sheet)
    x, y = cell(column, row)
    face = font(size)
    total = len(lines) * size * spacing
    top = y + (CELL - total) / 2
    for index, line in enumerate(lines):
        box = draw.textbbox((0, 0), line, font=face)
        draw.text((x + (CELL - (box[2] - box[0])) / 2 - box[0], top + index * size * spacing - box[1] * 0.3), line, font=face, fill=fill)


# Row 0: the unit's number and name.
text(0, 0, ["09"], 330)
text(1, 0, ["09"], 330, fill=PALE)
text(2, 0, ["WX-09"], 150)
text(3, 0, ["WOLFEXO", "LUNAR OPS"], 74)

# Row 1: stencils.
text(0, 1, ["NO STEP"], 104, fill=RED)
text(1, 1, ["LIFT", "POINT"], 120)
text(2, 1, ["HYDRAULIC", "24 MPA"], 86)
text(3, 1, ["TETHER", "LINK"], 120, fill=RED)

# Row 2: hazard stripes, a chevron, and the arrow for the lifting eye.
draw = ImageDraw.Draw(sheet)
x, y = cell(0, 2)
for index in range(-4, 12):
    left = x + index * 80
    draw.polygon([(left, y + CELL), (left + 40, y + CELL), (left + 40 + CELL, y), (left + CELL, y)], fill=(20, 20, 22, 240))
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rectangle((x, y, x + CELL, y + CELL), fill=255)
keep = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
keep.paste(sheet, (0, 0), mask)
outside = sheet.copy()
ImageDraw.Draw(outside).rectangle((x, y, x + CELL, y + CELL), fill=(0, 0, 0, 0))
sheet = Image.alpha_composite(outside, keep)
draw = ImageDraw.Draw(sheet)
stripe_back = Image.new("RGBA", (CELL, CELL), (204, 158, 24, 240))
sheet.paste(Image.alpha_composite(stripe_back, sheet.crop((x, y, x + CELL, y + CELL))), (x, y))

draw = ImageDraw.Draw(sheet)
x, y = cell(1, 2)
draw.polygon([(x + 256, y + 90), (x + 430, y + 300), (x + 320, y + 300), (x + 320, y + 430), (x + 192, y + 430), (x + 192, y + 300), (x + 82, y + 300)], fill=INK)
x, y = cell(2, 2)
for index in range(46):
    width = 3 + (index * 7) % 9
    left = x + 40 + index * 9.4
    draw.rectangle((left, y + 170, left + width * 0.7, y + 330), fill=INK)
text(3, 2, ["SERVICE", "PANEL 4C"], 84)

# Row 3: small print, in blocks, as it comes on a data plate.
text(0, 3, ["MAX LOAD 4000 KG", "SER 2088-0914-09", "VAC RATED", "-180 / +120 C"], 50)
text(1, 3, ["ISOLATE BEFORE", "OPENING", "STORED PRESSURE"], 56, fill=RED)
text(2, 3, ["CAUTION", "THRUST ZONE"], 84, fill=RED)
text(3, 3, ["RCS", "4 X 220 N"], 96)

sheet.save(OUT / "decals.png")
print("decals", sheet.size)

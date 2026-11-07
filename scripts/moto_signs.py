"""
Draws the small things that say where you are: Algerian shop signs, Arabic over French, and the


    python scripts/moto_signs.py

Writes public/moto/signs.webp.
"""

from pathlib import Path

import arabic_reshaper
import numpy as np
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/moto"
ARABIC = "C:/Windows/Fonts/tahomabd.ttf"
LATIN = "C:/Windows/Fonts/arialbd.ttf"
WIDE, TALL = 1024, 128
COLUMNS, ROWS = 2, 8

# What a street here actually says. Trades only: no real brands.
SIGNS = [
    ("صيدلية", "PHARMACIE", "#0f7a3d", "#ffffff"),
    ("مخبزة", "BOULANGERIE", "#7a3e12", "#ffe2a8"),
    ("مقهى", "CAFÉ", "#1a1a20", "#ffb24a"),
    ("حلاقة", "COIFFURE", "#123a7a", "#ffffff"),
    ("مطعم", "RESTAURANT", "#8f1024", "#ffe9c4"),
    ("مواد غذائية", "ALIMENTATION GÉNÉRALE", "#0e5a4a", "#ffffff"),
    ("جزار", "BOUCHERIE", "#a81414", "#ffffff"),
    ("هاتف عمومي", "TAXIPHONE", "#e0b020", "#1a1a20"),
    ("بيتزا", "PIZZERIA", "#1a7a2e", "#ffffff"),
    ("ملابس", "PRÊT-À-PORTER", "#26262e", "#ffffff"),
    ("مكتبة", "LIBRAIRIE", "#233f73", "#ffe9c4"),
    ("خضر و فواكه", "FRUITS ET LÉGUMES", "#3f7a1a", "#ffffff"),
    ("حلويات", "PÂTISSERIE", "#8a2a5a", "#ffe9c4"),
    ("أحذية", "CHAUSSURES", "#3a2a1e", "#ffd9a0"),
    ("قاعة شاي", "SALON DE THÉ", "#1a4f5a", "#ffe9c4"),
    ("بصريات", "OPTICIEN", "#1a3a6a", "#ffffff"),
]


def arabic(text):
    return get_display(arabic_reshaper.reshape(text))


sheet = Image.new("RGB", (WIDE * COLUMNS, TALL * ROWS), "#000000")
for index, (word, french, ground, ink) in enumerate(SIGNS):
    sign = Image.new("RGB", (WIDE, TALL), ground)
    draw = ImageDraw.Draw(sign)
    # A lit box sign: brighter across the middle, where the tubes are.
    fade = np.linspace(-1, 1, TALL)[:, None]
    glow = (1.12 - 0.34 * fade**2)[..., None]
    pixels = np.asarray(sign, np.float32) * glow
    sign = Image.fromarray(pixels.clip(0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(sign)
    big = ImageFont.truetype(ARABIC, 74)
    small = ImageFont.truetype(LATIN, 44 if len(french) < 14 else 32)
    text = arabic(word)
    box = draw.textbbox((0, 0), text, font=big)
    draw.text((WIDE - 34 - (box[2] - box[0]) - box[0], (TALL - (box[3] - box[1])) / 2 - box[1]), text, fill=ink, font=big)
    box = draw.textbbox((0, 0), french, font=small)
    draw.text((34 - box[0], (TALL - (box[3] - box[1])) / 2 - box[1]), french, fill=ink, font=small)
    draw.rectangle((6, 6, WIDE - 7, TALL - 7), outline=ink, width=3)
    if word == "صيدلية":
        cross = Image.new("RGB", (72, 72), ground)
        cd = ImageDraw.Draw(cross)
        cd.rectangle((24, 4, 48, 68), fill="#ffffff")
        cd.rectangle((4, 24, 68, 48), fill="#ffffff")
        sign.paste(cross, (WIDE // 2 - 36, 28))
    sheet.paste(sign, ((index % COLUMNS) * WIDE, (index // COLUMNS) * TALL))
sheet.save(OUT / "signs.webp", quality=86, method=5)
print("drew the signs")

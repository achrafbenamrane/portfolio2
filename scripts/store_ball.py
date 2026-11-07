"""
Paints the store's football: a white ball with Wolfexo-red pentagons.

    python scripts/store_ball.py

An equirectangular map of a truncated icosahedron, worked out per pixel from the
twelve pentagon centres and twenty hexagon centres. Writes assets-source/store/build/ball.png.
"""

from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets-source" / "store" / "build" / "ball.png"
W, H = 2048, 1024

phi = (1 + 5**0.5) / 2
pentagons = []
for a in (-1, 1):
    for b in (-phi, phi):
        pentagons += [(0, a, b), (a, b, 0), (b, 0, a)]
pentagons = np.array(pentagons, dtype=np.float64)
pentagons /= np.linalg.norm(pentagons, axis=1, keepdims=True)

# Each icosahedron face (three mutually adjacent vertices) is a hexagon's centre.
edge = np.min(
    [np.linalg.norm(pentagons[i] - pentagons[j]) for i in range(12) for j in range(i + 1, 12)]
)
hexagons = []
for i in range(12):
    for j in range(i + 1, 12):
        for k in range(j + 1, 12):
            a, b, c = pentagons[i], pentagons[j], pentagons[k]
            if (
                abs(np.linalg.norm(a - b) - edge) < 1e-6
                and abs(np.linalg.norm(a - c) - edge) < 1e-6
                and abs(np.linalg.norm(b - c) - edge) < 1e-6
            ):
                centre = a + b + c
                hexagons.append(centre / np.linalg.norm(centre))
hexagons = np.array(hexagons)

lon = (np.arange(W) + 0.5) / W * 2 * np.pi - np.pi
lat = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi
lon, lat = np.meshgrid(lon, lat)
d = np.stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)), axis=-1)

ang_p = np.arccos(np.clip(d @ pentagons.T, -1, 1))
ang_h = np.arccos(np.clip(d @ hexagons.T, -1, 1))
near_p = ang_p.min(axis=-1)
sorted_h = np.sort(ang_h, axis=-1)

# A point is on a pentagon when it is nearer that centre, weighted for their sizes.
gap = near_p * 1.24 - sorted_h[..., 0]
pent = gap < 0
seam = (np.abs(gap) < 0.012) | ((sorted_h[..., 1] - sorted_h[..., 0] < 0.018) & ~pent)

image = np.empty((H, W, 3), dtype=np.float32)
image[:] = (238, 236, 232)
image[pent] = (143, 16, 36)
image[seam] = (150, 146, 144)
Image.fromarray(image.astype(np.uint8)).save(OUT)
print("wrote", OUT)

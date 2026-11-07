"""
The ground of /3d/2090: a piece of the lunar highlands, simulated rather than painted.

The Moon's surface is nothing but impacts on impacts, so that's how it's made here: thousands
of craters in the power law real ones follow, each with a raised rim, laid over a fractal
ground, and the sun is then traced across the result. There's no air on the Moon to soften a
shadow, so those shadows are most of what makes it look like the real thing.

    python scripts/tether_terrain.py [size]

Writes public/2090/: ground-height.png (16 bits, in red and green, for the mesh and for walking
on), ground-normal.webp, ground-tone.webp, and src/content/tether-world.json.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 2048
# Metres across the map. Far enough that the base sits in a real landscape.
WORLD = 1600.0
METRES = WORLD / SIZE
OUT = Path("public/2090")
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(2090)

# Where the sun is. Low, so that every bump throws a shadow. Y is up.
SUN = np.array([-0.62, 0.27, 0.74])
SUN /= np.linalg.norm(SUN)

# The base sits on a levelled apron here, at the middle of the map.
BASE_RADIUS = 150.0


def fractal(size, power):
    """Noise whose detail falls off as real terrain's does."""
    frequency = np.fft.fftfreq(size)
    radius = np.sqrt(frequency[:, None] ** 2 + frequency[None, :] ** 2)
    radius[0, 0] = 1
    spectrum = rng.standard_normal((size, size)) + 1j * rng.standard_normal((size, size))
    field = np.fft.ifft2(spectrum / radius**power).real
    return (field / field.std()).astype(np.float32)


height = fractal(SIZE, 1.75) * 9.0

axis = (np.arange(SIZE) - SIZE / 2 + 0.5) * METRES
gx, gz = np.meshgrid(axis, axis)
from_base = np.sqrt(gx**2 + gz**2)


def crater(field, x, z, radius):
    """One impact: a bowl, a raised rim, and a blanket of ejecta thinning outward."""
    reach = radius * 3.2
    cells = int(reach / METRES) + 1
    cx = int((x + WORLD / 2) / METRES)
    cz = int((z + WORLD / 2) / METRES)
    x0, x1 = max(cx - cells, 0), min(cx + cells, SIZE)
    z0, z1 = max(cz - cells, 0), min(cz + cells, SIZE)
    if x0 >= x1 or z0 >= z1:
        return
    r = np.sqrt((gx[z0:z1, x0:x1] - x) ** 2 + (gz[z0:z1, x0:x1] - z) ** 2) / radius
    depth = radius * 0.2
    rim = radius * 0.05
    bowl = (r**2 - 1) * depth + rim
    outside = rim * np.maximum(r, 1) ** -3.2
    shape = np.where(r < 1, bowl, outside)
    # A big crater wipes out whatever was there; a small one just dents it.
    keep = np.clip((r - 0.7) / 0.5, 0, 1)
    patch = field[z0:z1, x0:x1]
    mean = float(patch[r < 1.2].mean()) if (r < 1.2).any() else 0.0
    field[z0:z1, x0:x1] = patch * (0.25 + 0.75 * keep) + (mean * (1 - keep) * 0.75) + shape * np.clip(3.2 - r, 0, 1)


# Biggest first, as they'd have aged. Counts follow the real power law of about r^-2.
sizes = [(110, 5), (60, 14), (28, 60), (14, 200), (7, 700), (3.4, 2600), (1.7, 7000)]
for radius, count in sizes:
    for _ in range(count):
        size = radius * rng.uniform(0.7, 1.35)
        x, z = rng.uniform(-WORLD / 2, WORLD / 2, 2)
        # Keep the big ones off the base, but let small ones scatter across it.
        if size > 4 and np.hypot(x, z) < BASE_RADIUS + size * 1.6:
            continue
        crater(height, x, z, size)
print("craters done", flush=True)

# The apron: graded flat for the pad and the buildings, blending out into the land.
level = float(height[from_base < 30].mean())
blend = np.clip((from_base - BASE_RADIUS * 0.55) / (BASE_RADIUS * 0.6), 0, 1)
blend = blend * blend * (3 - 2 * blend)
height = level + (height - level) * blend
fine = fractal(SIZE, 1.35) * 0.09
height += fine * (0.35 + 0.65 * blend)
height -= level

# Slopes, in metres per metre.
slope_z, slope_x = np.gradient(height, METRES)
normal = np.stack([-slope_x, np.ones_like(height), -slope_z], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)

# The sun's shadows: walk towards it from every point, and see if the land gets in the way.
print("tracing the sun", flush=True)
lit = np.ones_like(height)
step = max(METRES, 0.6)
reach = 340.0
horizontal = np.hypot(SUN[0], SUN[2])
rise = SUN[1] / horizontal
direction = np.array([SUN[0], SUN[2]]) / horizontal
distance = step
shade = np.ones_like(height)
while distance < reach:
    shifted = ndi.shift(height, (-direction[1] * distance / METRES, -direction[0] * distance / METRES), order=1, mode="nearest")
    gap = height + rise * distance - shifted
    # The sun is half a degree across: a shadow's edge gets softer the further it falls.
    softness = max(distance * 0.0087, 0.08)
    shade = np.minimum(shade, np.clip(gap / softness * 0.5 + 0.5, 0, 1))
    distance += step * (1 + distance / 60)

sunlight = np.clip(normal @ SUN, 0, 1) * shade
# Earthshine and the glow off nearby sunlit ground, which is all that lights a lunar shadow.
bounce = ndi.gaussian_filter(sunlight, 16 / METRES) * 0.16
sky = np.clip(normal[..., 1], 0, 1) * 0.02
tone = sunlight + bounce + sky

# Soil's own colour: fresh ejecta around young craters is brighter, old ground darker.
mottle = fractal(SIZE, 1.2)
albedo = 0.86 + 0.09 * mottle + 0.1 * np.clip(ndi.gaussian_filter(np.abs(slope_x) + np.abs(slope_z), 1.5), 0, 1)

lo, hi = float(height.min()), float(height.max())
quantised = np.round((height - lo) / (hi - lo) * 65535).astype(np.uint16)
packed = np.zeros((SIZE, SIZE, 3), np.uint8)
packed[..., 0] = quantised >> 8
packed[..., 1] = quantised & 255
Image.fromarray(packed).resize((1024, 1024), Image.NEAREST).save(OUT / "ground-height.png", optimize=True)

encoded = ((normal * 0.5 + 0.5) * 255).astype(np.uint8)
Image.fromarray(encoded).save(OUT / "ground-normal.webp", quality=90, method=5)

# Tone is stored square-rooted: shadows are where the eye needs the steps.
stored = np.stack([np.sqrt(np.clip(tone * 0.84, 0, 1)), np.clip(albedo * 0.8, 0, 1), shade], axis=-1)
Image.fromarray((stored * 255).astype(np.uint8)).save(OUT / "ground-tone.webp", quality=88, method=5)

Path("src/content/tether-world.json").write_text(
    json.dumps(
        dict(world=WORLD, heightLow=lo, heightHigh=hi, sun=[round(float(v), 4) for v in SUN], baseRadius=BASE_RADIUS),
        indent=1,
    )
    + "\n",
    encoding="utf-8",
)
print(f"height {lo:.1f} to {hi:.1f} m, lit share {float((shade > 0.5).mean()):.2f}")

preview = np.clip(np.sqrt(tone * 0.84) * albedo, 0, 1)
Image.fromarray((preview * 255).astype(np.uint8)).resize((1000, 1000)).save("assets-source/tether/build/ground-preview.png")

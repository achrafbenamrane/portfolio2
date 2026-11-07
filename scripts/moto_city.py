"""
Turns the raw map into the city the game rides through: every real building footprint in the
area, raised to a believable height; the true coastline and port; the ground, flattened under the
road; and, down the streets of the old centre, the unbroken white walls the map can't give: block
after block of apartment houses standing right on the pavement, with side streets, arcades along
the seafront, and mansard roofs. Run scripts/moto_route.py first.

    python -I scripts/moto_city.py

Reads assets-source/moto/dl and build/route.json. Writes build/city.npz, which
scripts/blender/build_moto_city.py compresses for the browser, and into public/moto/city the ride
line, the facade table and the height map. Map data is (c) OpenStreetMap contributors, ODbL.
Terrain tiles are Mapzen's, from SRTM and others.
"""

import json
import math
import site
import sys
from pathlib import Path

sys.path.append(site.getusersitepackages())
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

import moto_network  # noqa: E402
from moto_network import HERO, PLAZA_EDGE  # noqa: E402
from moto_route import BUILD, DL, Heights, LAP, LAT0, LON0, MAQAM_LEVEL, MAQAM_XY as MAQAM, METRES, ROOT  # noqa: E402

PUBLIC = ROOT / "public/moto/city"
STEP = 5.0
ROAD_CLEAR = 20.0
NEAR = 240.0
FACADE = 72.0
# Height of the ground floor and of each one above it, and the width of a bay.
GROUND = 4.4
FLOOR = 3.5
BAY = 3.7
# How far the wall of a street stands from the middle of the road, as a share of the road's width,
# and how deep its buildings are.
WALL = 21.2
DEPTH = 15.0
MOST_GRADE = 0.085
# Houses added along streets the map left bare: what kinds of street, how deep and how long they are.
INFILL_KINDS = (2, 3, 4, 5, 6, 7)
INFILL_DEPTH = (11.0, 15.0)
INFILL_LENGTH = (12.0, 24.0)
UNDER_ROAD = 1.1
ARCADE_DEEP = 3.7
MANSARD_DEEP = 1.5
SETBACK = 0.6
MANSARD_TALL = 2.7
CORNICE_TALL = 1.75
# Where the zones of the ride begin, by the map point nearest to each.
PLAZA, HILL, CITY, SEA, BAY_ROAD, MOSQUE = range(6)
ZONE_STARTS = [
    (HILL, (MAQAM[0] + LAP[-1][0], MAQAM[1] + LAP[-1][1])),
    (CITY, (-2391.0, -1507.0)),
    (SEA, (-2590.0, 1722.0)),
    (CITY, (-2582.0, 920.0)),
    (BAY_ROAD, (-2473.0, -600.0)),
]
MOSQUE_ZONE = 950.0
ZONE_WIDTH = {PLAZA: 1.0, HILL: 0.62, CITY: 0.62, SEA: 0.66, BAY_ROAD: 1.0, MOSQUE: 1.0}
ZONE_MEDIAN = {PLAZA: 0.0, HILL: 0.0, CITY: 0.0, SEA: 0.0, BAY_ROAD: 1.0, MOSQUE: 1.0}
# Nothing the map says stands here: the monuments are modelled, and need room around them.
STAGE = 232.0
# The top of the esplanade's paving.
STAGE_LEVEL = 121.84
MAQAM_CLEAR = 235.0
MOSQUE_BOX = (4230.0, -3560.0, 4760.0, -3190.0)
POSTE = (-2809.0, 835.0)
POSTE_CLEAR = 118.0
POSTE_LEVEL = 29.42
# How far before the finish the big letters stand on their bank, and how much ground they need.
LETTERS_BACK = 3300.0
LETTERS_CLEAR = 90.0
TILE = 1300.0
KIT_TILE = 240.0
FAR_TILE = 600.0
BOUNDS = (-5100.0, -4400.0, 6300.0, 4700.0)  # west, south, east, north, in metres
GRID = 8.0
# One height every ten metres: the surface the bike, the roads and the ground all stand on.
MAP_STEP = 10.0
# What's in the facade table, and which cell of the baked atlas each piece of wall shows.
BAY_PLAIN, BAY_BALCONY, BAY_FILANT, SHOP, SHUT, ARCADE, CORNICE, MANSARD, DISH = range(9)
HOOD, PEDIMENT, SEGMENT, ATTIC, RICH, DECO, MOORISH, MODERN, RUSTIC = range(9)
# Rows of the table: x, up, z, yaw, width, floor, kind, seed, tile, cell, tint.


def to_xy(lat, lon):
    return (lon - LON0) * METRES * math.cos(math.radians(LAT0)), (lat - LAT0) * METRES


def to_latlon(x, y):
    return LAT0 + y / METRES, LON0 + x / (METRES * math.cos(math.radians(LAT0)))


def gaussian(values, sigma):
    """Smooths along a line, holding the ends where they are."""
    radius = int(sigma * 3)
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    padded = np.pad(values, (radius, radius), mode="reflect", reflect_type="odd")
    return np.convolve(padded, kernel, mode="valid")


def smoothstep(values):
    values = np.clip(values, 0, 1)
    return values * values * (3 - 2 * values)


def ride_line():
    """The ride, one point every five metres, with its width, median and zone at each."""
    line = np.array(json.load(open(BUILD / "route.json"))["line"], float)
    along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(line[:, :2], axis=0), axis=1))])
    at = np.arange(0.0, along[-1], STEP)
    x, y, z = (np.interp(at, along, line[:, i]) for i in range(3))
    # OpenStreetMap's kinks would read as twitches at speed. A real road has none.
    sx, sy = gaussian(x, 5), gaussian(y, 5)
    # A junction on the map is a square corner. Ease only those, and leave the rest of the line true.
    for _ in range(3):
        heading = np.unwrap(np.arctan2(np.diff(sx), np.diff(sy)))
        radius = STEP / np.maximum(np.abs(np.gradient(heading)), 1e-6)
        tight = gaussian(np.pad((radius < 46).astype(float), (0, 1), mode="edge"), 12)
        share = np.clip(tight * 5, 0, 1)
        wx, wy = gaussian(sx, 14), gaussian(sy, 14)
        sx, sy = sx + (wx - sx) * share, sy + (wy - sy) * share
    # Smoothing pulls the corners in, so step along the finished line again.
    run = np.concatenate([[0], np.cumsum(np.hypot(np.diff(sx), np.diff(sy)))])
    at = np.arange(0.0, run[-1], STEP)
    z = np.interp(at, run, z)
    sx, sy = np.interp(at, run, sx), np.interp(at, run, sy)

    points = np.stack([sx, sy], axis=1)
    zone = np.full(len(at), PLAZA)
    for kind, spot in ZONE_STARTS:
        index = int(np.argmin(np.hypot(*(points - np.array(spot)).T)))
        zone[index:] = kind
    zone[at > at[-1] - MOSQUE_ZONE] = MOSQUE
    # The esplanade runs to its edge, with no road on it: the rider is free up there.
    gone = np.hypot(*(points - np.array(MAQAM)).T) > STAGE + 13
    zone[: int(np.argmax(gone))] = PLAZA

    # Level on the esplanade, then down off the hill.
    lap_end = at[int(np.argmax(zone != PLAZA))]
    z = gaussian(np.maximum(z, 2.2), 22)
    z = np.where(at < lap_end, MAQAM_LEVEL - 0.1, z)
    # Radar makes a cliff of a hillside. A road can't be steeper than a road: hold each step to the
    # grade, from the esplanade down, and from the far end back.
    limit = MOST_GRADE * STEP
    for index in range(1, len(z)):
        z[index] = min(max(z[index], z[index - 1] - limit), z[index - 1] + limit)
    for index in range(len(z) - 2, -1, -1):
        if at[index] > lap_end:
            z[index] = min(max(z[index], z[index + 1] - limit), z[index + 1] + limit)
    z = np.where(at < lap_end + 60, z, gaussian(z, 8))
    z = np.minimum(z, MAQAM_LEVEL - 0.1)

    width = gaussian(np.array([ZONE_WIDTH[k] for k in zone], float), 7)
    median = gaussian(np.array([ZONE_MEDIAN[k] for k in zone], float), 7)
    heading = np.unwrap(np.arctan2(np.gradient(sx), np.gradient(sy)))
    radius = STEP / np.maximum(np.abs(np.gradient(heading)), 1e-6)
    tightest = int(np.argmin(radius))
    slope = np.abs(np.gradient(z)) / STEP
    print(f"tightest bend {radius[tightest]:.0f} m at {at[tightest]:.0f}; steepest {slope.max() * 100:.1f}% at {at[int(np.argmax(slope))]:.0f}", flush=True)
    return np.stack([sx, sy, z], axis=1), width, median, zone


def nearest_on_line(points, line):
    """How far each point is from the line, and which point of the line is closest."""
    samples = line[::3, :2].astype(np.float32)
    best = np.zeros(len(points), np.float32)
    which = np.zeros(len(points), np.int32)
    for start in range(0, len(points), 3000):
        chunk = np.asarray(points[start : start + 3000], np.float32)
        d = ((chunk[:, None, :] - samples[None, :, :]) ** 2).sum(2)
        index = d.argmin(1)
        which[start : start + 3000] = index * 3
        best[start : start + 3000] = np.sqrt(d[np.arange(len(chunk)), index])
    return best, which


def distance_to_line(points, line):
    best = np.full(len(points), 1e9, np.float32)
    samples = line[::3, :2].astype(np.float32)
    for start in range(0, len(points), 4000):
        chunk = points[start : start + 4000].astype(np.float32)
        d = chunk[:, None, :] - samples[None, :, :]
        best[start : start + 4000] = np.sqrt((d * d).sum(2)).min(1)
    return best


def sea_mask(heights):
    """Which ground is sea: fill in from the open bay, stopping at the coast and the port walls."""
    west, south, east, north = BOUNDS
    wide, tall = int((east - west) / GRID), int((north - south) / GRID)
    wall = Image.new("L", (wide, tall), 0)
    draw = ImageDraw.Draw(wall)
    land = json.load(open(DL / "osm/land.json", encoding="utf-8"))["elements"]

    def pixel(p):
        x, y = to_xy(p["lat"], p["lon"])
        return (x - west) / GRID, (north - y) / GRID

    for way in land:
        tags = way.get("tags", {})
        geometry = way.get("geometry")
        if not geometry:
            continue
        if tags.get("natural") == "coastline" or "man_made" in tags:
            draw.line([pixel(p) for p in geometry], fill=255, width=3 if "man_made" in tags else 2)
    # The coast leaves the map at its edges, so a seam along the south and west keeps the fill out.
    wall = np.asarray(wall) > 0
    open_water = np.zeros_like(wall)
    open_water[0, wide // 2 :] = True  # the north edge, out in the bay
    open_water[:, -1] &= False
    stack = [(0, x) for x in range(wide // 2, wide)]
    seen = open_water.copy()
    while stack:
        r, c = stack.pop()
        for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= rr < tall and 0 <= cc < wide and not seen[rr, cc] and not wall[rr, cc]:
                seen[rr, cc] = True
                stack.append((rr, cc))
    return seen


def blur(field, sigma):
    """A gaussian blur, a row at a time and then a column."""
    radius = int(sigma * 3)
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    out = np.apply_along_axis(lambda row: np.convolve(np.pad(row, radius, mode="edge"), kernel, mode="valid"), 1, field)
    return np.apply_along_axis(lambda col: np.convolve(np.pad(col, radius, mode="edge"), kernel, mode="valid"), 0, out)


def dem_field(heights, wide, tall):
    """The terrain tiles, sampled onto the map's grid in one go."""
    west, south, east, north = BOUNDS
    xs = np.linspace(west, east, wide)
    ys = np.linspace(north, south, tall)
    lat = LAT0 + ys / METRES
    lon = LON0 + xs / (METRES * math.cos(math.radians(LAT0)))
    n = 2**14
    fx = ((lon + 180) / 360 * n - heights.x0) * 256
    rad = np.radians(lat)
    fy = ((1 - np.log(np.tan(rad) + 1 / np.cos(rad)) / math.pi) / 2 * n - heights.y0) * 256
    x0 = fx.astype(int)
    y0 = fy.astype(int)
    tx = (fx - x0)[None, :]
    ty = (fy - y0)[:, None]
    g = heights.grid
    a = g[np.ix_(y0, x0)]
    b = g[np.ix_(y0, x0 + 1)]
    c = g[np.ix_(y0 + 1, x0)]
    d = g[np.ix_(y0 + 1, x0 + 1)]
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty).astype(np.float32)


def height_map(heights, line, width, zone, edges, sea):
    """
    The one surface everything stands on: the bike, the roads and the ground are all read from this.
    Terrain from radar is noisy and a road isn't, so each street is laid in smooth, and the ground
    eases up to meet it either side.
    """
    west, south, east, north = BOUNDS
    wide = int((east - west) / MAP_STEP) + 1
    tall = int((north - south) / MAP_STEP) + 1
    dem = blur(dem_field(heights, wide, tall), 2.0)

    def cell(points):
        return (points[:, 0] - west) / MAP_STEP, (north - points[:, 1]) / MAP_STEP

    def sample(points):
        c, r = cell(points)
        c = np.clip(c.round().astype(int), 0, wide - 1)
        r = np.clip(r.round().astype(int), 0, tall - 1)
        return dem[r, c]

    # Each street, a smooth line of heights, stamped into a layer of its own.
    layer = np.zeros((tall, wide), np.float32)
    cover = np.zeros((tall, wide), np.float32)

    def stamp(points, levels, half, weight):
        c, r = cell(points)
        reach = max(int(math.ceil(half / MAP_STEP)), 1)
        for ci, ri, level in zip(c.round().astype(int), r.round().astype(int), levels):
            r0, r1 = max(ri - reach, 0), min(ri + reach + 1, tall)
            c0, c1 = max(ci - reach, 0), min(ci + reach + 1, wide)
            layer[r0:r1, c0:c1] += level * weight
            cover[r0:r1, c0:c1] += weight

    for edge in edges:
        if edge["kind"] >= HERO:
            continue
        points = edge["pts"]
        levels = sample(points)
        if len(levels) >= 8:
            levels = gaussian(levels, 3)
        stamp(points, levels, edge["half"] + 3, 1.0)
    # The ride is stamped far harder: where it's been cut into a hill, the other streets come to it.
    road_rows = np.nonzero(zone > 0)[0]
    stamp(line[road_rows, :2], line[road_rows, 2], 15.0, 14.0)

    wet = sea
    rows = ((north - np.linspace(north, south, tall)) / GRID).astype(int).clip(0, wet.shape[0] - 1)
    cols = ((np.linspace(west, east, wide) - west) / GRID).astype(int).clip(0, wet.shape[1] - 1)
    water = wet[np.ix_(rows, cols)]

    spread = blur(cover, 2.2)
    level = blur(layer, 2.2) / np.maximum(spread, 1e-5)
    share = smoothstep(blur((cover > 0).astype(np.float32), 2.2) / 0.34)
    field = np.where(spread > 1e-4, dem + (level - dem) * share, dem)

    # Sea is sea, whatever the radar said, unless there's a road on it.
    field = np.where(water & (share < 0.5), -6.0, np.maximum(field, 1.6))

    gx, gy = np.meshgrid(np.linspace(west, east, wide), np.linspace(north, south, tall))
    # The esplanade: a level stage round Maqam Echahid.
    gap = np.hypot(gx - MAQAM[0], gy - MAQAM[1])
    stage = smoothstep((gap - STAGE) / 90)
    field = STAGE_LEVEL + (field - STAGE_LEVEL) * stage
    # And a level floor under the Grande Poste's square.
    gap = np.hypot(gx - POSTE[0], gy - POSTE[1])
    floor_share = smoothstep((gap - 64) / 34)
    field = POSTE_LEVEL + (field - POSTE_LEVEL) * floor_share
    return field.astype(np.float32), water


def ground_sampler(field):
    """Height at map points, the same way the game reads it."""
    west, south, east, north = BOUNDS
    tall, wide = field.shape

    def at(x, y):
        u = np.clip((np.asarray(x, float) - west) / MAP_STEP, 0, wide - 1.001)
        v = np.clip((north - np.asarray(y, float)) / MAP_STEP, 0, tall - 1.001)
        c = u.astype(int)
        r = v.astype(int)
        s = u - c
        t = v - r
        return (field[r, c] * (1 - s) + field[r, c + 1] * s) * (1 - t) + (field[r + 1, c] * (1 - s) + field[r + 1, c + 1] * s) * t

    return at


def road_raster(edges, spine=False):
    """
    Where the carriageways are, at two metres to the pixel, to keep buildings off them. A spine is
    just the middle of each street: a wall on one of those means the street can't be ridden.
    """
    west, south, east, north = BOUNDS
    scale = 1.0 if spine else 0.5
    image = Image.new("L", (int((east - west) * scale) + 1, int((north - south) * scale) + 1), 0)
    draw = ImageDraw.Draw(image)
    for edge in edges:
        if edge["kind"] == PLAZA_EDGE or (spine and edge["kind"] >= HERO):
            continue
        points = [((x - west) * scale, (north - y) * scale) for x, y in edge["pts"]]
        draw.line(points, fill=255, width=3 if spine else max(int(edge["half"] * 2 * scale), 1))
    return np.asarray(image) > 0, scale


def raster_at(raster, scale, points):
    west, south, east, north = BOUNDS
    c = np.clip(((points[:, 0] - west) * scale).astype(int), 0, raster.shape[1] - 1)
    r = np.clip(((north - points[:, 1]) * scale).astype(int), 0, raster.shape[0] - 1)
    return raster[r, c]


def taken_ground(edges, rings):
    """Everything a new house can't stand on, at a metre to the pixel."""
    west, south, east, north = BOUNDS
    scale = 1.0
    image = Image.new("L", (int((east - west) * scale) + 1, int((north - south) * scale) + 1), 0)
    draw = ImageDraw.Draw(image)

    def pixel(point):
        return (point[0] - west) * scale, (north - point[1]) * scale

    for edge in edges:
        if edge["kind"] == PLAZA_EDGE:
            continue
        # The main road's pavement reaches out to its low wall.
        reach = edge["half"] * 21.0 / 13.25 + 1 if edge["kind"] >= HERO else edge["half"] + pavement_of(edge["half"]) + 0.6
        draw.line([pixel(q) for q in edge["pts"]], fill=255, width=max(int(reach * 2 * scale), 1))
    for pts in rings:
        draw.polygon([pixel(q) for q in pts], fill=255)
    for way in json.load(open(DL / "world/green.json", encoding="utf-8"))["elements"]:
        geometry = way.get("geometry")
        if geometry and len(geometry) > 2:
            draw.polygon([pixel(to_xy(q["lat"], q["lon"])) for q in geometry], fill=255)
    for way in json.load(open(DL / "world/places.json", encoding="utf-8"))["elements"]:
        geometry = way.get("geometry")
        if geometry and len(geometry) > 2 and way.get("tags", {}).get("leisure") == "stadium":
            draw.polygon([pixel(to_xy(q["lat"], q["lon"])) for q in geometry], fill=255)
    for centre, radius in ((MAQAM, MAQAM_CLEAR), (POSTE, POSTE_CLEAR)):
        x, y = pixel(centre)
        draw.ellipse((x - radius * scale, y - radius * scale, x + radius * scale, y + radius * scale), fill=255)
    a, b = pixel((MOSQUE_BOX[0], MOSQUE_BOX[3])), pixel((MOSQUE_BOX[2], MOSQUE_BOX[1]))
    draw.rectangle((a[0], a[1], b[0], b[1]), fill=255)
    return np.array(image) > 0, scale


def pavement_of(half):
    """The same widths street.ts draws."""
    return 3.0 if half > 5 else 2.4 if half > 4 else 1.7


def bare_streets(edges, taken, scale, at, rng):
    """
    Along every street the map left bare, the terraces a real street would have. OpenStreetMap only
    has the buildings people have traced, so whole streets of Algiers run between empty ground.
    Each side is walked for free frontage, which is built up house by house, wall to wall.
    """
    west, south, east, north = BOUNDS
    made = []
    order = sorted((edge for edge in edges if edge["kind"] in INFILL_KINDS), key=lambda edge: -edge["half"])
    for edge in order:
        pts = edge["pts"]
        if len(pts) < 4:
            continue
        run = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        if run[-1] < 24:
            continue
        forward = np.gradient(pts, axis=0)
        forward /= np.maximum(np.linalg.norm(forward, axis=1, keepdims=True), 1e-6)
        right = np.stack([forward[:, 1], -forward[:, 0]], axis=1)
        out = edge["half"] + pavement_of(edge["half"]) + 0.8
        depth = float(rng.uniform(INFILL_DEPTH[0], INFILL_DEPTH[1]))
        for side in (-1, 1):
            front = pts + right * (side * out)
            back = pts + right * (side * (out + depth))
            free = (run > 7) & (run < run[-1] - 7)
            for share in np.linspace(0, 1, 8):
                free &= ~raster_at(taken, scale, front + (back - front) * share)
            index = 0
            while index < len(pts) - 1:
                if not free[index]:
                    index += 1
                    continue
                goal = float(rng.uniform(INFILL_LENGTH[0], INFILL_LENGTH[1]))
                stop = index
                while stop + 1 < len(pts) and free[stop + 1] and run[stop + 1] - run[index] < goal:
                    # The front is a straight wall, so a bend ends the house.
                    chord = front[stop + 1] - front[index]
                    size = float(np.linalg.norm(chord)) or 1.0
                    rel = front[index : stop + 2] - front[index]
                    if np.abs(rel[:, 0] * chord[1] - rel[:, 1] * chord[0]).max() / size > 0.9:
                        break
                    stop += 1
                if run[stop] - run[index] < 9:
                    index = max(stop, index + 1)
                    continue
                ring = np.array([front[index], front[stop], back[stop], back[index]])
                levels = at(ring[:, 0], ring[:, 1])
                if levels.min() >= 1.6 and levels.max() - levels.min() < 7:
                    made.append(ring)
                    # What's built is taken, so the next street along can't overlap it.
                    a = np.linspace(0, 1, max(int((run[stop] - run[index]) / 0.8), 2))[:, None, None]
                    b = np.linspace(0, 1, max(int(depth / 0.8), 2))[None, :, None]
                    near = ring[0] + (ring[1] - ring[0]) * a
                    far = ring[3] + (ring[2] - ring[3]) * a
                    grid = (near + (far - near) * b).reshape(-1, 2)
                    c = np.clip(((grid[:, 0] - west) * scale).astype(int), 0, taken.shape[1] - 1)
                    r = np.clip(((north - grid[:, 1]) * scale).astype(int), 0, taken.shape[0] - 1)
                    taken[r, c] = True
                index = stop
                if index >= len(pts) - 1 or not free[index]:
                    index += 1
    return made


def round_the_walls(pts, step=0.9):
    """Points every step or so round a footprint."""
    out = []
    for a, b in zip(pts, np.roll(pts, -1, axis=0)):
        count = max(int(math.dist(a, b) / step), 1)
        out.append(a + (b - a) * (np.arange(count)[:, None] / count))
    return np.vstack(out)


def ear_clip(polygon):
    """Triangles for a footprint, which is often not convex."""
    n = len(polygon)
    if n == 3:
        return [(0, 1, 2)]
    indices = list(range(n))
    triangles = []
    guard = 0
    while len(indices) > 3 and guard < n * n:
        guard += 1
        cut = False
        for i in range(len(indices)):
            a, b, c = indices[i - 1], indices[i], indices[(i + 1) % len(indices)]
            pa, pb, pc = polygon[a], polygon[b], polygon[c]
            if (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]) <= 0:
                continue
            clear = True
            for k in indices:
                if k in (a, b, c):
                    continue
                p = polygon[k]
                d1 = (pb[0] - pa[0]) * (p[1] - pa[1]) - (pb[1] - pa[1]) * (p[0] - pa[0])
                d2 = (pc[0] - pb[0]) * (p[1] - pb[1]) - (pc[1] - pb[1]) * (p[0] - pb[0])
                d3 = (pa[0] - pc[0]) * (p[1] - pc[1]) - (pa[1] - pc[1]) * (p[0] - pc[0])
                if d1 >= 0 and d2 >= 0 and d3 >= 0:
                    clear = False
                    break
            if clear:
                triangles.append((a, b, c))
                indices.pop(i)
                cut = True
                break
        if not cut:
            break
    if len(indices) == 3:
        triangles.append(tuple(indices))
    return triangles


def levels_for(tags, area, seed, centre):
    value = tags.get("building:levels")
    if value:
        try:
            return float(value.split(";")[0])
        except ValueError:
            pass
    if tags.get("building") in ("industrial", "warehouse", "shed", "hangar"):
        return 2 + seed * 2
    # The old centre is five or six floors, tight together; the suburbs are towers and houses.
    if centre:
        return 5 + round(seed * 3)
    if area > 900:
        return 6 + round(seed * 7)
    if area > 220:
        return 4 + round(seed * 3)
    return 2 + round(seed * 2)


def floor_plan(style, floors, rng):
    """Which module and which atlas cell each floor above the ground gets, bottom to top."""
    plan = []
    for floor in range(1, floors):
        top = floor == floors - 1
        if style == "arcade":
            # The mezzanine is inside the arcade. A long iron balcony runs the whole front above it.
            if floor == 1:
                plan.append(None)
            elif floor == 2 or floor == floors - 2:
                plan.append((BAY_FILANT, RICH if floor == 2 else HOOD))
            else:
                plan.append((BAY_BALCONY, SEGMENT if floor % 2 else HOOD))
        elif style == "grand":
            if floor == 1:
                plan.append((BAY_PLAIN, RUSTIC))
            elif floor == 2:
                plan.append((BAY_FILANT, PEDIMENT))
            elif top or floor == floors - 2:
                plan.append((BAY_FILANT, HOOD))
            else:
                plan.append((BAY_BALCONY, RICH if floor % 2 else SEGMENT))
        elif style == "plain":
            if floor == 1 or top:
                plan.append((BAY_FILANT, HOOD))
            else:
                plan.append((BAY_BALCONY, SEGMENT))
        elif style == "deco":
            plan.append((BAY_FILANT if floor in (2, floors - 2) else BAY_PLAIN, DECO))
        elif style == "moorish":
            plan.append((BAY_BALCONY if floor % 2 == 0 else BAY_PLAIN, MOORISH))
        else:
            plan.append((BAY_BALCONY if rng.random() < 0.2 else BAY_PLAIN, MODERN))
    return plan


def right_of(line):
    """Which way is right of the road at every point of the line, on the map."""
    forward = np.gradient(line[:, :2], axis=0)
    forward /= np.maximum(np.linalg.norm(forward, axis=1, keepdims=True), 1e-6)
    return np.stack([forward[:, 1], -forward[:, 0]], axis=1)


def street_walls(line, width, zone, mouths, spine, scale, rng):
    """
    Walks each side of the streets of the centre laying out blocks of apartment houses, from one
    real junction to the next. Returns the buildings, each a footprint and a table of its bays.
    """
    right = right_of(line)
    count = len(line)
    samples = line[::2, :2].astype(np.float32)
    sample_at = np.arange(0, count, 2)
    heading = np.unwrap(np.arctan2(*np.gradient(line[:, :2], axis=0).T))
    # Turning right makes the heading grow, so a positive turn has its inside on the right.
    turn = np.gradient(heading)
    radius = STEP / np.maximum(np.abs(turn), 1e-6)
    buildings, gaps = [], []
    for row, side, half in mouths:
        gaps.append((row * STEP, side, (half + 3) * 2))
    for side in (-1, 1):
        offset = WALL * width
        front = line[:, :2] + right * (side * offset)[:, None]
        back = line[:, :2] + right * (side * (offset + DEPTH))[:, None]
        wanted = zone == CITY
        # The seafront has its arcades on the landward side, and the bay on the other.
        wanted |= (zone == SEA) & (side == 1)
        # Another stretch of the ride, or a monument, may need this ground.
        free = np.ones(count, bool)
        for start in range(0, count, 400):
            stop = min(start + 400, count)
            for points in (front[start:stop], back[start:stop]):
                d = np.sqrt(((points[:, None, :] - samples[None, :, :]) ** 2).sum(2))
                for row in range(len(points)):
                    index = start + row
                    near_self = np.abs(sample_at - index) < (offset[index] + DEPTH) / STEP + 7
                    if d[row][~near_self].min(initial=1e9) < 24:
                        free[index] = False
        free &= np.hypot(*(front - np.array(POSTE)).T) > POSTE_CLEAR
        free &= np.hypot(*(back - np.array(POSTE)).T) > POSTE_CLEAR
        # A wall folds on the inside of a tight bend: leave that corner open, as a small square.
        free &= ~((radius < offset + DEPTH + 6) & (np.sign(turn) == side))
        # Nor does it stand on any street, whichever way that one's going.
        tangent = np.gradient(front, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-6)
        for share in np.linspace(0, 1, 14):
            for shift in (-2.0, 0.0, 2.0):
                free &= ~raster_at(spine, scale, front + (back - front) * share + tangent * shift)
        # The side streets stay open, with room for their pavements.
        for row, mouth_side, half in mouths:
            if mouth_side == side:
                reach = int(math.ceil((half + 3.5) / STEP))
                free[max(row - reach, 0) : row + reach + 1] = False

        index = 0
        while index < count - 2:
            if not (wanted[index] and free[index]):
                index += 1
                continue
            block_end = index
            run = 0.0
            while block_end < count - 2 and wanted[block_end + 1] and free[block_end + 1]:
                run += float(np.linalg.norm(front[block_end + 1] - front[block_end]))
                block_end += 1
            if run >= 14:
                lay_block(line, front, back, index, block_end, side, zone, rng, buildings)
            index = block_end + 1
    return buildings, gaps


def lay_block(line, front, back, start, stop, side, zone, rng, buildings):
    """Splits a block into buildings, each with its own height and style."""
    index = start
    while index < stop:
        length = rng.uniform(20, 42)
        end = index
        run = 0.0
        while end < stop and run < length:
            run += float(np.linalg.norm(front[end + 1] - front[end]))
            end += 1
        # Nothing narrower than a house: the last scrap joins the one before.
        if stop - end < 3:
            end = stop
        pick = rng.random()
        if zone[index] == SEA:
            style = "arcade"
        elif pick < 0.34:
            style = "grand"
        elif pick < 0.74:
            style = "plain"
        elif pick < 0.88:
            style = "deco"
        else:
            style = "moorish"
        floors = int(rng.integers(6, 9)) if style in ("arcade", "grand") else int(rng.integers(5, 8))
        buildings.append(lay_building(line, front, back, index, end, side, style, floors, rng, index == start, end >= stop))
        index = end


def side_bays(a, b, outward, base, plan, floors, tint, tile, rng):
    """The return of a building down a side street: the same storeys, on its end wall."""
    length = float(np.linalg.norm(b - a))
    columns = max(int(round(length / BAY)), 1)
    span = length / columns
    yaw = math.atan2(outward[0], -outward[1])
    rows = []
    for column in range(columns):
        at = a + (b - a) * ((column + 0.5) / columns)
        x, z = float(at[0]), float(-at[1])
        rows.append((x, base, z, yaw, span, 0, SHUT if rng.random() < 0.5 else SHOP, float(rng.random()), tile, 0, tint))
        for floor, slot in enumerate(plan, start=1):
            kind, cell = slot if slot else (BAY_PLAIN, HOOD)
            rows.append((x, base + GROUND + (floor - 1) * FLOOR, z, yaw, span, floor, BAY_PLAIN if kind == BAY_FILANT else kind, float(rng.random()), tile, cell, tint))
        rows.append((x, base + GROUND + FLOOR * (floors - 1), z, yaw, span, floors, CORNICE, 0.5, tile, 0, tint))
    return rows


def lay_building(line, front, back, start, stop, side, style, floors, rng, first, last):
    """One apartment house: its footprint, and its front bay by bay, floor by floor."""
    path = front[start : stop + 1]
    base = float(line[start : stop + 1, 2].min()) - 0.25
    seed = float(rng.random())
    tint = float(rng.random())
    height = GROUND + FLOOR * (floors - 1)
    mid = path[len(path) // 2]
    tile = (math.floor(mid[0] / KIT_TILE) + 64) + (math.floor(-mid[1] / KIT_TILE) + 64) * 128
    # Walk the front at even steps, so the bays are all alike.
    run = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    columns = max(int(round(run[-1] / BAY)), 1)
    marks = np.linspace(0, run[-1], columns + 1)
    xs = np.interp(marks, run, path[:, 0])
    ys = np.interp(marks, run, path[:, 1])
    rows = []
    plan = floor_plan(style, floors, rng)
    arcade = style == "arcade"
    roof = style in ("arcade", "grand", "plain") and rng.random() < 0.7
    for column in range(columns):
        a = np.array([xs[column], ys[column]])
        b = np.array([xs[column + 1], ys[column + 1]])
        middle = (a + b) / 2
        span = float(np.linalg.norm(b - a))
        along = (b - a) / max(span, 1e-6)
        # Facing the road, which is left of the direction of travel on the right side.
        outward = np.array([along[1], -along[0]]) * (-side)
        yaw = math.atan2(outward[0], -outward[1])
        x, z = float(middle[0]), float(-middle[1])
        shop_seed = float(rng.random())
        if arcade:
            rows.append((x, base, z, yaw, span, 0, ARCADE, shop_seed, tile, 0, tint))
        else:
            rows.append((x, base, z, yaw, span, 0, SHOP if shop_seed < 0.74 else SHUT, float(rng.random()), tile, 0, tint))
        for floor, slot in enumerate(plan, start=1):
            if slot is None:
                continue
            kind, cell = slot
            rows.append((x, base + GROUND + (floor - 1) * FLOOR, z, yaw, span, floor, kind, float(rng.random()), tile, cell, tint))
        top = base + height
        rows.append((x, top, z, yaw, span, floors, CORNICE, seed, tile, 0, tint))
        if roof:
            rows.append((x, top + CORNICE_TALL, z, yaw, span, floors, MANSARD, float(rng.random()), tile, 0, tint))
    tangent_in = front[min(start + 1, stop)] - front[start]
    tangent_out = front[stop] - front[max(stop - 1, start)]
    if first:
        rows += side_bays(front[start], back[start], -tangent_in / max(float(np.linalg.norm(tangent_in)), 1e-6), base, plan, floors, tint, tile, rng)
    if last:
        rows += side_bays(front[stop], back[stop], tangent_out / max(float(np.linalg.norm(tangent_out)), 1e-6), base, plan, floors, tint, tile, rng)

    def outline(inset):
        """The solid mass, far enough behind the fronts that the glass stands clear of it."""
        share = inset / DEPTH
        near = front[start : stop + 1] * (1 - share) + back[start : stop + 1] * share
        far = back[start : stop + 1].copy()
        for row, end, cut in ((0, first, 1.0), (-1, last, -1.0)):
            if not end:
                continue
            tangent = near[1] - near[0] if row == 0 else near[-1] - near[-2]
            shift = tangent / max(float(np.linalg.norm(tangent)), 1e-6) * cut * SETBACK
            near[row] = near[row] + shift
            far[row] = far[row] + shift
        return np.array([*near, *far[::-1]])

    # The walls behind the modules. An arcade's are set back, under the floors that stand over it.
    masses = []
    if arcade:
        masses.append((outline(ARCADE_DEEP + 0.4), base, GROUND + FLOOR))
        masses.append((outline(SETBACK), base + GROUND + FLOOR, height - GROUND - FLOOR + CORNICE_TALL - 0.1))
    else:
        masses.append((outline(SETBACK), base, height + CORNICE_TALL - 0.1))
    if roof:
        masses.append((outline(MANSARD_DEEP), base + height + CORNICE_TALL - 0.1, MANSARD_TALL))
    return {"masses": masses, "solid": outline(SETBACK), "base": base, "height": height + CORNICE_TALL - 0.1, "seed": seed, "rows": rows, "index": (start + stop) // 2}


def main():
    line, width, median, zone = ride_line()
    heights = Heights()
    count = len(line)
    exit_row = int(np.argmax(zone != PLAZA))
    print(f"ride line: {count} points, {(count - 1) * STEP / 1000:.2f} km, off the esplanade at {exit_row * STEP:.0f} m", flush=True)

    nodes, edges, mouths = moto_network.build(line, width, zone, BOUNDS, exit_row)
    sea = sea_mask(heights)
    field, water = height_map(heights, line, width, zone, edges, sea)
    at = ground_sampler(field)
    print(f"ground from {field.min():.0f} to {field.max():.0f} m, {field.shape[1]} by {field.shape[0]}", flush=True)
    # The ride reads its heights from the same surface as everything else.
    line[:, 2] = at(line[:, 0], line[:, 1])

    rng = np.random.default_rng(1830)
    spine, spine_scale = road_raster(edges, spine=True)
    walls, gaps = street_walls(line, width, zone, mouths, spine, spine_scale, rng)
    print(f"{len(walls)} apartment houses on the street walls, {len(gaps)} junctions", flush=True)

    raw = json.load(open(DL / "osm/buildings.json", encoding="utf-8"))["elements"]
    west, south, east, north = BOUNDS
    feet, kept = [], []
    for way in raw:
        geometry = way.get("geometry")
        if not geometry or len(geometry) < 4:
            continue
        pts = np.array([to_xy(p["lat"], p["lon"]) for p in geometry[:-1]])
        centre = pts.mean(0)
        if not (west < centre[0] < east and south < centre[1] < north):
            continue
        feet.append(pts)
        kept.append(way.get("tags", {}))
    centres = np.array([f.mean(0) for f in feet])
    gaps_to_road, nearest = nearest_on_line(centres, line)
    on_road, scale = road_raster(edges)
    print(f"{len(feet)} buildings", flush=True)

    near_tiles, far_tiles = {}, {}
    rights = right_of(line)
    letters_row = int((count - 1) - LETTERS_BACK / STEP)
    letters = line[letters_row, :2] + rights[letters_row] * 44

    def road_at(points):
        return raster_at(on_road, scale, points)

    def ground_tile(index):
        return int(index * STEP / TILE)

    def kit_tile(x, y):
        return (math.floor(x / KIT_TILE) + 64) + (math.floor(-y / KIT_TILE) + 64) * 128

    def add_prism(bucket, pts, base, height, seed, plain_walls):
        """A footprint raised into walls and a flat roof. U runs round in metres, v up the wall."""
        start = bucket[4]
        run = 0.0
        verts, uv, tag, faces = [], [], [], []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            length = float(np.linalg.norm(b - a))
            n = len(verts) + start
            verts += [(a[0], a[1], base), (b[0], b[1], base), (b[0], b[1], base + height), (a[0], a[1], base + height)]
            uv += [(run, 0.0), (run + length, 0.0), (run + length, height), (run, height)]
            tag += [(seed, 0.5 if i in plain_walls else 0.0)] * 4
            faces += [(n, n + 1, n + 2), (n, n + 2, n + 3)]
            run += length
        n = len(verts) + start
        for p in pts:
            verts.append((p[0], p[1], base + height))
            uv.append((0.0, 0.0))
            tag.append((seed, 1.0))
        for a, b, c in ear_clip([tuple(p) for p in pts]):
            faces.append((n + a, n + b, n + c))
        bucket[0].extend(verts)
        bucket[1].extend(uv)
        bucket[2].extend(tag)
        bucket[3].extend(faces)
        bucket[4] += len(verts)

    def counter_clockwise(pts):
        x, y = pts[:, 0], pts[:, 1]
        area = 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
        return (pts[::-1], -area) if area < 0 else (pts, area)

    # Every solid thing on the map, for riding into. A ring of corners each, with what the game
    # needs to dress its walls: how many floors, a seed, and which walls look onto a street.
    rings = []

    def solid(pts, base, floors, seed, style, facing):
        rings.append((np.asarray(pts, float), float(base), int(floors), float(seed), int(style), facing))

    bays = []
    for building in walls:
        bucket = near_tiles.setdefault(ground_tile(building["index"]), [[], [], [], [], 0])
        for mass, low, tall in building["masses"]:
            pts, _ = counter_clockwise(mass)
            add_prism(bucket, pts, low, tall, building["seed"], ())
        bays.extend(building["rows"])
        ring, _ = counter_clockwise(building["solid"])
        solid(ring, building["base"], 0, building["seed"], 0, [False] * len(ring))
        # The dishes behind the parapets.
        for _ in range(2):
            spot = ring[int(rng.integers(len(ring)))] * 0.6 + ring.mean(0) * 0.4
            bays.append((spot[0], building["base"] + building["height"], -spot[1], float(rng.random() * 0.8 + 2.2), 1.0, 0, DISH, float(rng.random()), kit_tile(spot[0], spot[1]), 0, 0.5))

    def raise_building(pts, floors, seed, central):
        """One building: its walls for the distance, and its ring for riding into and dressing."""
        centre = pts.mean(0)
        height = GROUND + (floors - 1) * FLOOR + CORNICE_TALL - 0.1
        base = float(at(pts[:, 0], pts[:, 1]).min()) - 0.6
        bucket = far_tiles.setdefault((int(centre[0] // FAR_TILE), int(centre[1] // FAR_TILE)), [[], [], [], [], 0])
        # Which walls look onto a street: those get real windows and balconies as the rider nears.
        facing = []
        plain_walls = set()
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            length = float(np.linalg.norm(b - a))
            sees = False
            if length >= 3.2:
                outward = np.array([b[1] - a[1], -(b[0] - a[0])]) / length
                march = (a + b) / 2 + outward[None, :] * np.array([3.0, 8.0, 14.0, 22.0, 32.0])[:, None]
                sees = bool(road_at(march).any())
            facing.append(sees)
            if sees:
                plain_walls.add(i)
        add_prism(bucket, pts, base, height, seed, plain_walls)
        solid(pts, base, floors, seed, 1 if central else 0, facing)

    dropped = 0
    for pts, tags, gap, nearest_index in zip(feet, kept, gaps_to_road, nearest):
        centre = pts.mean(0)
        wall_gaps, closest = nearest_on_line(pts, line) if gap < 120 else (np.array([gap]), np.array([nearest_index]))
        which = int(closest[int(np.argmin(wall_gaps))])
        here = int(zone[which])
        clear = ROAD_CLEAR * float(width[which])
        if here in (CITY, SEA):
            # The street walls stand here now.
            clear = WALL * float(width[which]) + DEPTH + 3
        tall_tag = tags.get("height", "")
        seaward = here == SEA and float((centre - line[which, :2]) @ rights[which]) < 0
        probes = np.vstack([pts, centre[None, :]])
        if (
            wall_gaps.min() < clear
            or (seaward and gap < 90)
            or at(centre[0], centre[1]) < -1
            or math.dist(centre, MAQAM) < MAQAM_CLEAR
            or math.dist(centre, POSTE) < POSTE_CLEAR
            or math.dist(centre, letters) < LETTERS_CLEAR
            or (MOSQUE_BOX[0] < centre[0] < MOSQUE_BOX[2] and MOSQUE_BOX[1] < centre[1] < MOSQUE_BOX[3])
            or (tall_tag.replace(".", "").isdigit() and float(tall_tag) > 60)
            or road_at(centre[None, :])[0]
            or road_at(probes).sum() >= 3
            or raster_at(spine, spine_scale, round_the_walls(pts)).any()
        ):
            dropped += 1
            continue
        pts, area = counter_clockwise(pts)
        if area < 12:
            continue
        seed = float(rng.random())
        central = centre[0] < 400
        raise_building(pts, min(int(levels_for(tags, area, seed, central)), 12), seed, central)

    # The streets the map left bare.
    taken, taken_scale = taken_ground(edges, [ring[0] for ring in rings])
    extra = bare_streets(edges, taken, taken_scale, at, rng)
    for ring in extra:
        pts, _ = counter_clockwise(ring)
        centre = pts.mean(0)
        seed = float(rng.random())
        central = centre[0] < 400
        raise_building(pts, int(rng.integers(4, 8)) if central else int(rng.integers(3, 7)), seed, central)
    print(f"{len(extra)} houses added along bare streets", flush=True)

    # The monuments, solid too.
    plan = json.load(open(BUILD / "mosque.json"))
    for part in plan["mosque"]:
        if part["role"] == "outer":
            ring, _ = counter_clockwise(np.array(part["pts"], float))
            solid(ring, 0.0, 0, 0.5, 0, [False] * len(ring))

    def square(cx, cy, half, turn):
        c, s = math.cos(turn), math.sin(turn)
        return np.array([(cx + (x * c - y * s) * half, cy + (x * s + y * c) * half) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))])

    turn = math.atan2(0.74, 0.56) - math.pi / 2
    c, s = math.cos(turn), math.sin(turn)
    poste = np.array([(POSTE[0] + u * c - v * s, POSTE[1] + u * s + v * c) for u, v in ((-33, -22), (33, -22), (33, 22), (-33, 22))])
    for ring in (poste, square(4276.0, -3252.0, 21.0, math.radians(-16)), square(-4227.0, 4012.0, 18.0, math.radians(20)), square(-2623.0, 2233.0, 19.0, 0.0)):
        solid(ring, 0.0, 0, 0.5, 0, [False] * len(ring))

    arrays = {}
    total = {"near": 0, "far": 0}
    for name, tiles in (("near", near_tiles), ("far", far_tiles)):
        for key, (verts, uv, tag, faces, _) in tiles.items():
            label = f"{name}_{key if isinstance(key, int) else f'{key[0]}_{key[1]}'}"
            arrays[f"{label}.v"] = np.array(verts, np.float32)
            arrays[f"{label}.uv"] = np.array(uv, np.float32)
            arrays[f"{label}.tag"] = np.array(tag, np.float32)
            arrays[f"{label}.f"] = np.array(faces, np.int32)
            total[name] += len(faces)
    print(f"dropped {dropped} from the roads, the sea and the monuments; triangles {total}", flush=True)
    # Sorted by stretch of road, so each stretch can be drawn or skipped as a whole.
    bays.sort(key=lambda bay: (bay[8], bay[6]))
    table = np.array(bays, np.float32)
    kinds = np.bincount(table[:, 6].astype(int), minlength=9)
    print(f"facade modules on the street walls: {len(table)}, by kind {kinds.tolist()}", flush=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    table.tofile(PUBLIC / "facade.bin")
    np.savez_compressed(BUILD / "city.npz", **arrays)
    moto_network.pack(nodes, edges).tofile(PUBLIC / "network.bin")

    # The rings: two header words, then four numbers a building, then each corner, then a flag each.
    corners = sum(len(ring[0]) for ring in rings)
    meta = np.zeros((len(rings), 4), np.int16)
    points = np.zeros((corners, 2), np.int16)
    flags = np.zeros(corners, np.uint8)
    at_corner = 0
    for index, (pts, base, floors, seed, style, facing) in enumerate(rings):
        n = len(pts)
        meta[index] = (n, floors + style * 64, int(seed * 32767), int(base * 10))
        points[at_corner : at_corner + n, 0] = np.round(pts[:, 0] * 4)
        points[at_corner : at_corner + n, 1] = np.round(-pts[:, 1] * 4)
        flags[at_corner : at_corner + n] = np.array(facing, np.uint8)
        at_corner += n
    with open(PUBLIC / "buildings.bin", "wb") as out:
        np.array([len(rings), corners], np.int32).tofile(out)
        meta.tofile(out)
        points.tofile(out)
        flags.tofile(out)
    print(f"solid: {len(rings)} rings, {corners} corners, {(PUBLIC / 'buildings.bin').stat().st_size / 1e6:.2f} MB; network {(PUBLIC / 'network.bin').stat().st_size / 1e6:.2f} MB", flush=True)

    # Height, as 16 bits across red and green, the way the last game stored it.
    low, high = float(field.min()), float(field.max())
    code = ((field - low) / (high - low) * 65535).astype(np.uint32)
    rgb = np.zeros((*field.shape, 3), np.uint8)
    rgb[..., 0], rgb[..., 1] = code >> 8, code & 255
    Image.fromarray(rgb).save(PUBLIC / "ground.png", optimize=True)
    print(f"height map {(PUBLIC / 'ground.png').stat().st_size / 1e6:.2f} MB", flush=True)

    # The ride line in game axes: east, up, south.
    ride = np.stack([line[:, 0], line[:, 2], -line[:, 1]], axis=1).round(2)
    json.dump(
        {
            "step": STEP,
            "ride": ride.ravel().tolist(),
            "width": width.round(3).tolist(),
            "median": median.round(3).tolist(),
            "zone": zone.tolist(),
            "gaps": [[round(a, 1), s, round(g, 1)] for a, s, g in gaps],
            "bounds": list(BOUNDS),
            "ground": [low, high],
            "mapStep": MAP_STEP,
        },
        open(ROOT / "src/content/moto-city.json", "w"),
        separators=(",", ":"),
    )
    print("wrote the height map and the ride line", flush=True)


if __name__ == "__main__":
    main()

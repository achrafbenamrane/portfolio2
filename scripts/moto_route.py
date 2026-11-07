"""
Finds the ride through real Algiers. It starts on the esplanade of Maqam Echahid, passes under the
fronds and laps the monument, drops off the hill through Belcourt, runs up Didouche Mourad into the
old centre, round the Grande Poste, along Larbi Ben M'Hidi, back down the seafront on Boulevard
Zighoud Youcef, then along the bay on the Avenue de l'ALN to the Great Mosque.

It walks OpenStreetMap's road network between named streets. A few junctions are redrawn by hand,
because the map's are square corners and one-way loops, and a ride can't cross itself.

    python -I scripts/moto_route.py

Reads assets-source/moto/dl, writes assets-source/moto/build/route.json. Map data is
(c) OpenStreetMap contributors, ODbL.
"""

import heapq
import json
import math
import site
import sys
from pathlib import Path

sys.path.append(site.getusersitepackages())
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DL = ROOT / "assets-source/moto/dl"
BUILD = ROOT / "assets-source/moto/build"
LAT0, LON0 = 36.765, 3.09
METRES = 111320.0
MAQAM_XY = (-1808.0, -2147.0)
MAQAM_LEVEL = 122.0
# The lap of the monument, in metres from its axis: in between two fronds from the south, past the
# flame, out by the north-east gap, then round the back of the north frond and away to the west.
LAP = [(14, -205), (13, -150), (13, -100), (14, -55), (19, -18), (30, 14), (47, 40), (56, 62), (40, 84), (6, 94), (-34, 86), (-70, 66), (-112, 44), (-160, 28)]
# The ride, leg by leg: walk the map to a point on a named street, or go straight to a point.
LEGS = [
    ("line", None, (-2127, -2140)),
    ("line", None, (-2288, -1956)),
    ("line", None, (-2391, -1507)),
    ("walk", "Belouizdad Mohamed", (-2794, -967)),
    ("line", None, (-2900, -700)),
    ("line", None, (-2960, -430)),
    ("walk", "Hassiba", (-3020, 500)),
    ("walk", "Didouche", (-2895, 735)),
    ("line", None, (-2770, 760)),
    ("line", None, (-2652, 772)),
    ("line", None, (-2626, 802)),
    ("line", None, (-2700, 880)),
    ("line", None, (-2806, 938)),
    ("line", None, (-2778, 1000)),
    ("line", None, (-2800, 1130)),
    ("line", None, (-2838, 1290)),
    ("line", None, (-2882, 1470)),
    ("line", None, (-2868, 1570)),
    ("line", None, (-2800, 1645)),
    ("line", None, (-2690, 1690)),
    ("line", None, (-2590, 1722)),
    ("line", None, (-2542, 1690)),
    ("line", None, (-2588, 1520)),
    ("line", None, (-2640, 1390)),
    ("line", None, (-2652, 1290)),
    ("line", None, (-2628, 1140)),
    ("line", None, (-2582, 920)),
    ("line", None, (-2568, 820)),
    ("line", None, (-2570, 700)),
    ("line", None, (-2640, 620)),
    ("line", None, (-2740, 547)),
    ("line", None, (-2787, 427)),
    ("line", None, (-2840, 267)),
    ("line", None, (-2884, 80)),
    ("line", None, (-2880, -13)),
    ("line", None, (-2827, -160)),
    ("line", None, (-2760, -267)),
    ("line", None, (-2660, -387)),
    ("line", None, (-2473, -600)),
    ("walk", "ALN", (-2007, -1054)),
    ("walk", "", (2470, -3190)),
    # The map's way off the ALN is a motorway cloverleaf. A ride wants one long sweep instead.
    ("line", None, (2570, -3240)),
    ("line", None, (2650, -3262)),
    ("line", None, (2735, -3230)),
    ("line", None, (2805, -3130)),
    ("line", None, (2880, -3005)),
    ("line", None, (3000, -2905)),
    ("line", None, (3150, -2855)),
    ("line", None, (3350, -2885)),
    ("line", None, (3700, -2960)),
    ("line", None, (4125, -3055)),
]
ZOOM = 14
LOVED = ("Belouizdad Mohamed", "Hassiba", "Didouche", "ALN", "Moutonn", "Sablettes")


def to_xy(lat, lon):
    return (lon - LON0) * METRES * math.cos(math.radians(LAT0)), (lat - LAT0) * METRES


class Heights:
    """The terrain tiles, stitched: height in metres at any point."""

    def __init__(self):
        self.tiles = {}
        for path in (DL / "dem").glob(f"{ZOOM}_*.png"):
            _, x, y = path.stem.split("_")
            self.tiles[(int(x), int(y))] = path
        xs = sorted({k[0] for k in self.tiles})
        ys = sorted({k[1] for k in self.tiles})
        self.x0, self.y0 = xs[0], ys[0]
        self.grid = np.zeros(((ys[-1] - ys[0] + 1) * 256, (xs[-1] - xs[0] + 1) * 256), np.float32)
        for (x, y), path in self.tiles.items():
            rgb = np.asarray(Image.open(path).convert("RGB"), np.float32)
            height = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
            r, c = (y - self.y0) * 256, (x - self.x0) * 256
            self.grid[r : r + 256, c : c + 256] = height

    def at(self, lat, lon):
        n = 2**ZOOM
        fx = ((lon + 180) / 360 * n - self.x0) * 256
        rad = math.radians(lat)
        fy = ((1 - math.log(math.tan(rad) + 1 / math.cos(rad)) / math.pi) / 2 * n - self.y0) * 256
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        g = self.grid
        return float((g[y0, x0] * (1 - tx) + g[y0, x0 + 1] * tx) * (1 - ty) + (g[y0 + 1, x0] * (1 - tx) + g[y0 + 1, x0 + 1] * tx) * ty)


def graph():
    roads = json.load(open(DL / "osm/roads.json", encoding="utf-8"))["elements"]
    roads += json.load(open(DL / "osm/minor.json", encoding="utf-8"))["elements"]
    edges, points, named = {}, {}, {}
    for way in roads:
        tags = way.get("tags", {})
        geometry = way.get("geometry")
        if not geometry:
            continue
        kind = tags.get("highway", "")
        name = tags.get("name:fr", "") + " " + tags.get("name", "")
        # The streets we came for cost least, so the walk keeps to them.
        favour = 2.2
        if any(key in name for key in LOVED):
            favour = 0.35
        elif kind.startswith(("motorway", "trunk", "primary")):
            favour = 0.9
        elif kind.startswith(("secondary", "tertiary")):
            favour = 1.3
        keys = [(round(p["lat"], 6), round(p["lon"], 6)) for p in geometry]
        for a, b in zip(keys, keys[1:]):
            length = math.dist(to_xy(*a), to_xy(*b))
            edges.setdefault(a, []).append((b, length * favour, length))
            edges.setdefault(b, []).append((a, length * favour, length))
            points[a], points[b] = to_xy(*a), to_xy(*b)
        named.setdefault(name, []).extend(keys)
    return edges, points, named


def nearest(points, target):
    return min(points, key=lambda key: math.dist(points[key], target))


def shortest(edges, start, goal):
    best = {start: 0.0}
    came = {}
    queue = [(0.0, start)]
    while queue:
        cost, at = heapq.heappop(queue)
        if at == goal:
            break
        if cost > best.get(at, 1e18):
            continue
        for nxt, weight, _ in edges.get(at, ()):
            total = cost + weight
            if total < best.get(nxt, 1e18):
                best[nxt] = total
                came[nxt] = at
                heapq.heappush(queue, (total, nxt))
    path = [goal]
    while path[-1] != start:
        path.append(came[path[-1]])
    return path[::-1]


def on_street(named, points, street, target):
    if not street:
        return nearest(points, target)
    candidates = [key for name, keys in named.items() if street in name for key in keys]
    return min(candidates, key=lambda key: math.dist(points[key], target))


def main():
    edges, points, named = graph()
    heights = Heights()
    line = [(MAQAM_XY[0] + x, MAQAM_XY[1] + y, MAQAM_LEVEL) for x, y in LAP]

    def height_at(x, y):
        return heights.at(LAT0 + y / METRES, LON0 + x / (METRES * math.cos(math.radians(LAT0))))

    at = None
    for how, street, target in LEGS:
        if how == "line":
            line.append((target[0], target[1], height_at(*target)))
            at = None
            continue
        goal = on_street(named, points, street, target)
        if at is None:
            at = nearest(points, line[-1][:2])
        for key in shortest(edges, at, goal)[1:]:
            line.append((*points[key], heights.at(*key)))
        at = goal
    line = np.array(line)
    # Doubled-back points would fold the road: keep only those that move on.
    keep = [0]
    for index in range(1, len(line)):
        if math.dist(line[index, :2], line[keep[-1], :2]) > 2.0:
            keep.append(index)
    line = line[keep]
    length = np.linalg.norm(np.diff(line[:, :2], axis=0), axis=1).sum()
    print(f"route: {len(line)} points, {length / 1000:.2f} km, height {line[:, 2].min():.0f} to {line[:, 2].max():.0f} m")
    BUILD.mkdir(parents=True, exist_ok=True)
    json.dump({"origin": [LAT0, LON0], "line": line.round(2).tolist()}, open(BUILD / "route.json", "w"))


if __name__ == "__main__":
    main()

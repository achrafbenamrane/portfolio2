"""
The streets of Algiers as one connected network, for riding anywhere. It takes every road on the
map, cuts them at their junctions, and joins them to the main ride line, which runs wider than the
map's own streets: anything that only doubles it is dropped, and every street that meets it gets a
real junction on it, so the ride's buildings can stop there and leave the side street open.

Imported by scripts/moto_city.py, never run. Map data is (c) OpenStreetMap contributors, ODbL.
"""

import json
import math
from collections import Counter

import numpy as np

from moto_route import DL, MAQAM_XY as MAQAM, to_xy

# Half the carriageway, in metres. A dual road is two ways on the map, so each is one side of it.
HALF = {
    "motorway": 6.2,
    "trunk": 6.0,
    "primary": 6.0,
    "secondary": 5.2,
    "tertiary": 4.6,
    "unclassified": 3.8,
    "residential": 3.6,
    "living_street": 3.0,
    "motorway_link": 3.8,
    "trunk_link": 3.8,
    "primary_link": 3.8,
    "secondary_link": 3.6,
    "tertiary_link": 3.4,
}
CODES = {name: index for index, name in enumerate(HALF)}
HERO, PLAZA_EDGE = 20, 21
STEP = 6.0
# Where the ride's own road stands, as a share of its width: the pavement's outer edge.
CORRIDOR = 21.0
POSTE = (-2809.0, 835.0)
POSTE_RADIUS = 68.0
STAGE_RADIUS = 236.0
MOSQUE_BOX = (4230.0, -3560.0, 4760.0, -3190.0)


def load_ways(bounds):
    west, south, east, north = bounds
    seen = set()
    ways = []
    for path in (DL / "osm/roads.json", DL / "osm/minor.json", DL / "world/streets.json"):
        for way in json.load(open(path, encoding="utf-8"))["elements"]:
            tags = way.get("tags", {})
            geometry = way.get("geometry")
            ident = way.get("id")
            if ident in seen or not geometry or len(geometry) < 2:
                continue
            seen.add(ident)
            kind = tags.get("highway", "")
            # A tunnel runs under the ground this city is drawn on.
            if kind not in HALF or tags.get("tunnel", "no") not in ("no",) or tags.get("area") == "yes" or tags.get("access") == "private":
                continue
            keys = [(round(p["lat"], 6), round(p["lon"], 6)) for p in geometry]
            points = [to_xy(*key) for key in keys]
            ways.append((keys, points, kind))
    return ways


def cut_at_junctions(ways, bounds):
    """Each way is cut wherever another touches it, and wherever it leaves the map."""
    west, south, east, north = bounds
    touches = Counter()
    for keys, _, _ in ways:
        for key in set(keys):
            touches[key] += 1
        touches[keys[0]] += 1
        touches[keys[-1]] += 1
    edges = []
    for keys, points, kind in ways:
        run = []
        for key, point in zip(keys, points):
            inside = west + 60 < point[0] < east - 60 and south + 60 < point[1] < north - 60
            if not inside:
                if len(run) > 1:
                    edges.append((run, kind))
                run = []
                continue
            run.append((key, point))
            if touches[key] >= 2 and len(run) > 1:
                edges.append((run, kind))
                run = [(key, point)]
        if len(run) > 1:
            edges.append((run, kind))
    return edges


def resample(points, step):
    points = np.asarray(points, float)
    gaps = np.linalg.norm(np.diff(points, axis=0), axis=1)
    keep = np.concatenate([[True], gaps > 0.01])
    points = points[keep]
    if len(points) < 2:
        return points
    run = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))])
    count = max(int(round(run[-1] / step)), 1)
    at = np.linspace(0, run[-1], count + 1)
    return np.stack([np.interp(at, run, points[:, 0]), np.interp(at, run, points[:, 1])], axis=1)


def soften(points):
    """Takes the kinks out of a mapped line, holding its two ends exactly where they are."""
    if len(points) < 6:
        return points
    out = points.copy()
    kernel = np.array([1, 4, 6, 4, 1], float) / 16
    # Several light passes: a real road has no corners, but it does go where the map says.
    for _ in range(4):
        before = out.copy()
        for axis in range(2):
            padded = np.pad(before[:, axis], 2, mode="reflect", reflect_type="odd")
            out[:, axis] = np.convolve(padded, kernel, mode="valid")
        out[0], out[-1] = points[0], points[-1]
    return out


def nearest_rows(samples, rows):
    """For each sample, the nearest row of the ride line and how far it is."""
    best = np.zeros(len(samples), np.int32)
    gap = np.zeros(len(samples), np.float32)
    table = rows.astype(np.float32)
    for start in range(0, len(samples), 2000):
        chunk = samples[start : start + 2000].astype(np.float32)
        d = ((chunk[:, None, :] - table[None, :, :]) ** 2).sum(2)
        index = d.argmin(1)
        best[start : start + 2000] = index
        gap[start : start + 2000] = np.sqrt(d[np.arange(len(chunk)), index])
    return best, gap


def blocked(points):
    """Ground the map's roads don't cross: the esplanade, the Poste's square, the mosque's grounds."""
    x, y = points[:, 0], points[:, 1]
    west, south, east, north = MOSQUE_BOX
    return (np.hypot(x - MAQAM[0], y - MAQAM[1]) < STAGE_RADIUS) | (np.hypot(x - POSTE[0], y - POSTE[1]) < POSTE_RADIUS) | ((x > west) & (x < east) & (y > south) & (y < north))


def build(line, width, zone, bounds, exit_row):
    """Returns the nodes as a list of (x, y), edges as dicts, and the junctions on the ride."""
    ways = load_ways(bounds)
    raw = cut_at_junctions(ways, bounds)
    print(f"map: {len(ways)} ways, cut into {len(raw)} pieces", flush=True)

    rows = line[:, :2]
    forward = np.gradient(rows, axis=0)
    forward /= np.maximum(np.linalg.norm(forward, axis=1, keepdims=True), 1e-6)
    right = np.stack([forward[:, 1], -forward[:, 0]], axis=1)

    pieces = []
    for run, kind in raw:
        pieces.append((run[0][0], run[-1][0], resample([p for _, p in run], STEP), kind))
    every = np.concatenate([p[2] for p in pieces])
    row_of, gap_of = nearest_rows(every, rows)
    print(f"{len(every)} samples", flush=True)

    node_ids = {}
    nodes = []

    def node(key, point):
        if key not in node_ids:
            node_ids[key] = len(nodes)
            nodes.append((float(point[0]), float(point[1])))
        return node_ids[key]

    ride_rows = {}
    mouths = []
    edges = []
    at = 0
    for start_key, end_key, points, kind in pieces:
        count = len(points)
        rows_here = row_of[at : at + count]
        gaps_here = gap_of[at : at + count]
        at += count
        if count < 2:
            continue
        way = np.gradient(points, axis=0)
        way /= np.maximum(np.linalg.norm(way, axis=1, keepdims=True), 1e-6)
        along = np.abs((way * forward[rows_here]).sum(1))
        corridor = CORRIDOR * width[rows_here] + 1
        # Inside the ride's own road, or running alongside it: that's the same street on the map.
        doubled = (gaps_here < corridor) | ((gaps_here < corridor + 20) & (along > 0.82))
        stopped = blocked(points)
        keep = ~doubled & ~stopped
        index = 0
        while index < count:
            if not keep[index]:
                index += 1
                continue
            stop = index
            while stop + 1 < count and keep[stop + 1]:
                stop += 1
            part = points[index : stop + 1]
            length = float(np.linalg.norm(np.diff(part, axis=0), axis=1).sum()) if len(part) > 1 else 0.0
            joins = []
            for end, neighbour, inner in ((0, index - 1, index), (1, stop + 1, stop)):
                if 0 <= neighbour < count and doubled[neighbour] and not stopped[neighbour]:
                    joins.append((end, int(rows_here[neighbour])))
            if length >= 18 or len(joins) == 2:
                part = part.copy()
                a = node(start_key, part[0]) if index == 0 else None
                b = node(end_key, part[-1]) if stop == count - 1 else None
                for end, row in joins:
                    if zone[row] == 0:
                        continue
                    centre = rows[row]
                    outward = (part[0] if end == 0 else part[-1]) - centre
                    side = 1 if float(outward @ right[row]) >= 0 else -1
                    mouths.append((row, side, HALF[kind]))
                    ride_rows.setdefault(row, None)
                    ident = node(("ride", row), centre)
                    if end == 0:
                        part = np.vstack([centre, part])
                        a = ident
                    else:
                        part = np.vstack([part, centre])
                        b = ident
                if a is None:
                    a = node(("end", len(nodes)), part[0])
                if b is None:
                    b = node(("end", len(nodes)), part[-1])
                edges.append({"a": a, "b": b, "pts": soften(resample(part, STEP)), "kind": CODES[kind], "half": HALF[kind]})
            index = stop + 1

    # The ride itself, cut at its junctions. Its esplanade counts for finding the way, not for drawing.
    cuts = sorted({0, exit_row, len(rows) - 1, *ride_rows})
    for key_a, key_b in zip(cuts, cuts[1:]):
        a = node(("ride", key_a), rows[key_a])
        b = node(("ride", key_b), rows[key_b])
        kind = PLAZA_EDGE if key_b <= exit_row else HERO
        half = 13.25 * float(width[key_a : key_b + 1].mean())
        edges.append({"a": a, "b": b, "pts": rows[key_a : key_b + 1].copy(), "kind": kind, "half": half})

    # Only what's connected to the ride can be reached.
    parent = list(range(len(nodes)))

    def find(item):
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    for edge in edges:
        parent[find(edge["a"])] = find(edge["b"])
    main = find(node_ids[("ride", 0)])
    joined = [edge for edge in edges if find(edge["a"]) == main]
    total = sum(float(np.linalg.norm(np.diff(e["pts"], axis=0), axis=1).sum()) for e in joined)
    print(f"network: {len(nodes)} nodes, {len(joined)} of {len(edges)} edges joined up, {total / 1000:.0f} km, {len(mouths)} junctions on the ride", flush=True)
    return nodes, joined, mouths


def pack(nodes, edges):
    """As one run of floats: how many edges, then each edge's two nodes, kind, half width and line."""
    out = [float(len(edges))]
    for edge in edges:
        pts = simplify(edge["pts"], 0.5 if edge["kind"] < HERO else 0.08)
        out += [edge["a"], edge["b"], edge["kind"], edge["half"], len(pts)]
        out += pts.ravel().tolist()
    return np.array(out, np.float32)


def simplify(points, tolerance):
    """Drops points that don't change the line by more than the tolerance."""
    keep = np.zeros(len(points), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = points[a], points[b]
        d = q - p
        size = math.hypot(*d) or 1.0
        rel = points[a + 1 : b] - p
        off = np.abs(rel[:, 0] * d[1] - rel[:, 1] * d[0]) / size
        worst = int(off.argmax())
        if off[worst] > tolerance:
            mid = a + 1 + worst
            keep[mid] = True
            stack += [(a, mid), (mid, b)]
    return points[keep]

"""
The people on the pavements of Alger la Nuit: five ordinary figures on an evening street, walking
and standing, written out as a vertex animation for the game to play on as many of them as it wants.

They come from the same CC0 MakeHuman data the chef was made from, not from chef.blend itself: that
body is a young man with a head fitted to the portrait, so everyone in the city would have had his
face. Each one here is its own body, male or female, young or older, dressed in MakeHuman's own
clothes, which fit any body through their .mhclo files. The rig, and `aim` and `reach`, are the
rider's. What MakeHuman doesn't have is made here: the hijab and the skirts of the long coats.

A coat's skirt isn't skinned to anything. Each frame it's wrapped round where the legs are, so a
stride pushes it out, and it trails a little behind them.

    B --background --python scripts/blender/build_moto_people.py -- <repo root> [look <out dir> [cast numbers]]

`look` renders a sheet of each figure instead. Writes public/moto/city/people.bin and people.webp.
Needs assets-source/pizza/human/dl/mpfb.zip and system.zip: see scripts/blender/README.md.
"""

import gzip
import json
import math
import os
import re
import struct
import sys
import zipfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import script_args, select_only  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
MODE = args[1] if len(args) > 1 else "export"
LOOK_DIR = os.path.abspath(args[2]) if len(args) > 2 else ""
ONLY = [int(n) for n in args[3].split(",")] if len(args) > 3 else None
HUMAN = os.path.join(ROOT, "assets-source/pizza/human/dl")
BUILD = os.path.join(ROOT, "assets-source/moto/build/people")
os.makedirs(BUILD, exist_ok=True)

mpfb = zipfile.ZipFile(os.path.join(HUMAN, "mpfb.zip"))
system = zipfile.ZipFile(os.path.join(HUMAN, "system.zip"))
DATA = mpfb.namelist()[0] + "src/mpfb/data/"

WALK_FRAMES = 16
IDLE_FRAMES = 5
# What each part of a person is drawn in: the game fills these from its palette, person by person.
SKIN, TOP, UNDER, BOTTOM, SHOES, HAIR, SCARF, EYE = range(8)
# The sheet of fabric and skin detail: one tile per figure.
TILE_W, TILE_H = 512, 256
SHEET_COLUMNS = 2


def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def smooth_array(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ── MakeHuman's data ─────────────────────────────────────────────────────────────────────────


def parse_obj(text):
    """Vertices, UVs and polygons, with the group each polygon is in."""
    vertices, uvs, polygons, groups = [], [], [], []
    group = ""
    for line in text.splitlines():
        if line.startswith("v "):
            vertices.append([float(n) for n in line.split()[1:4]])
        elif line.startswith("vt "):
            uvs.append([float(n) for n in line.split()[1:3]])
        elif line.startswith("g "):
            group = line[2:].strip()
        elif line.startswith("f "):
            corners = [corner.split("/") for corner in line.split()[1:]]
            polygons.append([(int(c[0]) - 1, int(c[1]) - 1 if len(c) > 1 and c[1] else -1) for c in corners])
            groups.append(group)
    return np.array(vertices, np.float64), np.array(uvs, np.float64), polygons, groups


BASE, BASE_UVS, BASE_POLYGONS, BASE_GROUPS = parse_obj(mpfb.read(DATA + "3dobjs/base.obj").decode())
BODY_POLYGONS = [polygon for polygon, group in zip(BASE_POLYGONS, BASE_GROUPS) if group == "body"]
BODY_VERTS = sorted({i for polygon in BODY_POLYGONS for i, _ in polygon})
TARGETS = {}


def read_target(name):
    if name not in TARGETS:
        rows = []
        for line in gzip.decompress(mpfb.read(DATA + f"targets/macrodetails/{name}.target.gz")).decode().splitlines():
            if line and line[0] != "#":
                rows.append(line.split()[:4])
        # The average body is the base mesh, so its targets are empty.
        table = np.array(rows, np.float64).reshape(-1, 4)
        TARGETS[name] = (table[:, 0].astype(np.int64), table[:, 1:4])
    return TARGETS[name]


def shaped(mix):
    base = BASE.copy()
    for name, weight in mix:
        index, offsets = read_target(name)
        base[index] += weight * offsets
    return base


RIG = json.loads(mpfb.read(DATA + "rigs/standard/rig.default.json"))
CUBES = {}
for polygon, group in zip(BASE_POLYGONS, BASE_GROUPS):
    if group.startswith("joint-"):
        CUBES.setdefault(group, set()).update(i for i, _ in polygon)


def bone_table():
    """The rig's own bones, by name: where each joint is read from, and what it hangs from."""
    joints = {
        "Hips": (("spine05", "head"), ("spine04", "head")),
        "Spine": (("spine04", "head"), ("spine02", "head")),
        "Chest": (("spine02", "head"), ("neck01", "head")),
        "Neck": (("neck01", "head"), ("head", "head")),
        "Head": (("head", "head"), ("head", "tail")),
    }
    parents = {"Hips": "Root", "Spine": "Hips", "Chest": "Spine", "Neck": "Chest", "Head": "Neck"}
    rolls = {}
    for tag, side in (("L", ".L"), ("R", ".R")):
        joints[f"UpperArm{tag}"] = ((f"upperarm01{side}", "head"), (f"lowerarm01{side}", "head"))
        joints[f"ForeArm{tag}"] = ((f"lowerarm01{side}", "head"), (f"wrist{side}", "head"))
        joints[f"Hand{tag}"] = ((f"wrist{side}", "head"), (f"finger3-1{side}", "head"))
        joints[f"Thigh{tag}"] = ((f"upperleg01{side}", "head"), (f"lowerleg01{side}", "head"))
        joints[f"Shin{tag}"] = ((f"lowerleg01{side}", "head"), (f"foot{side}", "head"))
        joints[f"Foot{tag}"] = ((f"foot{side}", "head"), (f"toe3-1{side}", "head"))
        parents.update({f"UpperArm{tag}": "Chest", f"ForeArm{tag}": f"UpperArm{tag}", f"Hand{tag}": f"ForeArm{tag}", f"Thigh{tag}": "Hips", f"Shin{tag}": f"Thigh{tag}", f"Foot{tag}": f"Shin{tag}"})
        for finger in range(1, 6):
            for segment in range(1, 4):
                name = f"Finger{finger}{segment}{tag}"
                source = f"finger{finger}-{segment}{side}"
                joints[name] = ((source, "head"), (source, "tail"))
                parents[name] = f"Hand{tag}" if segment == 1 else f"Finger{finger}{segment - 1}{tag}"
                rolls[name] = RIG[source].get("roll", 0.0)
    return joints, parents, rolls


JOINTS, PARENTS, ROLLS = bone_table()
BONES = list(JOINTS)
BONE_INDEX = {name: i for i, name in enumerate(BONES)}


def simple_bone(name):
    """Which of our bones one of MakeHuman's many falls into."""
    tag = "L" if name.endswith(".L") else "R" if name.endswith(".R") else ""
    stem = name.split(".")[0]
    if stem.startswith("finger"):
        finger, segment = stem[6:].split("-")
        return f"Finger{finger}{segment}{tag}"
    if stem.startswith("metacarpal") or stem == "wrist":
        return f"Hand{tag}"
    if stem.startswith("upperarm"):
        return f"UpperArm{tag}"
    if stem.startswith("lowerarm"):
        return f"ForeArm{tag}"
    if stem.startswith("upperleg"):
        return f"Thigh{tag}"
    if stem.startswith("lowerleg"):
        return f"Shin{tag}"
    if stem == "foot" or stem.startswith("toe"):
        return f"Foot{tag}"
    if stem in ("clavicle", "shoulder01", "breast", "spine01", "spine02"):
        return "Chest"
    if stem in ("spine03", "spine04"):
        return "Spine"
    if stem in ("root", "pelvis", "spine05"):
        return "Hips"
    if stem.startswith("neck"):
        return "Neck"
    return "Head"


WEIGHTS = np.zeros((len(BASE), len(BONES)), np.float32)
for source, pairs in json.loads(mpfb.read(DATA + "rigs/standard/weights.default.json"))["weights"].items():
    column = BONE_INDEX[simple_bone(source)]
    for vertex, value in pairs:
        WEIGHTS[vertex, column] += value
_total = WEIGHTS.sum(axis=1, keepdims=True)
WEIGHTS = np.divide(WEIGHTS, _total, out=np.zeros_like(WEIGHTS), where=_total > 0)

GARMENTS = {}


def read_garment(path):
    """A .mhclo garment, not yet fitted to anyone."""
    if path in GARMENTS:
        return GARMENTS[path]
    scales, binding, deleted = {}, [], []
    obj_file = None
    section = None
    for line in system.read(path).decode("utf8", "ignore").splitlines():
        if not line or line.startswith("#"):
            continue
        words = line.split()
        if words[0] == "obj_file":
            obj_file = words[1]
        elif words[0] in ("x_scale", "y_scale", "z_scale"):
            scales[words[0][0]] = (int(words[1]), int(words[2]), float(words[3]))
        elif words[0] == "verts":
            section = "verts"
        elif words[0] == "delete_verts":
            section = "delete"
        elif section == "verts" and re.match(r"^-?\d", words[0]):
            binding.append(words)
        elif section == "delete" and re.match(r"^\d", words[0]):
            i = 0
            while i < len(words):
                if i + 2 < len(words) and words[i + 1] == "-":
                    deleted.extend(range(int(words[i]), int(words[i + 2]) + 1))
                    i += 3
                else:
                    deleted.append(int(words[i]))
                    i += 1
    folder = path.rsplit("/", 1)[0]
    vertices, uvs, polygons, _ = parse_obj(system.read(f"{folder}/{obj_file}").decode("utf8", "ignore"))
    GARMENTS[path] = (scales, binding, set(deleted), len(vertices), uvs, polygons, folder)
    return GARMENTS[path]


def fit(path, base):
    """Fits a garment to a body. Returns its points, UVs, polygons, weights, and the skin it hides."""
    scales, binding, hidden, count, uvs, polygons, folder = read_garment(path)

    def factor(axis):
        a, b, reference = scales[axis]
        column = "xyz".index(axis)
        return abs(base[a, column] - base[b, column]) / reference

    stretch = np.array([factor(axis) if axis in scales else 1.0 for axis in "xyz"])
    points = np.zeros((count, 3))
    weights = np.zeros((count, len(BONES)), np.float32)
    for row, words in enumerate(binding[:count]):
        if len(words) == 1:
            points[row] = base[int(words[0])]
            weights[row] = WEIGHTS[int(words[0])]
            continue
        i, j, k = (int(n) for n in words[:3])
        a, b, c = (float(n) for n in words[3:6])
        offset = np.array([float(n) for n in words[6:9]])
        points[row] = a * base[i] + b * base[j] + c * base[k] + offset * stretch
        weights[row] = a * WEIGHTS[i] + b * WEIGHTS[j] + c * WEIGHTS[k]
    return points, uvs, polygons, weights, hidden, folder


def pieces(polygons):
    """Splits polygons into the pieces that aren't joined to each other, biggest first."""
    parent = {}

    def find(a):
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for polygon in polygons:
        first = find(polygon[0][0])
        for vertex, _ in polygon[1:]:
            parent[find(vertex)] = first
    groups = {}
    for polygon in polygons:
        groups.setdefault(find(polygon[0][0]), []).append(polygon)
    return sorted(groups.values(), key=len, reverse=True)


# ── a part of a person ───────────────────────────────────────────────────────────────────────


class Part:
    """One piece of a figure: its slot in the palette, its shape, and where its detail comes from."""

    def __init__(self, name, slot, points, uvs, polygons, weights, picture, budget, size, contrast=1.0, flat=False, hidden_uv=False):
        used = sorted({i for polygon in polygons for i, _ in polygon})
        remap = {old: new for new, old in enumerate(used)}
        self.name = name
        self.slot = slot
        self.points = np.asarray(points, np.float64)[used]
        self.weights = np.asarray(weights, np.float32)[used]
        self.polygons = [[remap[i] for i, _ in polygon] for polygon in polygons]
        self.corner_uv = [[tuple(uvs[t]) if t >= 0 else (0.0, 0.0) for _, t in polygon] for polygon in polygons]
        self.picture = picture
        self.budget = budget
        self.size = size
        self.contrast = contrast
        self.flat = flat
        # Darkens a part by where on the body each vertex is: brows and stubble, on a head.
        self.paint = None
        self.rect = None
        self.box = None
        self.object = None
        # What the game ends up drawing: triangles as columns of the animation, and each corner's UV.
        self.columns = 0
        self.first = 0
        self.tris = None
        self.tri_uv = None


def clip_part(part, keep):
    """Throws away polygons of a part. `keep` takes a point and answers for each vertex."""
    inside = keep(part.points)
    polygons, corner_uv = [], []
    for polygon, corners in zip(part.polygons, part.corner_uv):
        if inside[polygon].any():
            polygons.append(polygon)
            corner_uv.append(corners)
    used = sorted({i for polygon in polygons for i in polygon})
    remap = {old: new for new, old in enumerate(used)}
    part.points = part.points[used]
    part.weights = part.weights[used]
    part.polygons = [[remap[i] for i in polygon] for polygon in polygons]
    part.corner_uv = corner_uv


# ── pictures ─────────────────────────────────────────────────────────────────────────────────

PICTURES = {}


def picture(path):
    """A picture from the zip as linear luminance and coverage, row 0 at the bottom."""
    if path in PICTURES:
        return PICTURES[path]
    local = os.path.join(BUILD, os.path.basename(path))
    if not os.path.exists(local):
        with open(local, "wb") as file:
            file.write(system.read(path))
    image = bpy.data.images.load(local)
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    linear = np.power(np.clip(pixels[..., :3], 0, 1), 2.2)
    luminance = linear @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    bpy.data.images.remove(image)
    PICTURES[path] = (luminance, pixels[..., 3])
    return PICTURES[path]


def resampler(size, start, stop, source):
    """A matrix that averages a span of `source` pixels down to `size` of them."""
    edges = np.linspace(start * source, stop * source, size + 1)
    out = np.zeros((size, source), np.float32)
    for row in range(size):
        low, high = edges[row], edges[row + 1]
        first = int(math.floor(low))
        last = min(int(math.ceil(high)), source)
        for column in range(first, max(last, first + 1)):
            out[row, min(column, source - 1)] = max(min(high, column + 1) - max(low, column), 1e-4)
        out[row] /= out[row].sum()
    return out


def fill_triangle(mask, a, b, c, value=1.0):
    low = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
    high = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int) + 1
    xs, ys = np.meshgrid(np.arange(max(low[0], 0), min(high[0], mask.shape[1])), np.arange(max(low[1], 0), min(high[1], mask.shape[0])))
    if not xs.size:
        return
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-9:
        return
    p = ((b[1] - c[1]) * (xs + 0.5 - c[0]) + (c[0] - b[0]) * (ys + 0.5 - c[1])) / d
    q = ((c[1] - a[1]) * (xs + 0.5 - c[0]) + (a[0] - c[0]) * (ys + 0.5 - c[1])) / d
    r = 1 - p - q
    hit = (p >= -0.08) & (q >= -0.08) & (r >= -0.08)
    mask[ys[hit], xs[hit]] = value


def shade_triangle(target, corners, values):
    """Multiplies a smoothly varying value into a triangle of a picture."""
    a, b, c = corners
    low = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
    high = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int) + 1
    xs, ys = np.meshgrid(np.arange(max(low[0], 0), min(high[0], target.shape[1])), np.arange(max(low[1], 0), min(high[1], target.shape[0])))
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if not xs.size or abs(d) < 1e-9:
        return
    p = ((b[1] - c[1]) * (xs + 0.5 - c[0]) + (c[0] - b[0]) * (ys + 0.5 - c[1])) / d
    q = ((c[1] - a[1]) * (xs + 0.5 - c[0]) + (a[0] - c[0]) * (ys + 0.5 - c[1])) / d
    r = 1 - p - q
    hit = (p >= -0.1) & (q >= -0.1) & (r >= -0.1)
    target[ys[hit], xs[hit]] = (p * values[0] + q * values[1] + r * values[2])[hit]


def spread(values, known, times=6):
    """Pushes known pixels outward, so a mipmap of an island's edge doesn't reach into the dark."""
    values = values.copy()
    known = known.copy()
    for _ in range(times):
        total = np.zeros_like(values)
        count = np.zeros_like(values)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            total += np.roll(np.roll(values * known, dy, 0), dx, 1)
            count += np.roll(np.roll(known, dy, 0), dx, 1)
        grown = (count > 0) & (known == 0)
        values[grown] = total[grown] / count[grown]
        known[grown] = 1
    return values, known


def part_detail(part):
    """A part's detail at its size in the sheet, as how many times brighter than its own average."""
    width, height = part.size
    corners = np.array([uv for polygon in part.corner_uv for uv in polygon], np.float64)
    low = corners.min(axis=0)
    high = corners.max(axis=0)
    pad = (high - low) * 0.01 + 0.002
    low = np.clip(low - pad, 0, 1)
    high = np.clip(high + pad, 0, 1)
    part.box = (low, high)
    luminance, alpha = picture(part.picture)
    rows, columns = luminance.shape
    down = resampler(height, low[1], high[1], rows)
    across = resampler(width, low[0], high[0], columns)
    small = down @ luminance @ across.T
    covered = down @ alpha @ across.T
    mask = np.zeros((height, width), np.float32)
    scale = np.array([width, height]) / (high - low)
    for polygon in part.corner_uv:
        flat = (np.array(polygon) - low) * scale
        for k in range(1, len(flat) - 1):
            fill_triangle(mask, flat[0], flat[k], flat[k + 1])
    known = (mask > 0) & (covered > 0.5)
    if not known.any():
        return np.ones((height, width), np.float32)
    # From what most of it is: a white shirt mustn't count against the jacket round it.
    mean = float(np.median(small[known]))
    detail = np.power(np.maximum(small, 1e-5) / mean, part.contrast)
    if part.flat:
        # A loud pattern: keep only the broad shading in it.
        coarse_down = resampler(max(height // 16, 2), 0, 1, height)
        coarse_across = resampler(max(width // 16, 2), 0, 1, width)
        blurred = coarse_down @ (detail * known) @ coarse_across.T
        weight = coarse_down @ known.astype(np.float32) @ coarse_across.T
        coarse = blurred / np.maximum(weight, 1e-3)
        grown_down = resampler(height, 0, 1, coarse.shape[0])
        grown_across = resampler(width, 0, 1, coarse.shape[1])
        detail = np.clip(grown_down @ coarse @ grown_across.T, 0.75, 1.2)
    if part.paint:
        shade = part.paint(part.points)
        layer = np.ones((height, width), np.float32)
        for polygon, corners in zip(part.polygons, part.corner_uv):
            flat = (np.array(corners) - low) * scale
            for k in range(1, len(flat) - 1):
                shade_triangle(layer, (flat[0], flat[k], flat[k + 1]), (shade[polygon[0]], shade[polygon[k]], shade[polygon[k + 1]]))
        detail = detail * layer
    values, seen = spread(np.where(known, detail, 0).astype(np.float32), known.astype(np.float32))
    return np.where(seen > 0, values, 1.0).astype(np.float32)


def woven(width, height, seed, folds=0.0):
    """Plain cloth for the parts made here: a faint weave, and long soft folds running down it."""
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 1, (height, width)).astype(np.float32)
    weave = noise * 0.035
    across = np.arange(width, dtype=np.float32) / width * math.tau
    wave = np.zeros(width, np.float32)
    for k, phase in ((3, 0.6), (5, 2.1), (8, 4.0), (13, 1.1)):
        wave += np.sin(across * k + phase + rng.uniform(0, 3)) / math.sqrt(k)
    down = np.linspace(0.25, 1.0, height, dtype=np.float32)[:, None]
    return 1 + weave + folds * wave[None, :] * down


def pack_tile(parts):
    """Finds every part a place in a figure's tile, largest first, shrinking them all until they fit."""
    margin = 3
    wanted = [part.size for part in parts]
    shrink = 1.0
    while True:
        free = [(0, 0, TILE_W, TILE_H)]
        for part, (width, height) in zip(parts, wanted):
            part.size = (max(int(width * shrink), 8), max(int(height * shrink), 8))
        for part in sorted(parts, key=lambda item: -item.size[0] * item.size[1]):
            width, height = part.size
            need_w, need_h = width + margin * 2, height + margin * 2
            fits = [rect for rect in free if rect[2] >= need_w and rect[3] >= need_h]
            if not fits:
                break
            rect = min(fits, key=lambda r: min(r[2] - need_w, r[3] - need_h))
            free.remove(rect)
            x, y, room_w, room_h = rect
            free.append((x + need_w, y, room_w - need_w, need_h))
            free.append((x, y + need_h, room_w, room_h - need_h))
            part.rect = (x + margin, y + margin, width, height)
        else:
            return
        shrink *= 0.95


# ── the skeleton and how it's posed ──────────────────────────────────────────────────────────


class Figure:
    def __init__(self, spec):
        self.spec = spec
        self.name = spec["name"]
        self.height = spec["height"]
        self.base = shaped(spec["body"])
        body_y = self.base[BODY_VERTS, 1]
        self.scale = self.height / (np.ptp(body_y) * 0.1)
        self.floor = body_y.min() * 0.1 * self.scale
        self.parts = []
        self.style = dict(WALK)
        self.style.update(spec.get("walk", {}))

    def metres(self, points):
        """MakeHuman is Y up and in decimetres, facing +Z. This project is Z up, facing -Y."""
        p = np.asarray(points) * 0.1 * self.scale
        return np.stack([p[..., 0], -p[..., 2], p[..., 1] - self.floor], axis=-1)

    def place(self, spec):
        if spec["strategy"] == "CUBE":
            return self.base[sorted(CUBES[spec["cube_name"]])].mean(axis=0)
        if spec["strategy"] == "VERTEX":
            return self.base[spec["vertex_index"]]
        return self.base[spec["vertex_indices"]].mean(axis=0)

    def joint(self, name, end):
        return self.metres(self.place(RIG[name][end]))

    def make_rig(self):
        data = bpy.data.armatures.new(self.name)
        rig = bpy.data.objects.new(self.name, data)
        bpy.context.scene.collection.objects.link(rig)
        bpy.context.view_layer.update()
        select_only(rig)
        bpy.ops.object.mode_set(mode="EDIT")
        edit = data.edit_bones
        root = edit.new("Root")
        root.head = (0, 0, 0)
        root.tail = (0, 0, 0.2)
        for name, (head, tail) in JOINTS.items():
            bone = edit.new(name)
            bone.head = self.joint(*head)
            bone.tail = self.joint(*tail)
            bone.roll = ROLLS.get(name, 0.0)
        for name in JOINTS:
            edit[name].parent = edit[PARENTS[name]]
        bpy.ops.object.mode_set(mode="OBJECT")
        rig.animation_data_clear()
        for bone in rig.pose.bones:
            bone.rotation_mode = "QUATERNION"
        self.rig = rig


def update():
    bpy.context.view_layer.update()


def aim(rig, bone, direction):
    """Points a bone along a direction, wherever its parent has got to."""
    update()
    pose_bone = rig.pose.bones[bone]
    rest = pose_bone.bone.matrix_local
    parent = pose_bone.parent
    held = (parent.matrix @ parent.bone.matrix_local.inverted() @ rest) if parent else rest
    held = held.to_3x3()
    swing = (held @ Vector((0, 1, 0))).rotation_difference(Vector(direction).normalized())
    pose_bone.rotation_quaternion = (held.inverted() @ swing.to_matrix() @ held).to_quaternion()


def reach(rig, upper, lower, target, pole):
    """Two bones to a point, with the joint between them bending toward `pole`."""
    update()
    start = rig.pose.bones[upper].head.copy()
    first = rig.pose.bones[upper].bone.length
    second = rig.pose.bones[lower].bone.length
    way = target - start
    wanted = way.length
    gap = min(wanted, (first + second) * 0.999)
    way = way.normalized()
    along = (first * first - second * second + gap * gap) / (2 * gap)
    height = math.sqrt(max(first * first - along * along, 0))
    side = (pole - way * pole.dot(way)).normalized()
    joint = start + way * along + side * height
    aim(rig, upper, joint - start)
    aim(rig, lower, (start + way * gap) - joint)
    return wanted


def orient(rig, bone, world):
    """Turns a bone in room space from how it lies in the A-pose. A local rotation means nothing here."""
    update()
    pose_bone = rig.pose.bones[bone]
    rest = pose_bone.bone.matrix_local.to_3x3()
    parent = pose_bone.parent
    held = (parent.matrix.to_3x3() @ parent.bone.matrix_local.to_3x3().inverted() @ rest) if parent else rest
    pose_bone.rotation_quaternion = (held.inverted() @ world.to_matrix() @ rest).to_quaternion()


def turned(yaw=0.0, lean=0.0, tip=0.0):
    """Yaw about up, lean forward, tip sideways, all in room space. Forward is -y."""
    return Quaternion((0, 0, 1), yaw) @ Quaternion((0, 1, 0), tip) @ Quaternion((1, 0, 0), lean)


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
    rig.location = (0, 0, 0)


def catmull(keys, u):
    """A smooth curve through (at, value) keys."""
    ats = [k[0] for k in keys]
    vals = [k[1] for k in keys]
    n = len(keys)
    i = max(min(np.searchsorted(ats, u) - 1, n - 2), 0)
    t = (u - ats[i]) / (ats[i + 1] - ats[i])

    def slope(j):
        a, b = max(j - 1, 0), min(j + 1, n - 1)
        return (vals[b] - vals[a]) / (ats[b] - ats[a])

    span = ats[i + 1] - ats[i]
    m0, m1 = slope(i) * span, slope(i + 1) * span
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * vals[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * vals[i + 1] + (t3 - t2) * m1


def hermite(a, b, m0, m1, t):
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b + (t3 - t2) * m1


# How an average person walks. Everything's in metres and radians, and a figure may change any of it.
WALK = dict(
    stride=1.44,  # One full cycle: two steps.
    pace=1.3,  # What this person's usual speed is, in metres a second.
    stance=0.62,  # How much of a cycle a foot is on the ground.
    ahead=0.21,  # Where the heel comes down in front of the hips, as a share of the stride.
    base=0.075,  # Each foot's distance from the line of travel.
    toe_out=0.11,
    heel_up=0.3,  # Toes raised as the heel lands.
    toe_off=0.95,  # How far the foot's tipped as it leaves.
    bob=0.036,
    sway=0.021,
    sink=0.022,  # How far the hips ride below standing height.
    hip_yaw=0.09,
    hip_tip=0.05,
    chest_yaw=0.12,
    lean=0.045,
    arm=0.34,  # Each arm's swing either way.
    arm_mean=0.02,
    arm_out=0.11,
    elbow=0.3,
    elbow_swing=0.3,
    head=0.0,
)


# Where a hand rests from the hips (out, back, up), which way its elbow goes, and how the hand lies.
HOLDS = {
    "pocket": ((0.205, -0.03, -0.035), (1, 0.7, -0.25), (-0.22, -0.3, -0.9)),
    "front": ((0.018, -0.2, -0.015), (1, 0.15, -0.55), (-0.95, -0.25, -0.1)),
    "back": ((0.015, 0.175, 0.0), (1, 0.75, -0.3), (-0.95, 0.2, -0.08)),
}


def foot_path(figure, phase):
    """Where an ankle is, and how the foot's tipped, a share of the way round its cycle."""
    s = figure.style
    stride, stance = s["stride"], s["stance"]
    rock, roll = 0.09, stance - 0.2
    heel_out, ankle_h, ball_out = figure.foot
    land = s["ahead"] * stride

    def on_ground(p):
        if p < rock:
            pitch = s["heel_up"] * (1 - p / rock) ** 1.6
            pivot = land - stride * p
            return pivot + heel_out * math.cos(pitch) - ankle_h * math.sin(pitch), heel_out * math.sin(pitch) + ankle_h * math.cos(pitch), pitch
        if p < roll:
            return land - stride * p + heel_out, ankle_h, 0.0
        pitch = -s["toe_off"] * ((p - roll) / (stance - roll)) ** 1.5
        pivot = land + ball_out - stride * p
        back = heel_out - ball_out
        return pivot + back * math.cos(pitch) - ankle_h * math.sin(pitch), back * math.sin(pitch) + ankle_h * math.cos(pitch), pitch

    if phase < stance:
        return on_ground(phase)
    u = (phase - stance) / (1 - stance)
    span = 1 - stance
    start = on_ground(stance - 1e-3)
    before = on_ground(stance - 0.02)
    finish = on_ground(0.0)
    after = on_ground(0.02)
    forward = hermite(start[0], finish[0], (start[0] - before[0]) / 0.019 * span * 0.55, (after[0] - finish[0]) / 0.02 * span, u)
    up = hermite(start[1], finish[1], (start[1] - before[1]) / 0.019 * span * 0.55, (after[1] - finish[1]) / 0.02 * span * 0.5, u)
    pitch = catmull([(0, -s["toe_off"]), (0.3, -0.62), (0.62, -0.08), (0.86, 0.26), (1, s["heel_up"])], u)
    up += 0.018 * math.sin(math.pi * u) ** 2
    return forward, up, pitch


def relax_hands(rig, curl):
    for key in "LR":
        for finger in range(1, 6):
            for segment in range(1, 4):
                bend = curl * (0.5 if finger == 1 else 1.0) * (0.75 if segment == 1 else 1.0)
                rig.pose.bones[f"Finger{finger}{segment}{key}"].rotation_quaternion = Quaternion(Vector((1, 0, 0)), bend)


def set_arm(figure, key, swing, bend, out):
    """One arm, hanging from the shoulder: `swing` forward of straight down, `bend` at the elbow."""
    rig = figure.rig
    side = 1 if key == "L" else -1
    upper = Vector((side * math.sin(out), -math.cos(out) * math.sin(swing), -math.cos(out) * math.cos(swing)))
    fore_angle = swing + bend
    fore = Vector((side * math.sin(out) * 0.45, -math.sin(fore_angle), -math.cos(fore_angle)))
    aim(rig, f"UpperArm{key}", upper)
    aim(rig, f"ForeArm{key}", fore)
    hand_angle = fore_angle + 0.12
    aim(rig, f"Hand{key}", Vector((-side * 0.08, -math.sin(hand_angle), -math.cos(hand_angle))))


def walk_pose(figure, t):
    """One moment of the walk. At t = 0 the left heel is coming down; the body stays over the origin."""
    rig = figure.rig
    s = figure.style
    reset_pose(rig)
    relax_hands(rig, 0.34)
    wave = math.tau * t
    hips = figure.hips
    # Hips: lowest as a heel lands, highest over the standing foot, and over toward that foot.
    rise = -s["sink"] - s["bob"] * 0.5 * math.cos(2 * (wave - 0.16))
    rig.location = (s["sway"] * math.sin(wave - 0.1), 0.007 * math.sin(2 * wave), rise)
    orient(rig, "Hips", turned(yaw=-s["hip_yaw"] * math.cos(wave), tip=-s["hip_tip"] * math.sin(wave - 0.1), lean=0.03))
    orient(rig, "Spine", turned(yaw=-s["hip_yaw"] * 0.25 * math.cos(wave), tip=s["hip_tip"] * 0.15 * math.sin(wave), lean=s["lean"] * 0.6))
    orient(rig, "Chest", turned(yaw=s["chest_yaw"] * math.cos(wave), tip=s["hip_tip"] * 0.3 * math.sin(wave), lean=s["lean"]))
    orient(rig, "Neck", turned(yaw=s["chest_yaw"] * 0.4 * math.cos(wave), lean=s["lean"] * 0.8 + s["head"] * 0.5))
    orient(rig, "Head", turned(yaw=s["chest_yaw"] * 0.12 * math.cos(wave), lean=s["head"] + 0.012 * math.cos(2 * wave)))
    offset = rig.location
    reached = 0.0
    for key, side, lag in (("L", 1, 0.0), ("R", -1, 0.5)):
        forward, up, pitch = foot_path(figure, (t + lag) % 1.0)
        toe = side * s["toe_out"]
        ankle = Vector((side * s["base"] + forward * math.sin(toe), -forward * math.cos(toe), up + figure.sole))
        reached = max(reached, reach(rig, f"Thigh{key}", f"Shin{key}", ankle - offset, Vector((side * 0.12, -1, 0.05))) / figure.leg)
        flat = figure.foot_slope
        aim(rig, f"Foot{key}", Vector((math.sin(toe) * math.cos(pitch - flat), -math.cos(toe) * math.cos(pitch - flat), math.sin(pitch - flat))))
        swing = s["arm_mean"] - side * s["arm"] * math.cos(wave - 0.22)
        bend = s["elbow"] + s["elbow_swing"] * (0.5 + 0.5 * math.sin(swing / max(s["arm"], 0.01) * 1.4))
        set_arm(figure, key, swing, bend, s["arm_out"])
    update()
    return reached


def idle_pose(figure, t):
    """Standing, with the weight easing over from one foot toward the other and back, and breathing."""
    rig = figure.rig
    s = figure.style
    reset_pose(rig)
    relax_hands(rig, 0.4)
    wave = math.tau * t
    weight = math.sin(wave)
    rig.location = (0.018 + 0.016 * weight, 0.004 * math.sin(wave * 2), -0.012 - 0.004 * abs(weight))
    orient(rig, "Hips", turned(yaw=0.03 * weight, tip=-0.03 - 0.02 * weight, lean=0.02))
    orient(rig, "Spine", turned(tip=0.012 + 0.01 * weight, lean=s["lean"] * 0.4))
    orient(rig, "Chest", turned(yaw=-0.03 * weight, tip=0.02 + 0.012 * weight, lean=s["lean"] * 0.7 + 0.008 * math.sin(wave * 2)))
    orient(rig, "Neck", turned(yaw=0.05 * weight, lean=s["lean"] * 0.6 + s["head"] * 0.5))
    orient(rig, "Head", turned(yaw=0.09 * weight, lean=s["head"], tip=0.012 * math.sin(wave + 1)))
    offset = rig.location
    for key, side in (("L", 1), ("R", -1)):
        toe = side * 0.16
        # One foot takes the weight under the hips; the other stands a little out and ahead.
        ankle = Vector((side * 0.1, -0.02 if side > 0 else -0.09, figure.sole + figure.foot[1]))
        reach(rig, f"Thigh{key}", f"Shin{key}", ankle - offset, Vector((side * 0.3, -1, 0.05)))
        flat = figure.foot_slope
        aim(rig, f"Foot{key}", Vector((math.sin(toe) * math.cos(-flat), -math.cos(toe) * math.cos(-flat), math.sin(-flat))))
        hold = figure.spec.get("hold", {}).get(key)
        if hold:
            # Hands go where a person's hands go: in a pocket, clasped in front, held behind.
            spot, pole, hand = HOLDS[hold]
            hips = rig.pose.bones["Hips"].head
            size = figure.height / 1.75
            target = hips + Vector((spot[0] * side * size, spot[1] * size, spot[2] * size))
            reach(rig, f"UpperArm{key}", f"ForeArm{key}", target, Vector((pole[0] * side, pole[1], pole[2])))
            aim(rig, f"Hand{key}", Vector((hand[0] * side, hand[1], hand[2])))
        else:
            set_arm(figure, key, 0.02 + 0.015 * math.sin(wave + side), 0.18, s["arm_out"] * 0.85)
    update()


# ── what's made here: the hijab and the coats' skirts ────────────────────────────────────────


def polar_profile(points, centre, bins):
    """How far out a set of points reaches in each direction round a centre. Zero where there are none."""
    dx = points[:, 0] - centre[0]
    dy = points[:, 1] - centre[1]
    angle = np.arctan2(dx, -dy) % math.tau
    index = (angle / math.tau * bins).astype(int) % bins
    reach_out = np.zeros(bins)
    np.maximum.at(reach_out, index, np.hypot(dx, dy))
    return reach_out


def fill_ring(values):
    """Fills the empty bins of a ring from their neighbours, then softens it."""
    known = values > 0
    if not known.any():
        return values
    at = np.arange(len(values))
    out = np.interp(at, at[known], values[known], period=len(values))
    return ring_blur(out, 1)


def ring_blur(values, times=1):
    for _ in range(times):
        values = 0.25 * np.roll(values, 1, axis=-1) + 0.5 * values + 0.25 * np.roll(values, -1, axis=-1)
    return values


def face_oval(figure, points):
    """Inside the hijab's opening, less than one; at its edge, one."""
    top = figure.crown
    size = figure.height / 1.62
    centre = top - 0.118 * size
    return np.hypot(points[:, 0] / (0.0605 * size), (points[:, 2] - centre) / (0.087 * size))


def make_hijab(figure, covers, budget):
    """A scarf wrapped round the head and pinned under the chin, its ends falling over the chest."""
    size = figure.height / 1.62
    bins = 44
    theta = (np.arange(bins) + 0.5) / bins * math.tau
    out_x, out_y = np.sin(theta), -np.cos(theta)
    crown = figure.crown
    chin = crown - 0.215 * size
    shoulder = figure.neck_base - 0.02 * size
    hem_front = shoulder - 0.19 * size
    hem_back = shoulder - 0.17 * size
    hem_side = shoulder - 0.012 * size
    centre = np.array([0.0, figure.head_y])
    # Rings from just over the crown down the head, then round the neck and out over the shoulders.
    head_rings = np.linspace(crown + 0.002, chin, 11)
    drape_rings = np.linspace(chin - 0.02, 1.0, 7)
    head = []
    cloud = covers[covers[:, 2] > shoulder - 0.32 * size]
    cloud = cloud[np.abs(cloud[:, 0]) < 0.135 * size]
    for z in head_rings:
        near = cloud[np.abs(cloud[:, 2] - z) < 0.012]
        ring = fill_ring(polar_profile(near, centre, bins))
        head.append(ring)
    head = np.array(head)
    chin_ring = head[-1]
    rows = []
    for i, z in enumerate(head_rings):
        rows.append((np.full(bins, z), head[i], np.full(bins, 0.0)))
    # Under the chin it no longer follows the skin: it hangs from the jaw onto the chest and shoulders.
    front = np.cos(theta) > 0
    for s in np.linspace(0.14, 1.0, 8):
        hem = hem_side + (np.where(front, hem_front, hem_back) - hem_side) * np.abs(np.cos(theta)) ** 1.3
        z = chin + (hem - chin) * s
        ring = np.zeros(bins)
        for b in range(bins):
            near = cloud[np.abs(cloud[:, 2] - z[b]) < 0.03]
            if len(near):
                ring[b] = polar_profile(near, centre, bins)[b]
        ring = fill_ring(ring)
        # It can't go in over the neck: the cloth runs straight from the jaw to where it next lies.
        ring = np.maximum(ring, chin_ring * (1 - s) + 0.1 * size * s) + 0.004 + 0.004 * s
        rows.append((z, ring_blur(ring, 2), np.full(bins, s)))
    # What's hair and cloth round the back of the head, and the cloth's own soft folds.
    points, uv = [], []
    grid = len(rows)
    for row, (z, ring, s) in enumerate(rows):
        lift = 0.007
        hair = 0.012 * size * smooth_array(0.2, -0.6, np.cos(theta)) * smooth_array(chin + 0.03, chin + 0.12, z)
        fold = s ** 1.2 * 0.012 * size * (np.sin(theta * 7 + 1.0) * 0.6 + np.sin(theta * 11 + 2.6) * 0.4)
        wrap = ring + lift + hair + fold
        p = np.stack([centre[0] + out_x * wrap, centre[1] + out_y * wrap, z], axis=-1)
        points.append(p)
        # One more UV column than points, so the seam at the back doesn't run the picture backward.
        uv.append(np.stack([np.arange(bins + 1) / bins, np.full(bins + 1, 1 - row / (grid - 1))], axis=-1))
    points = np.array(points)
    uv = np.array(uv)
    flat_points = points.reshape(-1, 3)
    # The face shows through an oval. Cloth near its edge lies tight against it.
    oval = face_oval(figure, flat_points)
    front = flat_points[:, 1] < figure.head_y
    tight = front & (oval < 1.5)
    pull = 1 - smooth_array(0.95, 1.5, oval)
    inward = flat_points[:, :2] - centre
    inward /= np.maximum(np.linalg.norm(inward, axis=1, keepdims=True), 1e-6)
    flat_points[tight, :2] -= inward[tight] * (pull[tight, None] * 0.012)
    # A rim: anything just outside the opening is drawn onto its edge, so the cut is a smooth oval.
    rim = front & (oval > 0.86) & (oval < 1.2)
    target_oval = 1.0
    size_face = np.array([0.0605 * size, 0.087 * size])
    middle = np.array([0.0, crown - 0.118 * size])
    rel = np.stack([flat_points[:, 0], flat_points[:, 2] - middle[1]], axis=-1) / size_face
    scale = target_oval / np.maximum(np.linalg.norm(rel, axis=1), 1e-6)
    moved = rel * scale[:, None] * size_face
    flat_points[rim, 0] = moved[rim, 0]
    flat_points[rim, 2] = moved[rim, 1] + middle[1]
    polygons = []
    uvs = uv.reshape(-1, 2)
    oval_now = face_oval(figure, flat_points)
    front_now = flat_points[:, 1] < figure.head_y
    for row in range(grid - 1):
        for b in range(bins):
            n = (b + 1) % bins
            quad = [row * bins + b, (row + 1) * bins + b, (row + 1) * bins + n, row * bins + n]
            if all(front_now[q] and oval_now[q] < 1.001 for q in quad):
                continue
            wide = bins + 1
            polygons.append(list(zip(quad, [row * wide + b, (row + 1) * wide + b, (row + 1) * wide + b + 1, row * wide + b + 1])))
    # The top closes on one point.
    top_index = len(flat_points)
    flat_points = np.vstack([flat_points, [[centre[0], centre[1] + 0.002, crown + 0.012]]])
    top_uv = len(uvs)
    uvs = np.vstack([uvs, [[0.5, 1.0]]])
    for b in range(bins):
        polygons.append([(top_index, top_uv), (b, b), ((b + 1) % bins, b + 1)])
    weights = np.zeros((len(flat_points), len(BONES)), np.float32)
    head_share = smooth_array(chin - 0.05 * size, chin + 0.02 * size, flat_points[:, 2])
    neck_share = smooth_array(shoulder - 0.02, chin - 0.04 * size, flat_points[:, 2]) * (1 - head_share)
    weights[:, BONE_INDEX["Head"]] = head_share
    weights[:, BONE_INDEX["Neck"]] = neck_share
    weights[:, BONE_INDEX["Chest"]] = 1 - head_share - neck_share
    part = Part("Hijab", SCARF, flat_points, uvs, polygons, weights, None, budget, (150, 96))
    part.cloth = (11, 0.05)
    part.box = (np.zeros(2), np.ones(2))
    return part


class Skirt:
    """The lower half of a long coat, wrapped round the legs afresh each frame."""

    def __init__(self, figure, top, hem, flare, ease, budget_rows=9, around=30, slit=False):
        self.figure = figure
        self.top = top
        self.hem = hem
        self.flare = flare
        self.ease = ease
        self.rows = budget_rows
        self.around = around
        self.slit = slit
        self.theta = np.arange(around) / around * math.tau
        self.width = None

    def measure(self, chest_points):
        """How wide the hips are."""
        figure = self.figure
        band = chest_points[(np.abs(chest_points[:, 2] - figure.hip_joint) < 0.06) & (np.abs(chest_points[:, 0]) < 0.24)]
        self.half_x = max(float(np.abs(band[:, 0]).max()), 0.14)
        self.half_y = max(float(np.ptp(band[:, 1]) / 2), 0.1)

    def ring(self, joints, coat_points, frame_fraction):
        """One frame's shape: a grid of radii and heights round the hips' axis."""
        figure = self.figure
        hips = joints["Hips"]
        rows = self.rows
        length = self.top - self.hem
        axis = np.array([hips[0], hips[1]])
        z_top = self.top + (hips[2] - figure.hip_rest)
        out = np.stack([np.sin(self.theta), -np.cos(self.theta)], axis=-1)
        band = coat_points[np.abs(coat_points[:, 2] - z_top) < 0.035]
        top_ring = fill_ring(polar_profile(band, axis, self.around * 2))[::2] + 0.002
        radii = np.zeros((rows + 1, self.around))
        heights = np.zeros((rows + 1, self.around))
        legs = []
        for key in "LR":
            legs.append((np.array(joints[f"Thigh{key}"]), np.array(joints[f"Shin{key}"]), np.array(joints[f"Foot{key}"])))
        previous = top_ring
        for row in range(rows + 1):
            s = row / rows
            z = z_top - length * s
            ellipse = 1 / np.sqrt((out[:, 0] / (self.half_x * (1 + self.flare * s))) ** 2 + (out[:, 1] / (self.half_y * (1 + self.flare * 1.3 * s))) ** 2)
            base = top_ring + (ellipse + self.ease - top_ring) * smooth(0.0, 0.3, s)
            ring = base
            for hip, knee, ankle in legs:
                if z >= knee[2]:
                    t = (hip[2] - z) / max(hip[2] - knee[2], 1e-3)
                    centre = hip + (knee - hip) * min(max(t, 0), 1)
                    size = 0.085 + (0.058 - 0.085) * t
                else:
                    t = (knee[2] - z) / max(knee[2] - ankle[2], 1e-3)
                    centre = knee + (ankle - knee) * min(max(t, 0), 1)
                    size = 0.058 + (0.042 - 0.058) * t
                # The cloth goes round the leg: the far side of it, seen from the hips' axis.
                ring = np.maximum(ring, (centre[:2] - axis) @ out.T + size + self.ease)
            ring = np.maximum(ring, previous * 0.985)
            ring = ring_blur(ring, 2)
            radii[row] = ring
            # A stride takes up cloth: what's pushed out rides up a little.
            pushed = np.maximum(ring - base, 0)
            heights[row] = z + 0.4 * pushed * pushed / max(length * s + 0.15, 0.15)
            previous = ring
        return axis, radii, heights

    def frames(self, joint_frames, coat_frames):
        """Every frame's grid for one clip, with the cloth trailing behind what moves it."""
        shapes = [self.ring(joints, coat, n / len(joint_frames)) for n, (joints, coat) in enumerate(zip(joint_frames, coat_frames))]
        count = len(shapes)
        rows = self.rows
        trailing = []
        for n in range(count):
            axis, radii, heights = shapes[n]
            behind_a = shapes[(n - 1) % count]
            behind_b = shapes[(n - 2) % count]
            share = (np.arange(rows + 1) / rows)[:, None] ** 1.3
            lagged = radii * 0.45 + behind_a[1] * 0.35 + behind_b[1] * 0.2
            lifted = heights * 0.5 + behind_a[2] * 0.3 + behind_b[2] * 0.2
            radii = radii * (1 - share) + np.maximum(lagged, radii - 0.02) * share
            heights = heights * (1 - share) + lifted * share
            trailing.append((axis, radii, heights))
        grids = []
        cos_t, sin_t = np.cos(self.theta), np.sin(self.theta)
        for axis, radii, heights in trailing:
            s = (np.arange(rows + 1) / rows)[:, None]
            folds = s ** 1.3 * 0.011 * (np.sin(self.theta * 5 + 0.7) * 0.5 + np.sin(self.theta * 9 + 2.2) * 0.3 + np.sin(self.theta * 14 + 1.1) * 0.2)
            wrap = radii + folds
            x = axis[0] + sin_t * wrap
            y = axis[1] - cos_t * wrap
            z = heights + (s ** 2) * 0.01 * np.sin(self.theta * 3 + 1.0)
            if self.slit:
                # Where the coat's two fronts part, the hem rises a little.
                z = z + (s ** 5) * 0.03 * np.exp(-(np.minimum(self.theta, math.tau - self.theta) / 0.09) ** 2)
            grids.append(np.stack([x, y, z], axis=-1))
        return grids


def grid_normals(grid):
    """Outward normals of a ring grid: rows down, columns round, closed round."""
    along = np.roll(grid, -1, axis=1) - np.roll(grid, 1, axis=1)
    down = np.empty_like(grid)
    down[1:-1] = grid[2:] - grid[:-2]
    down[0] = grid[1] - grid[0]
    down[-1] = grid[-1] - grid[-2]
    normal = np.cross(down, along)
    size = np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-9)
    return normal / size


# ── the cast ─────────────────────────────────────────────────────────────────────────────────

M_YOUNG = "universal-male-young-averagemuscle-averageweight"
M_HEAVY = "universal-male-young-averagemuscle-maxweight"
M_THIN = "universal-male-young-minmuscle-averageweight"
M_OLD = "universal-male-old-averagemuscle-averageweight"
M_OLD_HEAVY = "universal-male-old-averagemuscle-maxweight"
F_YOUNG = "universal-female-young-averagemuscle-averageweight"
F_FULL = "universal-female-young-averagemuscle-maxweight"
SKIN_MAN = "skins/young_caucasian_male/young_lightskinned_male_diffuse.png"
SKIN_WOMAN = "skins/young_caucasian_female/young_lightskinned_female_diffuse.png"
SKIN_OLD = "skins/old_caucasian_male/old_lightskinned_male_diffuse.png"
JACKET = "clothes/male_casualsuit05/male_casualsuit05.mhclo"
SUIT = "clothes/male_elegantsuit01/male_elegantsuit01.mhclo"
WOMAN_JEANS = "clothes/female_casualsuit01/female_casualsuit01.mhclo"
BLOUSE = "clothes/female_elegantsuit01/female_elegantsuit01.mhclo"

CAST = [
    dict(
        name="Jacket",
        height=1.77,
        body=[(M_YOUNG, 1), ("caucasian-male-young", 1)],
        skin=SKIN_MAN,
        wear=[
            dict(path=JACKET, piece=0, name="Jacket", slot=TOP, budget=820, size=(190, 170), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png"),
            dict(path=JACKET, piece=1, name="Jeans", slot=BOTTOM, budget=430, size=(120, 150), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png", contrast=0.8),
            dict(path=JACKET, piece=2, name="Shirt", slot=UNDER, budget=110, size=(48, 48), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png", flat=True),
            dict(path=JACKET, piece=3, name="Shirt2", slot=UNDER, budget=90, size=(32, 32), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png", flat=True),
        ],
        shoes=("clothes/shoes02/shoes02.mhclo", "clothes/shoes02/shoes02_diffuse.png"),
        hair=("hair/short02/short02.mhclo", "hair/short02/short02_diffuse.png", 170),
        beard=0.42,
        hold=dict(L="pocket"),
    ),
    dict(
        name="Blazer",
        height=1.73,
        body=[(M_YOUNG, 0.6), (M_HEAVY, 0.4), ("caucasian-male-young", 1)],
        skin=SKIN_MAN,
        wear=[
            dict(path=SUIT, piece=0, name="Blazer", slot=TOP, budget=950, size=(200, 200), picture="clothes/male_elegantsuit01/male_elegantsuit01_diffuse.png"),
            dict(path=JACKET, piece=1, name="Jeans", slot=BOTTOM, budget=430, size=(120, 150), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png", contrast=0.8),
        ],
        shoes=("clothes/shoes01/shoes01.mhclo", "clothes/shoes01/shoes01_diffuse.png"),
        hair=("hair/short01/short01.mhclo", "hair/short01/short01_diffuse.png", 170),
        walk=dict(stride=1.38, pace=1.2, arm=0.3, sway=0.024),
        beard=0.2,
        moustache=0.55,
        hold=dict(L="pocket", R="pocket"),
    ),
    dict(
        name="Hijab",
        height=1.63,
        body=[(F_YOUNG, 1), ("caucasian-female-young", 1)],
        skin=SKIN_WOMAN,
        brows=0.6,
        wear=[
            dict(path=BLOUSE, piece=0, name="Coat", slot=TOP, budget=620, size=(160, 150), picture="clothes/female_elegantsuit01/female_elegantsuit01_diffuse.png", flat=True),
            dict(path=WOMAN_JEANS, piece=1, name="Trousers", slot=BOTTOM, budget=90, size=(80, 60), picture="clothes/female_casualsuit01/female_casualsuit01_diffuse.png", flat=True),
        ],
        shoes=("clothes/shoes04/shoes04.mhclo", "clothes/shoes04/shoes04_diffuse.png"),
        hijab=True,
        hold=dict(L="front", R="front"),
        skirt=dict(top=0.97, hem=0.2, flare=0.2, ease=0.012),
        walk=dict(stride=1.3, pace=1.15, sway=0.018, base=0.06, arm=0.24, arm_out=0.09, hip_yaw=0.08, chest_yaw=0.09, heel_up=0.25, toe_off=0.85),
    ),
    dict(
        name="Woman",
        height=1.66,
        body=[(F_YOUNG, 0.8), (F_FULL, 0.2), ("caucasian-female-young", 1)],
        skin=SKIN_WOMAN,
        brows=0.6,
        wear=[
            dict(path=JACKET, piece=0, name="Jacket", slot=TOP, budget=800, size=(190, 170), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png"),
            dict(path=JACKET, piece=2, name="Shirt", slot=UNDER, budget=90, size=(48, 48), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png", flat=True),
            dict(path=JACKET, piece=3, name="Shirt2", slot=UNDER, budget=70, size=(32, 32), picture="clothes/male_casualsuit05/male_casualsuit05_diffuse.png", flat=True),
            dict(path=WOMAN_JEANS, piece=1, name="Trousers", slot=BOTTOM, budget=430, size=(120, 150), picture="clothes/female_casualsuit01/female_casualsuit01_diffuse.png", contrast=0.8),
        ],
        shoes=("clothes/shoes04/shoes04.mhclo", "clothes/shoes04/shoes04_diffuse.png"),
        hair=("hair/ponytail01/ponytail01.mhclo", "hair/ponytail01/ponytail01_diffuse.png", 260),
        hold=dict(R="pocket"),
        walk=dict(stride=1.32, pace=1.25, sway=0.024, base=0.05, arm=0.3, hip_yaw=0.1, hip_tip=0.06, chest_yaw=0.1),
    ),
    dict(
        name="Elder",
        height=1.7,
        body=[(M_YOUNG, 0.3), (M_OLD, 0.5), (M_OLD_HEAVY, 0.2), ("caucasian-male-young", 0.3), ("caucasian-male-old", 0.7)],
        skin=SKIN_OLD,
        wear=[
            dict(path=SUIT, piece=0, name="Coat", slot=TOP, budget=880, size=(200, 200), picture="clothes/male_elegantsuit01/male_elegantsuit01_diffuse.png"),
            dict(path=SUIT, piece=1, name="Trousers", slot=BOTTOM, budget=200, size=(100, 100), picture="clothes/male_elegantsuit01/male_elegantsuit01_diffuse.png"),
        ],
        shoes=("clothes/shoes01/shoes01.mhclo", "clothes/shoes01/shoes01_diffuse.png"),
        hair=("hair/short04/short04.mhclo", "hair/short04/short04_diffuse.png", 150),
        skirt=dict(top=0.99, hem=0.5, flare=0.14, ease=0.016, slit=True),
        moustache=0.3,
        brows=0.5,
        hold=dict(L="back", R="back"),
        walk=dict(stride=1.12, pace=0.95, bob=0.024, sway=0.024, base=0.085, hip_yaw=0.06, chest_yaw=0.07, lean=0.1, head=0.1, arm=0.2, toe_out=0.17, heel_up=0.2, toe_off=0.72, sink=0.03),
    ),
]


def dress(figure):
    """Fits everything a figure wears, and keeps the skin that still shows."""
    spec = figure.spec
    parts = []
    hidden = set()
    fits = {}
    for item in spec["wear"]:
        path = item["path"]
        if path not in fits:
            points, uvs, polygons, weights, hides, folder = fit(path, figure.base)
            fits[path] = (figure.metres(points), uvs, pieces(polygons), weights, hides)
        points, uvs, split, weights, hides = fits[path]
        hidden |= hides
        parts.append(Part(item["name"], item["slot"], points, uvs, split[item["piece"]], weights, item["picture"], item["budget"], item["size"], item.get("contrast", 1.0), item.get("flat", False)))
    shoes_path, shoes_picture = spec["shoes"]
    points, uvs, polygons, weights, hides, _ = fit(shoes_path, figure.base)
    hidden |= hides
    split = pieces(polygons)
    points = figure.metres(points)
    # The two biggest pieces are the shoes; what's left are socks.
    for index, side in ((0, "L"), (1, "R")):
        parts.append(Part(f"Shoe{side}", SHOES, points, uvs, split[index], weights, shoes_picture, 86, (56, 40), 0.8))
    if "hair" in spec:
        path, hair_picture, budget = spec["hair"]
        points, uvs, polygons, weights, _, _ = fit(path, figure.base)
        parts.append(Part("Hair", HAIR, figure.metres(points), uvs, [p for piece in pieces(polygons) if len(piece) > 4 for p in piece], weights, hair_picture, budget, (70, 60), 0.7))

    points, uvs, polygons, weights, _, _ = fit("eyes/low-poly/low-poly.mhclo", figure.base)
    for index, piece in enumerate(pieces(polygons)):
        parts.append(Part(f"Eye{index}", EYE, figure.metres(points), uvs, piece, weights, "eyes/materials/brown_eye.png", 24, (22, 22), 1.0))

    # What's left of the skin. It's only the head and the hands that matter.
    body = [polygon for polygon in BODY_POLYGONS if not any(i in hidden for i, _ in polygon)]
    points = figure.metres(figure.base)
    head_top = points[BODY_VERTS, 2].max()
    figure.crown = float(head_top)
    figure.head_y = float(np.mean(points[[i for polygon in body for i, _ in polygon if points[i, 2] > head_top - 0.2], 1]))
    figure.hip_joint = float(figure.joint("upperleg01.L", "head")[2])
    figure.neck_base = float(figure.joint("neck01", "head")[2])
    split = pieces(body)
    head = max(split, key=lambda piece: max(points[i, 2] for polygon in piece for i, _ in polygon))
    hands = [piece for piece in split if piece is not head and len(piece) > 40]
    if spec.get("hijab"):
        keep = []
        for polygon in head:
            corners = points[[i for i, _ in polygon]]
            if (face_oval(figure, corners) < 1.14).all() and (corners[:, 1] < figure.head_y).all():
                keep.append(polygon)
        head = keep
    parts.append(Part("Head", SKIN, points, BASE_UVS, head, WEIGHTS, spec["skin"], 330 if spec.get("hijab") else 430, (92, 96), 0.75))
    eyes = np.concatenate([part.points for part in parts if part.slot == EYE])
    parts[-1].paint = face_paint(figure, float(eyes[:, 2].mean()))
    for index, piece in enumerate(hands):
        parts.append(Part(f"Hand{index}", SKIN, points, BASE_UVS, piece, WEIGHTS, spec["skin"], 70, (44, 36), 0.7))
    print(figure.name, "skin pieces", [len(piece) for piece in split], flush=True)
    return parts


def face_paint(figure, eye_z):
    """What gives a plain head a face at twenty paces: brows, the shadow of the sockets, a mouth, a beard's shade."""
    spec = figure.spec
    size = figure.height / 1.75
    beard = spec.get("beard", 0.0)
    moustache = spec.get("moustache", 0.0)
    brow_dark = spec.get("brows", 0.72)

    def paint(points):
        u = np.abs(points[:, 0]) / size
        v = (points[:, 2] - eye_z) / size
        ahead = smooth_array(figure.head_y - 0.02, figure.head_y - 0.05, points[:, 1])
        brow = np.exp(-(((v - 0.026 + (u - 0.035) ** 2 * 7) / 0.0065) ** 2)) * smooth_array(0.006, 0.016, u) * smooth_array(0.066, 0.05, u)
        socket = np.exp(-(((u - 0.033) / 0.027) ** 2) - ((v - 0.002) / 0.015) ** 2)
        lips = np.exp(-(((v + 0.088) / 0.0075) ** 2)) * smooth_array(0.03, 0.018, u)
        below = np.exp(-(((v + 0.104) / 0.006) ** 2)) * smooth_array(0.028, 0.012, u)
        shade = 1 - brow_dark * brow
        shade = shade * (1 - 0.34 * socket) * (1 - 0.3 * lips) * (1 - 0.14 * below)
        stubble = smooth_array(-0.064, -0.082, v) * smooth_array(0.078, 0.06, u) * smooth_array(-0.15, -0.135, v)
        shade = shade * (1 - beard * stubble)
        shade = shade * (1 - moustache * np.exp(-(((v + 0.071) / 0.0065) ** 2)) * smooth_array(0.034, 0.026, u))
        shade = 1 + (shade - 1) * ahead
        if not spec.get("hijab"):
            # Dark under the hair, so the gaps between its cards read as more hair.
            line = 0.052 + 0.1 * smooth_array(figure.head_y - 0.09, figure.head_y + 0.03, points[:, 1]) * -1
            shade = shade * (1 - 0.88 * smooth_array(line, line + 0.022, v))
        return shade

    return paint


def to_object(figure, part):
    """Makes a part real in Blender, thins it to its budget, and hands it to the skeleton."""
    mesh = bpy.data.meshes.new(part.name)
    mesh.from_pydata(part.points.tolist(), [], part.polygons)
    mesh.update()
    layer = mesh.uv_layers.new(name="UV")
    layer.data.foreach_set("uv", np.array([uv for corners in part.corner_uv for uv in corners], np.float32).ravel())
    mesh.shade_smooth()
    obj = bpy.data.objects.new(f"{figure.name}.{part.name}", mesh)
    bpy.context.scene.collection.objects.link(obj)
    top = np.argsort(part.weights, axis=1)[:, -4:]
    rows = np.arange(len(part.weights))[:, None]
    kept = np.zeros_like(part.weights)
    kept[rows, top] = part.weights[rows, top]
    total = kept.sum(axis=1, keepdims=True)
    kept = np.divide(kept, total, out=np.zeros_like(kept), where=total > 0)
    for column, name in enumerate(BONES):
        used = np.nonzero(kept[:, column] > 0.01)[0]
        if not len(used):
            continue
        group = obj.vertex_groups.new(name=name)
        for vertex in used.tolist():
            group.add([vertex], float(kept[vertex, column]), "REPLACE")
    triangles = sum(len(p.vertices) - 2 for p in mesh.polygons)
    select_only(obj)
    if triangles > part.budget:
        modifier = obj.modifiers.new("Thin", "DECIMATE")
        modifier.ratio = part.budget / triangles
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    work = bmesh.new()
    work.from_mesh(obj.data)
    bmesh.ops.triangulate(work, faces=work.faces)
    work.to_mesh(obj.data)
    work.free()
    obj.data.shade_smooth()
    obj.parent = figure.rig
    rigging = obj.modifiers.new("Rig", "ARMATURE")
    rigging.object = figure.rig
    part.object = obj
    return obj


def skinning(figure, on):
    """Off while a pose is being worked out: every `aim` updates the scene, and only `capture` needs the meshes."""
    for part in figure.skinned:
        part.object.modifiers["Rig"].show_viewport = on


def capture(figure):
    """Where every vertex of every skinned part is right now, with its normal, in room space."""
    skinning(figure, True)
    update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    offset = np.array(figure.rig.location)
    points, normals = [], []
    for part in figure.skinned:
        evaluated = part.object.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        count = len(mesh.vertices)
        co = np.empty(count * 3, np.float32)
        no = np.empty(count * 3, np.float32)
        mesh.vertices.foreach_get("co", co)
        mesh.vertex_normals.foreach_get("vector", no)
        points.append(co.reshape(-1, 3) + offset)
        normals.append(no.reshape(-1, 3))
        evaluated.to_mesh_clear()
    skinning(figure, False)
    return np.concatenate(points), np.concatenate(normals)


def joints_now(figure):
    rig = figure.rig
    offset = rig.location
    out = {"Hips": tuple(rig.pose.bones["Hips"].head + offset)}
    for key in "LR":
        for name in ("Thigh", "Shin", "Foot"):
            out[f"{name}{key}"] = tuple(rig.pose.bones[f"{name}{key}"].head + offset)
    return out


def ambient(figure, points, normals):
    """How much of the street's light reaches each vertex: rays out, counted against everything else."""
    bvh_points = [tuple(p) for p in points]
    triangles = [tuple(int(i) for i in tri) for tri in figure.all_tris]
    tree = BVHTree.FromPolygons(bvh_points, triangles, all_triangles=True)
    rng = np.random.default_rng(5)
    rays = rng.normal(0, 1, (28, 3))
    rays /= np.linalg.norm(rays, axis=1, keepdims=True)
    open_sky = np.zeros(len(points), np.float32)
    for index, (point, normal) in enumerate(zip(points, normals)):
        start = Vector(point) + Vector(normal) * 0.006
        seen = 0
        total = 0
        for ray in rays:
            facing = ray @ normal
            if facing <= 0.02:
                ray = -ray
                facing = -facing
                if facing <= 0.02:
                    continue
            total += facing
            if tree.ray_cast(start, Vector(ray), 0.32)[0] is None:
                seen += facing
        open_sky[index] = seen / max(total, 1e-5)
    return open_sky


def build(figure):
    figure.parts = dress(figure)
    figure.make_rig()
    rig = figure.rig
    # What the feet measure, from the shoes themselves.
    shoes = [part for part in figure.parts if part.name == "ShoeL"][0].points
    ankle = figure.joint("foot.L", "head")
    toe = figure.joint("toe3-1.L", "head")
    figure.sole = float(shoes[:, 2].min())
    figure.foot = (float(shoes[:, 1].max() - ankle[1]) * -1 + 0.0, float(ankle[2] - shoes[:, 2].min()), 0.0)
    heel_y = float(shoes[:, 1].max())
    toe_y = float(shoes[:, 1].min())
    length = heel_y - toe_y
    # In the foot's own terms, measured forward from the heel: where the ankle is, and the ball.
    figure.foot = (heel_y - float(ankle[1]), float(ankle[2] - shoes[:, 2].min()), length * 0.72)
    figure.foot_slope = math.atan2(float(ankle[2] - toe[2]), float(ankle[1] - toe[1]))
    bones = rig.data.bones
    figure.leg = bones["ThighL"].length + bones["ShinL"].length
    figure.hips = bones["Hips"].head_local.copy()
    figure.hip_rest = float(bones["Hips"].head_local.z)

    skirt = None
    if "skirt" in figure.spec:
        s = figure.spec["skirt"]
        size = figure.height / (1.63 if figure.spec.get("hijab") else 1.7)
        skirt = Skirt(figure, s["top"] * size, s["hem"] * size, s["flare"], s["ease"], slit=s.get("slit", False))
        skirt.measure(figure.metres(figure.base)[BODY_VERTS])
        # Under a long coat, only what shows below its hem is worth drawing.
        for part in figure.parts:
            if part.slot == BOTTOM:
                clip_part(part, lambda p: p[:, 2] < skirt.hem + 0.14)
    if figure.spec.get("hijab"):
        wearing = [p.points for p in figure.parts if p.slot in (TOP, UNDER)] + [figure.metres(figure.base)[BODY_VERTS]]
        figure.parts.append(make_hijab(figure, np.concatenate(wearing), 340))

    for part in figure.parts:
        to_object(figure, part)
    figure.skinned = list(figure.parts)
    skinning(figure, False)
    update()

    # Columns of the animation, part by part, and the triangles with their UVs.
    first = 0
    tris = []
    for part in figure.skinned:
        mesh = part.object.data
        mesh.calc_loop_triangles()
        layer = mesh.uv_layers.active
        uv = np.empty(len(layer.data) * 2, np.float32)
        layer.data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        part.first = first
        part.columns = len(mesh.vertices)
        part.tris = np.array([tri.vertices[:] for tri in mesh.loop_triangles], np.int32) + first
        part.tri_uv = np.array([[uv[loop] for loop in tri.loops] for tri in mesh.loop_triangles], np.float32)
        first += part.columns
        tris.append(part.tris)
    figure.all_tris = np.concatenate(tris)

    reached = []
    frames, normals, joint_frames = [], [], []
    for frame in range(WALK_FRAMES):
        reached.append(walk_pose(figure, frame / WALK_FRAMES))
        p, n = capture(figure)
        frames.append(p)
        normals.append(n)
        joint_frames.append(joints_now(figure))
    idle_joints = []
    for frame in range(IDLE_FRAMES):
        idle_pose(figure, frame / IDLE_FRAMES)
        p, n = capture(figure)
        frames.append(p)
        normals.append(n)
        idle_joints.append(joints_now(figure))
    print(figure.name, "leg stretched to", round(max(reached), 3), "of its length", flush=True)
    frames = np.array(frames)
    normals = np.array(normals)
    open_sky = ambient(figure, frames[WALK_FRAMES], normals[WALK_FRAMES])

    # The skirt's frames join on as extra columns.
    if skirt:
        coat = [part for part in figure.skinned if part.slot == TOP][0]
        span = slice(coat.first, coat.first + coat.columns)
        grids = skirt.frames(joint_frames, [f[span] for f in frames[:WALK_FRAMES]]) + skirt.frames(idle_joints, [f[span] for f in frames[WALK_FRAMES:]])
        rows, around = skirt.rows + 1, skirt.around
        grid = np.array(grids)
        grid_n = np.array([grid_normals(g) for g in grid])
        count = rows * around
        first = frames.shape[1]
        frames = np.concatenate([frames, grid.reshape(len(grid), count, 3).astype(np.float32)], axis=1)
        normals = np.concatenate([normals, grid_n.reshape(len(grid), count, 3).astype(np.float32)], axis=1)
        open_sky = np.concatenate([open_sky, np.tile(np.linspace(0.8, 0.55, rows)[:, None], (1, around)).ravel().astype(np.float32)])
        part = Part("Skirt", TOP, np.zeros((1, 3)), [(0, 0)], [], np.zeros((1, len(BONES))), None, 0, (150, 100))
        part.cloth = (23, 0.08)
        tri_rows, uv_rows = [], []
        for row in range(rows - 1):
            for b in range(around):
                n = (b + 1) % around
                a0, a1 = row * around + b, row * around + n
                b0, b1 = (row + 1) * around + b, (row + 1) * around + n
                # Wound so the outside faces out, as the rest are.
                tri_rows.append((a0, b0, b1))
                tri_rows.append((a0, b1, a1))
                u0, u1 = b / around, (b + 1) / around
                v0, v1 = 1 - row / (rows - 1), 1 - (row + 1) / (rows - 1)
                uv_rows.append(((u0, v0), (u0, v1), (u1, v1)))
                uv_rows.append(((u0, v0), (u1, v1), (u1, v0)))
        part.first = first
        part.columns = count
        part.tris = np.array(tri_rows, np.int32) + first
        part.tri_uv = np.array(uv_rows, np.float32)
        part.corner_uv = []
        part.box = (np.array([0.0, 0.0]), np.array([1.0, 1.0]))
        figure.parts.append(part)

    # Standing on the ground, whatever the shoes' soles measure.
    low = frames[:, :, 2].min()
    frames[:, :, 2] -= low
    figure.frames = frames
    figure.normals = normals
    figure.open_sky = open_sky
    total = sum(len(part.tris) for part in figure.parts)
    print(figure.name, "columns", frames.shape[1], "triangles", total, {part.name: len(part.tris) for part in figure.parts}, flush=True)


# ── writing it out ───────────────────────────────────────────────────────────────────────────


def octahedral(normals):
    n = normals / np.maximum(np.abs(normals).sum(axis=-1, keepdims=True), 1e-9)
    x, y, z = n[..., 0], n[..., 1], n[..., 2]
    folded_x = (1 - np.abs(y)) * np.where(x >= 0, 1, -1)
    folded_y = (1 - np.abs(x)) * np.where(y >= 0, 1, -1)
    u = np.where(z >= 0, x, folded_x)
    v = np.where(z >= 0, y, folded_y)
    return np.round((u * 0.5 + 0.5) * 255).astype(np.uint16), np.round((v * 0.5 + 0.5) * 255).astype(np.uint16)


def sheet_uv(part, corners, tile_index, sheet_w, sheet_h):
    """Where a corner's UV lands on the sheet."""
    low, high = part.box
    column = tile_index % SHEET_COLUMNS
    row = tile_index // SHEET_COLUMNS
    x, y, w, h = part.rect
    u = (column * TILE_W + x + (corners[..., 0] - low[0]) / (high[0] - low[0]) * w) / sheet_w
    v = (row * TILE_H + y + (corners[..., 1] - low[1]) / (high[1] - low[1]) * h) / sheet_h
    return np.stack([u, v], axis=-1)


def figure_blob(figure, tile_index, sheet_w, sheet_h):
    """One figure's animation and its drawn vertices, in three.js axes, as bytes."""
    frames = figure.frames
    normals = figure.normals
    # Blender to three: x, z, -y.
    three = np.stack([frames[..., 0], frames[..., 2], -frames[..., 1]], axis=-1)
    three_n = np.stack([normals[..., 0], normals[..., 2], -normals[..., 1]], axis=-1)
    low = three.reshape(-1, 3).min(axis=0)
    span = np.maximum(three.reshape(-1, 3).max(axis=0) - low, 1e-4)
    quantised = np.round((three - low) / span * 65535).astype(np.uint16)
    u, v = octahedral(three_n)
    texels = np.concatenate([quantised, ((u << 8) | v)[..., None]], axis=-1).astype("<u2")

    seen = {}
    columns, us, vs, slots, index = [], [], [], [], []
    for part in figure.parts:
        uv = sheet_uv(part, part.tri_uv, tile_index, sheet_w, sheet_h)
        uv16 = np.round(np.clip(uv, 0, 1) * 65535).astype(np.int64)
        for tri, corners in zip(part.tris.tolist(), uv16.tolist()):
            # Blender's front faces are counter-clockwise, and x, z, -y keeps them so.
            for column, (a, b) in zip(tri, corners):
                key = (column, a, b, part.slot)
                at = seen.get(key)
                if at is None:
                    at = len(columns)
                    seen[key] = at
                    columns.append(column)
                    us.append(a)
                    vs.append(b)
                    slots.append(part.slot)
                index.append(at)
    columns = np.array(columns, "<u2")
    shade = np.round(np.clip(figure.open_sky[columns.astype(np.int64)], 0, 1) * 255).astype(np.uint8)
    if len(columns) > 65535 or frames.shape[1] > 8192:
        raise RuntimeError("Too many vertices")
    blob = texels.tobytes()
    blob += columns.tobytes()
    blob += np.stack([np.array(us, "<u2"), np.array(vs, "<u2")], axis=-1).tobytes()
    blob += np.stack([np.array(slots, np.uint8), shade], axis=-1).tobytes()
    if len(blob) % 2:
        blob += b"\0"
    blob += np.array(index, "<u2").tobytes()
    while len(blob) % 4:
        blob += b"\0"
    head = struct.pack("<4I", frames.shape[1], len(columns), len(index), 0)
    head += struct.pack("<8f", *low.tolist(), *span.tolist(), figure.style["stride"], figure.style["pace"])
    return head, blob


def save_sheet(sheet, path):
    height, width = sheet.shape
    image = bpy.data.images.new("PeopleSheet", width, height, alpha=False, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    pixels = np.ones((height, width, 4), np.float32)
    pixels[..., :3] = sheet[..., None]
    image.pixels.foreach_set(pixels.ravel())
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 86
    scene.view_settings.view_transform = "Raw"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"
    image.save_render(path, scene=scene)
    bpy.data.images.remove(image)


# ── a look at them, to judge the walk and the clothes by eye ─────────────────────────────────

LOOK_TINT = {SKIN: (0.62, 0.42, 0.3), TOP: (0.22, 0.26, 0.24), UNDER: (0.7, 0.7, 0.72), BOTTOM: (0.13, 0.17, 0.3), SHOES: (0.08, 0.06, 0.05), HAIR: (0.04, 0.03, 0.026), SCARF: (0.5, 0.42, 0.42), EYE: (0.6, 0.6, 0.6)}


def look(figures, sheet, directory):
    """Stands each figure in a row of its own frames, for a plain render on the CPU."""
    os.makedirs(directory, exist_ok=True)
    scene = bpy.context.scene
    for item in list(bpy.data.objects):
        bpy.data.objects.remove(item)
    path = os.path.join(directory, "sheet.png")
    height, width = sheet.shape
    image = bpy.data.images.new("Sheet", width, height, alpha=False, float_buffer=True)
    pixels = np.ones((height, width, 4), np.float32)
    pixels[..., :3] = sheet[..., None]
    image.pixels.foreach_set(pixels.ravel())
    image.colorspace_settings.name = "Non-Color"
    material = bpy.data.materials.new("People")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.7
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    square = nodes.new("ShaderNodeMath")
    square.operation = "MULTIPLY"
    links.new(texture.outputs["Color"], square.inputs[0])
    links.new(texture.outputs["Color"], square.inputs[1])
    four = nodes.new("ShaderNodeMath")
    four.operation = "MULTIPLY"
    four.inputs[1].default_value = 4
    links.new(square.outputs[0], four.inputs[0])
    tint = nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "Tint"
    mix = nodes.new("ShaderNodeVectorMath")
    mix.operation = "SCALE"
    links.new(tint.outputs["Color"], mix.inputs[0])
    links.new(four.outputs[0], mix.inputs["Scale"])
    links.new(mix.outputs[0], shader.inputs["Base Color"])

    world = bpy.data.worlds.new("Grey")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.75, 0.75, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    scene.world = world
    light = bpy.data.lights.new("Key", "SUN")
    light.energy = 2.5
    light.angle = 0.3
    sun = bpy.data.objects.new("Key", light)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(55), 0, math.radians(35))
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 14
    scene.cycles.use_denoising = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Standard"

    def place(figure, tile_index, frame, x, y=0.0):
        points = figure.frames[frame] + np.array([x, y, 0])
        tris, uvs, slots = [], [], []
        sheet_h, sheet_w = sheet.shape
        for part in figure.parts:
            tris.append(part.tris)
            uvs.append(sheet_uv(part, part.tri_uv, tile_index, sheet_w, sheet_h))
            slots.extend([part.slot] * len(part.tris))
        tris = np.concatenate(tris)
        uvs = np.concatenate(uvs)
        mesh = bpy.data.meshes.new("Frame")
        mesh.from_pydata(points.tolist(), [], tris.tolist())
        mesh.update()
        layer = mesh.uv_layers.new(name="UV")
        layer.data.foreach_set("uv", uvs.reshape(-1).astype(np.float32))
        colour = mesh.color_attributes.new("Tint", "FLOAT_COLOR", "CORNER")
        colours = np.ones((len(tris) * 3, 4), np.float32)
        for index, slot in enumerate(slots):
            colours[index * 3 : index * 3 + 3, :3] = LOOK_TINT[slot]
        colour.data.foreach_set("color", colours.ravel())
        mesh.shade_smooth()
        mesh.materials.append(material)
        obj = bpy.data.objects.new("Frame", mesh)
        scene.collection.objects.link(obj)
        return obj

    camera_data = bpy.data.cameras.new("Look")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("Look", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    def shoot(name, x, turn, scale, width_px, height_px, z=0.95):
        camera_data.ortho_scale = scale
        scene.render.resolution_x = width_px
        scene.render.resolution_y = height_px
        camera.rotation_euler = (math.radians(90), 0, math.radians(turn))
        camera.location = (x + 8 * math.sin(math.radians(turn)), -8 * math.cos(math.radians(turn)), z)
        scene.render.filepath = os.path.join(directory, name)
        bpy.ops.render.render(write_still=True)

    # Everyone in a line at the same moment, and each one's walk, side on.
    for row, (figure, tile_index) in enumerate(figures):
        place(figure, tile_index, 4, row * 0.95)
    shoot("cast-front.png", (len(figures) - 1) * 0.95 / 2, 0, 2.6 + len(figures) * 0.95, 1500, 620)
    shoot("cast-turn.png", (len(figures) - 1) * 0.95 / 2, 28, 2.6 + len(figures) * 0.95, 1500, 620)
    shoot("cast-back.png", (len(figures) - 1) * 0.95 / 2, 180, 2.6 + len(figures) * 0.95, 1500, 620)
    shoot("cast-heads.png", (len(figures) - 1) * 0.95 / 2, 12, 0.95 * len(figures) + 0.2, 1500, 300, 1.5)
    for item in [o for o in bpy.data.objects if o.name.startswith("Frame")]:
        bpy.data.objects.remove(item)
    for figure, tile_index in figures:
        chosen = list(range(0, WALK_FRAMES, 2))
        gap = 1.05
        for slot, frame in enumerate(chosen):
            place(figure, tile_index, frame, 0, -slot * gap)
        # Walking toward the left of the picture, seen from their left.
        camera_data.ortho_scale = gap * len(chosen)
        scene.render.resolution_x = 1600
        scene.render.resolution_y = 400
        camera.rotation_euler = (math.radians(90), 0, math.radians(90))
        camera.location = (8, -(len(chosen) - 1) * gap / 2, 0.95)
        scene.render.filepath = os.path.join(directory, f"walk-{figure.name}.png")
        bpy.ops.render.render(write_still=True)
        for item in [o for o in bpy.data.objects if o.name.startswith("Frame")]:
            bpy.data.objects.remove(item)


def main():
    scene = bpy.context.scene
    for thing in list(bpy.data.objects):
        bpy.data.objects.remove(thing)
    cast = [spec for index, spec in enumerate(CAST) if ONLY is None or index in ONLY]
    rows = (len(CAST) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
    sheet_w, sheet_h = TILE_W * SHEET_COLUMNS, TILE_H * rows
    sheet = np.full((sheet_h, sheet_w), 0.5, np.float32)
    figures = []
    for tile_index, spec in enumerate(cast):
        figure = Figure(spec)
        build(figure)
        tile = np.ones((TILE_H, TILE_W), np.float32)
        pack_tile(figure.parts)
        for part in figure.parts:
            x, y, width, height = part.rect
            tile[y : y + height, x : x + width] = part_detail(part) if part.picture else woven(width, height, part.cloth[0], part.cloth[1])
        column = tile_index % SHEET_COLUMNS
        row = tile_index // SHEET_COLUMNS
        sheet[row * TILE_H : (row + 1) * TILE_H, column * TILE_W : (column + 1) * TILE_W] = np.sqrt(np.clip(tile, 0, 4) / 4)
        figures.append((figure, tile_index))
        # Everything of this figure goes, so the next one's poses don't drag it along.
        for part in figure.parts:
            if part.object:
                bpy.data.objects.remove(part.object)
        bpy.data.objects.remove(figure.rig)
    if MODE == "look":
        look(figures, sheet, LOOK_DIR)
        return
    heads, blobs = [], []
    for figure, tile_index in figures:
        head, blob = figure_blob(figure, tile_index, sheet_w, sheet_h)
        heads.append(head)
        blobs.append(blob)
    out = struct.pack("<4I", len(figures), WALK_FRAMES, IDLE_FRAMES, 0) + b"".join(heads) + b"".join(blobs)
    target = os.path.join(ROOT, "public/moto/city/people.bin")
    with open(target, "wb") as file:
        file.write(out)
    picture_path = os.path.join(ROOT, "public/moto/city/people.webp")
    save_sheet(sheet, picture_path)
    print("Wrote", round(len(out) / 1e6, 3), "MB and a picture of", round(os.path.getsize(picture_path) / 1e3), "KB", flush=True)


main()

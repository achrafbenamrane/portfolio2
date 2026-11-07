"""
The chef's body: MakeHuman's base mesh, shaped into a young man and dressed.

MakeHuman's meshes, targets, clothes and skins are CC0, so what's built here can be sold.
Only its data is used: the zips are read directly, and none of the add-on's code runs.
Each garment is bound to the body by weights in its .mhclo file, which is how it follows
the shape, and how it inherits the skeleton's weights.

Needs assets-source/pizza/human/dl/mpfb.zip and system.zip: see scripts/blender/README.md.

    python scripts/pizza_chef_human.py

Writes assets-source/pizza/chef/human.npz, and the textures beside it.
"""

import gzip
import io
import json
import re
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

HUMAN = Path("assets-source/pizza/human/dl")
CHEF = Path("assets-source/pizza/chef")
TEXTURES = CHEF / "tex"

HEIGHT = 1.79

mpfb = zipfile.ZipFile(HUMAN / "mpfb.zip")
system = zipfile.ZipFile(HUMAN / "system.zip")
DATA = mpfb.namelist()[0] + "src/mpfb/data/"


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


def target(name, weight=1.0):
    text = gzip.decompress(mpfb.read(DATA + f"targets/macrodetails/{name}.target.gz")).decode()
    for line in text.splitlines():
        if not line or line[0] == "#":
            continue
        index, x, y, z = line.split()[:4]
        base[int(index)] += weight * np.array([float(x), float(y), float(z)])


base, base_uvs, base_polygons, base_groups = parse_obj(mpfb.read(DATA + "3dobjs/base.obj").decode())

# A lean, fit young man.
target("universal-male-young-averagemuscle-averageweight", 0.72)
target("universal-male-young-maxmuscle-averageweight", 0.28)
target("caucasian-male-young")

body_verts = sorted({i for polygon, group in zip(base_polygons, base_groups) if group == "body" for i, _ in polygon})


def to_metres(points, scale, floor):
    """MakeHuman is Y up and in decimetres, facing +Z. The rest of this project is Z up, facing -Y."""
    p = np.asarray(points) * 0.1 * scale
    return np.stack([p[..., 0], -p[..., 2], p[..., 1] - floor], axis=-1)


scale = HEIGHT / (np.ptp(base[body_verts, 1]) * 0.1)
floor = base[body_verts, 1].min() * 0.1 * scale


# The skeleton ---------------------------------------------------------------------------

rig = json.loads(mpfb.read(DATA + "rigs/standard/rig.default.json"))
cubes = {}
for polygon, group in zip(base_polygons, base_groups):
    if group.startswith("joint-"):
        cubes.setdefault(group, set()).update(i for i, _ in polygon)


def place(spec):
    if spec["strategy"] == "CUBE":
        return base[sorted(cubes[spec["cube_name"]])].mean(axis=0)
    if spec["strategy"] == "VERTEX":
        return base[spec["vertex_index"]]
    return base[spec["vertex_indices"]].mean(axis=0)


def joint(name, end="head"):
    return to_metres(place(rig[name][end]), scale, floor)


bones = {
    "Hips": (joint("spine05"), joint("spine04")),
    "Spine": (joint("spine04"), joint("spine02")),
    "Chest": (joint("spine02"), joint("neck01")),
    "Neck": (joint("neck01"), joint("head")),
    "Head": (joint("head"), joint("head", "tail")),
}
parents = {"Hips": "Root", "Spine": "Hips", "Chest": "Spine", "Neck": "Chest", "Head": "Neck"}
rolls = {}
for tag, side in (("L", ".L"), ("R", ".R")):
    bones[f"UpperArm{tag}"] = (joint(f"upperarm01{side}"), joint(f"lowerarm01{side}"))
    bones[f"ForeArm{tag}"] = (joint(f"lowerarm01{side}"), joint(f"wrist{side}"))
    bones[f"Hand{tag}"] = (joint(f"wrist{side}"), joint(f"finger3-1{side}"))
    bones[f"Thigh{tag}"] = (joint(f"upperleg01{side}"), joint(f"lowerleg01{side}"))
    bones[f"Shin{tag}"] = (joint(f"lowerleg01{side}"), joint(f"foot{side}"))
    bones[f"Foot{tag}"] = (joint(f"foot{side}"), joint(f"toe3-1{side}"))
    parents.update(
        {
            f"UpperArm{tag}": "Chest",
            f"ForeArm{tag}": f"UpperArm{tag}",
            f"Hand{tag}": f"ForeArm{tag}",
            f"Thigh{tag}": "Hips",
            f"Shin{tag}": f"Thigh{tag}",
            f"Foot{tag}": f"Shin{tag}",
        }
    )
    for finger in range(1, 6):
        for segment in range(1, 4):
            name = f"Finger{finger}{segment}{tag}"
            source = f"finger{finger}-{segment}{side}"
            bones[name] = (joint(source), joint(source, "tail"))
            parents[name] = f"Hand{tag}" if segment == 1 else f"Finger{finger}{segment - 1}{tag}"
            rolls[name] = rig[source].get("roll", 0.0)


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


names = list(bones)
index_of = {name: i for i, name in enumerate(names)}
weights = np.zeros((len(base), len(names)), np.float32)
raw = json.loads(mpfb.read(DATA + "rigs/standard/weights.default.json"))["weights"]
for source, pairs in raw.items():
    column = index_of[simple_bone(source)]
    for vertex, value in pairs:
        weights[vertex, column] += value
total = weights.sum(axis=1, keepdims=True)
weights = np.divide(weights, total, out=np.zeros_like(weights), where=total > 0)


# Dressing -------------------------------------------------------------------------------


def read_clothes(path):
    """Fits a .mhclo garment to the body as it now stands."""
    text = system.read(path).decode("utf8", "ignore").splitlines()
    scales = {}
    binding = []
    deleted = []
    obj_file = None
    section = None
    for line in text:
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
        elif section and not re.match(r"^-?\d", words[0]):
            section = None

    def factor(axis):
        a, b, reference = scales[axis]
        column = "xyz".index(axis)
        return abs(base[a, column] - base[b, column]) / reference

    stretch = np.array([factor("x"), factor("y"), factor("z")])
    folder = path.rsplit("/", 1)[0]
    vertices, uvs, polygons, _ = parse_obj(system.read(f"{folder}/{obj_file}").decode("utf8", "ignore"))
    fitted = np.zeros_like(vertices)
    garment_weights = np.zeros((len(vertices), len(names)), np.float32)
    for row, words in enumerate(binding[: len(vertices)]):
        if len(words) == 1:
            fitted[row] = base[int(words[0])]
            garment_weights[row] = weights[int(words[0])]
            continue
        i, j, k = (int(n) for n in words[:3])
        a, b, c = (float(n) for n in words[3:6])
        offset = np.array([float(n) for n in words[6:9]])
        fitted[row] = a * base[i] + b * base[j] + c * base[k] + offset * stretch
        garment_weights[row] = a * weights[i] + b * weights[j] + c * weights[k]
    return fitted, uvs, polygons, garment_weights, set(deleted)


def pack(vertices, uvs, polygons, part_weights, keep=None):
    """Keeps the polygons asked for, and drops the vertices they don't use."""
    chosen = [p for p in polygons if keep is None or keep(p)]
    used = sorted({i for polygon in chosen for i, _ in polygon})
    remap = {old: new for new, old in enumerate(used)}
    return {
        "v": to_metres(vertices[used], scale, floor).astype(np.float32),
        "sizes": np.array([len(p) for p in chosen], np.int32),
        "loops": np.array([remap[i] for polygon in chosen for i, _ in polygon], np.int32),
        "uv": np.array([uvs[t] if t >= 0 else (0, 0) for polygon in chosen for _, t in polygon], np.float32),
        "w": part_weights[used].astype(np.float32),
        "source": np.array(used, np.int32),
    }


shirt, shirt_uvs, shirt_polygons, shirt_weights, shirt_hides = read_clothes("clothes/male_casualsuit03/male_casualsuit03.mhclo")
shoes, shoe_uvs, shoe_polygons, shoe_weights, shoe_hides = read_clothes("clothes/shoes04/shoes04.mhclo")
eyes, eye_uvs, eye_polygons, eye_weights, _ = read_clothes("eyes/high-poly/high-poly.mhclo")
teeth, teeth_uvs, teeth_polygons, teeth_weights, _ = read_clothes("teeth/teeth_base/teeth_base.mhclo")
hair, hair_uvs, hair_polygons, hair_weights, _ = read_clothes("hair/short01/short01.mhclo")

hidden = shirt_hides | shoe_hides
body_polygons = [
    polygon
    for polygon, group in zip(base_polygons, base_groups)
    if group == "body" and not any(i in hidden for i, _ in polygon)
]

parts = {
    "Body": pack(base, base_uvs, body_polygons, weights),
    "Suit": pack(shirt, shirt_uvs, shirt_polygons, shirt_weights),
    "Shoes": pack(shoes, shoe_uvs, shoe_polygons, shoe_weights),
    "Eyes": pack(eyes, eye_uvs, eye_polygons, eye_weights),
    "Teeth": pack(teeth, teeth_uvs, teeth_polygons, teeth_weights),
    "Hair": pack(hair, hair_uvs, hair_polygons, hair_weights),
}


# Textures -------------------------------------------------------------------------------

TEXTURES.mkdir(parents=True, exist_ok=True)


def extract(source, name):
    (TEXTURES / name).write_bytes(system.read(source))


extract("skins/young_caucasian_male/young_lightskinned_male_diffuse.png", "skin.png")
extract("clothes/shoes04/shoes04_diffuse.png", "shoes.png")
extract("clothes/shoes04/shoes04_normal.png", "shoes-normal.png")
extract("clothes/male_casualsuit03/male_casualsuit03_normal.png", "suit-normal.png")
extract("eyes/materials/brown_eye.png", "eye.png")
extract("teeth/teeth_base/teeth.png", "teeth.png")
hair_picture = next(n for n in system.namelist() if n.startswith("hair/short01/") and n.endswith(".png"))
extract(hair_picture, "hair.png")

# The check shirt and jeans, turned into chef's whites and dark trousers. Blue is the jeans:
# what's left is the shirt, and the shade in its folds stays.
suit = np.asarray(Image.open(io.BytesIO(system.read("clothes/male_casualsuit03/male_casualsuit03_diffuse.png"))).convert("RGB")).astype(np.float32) / 255
shade = np.asarray(Image.open(io.BytesIO(system.read("clothes/male_casualsuit03/male_casualsuit03_ao.png"))).convert("L").resize(suit.shape[1::-1])).astype(np.float32) / 255
blue = suit[..., 2] - suit[..., 0]
trousers = np.clip(blue * 9 + 0.1, 0, 1)
from scipy import ndimage as ndi  # noqa: E402

trousers = ndi.gaussian_filter((ndi.median_filter(trousers, 9) > 0.5).astype(np.float32), 1.5)
white = np.array([0.9, 0.89, 0.86]) * (0.42 + 0.58 * shade[..., None])
luminance = suit.mean(axis=-1, keepdims=True)
dark = np.array([0.11, 0.11, 0.12]) * (0.55 + 1.1 * luminance)
recoloured = white * (1 - trousers[..., None]) + dark * trousers[..., None]
Image.fromarray((np.clip(recoloured, 0, 1) * 255).astype(np.uint8)).save(TEXTURES / "suit.png")

payload = {"bone_names": np.array(names), "bone_heads": np.array([bones[n][0] for n in names], np.float32)}
payload["bone_tails"] = np.array([bones[n][1] for n in names], np.float32)
payload["bone_parents"] = np.array([parents[n] for n in names])
payload["finger_rolls"] = np.array([rolls.get(n, 0.0) for n in names], np.float32)
for name, part in parts.items():
    for key, value in part.items():
        payload[f"{name}_{key}"] = value
    print(f"{name}: {len(part['v'])} vertices, {len(part['sizes'])} polygons")
np.savez_compressed(CHEF / "human.npz", **payload)
print("height", round(float(np.ptp(parts["Body"]["v"][:, 2])), 3), "bones", len(names))

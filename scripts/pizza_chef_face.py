"""
Turns MakeHuman's head into the person in the portrait.

The face landmarker is run on two pictures: the portrait, and a straight-on render of the
base head. That gives the same 478 points on both faces, so the head can be pulled into
shape point for point, and the portrait laid over it. Whatever the photo can't show, like
the ears and the neck, keeps the mesh's own skin, tinted to match.

    python scripts/pizza_chef_face.py

Needs face.json, mh-face.json and human.npz in assets-source/pizza/chef/. Writes
face-fit.npz and tex/skin-face.png.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import LinearNDInterpolator, RBFInterpolator
from scipy.spatial import cKDTree

CHEF = Path("assets-source/pizza/chef")
PORTRAIT = Path("public/portrait.webp")

# As rendered by `build_chef.py head`.
VIEW_WIDTH = 0.4
VIEW_MIDDLE = 1.62
DEPTH_TRUST = 0.86
SKIN_SIZE = 4096

human = np.load(CHEF / "human.npz")
mh_face = json.loads((CHEF / "mh-face.json").read_text())
his_face = json.loads((CHEF / "face.json").read_text())


def landmarks(face):
    return np.array([[p["x"], p["y"], p["z"]] for p in face["points"]])


his = landmarks(his_face)
mh = landmarks(mh_face)
size = his_face["width"]

body = human["Body_v"].astype(np.float64)
head_bone = list(human["bone_names"]).index("Head")
neck_bone = list(human["bone_names"]).index("Neck")
on_head = (human["Body_w"][:, head_bone] + human["Body_w"][:, neck_bone]) > 0.5

# Where the base head's landmarks sit in space: across and up from the picture, and depth
# from the front of the mesh.
source = np.stack(
    [(mh[:, 0] - 0.5) * VIEW_WIDTH, np.zeros(len(mh)), VIEW_MIDDLE - (mh[:, 1] - 0.5) * VIEW_WIDTH],
    axis=-1,
)
head_points = body[on_head]
front = head_points[head_points[:, 1] < np.median(head_points[:, 1])]
tree = cKDTree(front[:, [0, 2]])
_, near = tree.query(source[:, [0, 2]], k=8)
source[:, 1] = front[near, 1].min(axis=1)

# The portrait's landmarks in metres, then fitted onto the base head as a whole: its size
# and position and tilt, so what's left is only the shape of the face.
target = np.stack([his[:, 0] * size, his[:, 2] * size * DEPTH_TRUST, -his[:, 1] * size], axis=-1)


def similarity(a, b):
    """The scale, turn and shift that best lay `a` over `b`."""
    ca, cb = a.mean(axis=0), b.mean(axis=0)
    u, s, vt = np.linalg.svd((a - ca).T @ (b - cb))
    d = np.sign(np.linalg.det(u @ vt))
    rotation = u @ np.diag([1, 1, d]) @ vt
    scale = (s * [1, 1, d]).sum() / ((a - ca) ** 2).sum()
    return scale, rotation, cb - scale * ca @ rotation


scale, rotation, shift = similarity(target, source)
fitted = scale * target @ rotation + shift

# The lips are shut on the mesh and parted in the photo, and two points in one place can't
# go two ways, so the inside of the mouth is left out.
INNER_LIPS = {13, 14, 78, 80, 81, 82, 87, 88, 95, 178, 191, 308, 310, 311, 312, 317, 318, 324, 402, 415}
keep = np.array([i for i in range(468) if i not in INNER_LIPS])
warp = RBFInterpolator(source[keep], (fitted - source)[keep], kernel="thin_plate_spline", smoothing=1e-5)

reach = cKDTree(source[keep])


def falloff(points):
    """All of the warp on the face, none of it by the time it gets to the shoulders."""
    distance, _ = reach.query(points)
    t = np.clip(1 - (distance - 0.012) / 0.07, 0, 1)
    return t * t * (3 - 2 * t)


moved = body.copy()
moved[on_head] += warp(body[on_head]) * falloff(body[on_head])[:, None]

# The eyes and teeth move as whole things, or they'd stop being round.
result = {"Body_v": moved.astype(np.float32)}
eyes = human["Eyes_v"].astype(np.float64)
for sign, corners in ((1, [263, 362]), (-1, [33, 133])):
    part = np.sign(eyes[:, 0]) == sign
    eyes[part] += (fitted[corners] - source[corners]).mean(axis=0)
result["Eyes_v"] = eyes.astype(np.float32)
teeth = human["Teeth_v"].astype(np.float64)
teeth += (fitted[[61, 291, 0, 17]] - source[[61, 291, 0, 17]]).mean(axis=0)
result["Teeth_v"] = teeth.astype(np.float32)
hair = human["Hair_v"].astype(np.float64)
hair += warp(hair) * falloff(hair)[:, None]
result["Hair_v"] = hair.astype(np.float32)
np.savez_compressed(CHEF / "face-fit.npz", **result)

# The skin -------------------------------------------------------------------------------

picture = np.asarray(Image.open(PORTRAIT).convert("RGBA")).astype(np.float32) / 255
solid = ndi.binary_erosion(picture[..., 3] > 0.9, iterations=3)
nearest = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
photo = picture[..., :3][nearest[0], nearest[1]]

# Each vertex's place in the photo: undo the fit, and read it off from the front.
back = (moved - shift) @ rotation.T / scale
photo_x = back[:, 0]
photo_y = -back[:, 2]

# How much of the photo to use: all of the face, fading out past its edge. The oval is the
# landmarks' own outline, raised past the top of the forehead to take in the hairline.
oval = sorted({index for edge in json.loads((CHEF / "face.json").read_text())["oval"] for index in (edge["start"], edge["end"])})
outline = his[oval, :2] * size
centre = outline.mean(axis=0)
outline = centre + (outline - centre) * np.array([0.97, 1.0])
top = outline[:, 1] < centre[1]
outline[top, 1] = centre[1] + (outline[top, 1] - centre[1]) * 1.2

grid = np.zeros((size, size), np.uint8)
from skimage.draw import polygon as fill_polygon  # noqa: E402

angles = np.arctan2(outline[:, 1] - centre[1], outline[:, 0] - centre[0])
ordered = outline[np.argsort(angles)]
rows, columns = fill_polygon(ordered[:, 1], ordered[:, 0], grid.shape)
grid[rows, columns] = 1
inside = ndi.distance_transform_edt(grid)
mask = np.clip(inside / 26, 0, 1)
mask = mask * mask * (3 - 2 * mask)

skin = Image.open(CHEF / "tex/skin.png").convert("RGB").resize((SKIN_SIZE, SKIN_SIZE), Image.LANCZOS)
skin = np.asarray(skin).astype(np.float32) / 255

# Lay the corners of the head's polygons out in the skin's own space.
sizes = human["Body_sizes"]
loops = human["Body_loops"]
uvs = human["Body_uv"]
facing_front = np.ones(len(body))
loop_on_head = on_head[loops]
u = uvs[loop_on_head, 0]
v = uvs[loop_on_head, 1]
values = np.stack([photo_x[loops[loop_on_head]], photo_y[loops[loop_on_head]]], axis=-1)

low_u, high_u = u.min(), u.max()
low_v, high_v = v.min(), v.max()
columns = np.arange(int(low_u * SKIN_SIZE), int(high_u * SKIN_SIZE))
rows = np.arange(int((1 - high_v) * SKIN_SIZE), int((1 - low_v) * SKIN_SIZE))
grid_u, grid_v = np.meshgrid((columns + 0.5) / SKIN_SIZE, 1 - (rows + 0.5) / SKIN_SIZE)
place = LinearNDInterpolator(np.stack([u, v], axis=-1), values)(grid_u, grid_v)
found = ~np.isnan(place[..., 0])
px = np.where(found, place[..., 0], 0)
py = np.where(found, place[..., 1], 0)

where = np.stack([np.clip(py, 0, size - 1), np.clip(px, 0, size - 1)])
sampled = np.stack([ndi.map_coordinates(photo[..., c], where, order=1) for c in range(3)], axis=-1)
weight = ndi.map_coordinates(mask, where, order=1) * found

# The mesh's skin is tinted to the portrait's, so the join doesn't show, and neither do the hands.
strong = weight > 0.9
theirs = np.median(sampled[strong], axis=0)
ours = np.median(skin[rows[0] : rows[-1] + 1, columns[0] : columns[-1] + 1][strong], axis=0)
tint = theirs / np.maximum(ours, 1e-3)
print("skin tint", np.round(tint, 3))
skin = np.clip(skin * tint, 0, 1)

box = (slice(rows[0], rows[-1] + 1), slice(columns[0], columns[-1] + 1))
skin[box] = skin[box] * (1 - weight[..., None]) + sampled * weight[..., None]
Image.fromarray((np.clip(skin, 0, 1) * 255).astype(np.uint8)).save(CHEF / "tex/skin-face.png")
print(f"fit scale {scale:.5f}, landmarks moved {np.linalg.norm(fitted - source, axis=1).mean() * 1000:.1f} mm on average")

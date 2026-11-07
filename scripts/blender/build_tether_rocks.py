"""
Moon rocks for /3d/2090, from Poly Haven's scans (CC0). The scans are far too heavy to scatter
by the hundred, so each is cut down to a game mesh, keeping its own normal map to hold the detail.

    blender --background --python scripts/blender/build_tether_rocks.py -- <repo root> [triangles]

Reads assets-source/tether/dl/rocks/. Writes public/2090/rocks.glb, with one mesh per rock.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import script_args  # noqa: E402

args = script_args()
ROOT = os.path.abspath(args[0])
TRIANGLES = int(args[1]) if len(args) > 1 else 900

bpy.ops.wm.read_factory_settings(use_empty=True)
kept = []
for index in range(1, 8):
    name = f"moon_rock_0{index}"
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, f"assets-source/tether/dl/rocks/{name}/{name}.gltf"))
    meshes = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    rock = meshes[0]
    bpy.context.view_layer.objects.active = rock
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    have = sum(len(p.vertices) - 2 for p in rock.data.polygons)
    cut = rock.modifiers.new("Cut", "DECIMATE")
    cut.ratio = min(TRIANGLES / max(have, 1), 1)
    bpy.ops.object.modifier_apply(modifier="Cut")
    rock.data.shade_smooth()

    # All rocks are the same size in the file: the page scales each one.
    size = max(rock.dimensions)
    rock.scale = (1 / size, 1 / size, 1 / size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    centre = sum((v.co for v in rock.data.vertices), start=rock.data.vertices[0].co * 0) / len(rock.data.vertices)
    rock.data.transform(__import__("mathutils").Matrix.Translation(-centre))
    rock.location = (0, 0, 0)
    rock.name = f"Rock{index}"
    rock.data.name = f"Rock{index}"
    kept.append(rock)
    print(name, have, "->", len(rock.data.polygons), flush=True)

for image in bpy.data.images:
    if image.size[0] > 512:
        image.scale(512, 512)

bpy.ops.object.select_all(action="DESELECT")
for rock in kept:
    rock.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ROOT, "public/2090/rocks.glb"),
    export_format="GLB",
    use_selection=True,
    export_image_format="WEBP",
    export_image_quality=78,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
print("Exported rocks", math.floor(os.path.getsize(os.path.join(ROOT, "public/2090/rocks.glb")) / 1000), "KB", flush=True)

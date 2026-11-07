"""
Packs the city from scripts/moto_city.py into compressed models for the browser: one for the
buildings along the road, one for the rest of Algiers behind them. Each tile stays its own mesh,
so the game can skip whatever's out of sight.

    blender --background --python scripts/blender/build_moto_city.py -- <repo root>
"""

import os
import sys

import bpy
import numpy as np

ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
BUILD = os.path.join(ROOT, "assets-source/moto/build")
OUT = os.path.join(ROOT, "public/moto/city")
os.makedirs(OUT, exist_ok=True)
data = np.load(os.path.join(BUILD, "city.npz"))
labels = sorted({key.rsplit(".", 1)[0] for key in data.files})


def tile(label):
    verts, faces = data[f"{label}.v"], data[f"{label}.f"]
    uv, tag = data[f"{label}.uv"], data[f"{label}.tag"]
    mesh = bpy.data.meshes.new(label)
    mesh.from_pydata(verts.tolist(), [], faces.tolist())
    indices = np.zeros(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get("vertex_index", indices)
    mesh.uv_layers.new(name="UVMap").data.foreach_set("uv", uv[indices].ravel())
    mesh.uv_layers.new(name="Tag").data.foreach_set("uv", tag[indices].ravel())
    item = bpy.data.objects.new(label, mesh)
    bpy.context.scene.collection.objects.link(item)
    return item


for name in ("near", "far"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for label in labels:
        if label.startswith(name):
            tile(label)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{name}.glb"),
        export_format="GLB",
        export_materials="NONE",
        export_normals=True,
        export_texcoords=True,
        export_yup=True,
        export_apply=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=15,
        export_draco_normal_quantization=6,
        export_draco_texcoord_quantization=14,
    )
    print("Packed", name, os.path.getsize(os.path.join(OUT, f"{name}.glb")) / 1e6, "MB", flush=True)

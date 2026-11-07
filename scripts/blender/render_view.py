"""
A test render of the store from any saved camera.

    blender --background <storedir>/store.blend --python scripts/blender/render_view.py -- <out.png> [width] [height] [samples] [x y z tx ty tz lens]
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import add_camera, script_args, use_gpu  # noqa: E402

args = script_args()
out = os.path.abspath(args[0])
width = int(args[1]) if len(args) > 1 else 960
height = int(args[2]) if len(args) > 2 else 540
samples = int(args[3]) if len(args) > 3 else 64

scene = bpy.context.scene
if len(args) >= 11:
    numbers = [float(a) for a in args[4:11]]
    add_camera(scene, numbers[0:3], numbers[3:6], lens=numbers[6], name="Test")

use_gpu(scene, samples=samples)
scene.render.resolution_x = width
scene.render.resolution_y = height
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)

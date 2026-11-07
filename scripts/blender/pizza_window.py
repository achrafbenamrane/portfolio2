"""
Opens a saved pizza scene to be watched: the 3D view rendering live through the camera.

    B <scene.blend> --factory-startup --python scripts/blender/pizza_window.py

Blender sets its windows up after the scripts on the command line have run, so the work
waits for a timer.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import use_gpu  # noqa: E402


def show():
    scene = bpy.context.scene
    samples = scene.cycles.preview_samples
    use_gpu(scene, scene.cycles.samples)
    scene.cycles.preview_samples = samples
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.shading.type = "RENDERED"
            space.overlay.show_overlays = False
            space.show_gizmo = False
            space.region_3d.view_perspective = "CAMERA"
            region = next(item for item in area.regions if item.type == "WINDOW")
            with bpy.context.temp_override(window=window, area=area, region=region):
                bpy.ops.view3d.view_center_camera()
    return None


bpy.app.timers.register(show, first_interval=1.5)

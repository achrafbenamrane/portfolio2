"""Helpers shared by the store's Blender scripts. Imported, never run."""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def script_args():
    """Everything after Blender's own `--`."""
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def use_gpu(scene, samples=128, denoise=True):
    """Cycles on the GTX through OptiX, falling back to whatever is there."""
    scene.render.engine = "CYCLES"
    cycles_prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA"):
        try:
            cycles_prefs.compute_device_type = backend
        except TypeError:
            continue
        cycles_prefs.get_devices()
        devices = [d for d in cycles_prefs.devices if d.type == backend]
        if devices:
            for device in cycles_prefs.devices:
                device.use = device.type == backend
            scene.cycles.device = "GPU"
            break
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    scene.cycles.use_adaptive_sampling = True


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(scene, location, target, lens=50.0, name="Camera"):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    camera = bpy.data.objects.new(name, data)
    scene.collection.objects.link(camera)
    camera.location = location
    look_at(camera, target)
    scene.camera = camera
    return camera


def add_area(scene, name, location, target, size, power, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.size = size
    data.energy = power
    data.color = color
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    look_at(light, target)
    return light


def studio(scene, centre=(0, 0, 0.4), strength=0.45):
    """A soft three-light packshot setup on a plain grey world."""
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (0.8, 0.8, 0.8, 1)
    background.inputs[1].default_value = strength
    scene.world = world
    cx, cy, cz = centre
    add_area(scene, "Key", (cx - 1.4, cy - 1.8, cz + 1.2), centre, 1.6, 90)
    add_area(scene, "Fill", (cx + 1.8, cy - 1.2, cz + 0.2), centre, 2.0, 30)
    add_area(scene, "Rim", (cx + 0.4, cy + 2.0, cz + 1.0), centre, 1.5, 70)


def orbit_points(centre, radius, height, degrees):
    """Camera positions around `centre`. 0 degrees is the front (-Y)."""
    cx, cy, cz = centre
    points = []
    for degree in degrees:
        angle = math.radians(degree)
        points.append(
            (cx + radius * math.sin(angle), cy - radius * math.cos(angle), cz + height)
        )
    return points


def linear_material(name, colour, roughness=0.5, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


class Group:
    """One mesh, built up from primitives, one material slot per colour name."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []

    def slot(self, colour):
        if colour not in self.slots:
            self.slots.append(colour)
        return self.slots.index(colour)

    def _finish(self, geom, colour, smooth=False):
        index = self.slot(colour)
        for element in geom:
            if isinstance(element, bmesh.types.BMFace):
                element.material_index = index
                element.smooth = smooth

    def quad(self, corners, colour):
        verts = [self.bm.verts.new(c) for c in corners]
        face = self.bm.faces.new(verts)
        self._finish([face], colour)

    def box(self, low, high, colour, bevel=0.0):
        low, high = Vector(low), Vector(high)
        size = high - low
        matrix = Matrix.Translation((low + high) / 2) @ Matrix.Diagonal((*size, 1))
        result = bmesh.ops.create_cube(self.bm, size=1.0, matrix=matrix)
        verts = result["verts"]
        faces = list({f for v in verts for f in v.link_faces})
        self._finish(faces, colour)
        if bevel:
            edges = list({e for v in verts for e in v.link_edges})
            bevelled = bmesh.ops.bevel(
                self.bm,
                geom=[*verts, *edges, *faces],
                offset=bevel,
                offset_type="OFFSET",
                segments=2,
                profile=0.5,
                affect="EDGES",
            )
            self._finish(bevelled["faces"], colour)

    def cylinder(self, start, end, radius, colour, sides=16, caps=True):
        start, end = Vector(start), Vector(end)
        axis = end - start
        rotation = axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
        matrix = Matrix.Translation((start + end) / 2) @ rotation
        result = bmesh.ops.create_cone(
            self.bm,
            cap_ends=caps,
            cap_tris=False,
            segments=sides,
            radius1=radius,
            radius2=radius,
            depth=axis.length,
            matrix=matrix,
        )
        faces = list({f for v in result["verts"] for f in v.link_faces})
        self._finish(faces, colour, smooth=True)

    def sphere(self, centre, radius, colour, subdivisions=2):
        result = bmesh.ops.create_icosphere(
            self.bm,
            subdivisions=subdivisions,
            radius=radius,
            matrix=Matrix.Translation(centre),
        )
        faces = list({f for v in result["verts"] for f in v.link_faces})
        self._finish(faces, colour, smooth=True)

    def polyline(self, points, radius, colour, sides=8):
        """A wire, for hangers: thin enough that its joints need no rounding."""
        for a, b in zip(points, points[1:]):
            self.cylinder(a, b, radius, colour, sides=sides, caps=False)

    def build(self, collection, materials):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        for colour in self.slots:
            mesh.materials.append(materials[colour])
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        return obj


def select_only(*objects):
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def unwrap(obj):
    mesh = obj.data
    bake_layer = mesh.uv_layers.new(name="Bake")
    mesh.uv_layers.active = bake_layer
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(60),
        margin_method="FRACTION",
        island_margin=0.004,
        rotate_method="AXIS_ALIGNED",
        scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")


def to_array(image):
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)[::-1, :, :3]


def bake_diffuse(obj, size, out_dir):
    image = bpy.data.images.new(f"Bake_{obj.name}", size, size, alpha=False, float_buffer=True)
    added = []
    for slot in obj.material_slots:
        tree = slot.material.node_tree
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        tree.nodes.active = node
        added.append((tree, node))

    select_only(obj)
    print(f"baking {obj.name} at {size}", flush=True)
    bpy.ops.object.bake(
        type="DIFFUSE",
        pass_filter={"DIRECT", "INDIRECT", "COLOR"},
        margin=14,
        margin_type="EXTEND",
        use_clear=True,
        uv_layer="Bake",
    )
    np.save(os.path.join(out_dir, f"{obj.name.lower()}.npy"), to_array(image).astype(np.float16))
    for tree, node in added:
        tree.nodes.remove(node)
    bpy.data.images.remove(image)


def render_linear(scene, name, out_dir, width, height, samples):
    """A denoised render, kept in linear light like the bakes."""
    use_gpu(scene, samples=samples)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "16"
    path = os.path.join(out_dir, f"{name}.exr")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(path)
    np.save(os.path.join(out_dir, f"{name}.npy"), to_array(image).astype(np.float16))
    bpy.data.images.remove(image)

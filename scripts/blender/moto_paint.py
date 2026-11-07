"""
What the motorcycles are made of. Imported by build_moto.py, never run.

Real finishes, built the way they're built: a colour coat with metal flake in it under a clear
coat that has its own smooth surface, carbon as a woven twill under lacquer, titanium that's gone
straw and blue where the exhaust runs hot. The clear coat is the whole difference between paint
and plastic: the sharp reflection sits on top, and the colour glows from underneath it.
"""

import math
import os

import bpy
import numpy as np


class Graph:
    def __init__(self, name):
        self.material = bpy.data.materials.new(name)
        self.material.use_nodes = True
        self.tree = self.material.node_tree
        self.nodes = self.tree.nodes
        self.nodes.clear()
        self.out = self.nodes.new("ShaderNodeOutputMaterial")
        self.bsdf = self.nodes.new("ShaderNodeBsdfPrincipled")
        self.link(self.bsdf.outputs["BSDF"], self.out.inputs["Surface"])

    def link(self, a, b):
        self.tree.links.new(a, b)

    def set(self, **values):
        names = {
            "colour": "Base Color",
            "metal": "Metallic",
            "rough": "Roughness",
            "coat": "Coat Weight",
            "coat_rough": "Coat Roughness",
            "coat_ior": "Coat IOR",
            "aniso": "Anisotropic",
            "ior": "IOR",
            "transmission": "Transmission Weight",
            "emission": "Emission Color",
            "glow": "Emission Strength",
            "alpha": "Alpha",
            "specular": "Specular IOR Level",
        }
        for key, value in values.items():
            socket = self.bsdf.inputs[names[key]]
            socket.default_value = (*value, 1) if isinstance(value, tuple) and len(value) == 3 else value
        return self

    def node(self, kind, **props):
        made = self.nodes.new(kind)
        for key, value in props.items():
            setattr(made, key, value)
        return made


def plain(name, colour, rough=0.4, metal=0.0, **more):
    return Graph(name).set(colour=colour, rough=rough, metal=metal, **more).material


def candy(name, colour, flake=(1.0, 0.75, 0.7), rough=0.34):
    """Colour over metal flake, under a mirror-smooth clear coat."""
    g = Graph(name).set(colour=colour, metal=0.72, rough=rough, coat=1.0, coat_rough=0.018, coat_ior=1.52)
    coords = g.node("ShaderNodeTexCoord")
    # Flake is a hair-fine glitter: only the colour coat sees it. The lacquer over it stays flat.
    noise = g.node("ShaderNodeTexVoronoi")
    noise.inputs["Scale"].default_value = 5200
    noise.feature = "F1"
    g.link(coords.outputs["Object"], noise.inputs["Vector"])
    separate = g.node("ShaderNodeSeparateColor")
    g.link(noise.outputs["Color"], separate.inputs["Color"])
    combine = g.node("ShaderNodeCombineXYZ")
    for index, name_ in enumerate(("Red", "Green", "Blue")):
        shift = g.node("ShaderNodeMath", operation="SUBTRACT")
        g.link(separate.outputs[name_], shift.inputs[0])
        shift.inputs[1].default_value = 0.5
        g.link(shift.outputs[0], combine.inputs[index])
    geometry = g.node("ShaderNodeNewGeometry")
    scale = g.node("ShaderNodeVectorMath", operation="SCALE")
    g.link(combine.outputs[0], scale.inputs[0])
    scale.inputs["Scale"].default_value = 0.2
    bent = g.node("ShaderNodeVectorMath", operation="ADD")
    g.link(scale.outputs[0], bent.inputs[0])
    g.link(geometry.outputs["Normal"], bent.inputs[1])
    unit = g.node("ShaderNodeVectorMath", operation="NORMALIZE")
    g.link(bent.outputs[0], unit.inputs[0])
    g.link(unit.outputs[0], g.bsdf.inputs["Normal"])
    g.link(geometry.outputs["Normal"], g.bsdf.inputs["Coat Normal"])

    # Colour deepens as it's seen edge-on, through more of the tinted coat.
    fresnel = g.node("ShaderNodeLayerWeight")
    fresnel.inputs["Blend"].default_value = 0.55
    ramp = g.node("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    ramp.inputs["A"].default_value = (*colour, 1)
    ramp.inputs["B"].default_value = (0.42, 0.32, 0.34, 1)
    g.link(fresnel.outputs["Facing"], ramp.inputs["Factor"])
    g.link(ramp.outputs["Result"], g.bsdf.inputs["Base Color"])
    return g.material


def weave_images(folder, size=1024, tows=16):
    """A 2x2 twill, which is what real carbon cloth is: height for the surface, and sheen by direction."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size * tows
    cell_x, cell_y = np.floor(x), np.floor(y)
    fx, fy = x - cell_x, y - cell_y
    # Over two, under two, stepping one along every row.
    over = ((cell_x + cell_y) % 4) < 2
    along = np.where(over, fx, fy)
    across = np.where(over, fy, fx)
    tow = np.clip(1 - (2 * across - 1) ** 2, 0, 1) ** 0.5
    fibres = 0.5 + 0.5 * np.sin(across * 90 + np.sin(along * 7) * 1.4)
    height = tow * (0.75 + 0.25 * np.sin(along * math.pi)) * (0.94 + 0.06 * fibres)
    shade = np.where(over, 0.034, 0.016) * (0.7 + 0.5 * tow) * (0.88 + 0.12 * fibres)
    gx = np.roll(height, -1, 1) - np.roll(height, 1, 1)
    gy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
    strength = 3.2
    normal = np.stack([-gx * strength, -gy * strength, np.ones_like(height)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)

    def save(name, rgb, colour_space):
        path = os.path.join(folder, name)
        image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
        pixels = np.ones((size, size, 4), np.float32)
        pixels[..., :3] = rgb
        image.pixels.foreach_set(pixels.ravel())
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        image.colorspace_settings.name = colour_space
        return image

    # Stored as seen, so a game can use them as they are.
    albedo = save("carbon-albedo.png", np.repeat(np.power(shade, 1 / 2.2)[..., None], 3, axis=2), "sRGB")
    bumps = save("carbon-normal.png", normal * 0.5 + 0.5, "Non-Color")
    return albedo, bumps


def carbon(name, images, scale=420.0, lacquer=0.5, rough=0.4):
    albedo, normal = images
    g = Graph(name).set(metal=0.0, rough=rough, coat=lacquer, coat_rough=0.26, coat_ior=1.5, specular=0.18)
    coords = g.node("ShaderNodeTexCoord")
    mapping = g.node("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale / 16 * 1.0, scale / 16 * 1.0, 1)
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(45))
    g.link(coords.outputs["UV"], mapping.inputs["Vector"])
    colour = g.node("ShaderNodeTexImage", image=albedo)
    bump = g.node("ShaderNodeTexImage", image=normal)
    g.link(mapping.outputs[0], colour.inputs["Vector"])
    g.link(mapping.outputs[0], bump.inputs["Vector"])
    g.link(colour.outputs["Color"], g.bsdf.inputs["Base Color"])
    strength = g.node("ShaderNodeNormalMap")
    strength.inputs["Strength"].default_value = 0.22
    g.link(bump.outputs["Color"], strength.inputs["Color"])
    g.link(strength.outputs[0], g.bsdf.inputs["Normal"])
    return g.material


def brushed(name, colour, rough=0.26, grain=2400):
    """Metal with a machined grain, whose highlight stretches across the grain."""
    g = Graph(name).set(colour=colour, metal=1.0, rough=rough, aniso=0.55)
    coords = g.node("ShaderNodeTexCoord")
    noise = g.node("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = grain
    noise.inputs["Detail"].default_value = 3
    mapping = g.node("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.02, 1, 1)
    g.link(coords.outputs["UV"], mapping.inputs["Vector"])
    g.link(mapping.outputs[0], noise.inputs["Vector"])
    bump = g.node("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.05
    bump.inputs["Distance"].default_value = 0.0004
    g.link(noise.outputs["Fac"], bump.inputs["Height"])
    g.link(bump.outputs[0], g.bsdf.inputs["Normal"])
    return g.material


def cast(name, colour, rough=0.46, scale=900.0, metal=1.0):
    """A cast casing under a satin coat: faintly orange-peeled, never flat."""
    g = Graph(name).set(colour=colour, metal=metal, rough=rough)
    coords = g.node("ShaderNodeTexCoord")
    noise = g.node("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 5
    g.link(coords.outputs["Object"], noise.inputs["Vector"])
    bump = g.node("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.0005
    g.link(noise.outputs["Fac"], bump.inputs["Height"])
    g.link(bump.outputs[0], g.bsdf.inputs["Normal"])
    return g.material


def heat_tinted(name, stops, length=1.0):
    """Titanium that's been hot. `stops` run along the pipe from the head, in metres."""
    g = Graph(name).set(metal=1.0, rough=0.24, aniso=0.3)
    coords = g.node("ShaderNodeTexCoord")
    separate = g.node("ShaderNodeSeparateXYZ")
    g.link(coords.outputs["UV"], separate.inputs[0])
    scale = g.node("ShaderNodeMath", operation="DIVIDE")
    g.link(separate.outputs["Y"], scale.inputs[0])
    scale.inputs[1].default_value = length
    ramp = g.node("ShaderNodeValToRGB")
    elements = ramp.color_ramp.elements
    while len(elements) > 1:
        elements.remove(elements[-1])
    elements[0].position, elements[0].color = stops[0][0], (*stops[0][1], 1)
    for at, colour in stops[1:]:
        element = elements.new(at)
        element.color = (*colour, 1)
    g.link(scale.outputs[0], ramp.inputs["Fac"])
    g.link(ramp.outputs["Color"], g.bsdf.inputs["Base Color"])
    return g.material


def rubber(name, images, rough=0.74):
    """A tyre: a dark, faintly waxy compound, with its tread and lettering in the maps."""
    albedo, normal = images
    g = Graph(name).set(metal=0.0, rough=rough, specular=0.22)
    coords = g.node("ShaderNodeTexCoord")
    colour = g.node("ShaderNodeTexImage", image=albedo)
    bump = g.node("ShaderNodeTexImage", image=normal)
    g.link(coords.outputs["UV"], colour.inputs["Vector"])
    g.link(coords.outputs["UV"], bump.inputs["Vector"])
    g.link(colour.outputs["Color"], g.bsdf.inputs["Base Color"])
    strength = g.node("ShaderNodeNormalMap")
    strength.inputs["Strength"].default_value = 1.0
    g.link(bump.outputs["Color"], strength.inputs["Color"])
    g.link(strength.outputs[0], g.bsdf.inputs["Normal"])
    return g.material

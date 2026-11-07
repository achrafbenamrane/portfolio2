"""
What the machines in /3d/2090 are painted with, and how that paint becomes game textures.
Imported, never run.
"""

import os

import bpy


class Nodes:
    """Just enough to write a shader as sums instead of wiring."""

    def __init__(self, material):
        self.tree = material.node_tree
        self.nodes = self.tree.nodes
        self.links = self.tree.links

    def set(self, socket, value):
        if isinstance(value, (int, float)):
            socket.default_value = value
        elif isinstance(value, (tuple, list)):
            socket.default_value = (*value, 1)[: len(socket.default_value)]
        else:
            self.links.new(value, socket)

    def maths(self, operation, a, b=None):
        node = self.nodes.new("ShaderNodeMath")
        node.operation = operation
        node.use_clamp = operation in ("MULTIPLY_CLAMP",)
        self.set(node.inputs[0], a)
        if b is not None:
            self.set(node.inputs[1], b)
        return node.outputs[0]

    def noise(self, vector, scale, detail=5, roughness=0.55, stretch=None):
        node = self.nodes.new("ShaderNodeTexNoise")
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = detail
        node.inputs["Roughness"].default_value = roughness
        if stretch:
            mapping = self.nodes.new("ShaderNodeMapping")
            mapping.inputs["Scale"].default_value = stretch
            self.links.new(vector, mapping.inputs["Vector"])
            vector = mapping.outputs[0]
        self.links.new(vector, node.inputs["Vector"])
        return node.outputs[0]

    def step(self, value, low, high):
        node = self.nodes.new("ShaderNodeMapRange")
        node.interpolation_type = "SMOOTHSTEP"
        node.inputs["From Min"].default_value = low
        node.inputs["From Max"].default_value = high
        self.set(node.inputs["Value"], value)
        return node.outputs[0]

    def mix(self, a, b, share):
        node = self.nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
        self.set(node.inputs["Factor"] if "Factor" in node.inputs else node.inputs[0], share)
        self.set(node.inputs[6], a)
        self.set(node.inputs[7], b)
        return node.outputs[2]

    def mix_value(self, a, b, share):
        node = self.nodes.new("ShaderNodeMix")
        node.data_type = "FLOAT"
        self.set(node.inputs[0], share)
        self.set(node.inputs[2], a)
        self.set(node.inputs[3], b)
        return node.outputs[0]

    def scale(self, colour, factor):
        node = self.nodes.new("ShaderNodeVectorMath")
        node.operation = "SCALE"
        self.links.new(colour, node.inputs[0])
        node.inputs["Scale"].default_value = factor
        return node.outputs[0]

    def occlusion(self, distance, inside=False):
        node = self.nodes.new("ShaderNodeAmbientOcclusion")
        node.inside = inside
        node.samples = 12
        node.inputs["Distance"].default_value = distance
        return node.outputs["AO"]


REGOLITH = (0.2, 0.185, 0.165)
BARE = (0.46, 0.46, 0.47)
GRIME = (0.03, 0.027, 0.024)


def weathered(name, colour, roughness=0.46, metallic=0.0, wear=1.0, dust=1.0):
    """
    Paint that's been working. Bare metal where edges have been knocked, grime in the corners,
    and the Moon's dust, which is abrasive and gets everywhere, climbing from the feet.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    n = Nodes(material)
    shader = n.nodes["Principled BSDF"]
    geometry = n.nodes.new("ShaderNodeNewGeometry")
    where = geometry.outputs["Position"]

    big = n.noise(where, 1.6, 6)
    mid = n.noise(where, 9, 6)
    fine = n.noise(where, 70, 4)
    streaks = n.noise(where, 7, 4, stretch=(1, 1, 0.16))

    # Worn edges: the inside-out occlusion lights up anything convex.
    edge = n.maths("SUBTRACT", 1.0, n.occlusion(0.016, inside=True))
    worn = n.step(n.maths("ADD", edge, n.maths("MULTIPLY", n.maths("SUBTRACT", mid, 0.5), 0.9)), 0.2, 0.55)
    worn = n.maths("MULTIPLY", worn, wear)
    chips = n.step(n.maths("ADD", n.maths("MULTIPLY", mid, 0.7), n.maths("MULTIPLY", fine, 0.5)), 0.74, 0.8)
    worn = n.maths("MAXIMUM", worn, n.maths("MULTIPLY", chips, 0.8 * wear))

    # Grime: whatever is shut in.
    shut = n.maths("SUBTRACT", 1.0, n.occlusion(0.11))
    grime = n.step(n.maths("ADD", shut, n.maths("MULTIPLY", n.maths("SUBTRACT", big, 0.5), 0.5)), 0.12, 0.72)

    # Dust: thick on the feet, thinning up the legs, and lying on anything that faces up.
    height = n.nodes.new("ShaderNodeSeparateXYZ")
    n.links.new(where, height.inputs[0])
    climb = n.step(n.maths("ADD", height.outputs["Z"], n.maths("MULTIPLY", n.maths("SUBTRACT", big, 0.5), 1.6)), 2.0, 0.1)
    facing = n.nodes.new("ShaderNodeSeparateXYZ")
    n.links.new(geometry.outputs["Normal"], facing.inputs[0])
    lying = n.maths("MULTIPLY", n.step(facing.outputs["Z"], 0.3, 0.8), n.step(mid, 0.36, 0.56))
    settled = n.maths("MAXIMUM", n.maths("MULTIPLY", climb, 0.88), n.maths("MULTIPLY", lying, 0.7))
    settled = n.maths("MULTIPLY", settled, dust)

    # One colour node, named, so the bake can repaint the machine as the enemy's.
    tint = n.nodes.new("ShaderNodeRGB")
    tint.name = "Tint"
    tint.outputs[0].default_value = (*colour, 1)
    mottled = n.mix(tint.outputs[0], n.scale(tint.outputs[0], 0.74), n.step(big, 0.38, 0.66))
    stained = n.mix(mottled, n.scale(tint.outputs[0], 0.6), n.maths("MULTIPLY", n.step(streaks, 0.52, 0.7), 0.5))
    base = n.mix(stained, GRIME, n.maths("MULTIPLY", grime, 0.85))
    base = n.mix(base, BARE, worn)
    base = n.mix(base, REGOLITH, settled)
    n.links.new(base, shader.inputs["Base Color"])

    n.set(shader.inputs["Metallic"], n.mix_value(n.mix_value(metallic, 1.0, worn), 0.0, settled))
    rough = n.maths("ADD", roughness, n.maths("MULTIPLY", n.maths("SUBTRACT", mid, 0.5), 0.26))
    rough = n.mix_value(rough, 0.34, worn)
    n.set(shader.inputs["Roughness"], n.mix_value(rough, 0.96, settled))

    bump = n.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.003
    n.links.new(n.maths("ADD", fine, n.maths("MULTIPLY", streaks, 0.5)), bump.inputs["Height"])
    n.links.new(bump.outputs[0], shader.inputs["Normal"])
    return material


def glowing(name, colour, strength):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    shader.inputs["Emission Color"].default_value = (*colour, 1)
    shader.inputs["Emission Strength"].default_value = strength
    return material


def printed(sheet_path):
    material = bpy.data.materials.new("Decal")
    material.use_nodes = True
    n = Nodes(material)
    shader = n.nodes["Principled BSDF"]
    sheet = n.nodes.new("ShaderNodeTexImage")
    sheet.image = bpy.data.images.load(sheet_path)
    n.links.new(sheet.outputs["Color"], shader.inputs["Base Color"])
    n.links.new(sheet.outputs["Alpha"], shader.inputs["Alpha"])
    shader.inputs["Roughness"].default_value = 0.55
    return material


def emitted(material, socket_name):
    """Wires one input of a material straight to its output, so a bake reads it as data."""
    n = Nodes(material)
    shader = n.nodes["Principled BSDF"]
    output = n.nodes["Material Output"]
    source = shader.inputs[socket_name]
    emission = n.nodes.new("ShaderNodeEmission")
    if source.links:
        n.links.new(source.links[0].from_socket, emission.inputs["Color"])
    else:
        value = source.default_value
        emission.inputs["Color"].default_value = tuple(value) if socket_name == "Base Color" else (value, value, value, 1)
    original = output.inputs["Surface"].links[0].from_socket
    n.links.new(emission.outputs[0], output.inputs["Surface"])
    return lambda: (n.links.new(original, output.inputs["Surface"]), n.nodes.remove(emission))


def bake_pass(name, size, kind, solid, materials, folder, data, socket_name=None):
    """One map, for the whole machine at once."""
    image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "Non-Color" if data else "sRGB"
    undo = []
    added = []
    for material in materials:
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.nodes.active = node
        added.append((material, node))
        if socket_name:
            undo.append(emitted(material, socket_name))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in solid:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = solid[0]
    print("baking", name, flush=True)
    bpy.ops.object.bake(type=kind, margin=8, margin_type="EXTEND", use_clear=True, uv_layer="Bake", normal_space="TANGENT")
    image.filepath_raw = os.path.join(folder, f"{name}.png")
    image.file_format = "PNG"
    image.save()
    for restore in undo:
        restore()
    for material, node in added:
        material.node_tree.nodes.remove(node)
    bpy.data.images.remove(image)

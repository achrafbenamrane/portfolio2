import * as THREE from "three";

import world from "@/content/tether-world.json";

/*
 * The Moon underfoot. One mesh out to the horizon: a polar grid centred on the base, fine where
 * the robot walks and coarse by the time it's a kilometre away, dropping away with the curve of
 * a body only 1,737 km in radius. There's no air, so it stays sharp all the way to the edge.
 */

const MOON_RADIUS = 1737000;

export class Ground {
  readonly mesh: THREE.Mesh;
  private readonly heights: Float32Array;
  private readonly size: number;

  private constructor(heights: Float32Array, size: number, maps: THREE.Texture[], small: boolean) {
    this.heights = heights;
    this.size = size;
    this.mesh = new THREE.Mesh(this.build(small), this.material(maps));
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  static async load(loader: THREE.TextureLoader, small: boolean) {
    const [height, normal, tone, soil, soilNormal] = await Promise.all([
      loadImage("/2090/ground-height.png"),
      loader.loadAsync("/2090/ground-normal.webp"),
      loader.loadAsync("/2090/ground-tone.webp"),
      loader.loadAsync("/2090/soil-albedo.webp"),
      loader.loadAsync("/2090/soil-normal.webp"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = height.width;
    canvas.height = height.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(height, 0, 0);
    const bytes = context.getImageData(0, 0, height.width, height.height).data;
    const heights = new Float32Array(height.width * height.height);
    const span = world.heightHigh - world.heightLow;
    for (let index = 0; index < heights.length; index++) {
      heights[index] = world.heightLow + ((bytes[index * 4] * 256 + bytes[index * 4 + 1]) / 65535) * span;
    }

    for (const map of [normal, tone]) {
      map.flipY = false;
      map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
      map.colorSpace = THREE.NoColorSpace;
      map.anisotropy = 8;
      map.needsUpdate = true;
    }
    soil.colorSpace = THREE.SRGBColorSpace;
    soilNormal.colorSpace = THREE.NoColorSpace;
    for (const map of [soil, soilNormal]) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = 8;
      map.needsUpdate = true;
    }
    return new Ground(heights, height.width, [normal, tone, soil, soilNormal], small);
  }

  /** The ground's height at a point, in metres, mirrored past the edge of the map. */
  heightAt(x: number, z: number) {
    const size = this.size;
    const fold = (value: number) => {
      const period = 2 * (size - 1);
      const wrapped = ((value % period) + period) % period;
      return wrapped > size - 1 ? period - wrapped : wrapped;
    };
    const u = fold((x / world.world + 0.5) * size - 0.5);
    const v = fold((z / world.world + 0.5) * size - 0.5);
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, size - 1);
    const z1 = Math.min(z0 + 1, size - 1);
    const fx = u - x0;
    const fz = v - z0;
    const h = this.heights;
    const near = h[z0 * size + x0] * (1 - fx) + h[z0 * size + x1] * fx;
    const far = h[z1 * size + x0] * (1 - fx) + h[z1 * size + x1] * fx;
    return near * (1 - fz) + far * fz;
  }

  /** The ground as it's actually drawn, curve and all: what feet have to stand on. */
  surfaceAt(x: number, z: number) {
    return this.heightAt(x, z) - (x * x + z * z) / (2 * MOON_RADIUS);
  }

  normalAt(x: number, z: number, out: THREE.Vector3) {
    const step = 0.8;
    out.set(this.surfaceAt(x - step, z) - this.surfaceAt(x + step, z), 2 * step, this.surfaceAt(x, z - step) - this.surfaceAt(x, z + step));
    return out.normalize();
  }

  private build(small: boolean) {
    const around = small ? 256 : 512;
    const rings = small ? 200 : 380;
    const positions = new Float32Array((around + 1) * (rings + 1) * 3);
    const indices: number[] = [];
    let written = 0;
    for (let ring = 0; ring <= rings; ring++) {
      // Fine near the middle, and stretching geometrically out to about nine kilometres.
      const share = ring / rings;
      const radius = 260 * share + 9000 * share ** 6;
      for (let step = 0; step <= around; step++) {
        const angle = (step / around) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        positions[written++] = x;
        positions[written++] = this.surfaceAt(x, z);
        positions[written++] = z;
      }
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let step = 0; step < around; step++) {
        const a = ring * (around + 1) + step;
        const b = a + around + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private material([normal, tone, soil, soilNormal]: THREE.Texture[]) {
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.groundNormal = { value: normal };
      shader.uniforms.groundTone = { value: tone };
      shader.uniforms.soil = { value: soil };
      shader.uniforms.soilNormal = { value: soilNormal };
      shader.uniforms.worldSize = { value: world.world };

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `#include <common>
          varying vec2 vGround;
          uniform sampler2D groundNormal;
          uniform sampler2D groundTone;
          uniform sampler2D soil;
          uniform sampler2D soilNormal;
          uniform float worldSize;
          float groundShade;
          float groundBounce;`,
        )
        .replace(
          "#include <map_fragment>",
          /* glsl */ `
          vec2 groundUv = vGround / worldSize + 0.5;
          vec3 tone = texture2D(groundTone, groundUv).rgb;
          vec3 near = texture2D(soil, vGround / 5.3).rgb;
          vec3 far = texture2D(soil, vGround / 37.0).rgb;
          float grain = dot(near, vec3(0.33)) * 1.5 + dot(far, vec3(0.33)) * 1.0;
          // The Moon isn't the grey of a photo's midtone: it's as dark as old asphalt.
          diffuseColor.rgb = vec3(0.235, 0.222, 0.205) * grain * (tone.g * 1.25);
          groundShade = tone.b;
          groundBounce = tone.r * tone.r * 0.09 + 0.012;
          `,
        )
        .replace(
          "#include <normal_fragment_maps>",
          /* glsl */ `
          vec3 macro = texture2D(groundNormal, groundUv).xyz * 2.0 - 1.0;
          vec2 fine = texture2D(soilNormal, vGround / 5.3).xy * 2.0 - 1.0;
          vec2 broad = texture2D(soilNormal, vGround / 37.0).xy * 2.0 - 1.0;
          vec3 worldNormal = normalize(macro + vec3(fine.x + broad.x, 0.0, -(fine.y + broad.y)) * 0.42);
          normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
          `,
        )
        .replace(
          "#include <lights_fragment_end>",
          /* glsl */ `#include <lights_fragment_end>
          reflectedLight.directDiffuse *= groundShade;
          reflectedLight.indirectDiffuse += material.diffuseColor * groundBounce;`,
        );
    };
    return material;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

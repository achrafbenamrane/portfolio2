import * as THREE from "three";

import city from "@/content/moto-city.json";

/*
 * Algiers at night. Every building here is a real footprint from the map, and the city's whole
 * look is drawn in one shader: Alger la Blanche, white plaster lit from below by the street, blue
 * shutters, iron balconies, a warm window here and there, and shop signs along the ground floor.
 * Nothing is textured, so twenty-five thousand buildings cost next to nothing, and a window can be
 * lit or dark from a hash of where it is.
 */

const FOG = new THREE.Color(0.011, 0.011, 0.018);

const SHADER_HASH = /* glsl */ `
  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
`;

export function buildingMaterial(atlas: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { uFog: { value: FOG }, uFar: { value: 0.00016 }, uAtlas: { value: atlas } },
    vertexShader: /* glsl */ `
      attribute vec2 uv1;
      varying vec2 vWall;
      varying vec2 vTag;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        // glTF stores v upside down, as one minus itself.
        vWall = vec2(uv.x, 1.0 - uv.y);
        vTag = vec2(uv1.x, 1.0 - uv1.y);
        vec4 at = modelMatrix * vec4(position, 1.0);
        vWorld = at.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * at;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog;
      uniform float uFar;
      uniform sampler2D uAtlas;
      varying vec2 vWall;
      varying vec2 vTag;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${SHADER_HASH}

      // The same baked pictures the real facades are made from, read straight onto the wall. The
      // slope of the coordinates is passed in, or the seam at each window's edge would show.
      vec4 front(float id, vec2 at, vec2 slopeX, vec2 slopeY) {
        vec2 inside = clamp(at, 0.004, 0.996);
        vec2 uv = vec2((mod(id, 4.0) + inside.x) * 0.25, 1.0 - (floor(id / 4.0) + 1.0 - inside.y) * 0.25);
        return textureGrad(uAtlas, uv, slopeX * 0.25, slopeY * 0.25);
      }

      void main() {
        // Rounded, because the tiny jitter a varying picks up would turn every hash below to noise.
        float seed = floor(vTag.x * 512.0 + 0.5) / 512.0;
        float distanceAway = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-distanceAway * uFar);

        // A flat roof, dark, with the odd lit stairhead.
        if (vTag.y > 0.75) {
          vec3 roof = vec3(0.016, 0.017, 0.022);
          gl_FragColor = vec4(mix(roof, uFog, fog), 1.0);
          return;
        }

        // The wall is storeys of bays, as the real facades are: a tall shop floor, then the flats.
        float bay = 3.7;
        vec2 cellAt = vec2(vWall.x / bay, (vWall.y - 4.4) / 3.5);
        vec2 slopeX = dFdx(cellAt);
        vec2 slopeY = dFdy(cellAt);
        vec2 cell = floor(cellAt);
        vec2 inCell = fract(cellAt);
        float blur = max(length(vec2(slopeX.x, slopeY.x)), length(vec2(slopeX.y, slopeY.y)));
        bool shops = vWall.y < 4.4;
        float shade = 0.62 + 0.38 * hash1(vec2(seed, 2.0));
        float pick = hash1(vec2(seed, 17.0));
        float id = pick < 0.3 ? 2.0 : pick < 0.55 ? 0.0 : pick < 0.7 ? 3.0 : pick < 0.85 ? 7.0 : 5.0;
        vec4 texel;
        if (shops) {
          float shut = step(0.68, hash1(vec2(cell.x, seed * 13.0)));
          texel = front(9.0 + shut, vec2(inCell.x, vWall.y / 4.4), slopeX, slopeY * (3.5 / 4.4));
        } else {
          texel = front(id, inCell, slopeX, slopeY);
        }
        float glass = smoothstep(0.7, 0.92, texel.a);
        float shutter = smoothstep(0.25, 0.4, texel.a) * (1.0 - glass);
        vec3 plaster = mix(vec3(1.0, 0.985, 0.965), vec3(1.0, 0.9, 0.76), smoothstep(0.55, 1.0, hash1(vec2(seed, 3.1))));
        // Walls that turn from the moon stay darker, and the street's light fades going up.
        float turned = 0.72 + 0.28 * max(dot(normalize(vNormal), normalize(vec3(0.3, 0.2, -0.9))), 0.0);
        float climb = mix(1.0, 0.34, smoothstep(4.0, 24.0, vWall.y));
        float bright = (0.34 + 0.46 * shade) * climb * turned;
        vec3 wall = texel.rgb * plaster * bright;
        float tone = hash1(vec2(seed, 5.0));
        vec3 paint = tone < 0.46 ? vec3(0.34, 0.5, 0.78) : tone < 0.66 ? vec3(0.62, 0.64, 0.66) : tone < 0.82 ? vec3(0.34, 0.56, 0.5) : vec3(0.6, 0.46, 0.34);
        vec3 shuttered = texel.rgb * paint * 1.3 * bright;
        float odds = hash1(cell + seed * 31.0);
        vec3 room = texel.rgb * mix(vec3(1.0, 0.72, 0.44), vec3(0.76, 0.84, 1.0), step(0.9, odds)) * (0.22 + 0.62 * hash1(cell * 1.7 + seed));
        vec3 dark = vec3(0.006, 0.008, 0.016) + vec3(0.028, 0.03, 0.04) * (1.0 - inCell.y);
        vec3 pane = shops ? texel.rgb * vec3(1.0, 0.82, 0.6) * 0.5 : mix(dark, room, step(0.6, odds));
        vec3 colour = mix(mix(wall, shuttered, shutter), pane, glass);

        // Far off, the fronts melt into a dark mass with a fine scatter of light on it. Each spark
        // is smaller than its cell, and goes out long before a cell gets smaller than a pixel.
        float far = smoothstep(0.1, 0.3, blur);
        vec2 spark = abs(inCell - 0.5);
        float dotSize = 0.16 + 0.34 * smoothstep(0.3, 1.4, blur);
        float glitter = step(0.93, hash1(cell * 0.73 + seed * 7.0)) * (1.0 - smoothstep(dotSize, dotSize + 0.12, max(spark.x, spark.y)));
        glitter *= 1.0 - smoothstep(1.2, 3.2, blur);
        vec3 distant = plaster * vec3(0.012, 0.012, 0.016) + vec3(1.0, 0.68, 0.38) * glitter * 0.42;
        colour = mix(colour, distant, far);

        gl_FragColor = vec4(mix(colour, uFog, fog), 1.0);
      }
    `,
  });
}

function groundMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uFog: { value: FOG }, uFar: { value: 0.00016 } },
    // Roads lie a few centimetres above this, so it's pushed back for the depth test.
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 6,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vWorld = position;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog;
      uniform float uFar;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${SHADER_HASH}
      float soft(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        // The esplanade and the Poste's square have paving of their own.
        if (length(vWorld.xz - vec2(-1808.0, 2147.0)) < 226.0 || length(vWorld.xz - vec2(-2809.0, -835.0)) < 63.0) discard;
        float distanceAway = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-distanceAway * uFar);
        float moon = max(dot(normalize(vNormal), normalize(vec3(0.3, 0.5, -0.8))), 0.0);
        // Packed earth and rubble, picked out by the spill from the street.
        float rough = soft(vWorld.xz / 2.3) * 0.5 + soft(vWorld.xz / 9.0) * 0.5;
        float spill = exp(-distanceAway * 0.007);
        vec3 colour = vec3(0.0075, 0.0078, 0.0075) + vec3(0.008, 0.01, 0.013) * moon;
        colour += vec3(0.012, 0.011, 0.008) * rough;
        colour += vec3(0.075, 0.068, 0.058) * (0.35 + 0.65 * rough) * spill;
        // In town, what isn't road is walked on: big worn slabs, the same as the pavements.
        vec2 slab = vWorld.xz / 1.3;
        vec2 slabJoint = abs(fract(slab) - 0.5);
        float tiny = fwidth(slab.x) + fwidth(slab.y);
        float seam = smoothstep(0.46, 0.5, max(slabJoint.x, slabJoint.y)) * (1.0 - smoothstep(0.08, 0.3, tiny));
        vec3 paved = vec3(0.066, 0.062, 0.056) * (0.8 + 0.34 * hash1(floor(slab))) * (1.0 - seam * 0.45);
        paved *= 0.34 + 0.66 * spill;
        colour = mix(colour, paved, 1.0 - smoothstep(600.0, 1400.0, vWorld.x));
        gl_FragColor = vec4(mix(colour, uFog, fog), 1.0);
      }
    `,
  });
}

/** The ground right round the bike, at the height map's full detail, moved along as it rides. */
export class NearGround {
  readonly mesh: THREE.Mesh;
  private readonly position: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(
    private readonly ground: Ground,
    private readonly size: number,
    private readonly spacing: number,
  ) {
    this.position = new Float32Array(size * size * 3);
    const index: number[] = [];
    for (let row = 0; row < size - 1; row++) {
      for (let column = 0; column < size - 1; column++) {
        const at = row * size + column;
        index.push(at, at + size, at + 1, at + 1, at + size, at + size + 1);
      }
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3));
    this.geometry.setIndex(index);
    this.mesh = new THREE.Mesh(this.geometry, groundMaterial());
    this.mesh.frustumCulled = false;
  }

  follow(x: number, z: number) {
    const snap = this.spacing * 8;
    const nearX = Math.round(x / snap) * snap;
    const nearZ = Math.round(z / snap) * snap;
    if (nearX === this.lastX && nearZ === this.lastZ) return;
    this.lastX = nearX;
    this.lastZ = nearZ;
    const { size, spacing, position, ground } = this;
    const half = (size - 1) * spacing * 0.5;
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const at = (row * size + column) * 3;
        const px = nearX - half + column * spacing;
        const pz = nearZ - half + row * spacing;
        position[at] = px;
        position[at + 1] = ground.at(px, pz);
        position[at + 2] = pz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

/** Height at any point of the map, read from the stored height image. */
export class Ground {
  private constructor(
    private readonly heights: Float32Array,
    private readonly wide: number,
    private readonly tall: number,
  ) {}

  static async load() {
    const image = new Image();
    image.src = "/moto/city/ground.png";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(image, 0, 0);
    const bytes = context.getImageData(0, 0, image.width, image.height).data;
    const [low, high] = city.ground;
    const heights = new Float32Array(image.width * image.height);
    for (let index = 0; index < heights.length; index++) {
      heights[index] = low + ((bytes[index * 4] * 256 + bytes[index * 4 + 1]) / 65535) * (high - low);
    }
    return new Ground(heights, image.width, image.height);
  }

  /** Height at a point in game axes, x east and z south: the surface everything stands on. */
  at(x: number, z: number) {
    const [west, , , north] = city.bounds;
    const u = Math.min(Math.max((x - west) / city.mapStep, 0), this.wide - 1.001);
    const v = Math.min(Math.max((north + z) / city.mapStep, 0), this.tall - 1.001);
    const c = Math.floor(u);
    const r = Math.floor(v);
    const s = u - c;
    const t = v - r;
    const at = r * this.wide + c;
    const h = this.heights;
    return (h[at] * (1 - s) + h[at + 1] * s) * (1 - t) + (h[at + this.wide] * (1 - s) + h[at + this.wide + 1] * s) * t;
  }

  /** The whole map, coarse, and sunk a little so the fine ground near the bike always wins. */
  mesh() {
    const [west, south, east, north] = city.bounds;
    const stepEvery = 3;
    const columns = Math.floor((this.wide - 1) / stepEvery) + 1;
    const rows = Math.floor((this.tall - 1) / stepEvery) + 1;
    const position = new Float32Array(columns * rows * 3);
    const index: number[] = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const at = row * columns + column;
        const c = column * stepEvery;
        const r = row * stepEvery;
        position[at * 3] = west + (c / (this.wide - 1)) * (east - west);
        position[at * 3 + 1] = this.heights[r * this.wide + c] - 3;
        // Rows run north to south, and in the game, south is +z.
        position[at * 3 + 2] = -north + (r / (this.tall - 1)) * (north - south);
        if (row < rows - 1 && column < columns - 1) index.push(at, at + columns, at + 1, at + 1, at + columns, at + columns + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, groundMaterial());
    mesh.frustumCulled = false;
    return mesh;
  }
}

export function makeSea() {
  const time = { value: 0 };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(40000, 40000, 1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { uTime: time, uFog: { value: FOG }, uMoon: { value: new THREE.Vector3(0.28, 0.42, -0.86).normalize() } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 at = modelMatrix * vec4(position, 1.0);
          vWorld = at.xyz;
          gl_Position = projectionMatrix * viewMatrix * at;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFog;
        uniform vec3 uMoon;
        varying vec3 vWorld;

        vec2 swell(vec2 p, float t) {
          vec2 n = vec2(0.0);
          n += vec2(cos(p.x * 0.11 + t * 0.7), sin(p.y * 0.13 - t * 0.6)) * 0.5;
          n += vec2(cos(p.x * 0.37 - p.y * 0.21 + t * 1.3), sin(p.y * 0.41 + p.x * 0.17 + t * 1.1)) * 0.3;
          n += vec2(cos(p.x * 1.1 + p.y * 0.8 - t * 2.1), sin(p.y * 1.3 - p.x * 0.9 + t * 1.9)) * 0.14;
          return n;
        }

        void main() {
          vec3 toEye = normalize(cameraPosition - vWorld);
          float away = length(cameraPosition - vWorld);
          vec2 tilt = swell(vWorld.xz, uTime) * mix(0.11, 0.03, smoothstep(40.0, 900.0, away));
          vec3 normal = normalize(vec3(tilt.x, 1.0, tilt.y));
          vec3 mirrored = reflect(-toEye, normal);
          float fresnel = pow(1.0 - max(dot(normal, toEye), 0.0), 4.0);
          vec3 sky = mix(vec3(0.05, 0.075, 0.13), vec3(0.008, 0.012, 0.03), clamp(mirrored.y * 2.2, 0.0, 1.0));
          vec3 colour = vec3(0.004, 0.009, 0.016) + sky * (0.2 + 0.8 * fresnel);
          float moon = pow(max(dot(mirrored, uMoon), 0.0), 340.0);
          colour += vec3(0.8, 0.86, 1.0) * moon * 2.4;
          gl_FragColor = vec4(mix(colour, uFog, (1.0 - exp(-away * 0.00011)) * 0.8), 1.0);
        }
      `,
    }),
  );
  mesh.position.y = 0.2;
  mesh.frustumCulled = false;
  return { mesh, time };
}

export function makeSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(26000, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uMoon: { value: new THREE.Vector3(0.28, 0.42, -0.86).normalize() } },
      vertexShader: /* glsl */ `
        varying vec3 vWay;
        void main() {
          vWay = normalize(position);
          vec4 at = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
          gl_Position = at.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uMoon;
        varying vec3 vWay;
        ${SHADER_HASH}
        void main() {
          vec3 way = normalize(vWay);
          float up = max(way.y, 0.0);
          // Night over a lit city: never black at the horizon, always a little orange.
          vec3 colour = mix(vec3(0.02, 0.018, 0.026), vec3(0.0012, 0.002, 0.0062), pow(up, 0.3));
          vec2 grid = floor(vec2(atan(way.z, way.x), asin(way.y)) * 900.0);
          float star = step(0.9988, hash1(grid)) * smoothstep(0.05, 0.4, way.y);
          colour += vec3(0.85, 0.9, 1.0) * star * (0.1 + 0.5 * hash1(grid + 3.0));
          float toMoon = dot(way, uMoon);
          colour += vec3(0.95, 0.96, 1.0) * smoothstep(0.99988, 0.99993, toMoon) * 1.25;
          colour += vec3(0.32, 0.36, 0.5) * pow(max(toMoon, 0.0), 900.0) * 0.12;
          gl_FragColor = vec4(colour, 1.0);
        }
      `,
    }),
  );
}

export { FOG };

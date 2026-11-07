import * as THREE from "three";

import type { Ground } from "./city";
import { PLAZA, type Ride, type Spot } from "./ride";
import { type Edge, HERO, PLAZA_EDGE, type World } from "./world";

/*
 * The road, drawn from the ride line. It's one long ribbon that knows how far along it is and how
 * far across, so the lane lines, the crossings, the paving, the pools of street light and the
 * reflections are all worked out from those two numbers, not from a texture of a road. Along the
 * bay it's two carriageways with a median; in the city it's one street between its pavements.
 *
 * The reflections are the point of riding at night. A wet road mirrors each street lamp, stretched
 * into a long streak toward the viewer. A lamp's streak lands where a line from the eye to the
 * lamp's mirror image crosses the road, so it can be drawn exactly, for a few lamps ahead, with no
 * second render of the scene.
 */

export const LAMP_SPACING = 34;
export const LAMP_HEIGHT = 10;
export const LAMP_REACH = 6.2;

const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [-21, 0.16],
  [-13.3, 0.16],
  [-13.25, 0],
  [-1.05, 0],
  [-1, 0.22],
  [1, 0.22],
  [1.05, 0],
  [13.25, 0],
  [13.3, 0.16],
  [21, 0.16],
];

const GLSL_ROAD_HEAD = /* glsl */ `
  varying vec2 vStreet;
  varying vec3 vRoad;
  varying vec2 vPlan;
  uniform vec3 uEye;
  uniform float uLamps;

  float streetHash(vec2 p) {
    return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
  }

  // Smooth patches of damp: a wet road is never evenly wet.
  float streetNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(streetHash(i), streetHash(i + vec2(1.0, 0.0)), f.x), mix(streetHash(i + vec2(0.0, 1.0)), streetHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float softBand(float value, float centre, float half_) {
    float w = fwidth(value) * 0.8 + 0.002;
    return 1.0 - smoothstep(half_ - w, half_ + w, abs(value - centre));
  }
`;

const GLSL_ROAD_PAINT = /* glsl */ `
  {
    float along = vStreet.x;
    float across = vStreet.y;
    float side = abs(across);
    float median = vRoad.x;
    // On the main road, y marks a side street's mouth. Past 8 it's one of the city's other streets,
    // whose z says how strongly its lines show, fading out at its junctions.
    bool street = vRoad.y > 8.5;
    bool mouth = !street && vRoad.y > 0.5;
    bool road = (side < 13.25 && (side > 1.05 || median < 0.5)) || mouth;

    if (road) {
      // Worn lines: lanes along the bay, a dashed crown in the city, a solid edge each side.
      float dashWave = abs(fract(along / 12.0) - 0.5) * 2.0;
      float dashSoft = fwidth(along / 12.0) * 2.0 + 0.004;
      float dash = smoothstep(0.58 - dashSoft, 0.58 + dashSoft, dashWave);
      float paintLine;
      if (median > 0.5) {
        paintLine = (softBand(side, 5.05, 0.075) + softBand(side, 9.15, 0.075)) * dash + softBand(side, 1.65, 0.09);
      } else {
        paintLine = softBand(across, 0.0, 0.1) * dash;
      }
      if (!mouth) paintLine += softBand(side, 12.75, 0.09);
      if (street) {
        // z over 1.5 is a crossing, where this street meets a bigger one. Under that, how strong its lines are.
        float crossing = step(1.5, vRoad.z);
        float bars = abs(fract(across / 2.6) - 0.5) * 2.0;
        float barSoft = fwidth(across / 2.6) * 2.0 + 0.01;
        float stripe = smoothstep(0.5 - barSoft, 0.5 + barSoft, bars);
        paintLine = mix(paintLine * vRoad.z, stripe, crossing);
      } else {
        // A zebra crossing where a side street comes in.
        float stripeWave = abs(fract(across / 1.5) - 0.5) * 2.0;
        float stripeSoft = fwidth(across / 1.5) * 2.0 + 0.01;
        float stripe = smoothstep(0.5 - stripeSoft, 0.5 + stripeSoft, stripeWave) * step(0.5, vRoad.z);
        paintLine = max(paintLine, stripe);
      }
      // Paint wears unevenly, and most of all where the tyres run.
      float worn = 0.45 + 0.55 * streetNoise(vec2(along * 0.7, across * 1.3));
      // The asphalt photograph is a little green, and warm lamps would turn that to olive.
      float tar = dot(diffuseColor.rgb, vec3(0.33));
      vec3 surface = mix(vec3(tar) * vec3(1.0, 0.985, 0.985), diffuseColor.rgb, 0.05);
      diffuseColor.rgb = mix(surface * 0.1, vec3(0.3, 0.29, 0.26), min(paintLine, 1.0) * worn);
    } else if (side >= 13.3) {
      // Big grey slabs, with a band of tan ones let into them, as on the seafront.
      vec2 slab = street ? vPlan / vec2(0.6, 0.6) : vec2(along, across) / vec2(1.25, 1.5);
      vec2 joint = abs(fract(slab) - 0.5);
      // Joints too fine to draw at this distance are left out, or they'd shimmer.
      float lines = smoothstep(0.46, 0.5, max(joint.x, joint.y)) * (1.0 - smoothstep(0.08, 0.3, fwidth(slab.x) + fwidth(slab.y)));
      vec2 id = floor(slab);
      float tan_ = step(5.5, mod(id.x, 7.0)) * step(0.5, mod(id.y + floor(id.x / 7.0), 2.0));
      vec3 stone = mix(vec3(0.15, 0.145, 0.135), vec3(0.24, 0.18, 0.1), tan_);
      diffuseColor.rgb = stone * (0.82 + 0.3 * streetHash(id)) * (1.0 - lines * 0.45);
    } else {
      // The kerb, and the median's stone.
      diffuseColor.rgb = vec3(0.06, 0.058, 0.054);
    }
  }
`;

/**
 * The scene's night photograph lights everything, and its colours are a real city's: green and blue
 * in the sky, which a road at a low angle mirrors as a wash of olive. The scene's strength overrides
 * a material's own, so the road takes it down here, and takes the colour out of it.
 */
const GLSL_ROAD_SKY = /* glsl */ `
  #ifdef RE_IndirectSpecular
    radiance = vec3(dot(radiance, vec3(0.3333))) * 0.3;
  #endif
  #ifdef RE_IndirectDiffuse
    iblIrradiance = vec3(dot(iblIrradiance, vec3(0.3333))) * 0.3;
  #endif
`;

const GLSL_ROAD_LIGHT = /* glsl */ `
  {
    float along = vStreet.x;
    float across = vStreet.y;
    float side = abs(across);
    float median = vRoad.x;
    float cityness = 1.0 - median;
    float lampSide = mix(14.0, ${LAMP_REACH.toFixed(1)}, median);
    if (vRoad.y > 8.5) {
      // One even glow: where two streets overlap at a junction, they mustn't show it.
      // A pool under each lamp, from side to side down the street as the lamps are set out.
      float lampRun = mod(along - 12.0 + 20.0, 40.0) - 20.0;
      float lampPool = exp(-lampRun * lampRun / 130.0);
      totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.82, 0.7) * (0.2 + lampPool * 0.62);
    } else {
    float cell = (fract(along / ${LAMP_SPACING.toFixed(1)}) - 0.5) * ${LAMP_SPACING.toFixed(1)};
    float pool = exp(-cell * cell / 190.0) * exp(-pow(side - lampSide, 2.0) / 90.0);
    vec3 lamp = mix(vec3(1.0, 0.82, 0.72), vec3(0.92, 0.93, 1.0), median);
    totalEmissiveRadiance += diffuseColor.rgb * lamp * (0.05 + pool * 0.62);
    // In the city, the lit fronts themselves throw light over the pavement and out across the road.
    float fronts = smoothstep(4.0, 21.0, side) * cityness;
    totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.82, 0.72) * fronts * 0.42;

    // The streaks: for each lamp ahead, where its mirror image lands on the road.
    float height = max(uEye.z, 0.3);
    float wet = (0.3 + 0.7 * streetNoise(vec2(along * 0.09, across * 0.31))) * step(side, 13.25);
    float first = (floor(uEye.x / ${LAMP_SPACING.toFixed(1)}) + 1.0) * ${LAMP_SPACING.toFixed(1)};
    vec3 streak = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      if (float(i) >= uLamps) break;
      float lampAlong = first + float(i) * ${LAMP_SPACING.toFixed(1)};
      float reach = lampAlong - uEye.x;
      float t = height / (height + ${LAMP_HEIGHT.toFixed(1)});
      float spotAlong = uEye.x + reach * t;
      float length_ = 0.9 + reach * 0.03;
      float width = 0.26 + reach * 0.007;
      for (int s = 0; s < 2; s++) {
        float lampAcross = s == 0 ? lampSide : -lampSide;
        float spotAcross = uEye.y + (lampAcross - uEye.y) * t;
        float a = (along - spotAlong) / length_;
        float b = (across - spotAcross) / width;
        streak += lamp * exp(-(a * a + b * b)) / (1.0 + reach * 0.018);
      }
    }
    totalEmissiveRadiance += streak * wet * 0.15;
    // And the fronts, mirrored as a long warm sheen down each side of a wet street.
    totalEmissiveRadiance += vec3(1.0, 0.72, 0.46) * wet * smoothstep(2.0, 13.0, side) * cityness * 0.03;
    }
  }
`;

type Maps = { albedo: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture };

function roadMaterial(maps: Maps, lamps: number, eye: { value: THREE.Vector3 }) {
  for (const map of [maps.albedo, maps.normal, maps.rough]) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(0.3, 0.3);
    map.anisotropy = 8;
  }
  maps.albedo.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map: maps.albedo,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: maps.rough,
    roughness: 0.82,
    metalness: 0,
    // Only a touch: the sky photograph has green in it, and the streaks do the real reflecting.
    envMapIntensity: 0.08,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEye = eye;
    shader.uniforms.uLamps = { value: lamps };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aRoad;\nattribute vec2 aStreet;\nvarying vec2 vStreet;\nvarying vec3 vRoad;\nvarying vec2 vPlan;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvStreet = aStreet;\nvRoad = aRoad;\nvPlan = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GLSL_ROAD_HEAD}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${GLSL_ROAD_PAINT}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${GLSL_ROAD_LIGHT}`)
      .replace("#include <lights_fragment_end>", `${GLSL_ROAD_SKY}\n#include <lights_fragment_end>`);
  };
  return material;
}

/** The main road: wide, with its kerbs and median, its junctions opening off it. */
export function makeRoad(ride: Ride, maps: Maps, small: boolean) {
  const columns = PROFILE.length;
  const rows = ride.count;
  const position = new Float32Array(rows * columns * 3);
  const street = new Float32Array(rows * columns * 2);
  const plan = new Float32Array(rows * columns * 2);
  const road = new Float32Array(rows * columns * 3);
  const index: number[] = [];
  const spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };
  // Crossings go where the side streets meet the road, and its kerb stops for them.
  const zebra = new Uint8Array(rows);
  const openLeft = new Uint8Array(rows);
  const openRight = new Uint8Array(rows);
  for (const [along, side, wide] of ride.gaps) {
    const row = Math.round(along / ride.step);
    const reach = Math.ceil(wide / 2 / ride.step);
    if (row - reach - 1 >= 0 && row + reach + 1 < rows) {
      zebra[row - reach - 1] = zebra[row + reach + 1] = 1;
    }
    for (let k = Math.max(row - reach, 0); k <= Math.min(row + reach, rows - 1); k++) {
      if (side < 0) openLeft[k] = 1;
      else openRight[k] = 1;
    }
  }
  for (let row = 0; row < rows; row++) {
    const along = row * ride.step;
    ride.spot(along, spot);
    const width = ride.widthAt(along);
    const median = ride.medianAt(along);
    const zone = ride.zoneAt(along);
    for (let column = 0; column < columns; column++) {
      const [across, lift] = PROFILE[column];
      const at = row * columns + column;
      const open = across < -1 ? openLeft[row] : across > 1 ? openRight[row] : 0;
      // The median only rises where there is one, and the kerb drops where a street comes in.
      const raised = Math.abs(across) <= 1 ? lift * median : open ? 0 : lift;
      const x = spot.x + spot.rightX * across * width;
      const z = spot.z + spot.rightZ * across * width;
      position[at * 3] = x;
      position[at * 3 + 1] = spot.y + raised + 0.05;
      position[at * 3 + 2] = z;
      street[at * 2] = along;
      street[at * 2 + 1] = across;
      plan[at * 2] = x;
      plan[at * 2 + 1] = z;
      road[at * 3] = median;
      road[at * 3 + 1] = open;
      road[at * 3 + 2] = zebra[row];
      // The esplanade has its own paving, so the road only begins where it leaves it. Wound so the
      // road faces up.
      if (row < rows - 1 && column < columns - 1 && zone !== PLAZA) {
        index.push(at, at + 1, at + columns, at + 1, at + columns + 1, at + columns);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(plan, 2));
  geometry.setAttribute("aStreet", new THREE.BufferAttribute(street, 2));
  geometry.setAttribute("aRoad", new THREE.BufferAttribute(road, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  const eye = { value: new THREE.Vector3() };
  const mesh = new THREE.Mesh(geometry, roadMaterial(maps, small ? 5 : 12, eye));
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return { mesh, eye };
}

/** Square of the map a stretch of street belongs to. */
const STREET_CELL = 400;
/** A crossing stands this far back from the bigger street's kerb, and is this deep. */
const CROSSING_GAP = 1.6;
const CROSSING_DEEP = 3;
/** Between the road's edge and the wall, a pavement, wider on the bigger streets. */
const pavement = (edge: Edge) => (edge.half > 5 ? 3 : edge.half > 4 ? 2.4 : 1.7);

/**
 * Every other street in the city, built a square of the map at a time as the bike nears it. A side
 * street stops at the kerb of the road it joins, and a pavement gives way at each junction, so the
 * streets run into each other the way real ones do.
 */
export class Streets {
  readonly group = new THREE.Group();
  private readonly material: THREE.Material;
  private readonly cells = new Map<number, { edge: Edge; from: number; to: number }[]>();
  private readonly live = new Map<number, THREE.Mesh>();
  private readonly point = { x: 0, z: 0, forwardX: 0, forwardZ: 1 };
  private lastCell = -1;

  constructor(
    private readonly world: World,
    private readonly ground: Ground,
    maps: Maps,
    private readonly reach: number,
  ) {
    this.material = roadMaterial(maps, 0, { value: new THREE.Vector3(-1e6, 0, 1) });
    for (const edge of world.edges) {
      if (edge.kind >= HERO) continue;
      // A long street is split between the squares it passes through.
      const rows = Math.max(Math.ceil(edge.length / 6), 1);
      let start = 0;
      let cell = this.cellOf(edge, 0);
      for (let row = 1; row <= rows; row++) {
        const next = this.cellOf(edge, (row / rows) * edge.length);
        if (next === cell && row < rows) continue;
        const list = this.cells.get(cell) ?? [];
        list.push({ edge, from: (start / rows) * edge.length, to: (row / rows) * edge.length });
        this.cells.set(cell, list);
        start = row;
        cell = next;
      }
    }
  }

  private key(x: number, z: number) {
    return (Math.floor(x / STREET_CELL) + 64) * 256 + Math.floor(z / STREET_CELL) + 64;
  }

  private cellOf(edge: Edge, along: number) {
    this.world.pointOn(edge, along, this.point);
    return this.key(this.point.x, this.point.z);
  }

  /** How far from each end of a street it gives way to the junction there. */
  private clearance(edge: Edge, node: number) {
    let widest = 0;
    let hero = false;
    for (const index of this.world.nodes[node]) {
      if (index === edge.index) continue;
      const other = this.world.edges[index];
      if (other.kind === PLAZA_EDGE) continue;
      widest = Math.max(widest, other.half);
      if (other.kind >= HERO) hero = true;
    }
    return { widest, trim: hero || widest > edge.half + 0.5 ? widest - 0.3 : 0 };
  }

  private build(key: number) {
    const runs = this.cells.get(key);
    if (!runs) return null;
    const { world, ground, point } = this;
    const position: number[] = [];
    const plan: number[] = [];
    const street: number[] = [];
    const road: number[] = [];
    const index: number[] = [];
    for (const { edge, from, to } of runs) {
      const startEnd = this.clearance(edge, edge.a);
      const finishEnd = this.clearance(edge, edge.b);
      const lines = edge.kind < 5 ? 1 : edge.kind < 6 ? 0.6 : 0;
      const start = Math.max(from, startEnd.trim);
      const stop = Math.min(to, edge.length - finishEnd.trim);
      if (stop - start < 0.5) continue;
      const steps = Math.max(Math.ceil((stop - start) / 6), 1);
      const scale = 13.25 / edge.half;
      const stations: number[] = [];
      for (let step = 0; step <= steps; step++) stations.push(start + ((stop - start) * step) / steps);
      // A crossing at each end that gives way to a bigger street, cut in with rows of its own.
      const bands: [number, number][] = [];
      if (startEnd.trim > 0 && from <= startEnd.trim) bands.push([startEnd.trim + CROSSING_GAP, startEnd.trim + CROSSING_GAP + CROSSING_DEEP]);
      if (finishEnd.trim > 0 && to >= edge.length - finishEnd.trim) bands.push([edge.length - finishEnd.trim - CROSSING_GAP - CROSSING_DEEP, edge.length - finishEnd.trim - CROSSING_GAP]);
      for (const [a, b] of bands) {
        if (a > start && b < stop) stations.push(a - 0.05, a + 0.05, b - 0.05, b + 0.05);
      }
      stations.sort((a, b) => a - b);
      const inCrossing = (along: number) => bands.some(([a, b]) => along > a && along < b);
      stations.forEach((along, step) => {
        world.pointOn(edge, along, point);
        const rightX = -point.forwardZ;
        const rightZ = point.forwardX;
        // The pavement gives way as a junction nears, and the lines fade out into it.
        const fromStart = along - startEnd.widest - 2;
        const fromEnd = edge.length - along - finishEnd.widest - 2;
        const open = Math.min(Math.max(Math.min(fromStart, fromEnd) / 3, 0), 1);
        // Gone altogether once it's nearly gone: a sliver would draw as a long thin bright line.
        const side = open < 0.2 ? 0 : pavement(edge) * open;
        const lift = 0.04 + 0.05 * open;
        const base = position.length / 3;
        for (const [across, up] of [
          [-(edge.half + side), lift],
          [-edge.half - 0.02 * open, lift],
          [-edge.half, 0.04],
          [0, 0.04],
          [edge.half, 0.04],
          [edge.half + 0.02 * open, lift],
          [edge.half + side, lift],
        ] as const) {
          const x = point.x + rightX * across;
          const z = point.z + rightZ * across;
          position.push(x, ground.at(x, z) + up, z);
          plan.push(x, z);
          // Pavement reads as past the road's edge, however wide this street is.
          street.push(along, Math.abs(across) > edge.half + 0.01 ? Math.sign(across) * (14 + Math.abs(across) - edge.half) : across * scale);
          road.push(0, 9, inCrossing(along) ? 2 : lines * open);
        }
        if (step < stations.length - 1) {
          for (let k = 0; k < 6; k++) {
            const a = base + k;
            index.push(a, a + 1, a + 7, a + 1, a + 8, a + 7);
          }
        }
      });
    }
    if (!index.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(plan, 2));
    geometry.setAttribute("aStreet", new THREE.Float32BufferAttribute(street, 2));
    geometry.setAttribute("aRoad", new THREE.Float32BufferAttribute(road, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Builds at most one square a frame, nearest first, and drops what's been left behind. */
  update(x: number, z: number) {
    const here = this.key(x, z);
    const near: [number, number][] = [];
    const steps = Math.ceil(this.reach / STREET_CELL);
    for (let a = -steps; a <= steps; a++) {
      for (let b = -steps; b <= steps; b++) {
        const cx = x + a * STREET_CELL;
        const cz = z + b * STREET_CELL;
        const key = this.key(cx, cz);
        if (this.cells.has(key) && !this.live.has(key)) near.push([Math.hypot(a, b), key]);
      }
    }
    if (near.length) {
      near.sort((p, q) => p[0] - q[0]);
      const mesh = this.build(near[0][1]);
      const made = mesh ?? new THREE.Mesh();
      this.live.set(near[0][1], made);
      if (mesh) this.group.add(mesh);
    }
    const busy = near.length > 0;
    if (here === this.lastCell) return busy;
    this.lastCell = here;
    const hereA = Math.floor(here / 256);
    const hereB = here % 256;
    for (const [key, mesh] of this.live) {
      const far = Math.max(Math.abs(Math.floor(key / 256) - hereA), Math.abs((key % 256) - hereB));
      if (far <= steps + 1) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      this.live.delete(key);
    }
    return busy;
  }
}

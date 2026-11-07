import * as THREE from "three";

import { FOG } from "./city";
import type { Building, World } from "./world";

/*
 * The fronts of Algiers. Every bay was modelled in full in Blender and path-traced under the warm
 * light that climbs the city's walls at night, then baked into one atlas. Here those pictures go on
 * small models with real depth: reveals, balconies on their brackets, the vaults of the seafront
 * arcade, tens of thousands of them, a stretch of road at a time.
 *
 * One shader does the whole kit, because every window has to be lit or dark on its own, and every
 * building has its own plaster and shutters. The atlas's alpha says what each texel is.
 */

const FIELDS = 11;
const KINDS = ["Bay", "Balcony", "Filant", "Shop", "Shut", "Arcade", "Cornice", "Mansard", "Dish"];
const DISH = 8;
/** Side of a square of the map, in metres, as scripts/moto_city.py cuts them. */
const TILE = 240;
const BAY = 3.7;
const GROUND_FLOOR = 4.4;
const STOREY = 3.5;
/** The modules stand this far off a building's wall: their windows, and the shops' deeper glass, are set back into it. */
const PROUD = 0.5;
const BAY_PLAIN = 0;
const BAY_BALCONY = 1;
const BAY_FILANT = 2;
const SHOP = 3;
const SHUT = 4;
const CORNICE = 6;
const [HOOD, PEDIMENT, SEGMENT, , RICH, DECO, MOORISH, MODERN, RUSTIC] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function mulberry(seed: number) {
  let state = Math.floor(seed * 4294967296);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What goes on each floor above the shops: a window, a balcony or a long iron one, and its surround. */
function floorPlan(style: number, floors: number, rand: () => number) {
  const plan: [number, number][] = [];
  for (let floor = 1; floor < floors; floor++) {
    const top = floor === floors - 1;
    if (style === 0) plan.push(floor === 1 ? [BAY_PLAIN, RUSTIC] : floor === 2 ? [BAY_FILANT, PEDIMENT] : top || floor === floors - 2 ? [BAY_FILANT, HOOD] : [BAY_BALCONY, floor % 2 ? RICH : SEGMENT]);
    else if (style === 1) plan.push(floor === 1 || top ? [BAY_FILANT, HOOD] : [BAY_BALCONY, SEGMENT]);
    else if (style === 2) plan.push([floor === 2 || floor === floors - 2 ? BAY_FILANT : BAY_PLAIN, DECO]);
    else if (style === 3) plan.push([floor % 2 === 0 ? BAY_BALCONY : BAY_PLAIN, MOORISH]);
    else plan.push([rand() < 0.2 ? BAY_BALCONY : BAY_PLAIN, MODERN]);
  }
  return plan;
}

const VERTEX = /* glsl */ `
  attribute vec4 aInfo;
  attribute float aTint;
  attribute vec2 uv1;
  varying vec3 vWorld;
  varying vec2 vLocal;
  varying vec4 vInfo;
  varying float vTint;
  varying float vZone;
  varying float vHeight;
  varying vec3 vRight;
  varying vec3 vInward;
  varying float vSpan;
  void main() {
    vec4 at = modelMatrix * instanceMatrix * vec4(position, 1.0);
    // As seen from the street, the model's -x is to the right, and its +z runs into the wall.
    vSpan = length(instanceMatrix[0].xyz);
    vRight = -instanceMatrix[0].xyz / max(vSpan, 0.001);
    vInward = normalize(instanceMatrix[2].xyz);
    vWorld = at.xyz;
    // glTF stores v upside down, as one minus itself.
    vLocal = vec2(uv1.x, 1.0 - uv1.y);
    vZone = floor(uv.x * 32.0);
    vInfo = aInfo;
    vTint = aTint;
    vHeight = position.y + (aInfo.y < 0.5 ? 0.0 : 4.4 + (aInfo.y - 1.0) * 3.5);
    gl_Position = projectionMatrix * viewMatrix * at;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uFog;
  uniform sampler2D uAtlas;
  uniform sampler2D uRail;
  uniform sampler2D uSigns;
  varying vec3 vWorld;
  varying vec2 vLocal;
  varying vec4 vInfo;
  varying float vTint;
  varying float vZone;
  varying float vHeight;
  varying vec3 vRight;
  varying vec3 vInward;
  varying float vSpan;

  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // A cell of the atlas, counted from its top left, with v running up.
  vec4 cell(float col, float row, vec2 at) {
    vec2 inside = clamp(at, 0.004, 0.996);
    return texture2D(uAtlas, vec2((col + inside.x) * 0.25, 1.0 - (row + 1.0 - inside.y) * 0.25));
  }

  // The plaster of this building: nearly all white, some cream, the odd old ochre.
  vec3 plasterOf(float tint) {
    vec3 cream = vec3(1.0, 0.9, 0.76);
    vec3 white = vec3(1.0, 0.985, 0.965);
    return mix(white, cream, smoothstep(0.55, 1.0, tint));
  }

  vec3 shutterOf(float tint) {
    float pick = hash1(vec2(tint, 5.0));
    if (pick < 0.46) return vec3(0.34, 0.5, 0.78);
    if (pick < 0.66) return vec3(0.62, 0.64, 0.66);
    if (pick < 0.82) return vec3(0.34, 0.56, 0.5);
    return vec3(0.6, 0.46, 0.34);
  }

  // What the atlas says, finished for this building and this window.
  vec3 finish(vec4 texel, float seed, float tint, float storey) {
    float glass = smoothstep(0.7, 0.92, texel.a);
    float shutter = smoothstep(0.25, 0.4, texel.a) * (1.0 - glass);
    vec3 wall = texel.rgb * plasterOf(tint);
    vec3 painted = texel.rgb * shutterOf(tint) * 1.3;
    float odds = hash1(vec2(seed, storey + 7.0));
    float lit = step(0.6, odds);
    vec3 warm = mix(vec3(1.0, 0.72, 0.44), vec3(0.76, 0.84, 1.0), step(0.88, hash1(vec2(seed, 11.0))));
    vec3 room = texel.rgb * warm * (0.22 + 0.62 * hash1(vec2(seed, storey)));
    // An unlit window shows the sky, and a little of the street across the way.
    vec3 dark = vec3(0.006, 0.008, 0.016) + vec3(0.028, 0.03, 0.04) * (1.0 - vLocal.y);
    vec3 pane = mix(dark, room, lit);
    return mix(mix(wall, painted, shutter), pane, glass);
  }

  // Which kind of room goes behind which sign, in the order scripts/moto_signs.py draws them.
  float tradeOf(float sign_) {
    int id = int(sign_ + 0.5);
    if (id == 1 || id == 11 || id == 12) return 4.0;
    if (id == 2 || id == 3 || id == 4 || id == 6 || id == 8 || id == 14) return 2.0;
    if (id == 9) return 1.0;
    if (id == 7) return 3.0;
    return 0.0;
  }

  // What's on the back wall of a shop. Each trade has its own, so a street isn't one long bookshop.
  // 0 grocer: shelves of tins and packets. 1 clothes: rails of hanging things on a pale wall.
  // 2 café: a tiled wall, a counter, and bottles above it. 3 hardware: a dark wall of hung goods.
  // 4 bakery: racks of pale loaves, in warm light.
  vec3 stock(vec2 at, float seed, vec3 glow, float trade) {
    if (trade < 0.5 || trade > 3.5) {
      float rowHeight = trade > 3.5 ? 0.3 : 0.34 + 0.16 * hash1(vec2(seed, 31.0));
      float row = floor(at.y / rowHeight);
      float inRow = fract(at.y / rowHeight);
      float wide = trade > 3.5 ? 0.3 : 0.1 + 0.2 * hash1(vec2(row, seed));
      float item = floor(at.x / wide + row * 0.37);
      float inItem = fract(at.x / wide + row * 0.37);
      float tone = hash1(vec2(item, row + seed * 13.0));
      float tall = trade > 3.5 ? 0.42 : 0.5 + 0.42 * hash1(vec2(item + 3.0, row));
      vec3 goods = trade > 3.5 ? mix(vec3(0.62, 0.42, 0.2), vec3(0.86, 0.66, 0.36), tone) : mix(vec3(0.3, 0.27, 0.23), vec3(0.72, 0.64, 0.54), tone);
      float there = step(inRow, tall) * step(0.08, inItem) * step(inItem, 0.92) * step(0.16, hash1(vec2(item + 11.0, row + seed)));
      vec3 back = trade > 3.5 ? vec3(0.34, 0.27, 0.2) : vec3(0.24, 0.23, 0.21);
      vec3 colour = mix(back, goods, there);
      colour *= 0.55 + 0.45 * smoothstep(1.0, 0.25, inRow);
      colour = mix(colour, vec3(0.5, 0.46, 0.4), step(0.95, inRow));
      return colour * glow;
    }
    if (trade < 1.5) {
      // Clothes on a rail: long soft shapes in dark colours, under a pale wall.
      float item = floor(at.x / 0.22);
      float inItem = abs(fract(at.x / 0.22) - 0.5) * 2.0;
      float length_ = 0.7 + 0.5 * hash1(vec2(item, seed));
      float rail = 1.9;
      float there = step(rail - length_, at.y) * step(at.y, rail) * step(inItem, 0.84) * step(0.2, hash1(vec2(item + 5.0, seed)));
      vec3 cloth = mix(vec3(0.07, 0.07, 0.09), vec3(0.34, 0.24, 0.22), hash1(vec2(item, 9.0 + seed)));
      vec3 wall = vec3(0.56, 0.54, 0.5);
      return mix(wall, cloth, there) * glow;
    }
    if (trade < 2.5) {
      // A café: white tile to shoulder height, a dark counter, and bottles on a shelf above it.
      vec2 tile = abs(fract(at / 0.2) - 0.5);
      vec3 wall = vec3(0.6, 0.58, 0.54) * (0.86 + 0.14 * smoothstep(0.42, 0.5, max(tile.x, tile.y)));
      wall = mix(wall, vec3(0.2, 0.13, 0.08), step(1.5, at.y));
      float bottle = step(1.62, at.y) * step(at.y, 1.92) * step(abs(fract(at.x / 0.13) - 0.5), 0.22);
      vec3 colour = mix(wall, vec3(0.3, 0.2, 0.1), bottle);
      colour = mix(colour, vec3(0.1, 0.06, 0.04), step(at.y, 1.02));
      return colour * glow;
    }
    // Hardware: tools and coils hung on a dark board.
    float cellX = floor(at.x / 0.34);
    float cellY = floor(at.y / 0.42);
    vec2 inCell = abs(fract(at / vec2(0.34, 0.42)) - 0.5) * 2.0;
    float there = step(max(inCell.x, inCell.y * 0.8), 0.72) * step(0.32, hash1(vec2(cellX, cellY + seed)));
    vec3 goods = mix(vec3(0.3, 0.3, 0.32), vec3(0.5, 0.3, 0.14), hash1(vec2(cellX + 3.0, cellY)));
    return mix(vec3(0.08, 0.075, 0.07), goods, there) * glow;
  }

  // Looks into the shop as if it were a real room behind the glass, by following the ray from the
  // eye to whichever wall of the room it lands on. It moves as you ride past, the way depth does.
  vec3 shopRoom(vec2 at, float wide, float tall, float seed) {
    float pick = hash1(vec2(seed, 19.0));
    vec3 glow = pick < 0.5 ? vec3(1.0, 0.82, 0.6) : pick < 0.82 ? vec3(0.9, 0.93, 1.0) : vec3(1.0, 0.7, 0.42);
    float deep = 3.4 + 2.4 * hash1(vec2(seed, 23.0));
    float trade = tradeOf(floor(seed * 16.0));
    vec3 ray = normalize(vWorld - cameraPosition);
    vec3 way = vec3(dot(ray, vRight), ray.y, max(dot(ray, vInward), 0.04));
    vec3 from = vec3((at.x - 0.5) * wide, at.y * tall, 0.0);
    // A ray running dead level must keep its sign here. Lost, the distance turns hugely negative, and
    // a bright line runs along every shop at the height of the eye.
    float sideways = abs(way.x) < 0.0001 ? (way.x < 0.0 ? -0.0001 : 0.0001) : way.x;
    float upward = abs(way.y) < 0.0001 ? (way.y < 0.0 ? -0.0001 : 0.0001) : way.y;
    float toSide = ((sideways > 0.0 ? wide * 0.5 : -wide * 0.5) - from.x) / sideways;
    float toFlat = ((upward > 0.0 ? tall : 0.0) - from.y) / upward;
    float toBack = deep / way.z;
    float reach = max(min(toBack, min(toSide, toFlat)), 0.0);
    vec3 hit = from + way * reach;

    vec3 colour;
    if (reach == toFlat && way.y > 0.0) {
      // The ceiling, with its strip lights.
      float strip = step(abs(fract(hit.z / 1.5) - 0.5), 0.1) * step(abs(hit.x), wide * 0.36);
      colour = mix(vec3(0.22, 0.21, 0.19) * glow, glow * 0.85, strip);
    } else if (reach == toFlat) {
      // The floor: old terrazzo tile, shining a little under the lights.
      vec2 tile = abs(fract(hit.xz / 0.5) - 0.5);
      float joint = smoothstep(0.46, 0.5, max(tile.x, tile.y));
      colour = vec3(0.34, 0.31, 0.27) * glow * (1.0 - joint * 0.5) * (0.8 + 0.3 * hash1(floor(hit.xz / 0.5)));
    } else if (reach == toBack) {
      colour = stock(hit.xy + vec2(7.0, 0.0), seed, glow, trade);
    } else {
      colour = stock(hit.zy, seed + 0.31, glow, trade) * 0.86;
    }
    // A counter across the back, and the light falling away from the ceiling down the room.
    colour *= 0.42 + 0.58 * smoothstep(0.0, tall, hit.y);
    colour *= 1.0 - 0.34 * hit.z / deep;
    // The glass: a dark tint, and a little of the street shining on it at a glance.
    float glance = pow(max(1.0 - way.z, 0.0), 3.0);
    colour = colour * 0.6 + vec3(0.1, 0.075, 0.05) * glance;
    // The frame down the middle.
    colour *= smoothstep(0.0, 0.006, abs(at.x - 0.5) - 0.006);
    return min(colour, vec3(1.0));
  }

  void main() {
    int zone = int(vZone + 0.5);
    // Rounded, because the tiny jitter a varying picks up would turn every hash below to noise.
    float seed = floor(vInfo.x * 512.0 + 0.5) / 512.0;
    float storey = vInfo.y;
    float tint = floor(vTint * 512.0 + 0.5) / 512.0;

    // Each front has its own lamps: some blaze, some are left to the street. All fade going up.
    float bright = 0.34 + 0.46 * hash1(vec2(tint, 2.0));
    float climb = mix(1.0, 0.34, smoothstep(4.0, 24.0, vHeight));
    float gain = bright * climb;
    vec3 colour;
    float alpha = 1.0;

    if (zone == 0) {
      float id = floor(vInfo.z + 0.5);
      vec4 texel = cell(mod(id, 4.0), floor(id / 4.0), vLocal);
      colour = finish(texel, seed, tint, storey);
      colour *= mix(vec3(gain), vec3(1.0), smoothstep(0.7, 0.92, texel.a));
    } else if (zone == 1) {
      colour = plasterOf(tint) * vec3(0.42, 0.34, 0.25) * gain;
    } else if (zone == 2) {
      colour = cell(2.0, 3.0, vec2(vLocal.x, 0.9)).rgb * plasterOf(tint) * gain * 0.9;
    } else if (zone == 3) {
      colour = cell(2.0, 3.0, vLocal).rgb * plasterOf(tint) * gain * 0.78;
    } else if (zone == 4) {
      colour = plasterOf(tint) * vec3(0.62, 0.5, 0.36) * (0.5 + 0.5 * vLocal.y) * gain;
    } else if (zone == 5) {
      vec4 iron = texture2D(uRail, vLocal);
      alpha = smoothstep(0.18, 0.55, iron.a);
      if (alpha < 0.02) discard;
      colour = vec3(0.006, 0.006, 0.007) + vec3(0.03, 0.022, 0.014) * gain;
    } else if (zone == 6) {
      colour = vec3(0.006, 0.006, 0.007) + vec3(0.02, 0.016, 0.01) * gain;
    } else if (zone == 7) {
      vec4 texel = cell(1.0, 2.0, vLocal);
      colour = texel.rgb * plasterOf(tint) * bright;
    } else if (zone == 8) {
      // The glass takes up part of the picture of its wall.
      vec2 at = vec2((vLocal.x - 0.103) / 0.794, (vLocal.y - 0.0818) / 0.6);
      colour = shopRoom(at, vSpan * 0.794, 2.64, seed);
    } else if (zone == 9) {
      vec4 texel = cell(2.0, 2.0, vLocal);
      colour = texel.rgb * plasterOf(tint) * bright;
    } else if (zone == 10) {
      float id = floor(seed * 16.0);
      float col = mod(id, 2.0);
      float row = floor(id / 2.0);
      vec2 sheet = vec2((col + vLocal.x) / 2.0, (7.0 - row + vLocal.y) / 8.0);
      colour = texture2D(uSigns, sheet).rgb * 0.72;
    } else if (zone == 11) {
      vec4 texel = vec4(0.0);
      // Two cells high, in the last column.
      vec2 at = vec2(vLocal.x, vLocal.y * 2.0);
      texel = at.y < 1.0 ? cell(3.0, 3.0, at) : cell(3.0, 2.0, at - vec2(0.0, 1.0));
      colour = finish(texel, seed, tint, 1.0);
      colour *= mix(vec3(bright), vec3(1.0), smoothstep(0.7, 0.92, texel.a));
    } else if (zone == 12) {
      // Under the arcade: a shop window in a wall warm from the lantern.
      float window = step(0.18, vLocal.x) * step(vLocal.x, 0.82) * step(0.08, vLocal.y) * step(vLocal.y, 0.62);
      vec3 wall = vec3(0.04, 0.026, 0.014) * (1.3 - vLocal.y * 0.6);
      vec2 at = (vLocal - vec2(0.18, 0.08)) / vec2(0.64, 0.54);
      colour = mix(wall, shopRoom(at, vSpan * 0.64, 2.83, seed), window * step(0.3, seed));
    } else if (zone == 13) {
      colour = cell(1.0, 3.0, vLocal).rgb * plasterOf(tint) * bright * 0.82;
    } else if (zone == 14) {
      vec4 texel = cell(0.0, 3.0, vLocal);
      colour = finish(texel, seed, tint, 40.0) * 0.72;
    } else if (zone == 15) {
      colour = vec3(5.2, 3.4, 1.6);
    } else if (zone == 16) {
      colour = vec3(0.3, 0.3, 0.32) * (0.05 + 0.2 * gain);
    } else if (zone == 17) {
      colour = vec3(0.012, 0.012, 0.016);
    } else {
      // The vault and the floor under it, warmest round the lantern.
      float fall = exp(-abs(vLocal.x - 0.42) * 2.6);
      colour = plasterOf(tint) * vec3(1.0, 0.68, 0.38) * (0.02 + 0.2 * fall);
    }

    float fog = 1.0 - exp(-length(vWorld - cameraPosition) * 0.00016);
    gl_FragColor = vec4(mix(colour, uFog, fog), alpha);
  }
`;

type Row = number[];

export class Facades {
  readonly group = new THREE.Group();
  private readonly live = new Map<number, THREE.Group>();
  private readonly byTile = new Map<number, Building[]>();
  private readonly fixed = new Map<number, [number, number][]>();
  private readonly holder = new THREE.Object3D();

  private constructor(
    private readonly world: World,
    private readonly table: Float32Array,
    private readonly shapes: THREE.BufferGeometry[],
    private readonly material: THREE.ShaderMaterial,
    private readonly reach: number,
  ) {
    // The street walls of the main road come ready laid out, a square at a time.
    const rows = table.length / FIELDS;
    let start = 0;
    while (start < rows) {
      const tile = table[start * FIELDS + 8];
      const kind = table[start * FIELDS + 6];
      let end = start;
      while (end < rows && table[end * FIELDS + 8] === tile && table[end * FIELDS + 6] === kind) end += 1;
      const list = this.fixed.get(tile) ?? [];
      list.push([start, end]);
      this.fixed.set(tile, list);
      start = end;
    }
    // The rest of the city's buildings, filed by square, for dressing as the bike comes.
    for (const building of world.buildings) {
      if (building.floors === 0) continue;
      const x = world.cornerX[building.start];
      const z = world.cornerZ[building.start];
      const key = this.tileOf(x, z);
      const list = this.byTile.get(key);
      if (list) list.push(building);
      else this.byTile.set(key, [building]);
    }
  }

  static async make(world: World, kit: THREE.Object3D, atlas: THREE.Texture, rail: THREE.Texture, signs: THREE.Texture, small: boolean) {
    const response = await fetch("/moto/city/facade.bin");
    const table = new Float32Array(await response.arrayBuffer());

    for (const map of [atlas, signs]) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
    rail.wrapS = THREE.RepeatWrapping;
    rail.anisotropy = 4;
    const material = new THREE.ShaderMaterial({
      uniforms: { uFog: { value: FOG }, uAtlas: { value: atlas }, uRail: { value: rail }, uSigns: { value: signs } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.DoubleSide,
      alphaToCoverage: !small,
    });
    const shapes = KINDS.map((name) => {
      const item = kit.getObjectByName(name);
      if (!(item instanceof THREE.Mesh)) throw new Error(`The kit has no ${name}`);
      return item.geometry as THREE.BufferGeometry;
    });
    return new Facades(world, table, shapes, material, small ? 170 : 340);
  }

  private tileOf(x: number, z: number) {
    // The same numbering as scripts/moto_city.py, whose second axis runs north.
    return Math.floor(x / TILE) + 64 + (Math.floor(z / TILE) + 64) * 128;
  }

  /** The rows of modules for every street-facing wall of one building. */
  private dress(building: Building, out: Row[]) {
    const { world } = this;
    const rand = mulberry(building.seed);
    const pick = rand();
    const style = !building.central ? 4 : pick < 0.34 ? 0 : pick < 0.74 ? 1 : pick < 0.88 ? 2 : 3;
    const floors = building.floors;
    const plan = floorPlan(style, floors, rand);
    const tint = rand();
    const { corners, start, base } = building;
    for (let k = 0; k < corners; k++) {
      if (!world.faces[start + k]) continue;
      const ax = world.cornerX[start + k];
      const az = world.cornerZ[start + k];
      const next = start + ((k + 1) % corners);
      const bx = world.cornerX[next];
      const bz = world.cornerZ[next];
      const length = Math.hypot(bx - ax, bz - az);
      const columns = Math.max(Math.round(length / BAY), 1);
      const span = length / columns;
      // Rings go round counter-clockwise on the map, whose y is this z turned over.
      const outX = -(bz - az) / length;
      const outY = -(bx - ax) / length;
      const yaw = Math.atan2(outX, -outY);
      for (let column = 0; column < columns; column++) {
        const t = (column + 0.5) / columns;
        const x = ax + (bx - ax) * t + outX * PROUD;
        const z = az + (bz - az) * t - outY * PROUD;
        out.push([x, base, z, yaw, span, 0, rand() < 0.68 ? SHOP : SHUT, rand(), 0, 0, tint]);
        plan.forEach(([kind, cell], index) => {
          out.push([x, base + GROUND_FLOOR + index * STOREY, z, yaw, span, index + 1, kind, rand(), 0, cell, tint]);
        });
        out.push([x, base + GROUND_FLOOR + STOREY * (floors - 1), z, yaw, span, floors, CORNICE, building.seed, 0, 0, tint]);
      }
    }
  }

  private build(key: number) {
    const group = new THREE.Group();
    const { holder, table } = this;
    const add = (kind: number, rows: ArrayLike<number>[]) => {
      const count = rows.length;
      if (!count) return;
      const geometry = this.shapes[kind].clone();
      const info = new Float32Array(count * 4);
      const tints = new Float32Array(count);
      const mesh = new THREE.InstancedMesh(geometry, this.material, count);
      for (let index = 0; index < count; index++) {
        const row = rows[index];
        holder.position.set(row[0], row[1], row[2]);
        // The kit faces away from +z, so a wall's yaw is half a turn from it.
        holder.rotation.y = row[3] + Math.PI;
        holder.scale.set(kind === DISH ? 1 : row[4], 1, 1);
        holder.updateMatrix();
        mesh.setMatrixAt(index, holder.matrix);
        info[index * 4] = row[7];
        info[index * 4 + 1] = row[5];
        info[index * 4 + 2] = row[9];
        info[index * 4 + 3] = kind;
        tints[index] = row[10];
      }
      geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
      geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 1));
      mesh.computeBoundingSphere();
      group.add(mesh);
    };

    for (const [start, end] of this.fixed.get(key) ?? []) {
      const rows: ArrayLike<number>[] = [];
      for (let index = start; index < end; index++) rows.push(table.subarray(index * FIELDS, (index + 1) * FIELDS));
      add(table[start * FIELDS + 6], rows);
    }
    const made: Row[] = [];
    for (const building of this.byTile.get(key) ?? []) this.dress(building, made);
    for (let kind = 0; kind < KINDS.length; kind++) add(kind, made.filter((row) => row[6] === kind));
    return group;
  }

  /** Dresses the walls near the bike, one square a frame, and lets go of what's been left behind. */
  update(x: number, z: number) {
    const steps = Math.ceil(this.reach / TILE);
    let nearest = -1;
    let best = Infinity;
    for (let a = -steps; a <= steps; a++) {
      for (let b = -steps; b <= steps; b++) {
        const gap = Math.hypot(a, b) * TILE;
        if (gap > this.reach + TILE * 0.5 || gap >= best) continue;
        const key = this.tileOf(x + a * TILE, z + b * TILE);
        if (!this.live.has(key) && (this.byTile.has(key) || this.fixed.has(key))) {
          nearest = key;
          best = gap;
        }
      }
    }
    if (nearest >= 0) {
      const made = this.build(nearest);
      this.live.set(nearest, made);
      this.group.add(made);
    }
    const hereA = Math.floor(x / TILE) + 64;
    const hereB = Math.floor(z / TILE) + 64;
    for (const [key, tile] of this.live) {
      if (Math.max(Math.abs((key % 128) - hereA), Math.abs(Math.floor(key / 128) - hereB)) <= steps + 1) continue;
      for (const item of tile.children) {
        const mesh = item as THREE.InstancedMesh;
        mesh.geometry.dispose();
        mesh.dispose();
      }
      this.group.remove(tile);
      this.live.delete(key);
    }
    return nearest >= 0;
  }
}

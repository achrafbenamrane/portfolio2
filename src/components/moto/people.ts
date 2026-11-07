import * as THREE from "three";

import { FOG, type Ground } from "./city";
import { BAY, CITY, HILL, MOSQUE, type Ride, SEA, type Spot } from "./ride";
import { type Edge, HERO, PLAZA_EDGE, type World } from "./world";

/*
 * People on the pavements, on an ordinary evening: a few figures from scripts/blender/build_moto_people.py,
 * each one's walk and idle baked frame by frame into a data texture. There's no skeleton here. The
 * vertex shader reads each vertex's place from that texture at each person's own moment of the cycle,
 * so a whole street of them is one draw call per figure, whatever they're all doing.
 *
 * Like the traffic, they only exist near the bike. Anyone left behind is lifted and put down again
 * ahead of it, where a wall hides them or they're too small to see arrive. Most of them are in the
 * old centre, on the main road and the wider streets.
 *
 * Nobody here can be hurt. A person who sees the bike coming steps away from it, toward the wall, and
 * goes back to what they were doing. If it gets to them anyway it goes straight through.
 */

/** Nobody's put further from the bike than this, and anyone past the second is lifted. */
const KEEP_WITHIN = 130;
const LIFT_AT = 150;
/** Anyone nearer than this needs a wall between them and the bike to appear, or to be behind it. */
const IN_PLAIN_SIGHT = 95;
const NEAREST_PUT = 45;
/** How many people may be put down in one frame, and how long someone waits after finding nowhere. */
const PUT_PER_FRAME = 3;
const TRY_AGAIN = 0.6;
/** East of this is the modern city, and there are few people out on foot. */
const OLD_CENTRE_EAST = 400;
/** How close the bike gets before they step aside, how long ahead they see it at speed, and how wide its path is to them. */
const STEP_ASIDE_AT = 7;
const SEES_AHEAD = 1.1;
const SEES_AT_MOST = 26;
const ITS_PATH = 3.2;
/** How fast they get out of the way, for how long, and how they drift back. */
const STEP_SPEED = 2.5;
const STEP_FOR = 0.85;
const DRIFT_BACK = 0.55;
const SHOULDERS = 0.42;
/** The height of each kind of pavement above the surface. */
const KERB = 0.09;
const MAIN_KERB = 0.21;
const MOUTH_KERB = 0.05;
/** What a person's clothes can be, as colours of real clothes: dark, muted, a bit worn. */
const SKINS = ["#b08a72", "#a37e64", "#947156", "#bb9a82", "#85624c", "#a9866e"];
const TOPS = ["#33373d", "#2a3444", "#413b35", "#4f5249", "#473530", "#3d424b", "#5c564e", "#2a2b2f", "#525c68", "#60503f", "#6b6255", "#5a5750"];
const UNDERS = ["#b9b6ae", "#8a8f96", "#6d7480", "#9c8f80", "#d0ccc4", "#5a5f66"];
const BOTTOMS = ["#34415c", "#2b3448", "#3b4966", "#35363b", "#403b37", "#2a2b30", "#4a4a47"];
const SHOES = ["#2a2724", "#3a2e26", "#4c4842", "#202023", "#6a655e"];
const HAIRS = ["#141110", "#1e1712", "#2a1f17", "#0e0d0d"];
const GREYS = ["#46443f", "#524f4a", "#3c3a37"];
const SCARVES = ["#6b5f63", "#4f5a66", "#7d7168", "#9a9088", "#3d3a45", "#5c4a48", "#8a7f86", "#2f3a40", "#a39a90"];
const EYES = ["#b8b4ae"];
const PALETTE = [...SKINS, ...TOPS, ...UNDERS, ...BOTTOMS, ...SHOES, ...HAIRS, ...GREYS, ...SCARVES, ...EYES];
/** How often each figure appears, in the order they're built: jacket, blazer, hijab, woman, elder. */
const CASTING = [0.3, 0.2, 0.22, 0.15, 0.13];
const HIJAB = 2;
const ELDER = 4;

type Shape = {
  mesh: THREE.InstancedMesh;
  motion: THREE.InstancedBufferAttribute;
  place: THREE.InstancedBufferAttribute;
  /** One walk cycle, in metres, and this person's usual speed. */
  stride: number;
  pace: number;
};

type Person = {
  shape: Shape;
  slot: number;
  index: number;
  /** On a street, or on the main road when this is null. */
  edge: Edge | null;
  along: number;
  /** Which way along it they walk, which side of it they're on, and how far out from its middle. */
  way: number;
  side: number;
  lane: number;
  from: number;
  to: number;
  /** Where they're drawn, eased toward where they should be, and how fast that's really going. */
  x: number;
  y: number;
  z: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  /** Which way they face while they're standing. */
  facing: number;
  cruise: number;
  going: number;
  phase: number;
  walking: number;
  idle: number;
  scale: number;
  stands: boolean;
  pause: number;
  /** Where they've stepped to, and for how much longer they're stepping. */
  stepX: number;
  stepZ: number;
  stepping: number;
  awayX: number;
  awayZ: number;
  wallX: number;
  wallZ: number;
  lamp: number;
  fade: number;
  wait: number;
  hidden: boolean;
};

const VERTEX = /* glsl */ `
  uniform highp usampler2D uFrames;
  uniform vec3 uLow;
  uniform vec3 uSpan;
  uniform float uWalkFrames;
  uniform float uIdleFrames;
  uniform vec3 uPalette[${PALETTE.length}];
  attribute float aColumn;
  attribute vec2 aInfo;
  attribute vec4 aMotion;
  attribute vec4 aLookA;
  attribute vec4 aLookB;
  attribute vec3 aPlace;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vTint;
  varying vec3 vPlace;
  varying float vHeight;
  varying float vShade;
  varying float vFade;

  vec3 placed(uvec4 texel) {
    return uLow + vec3(texel.xyz) * uSpan * (1.0 / 65535.0);
  }

  vec3 facing(uvec4 texel) {
    vec2 e = vec2(float(texel.w >> 8u), float(texel.w & 255u)) * (2.0 / 255.0) - 1.0;
    vec3 n = vec3(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
    if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
    return normalize(n);
  }

  void main() {
    int column = int(aColumn + 0.5);
    // A share of the way round a cycle, between the two frames either side of it.
    float walkAt = aMotion.x * uWalkFrames;
    float idleAt = aMotion.y * uIdleFrames;
    int walkRow = int(walkAt);
    int idleRow = int(idleAt);
    int walkCount = int(uWalkFrames + 0.5);
    int idleCount = int(uIdleFrames + 0.5);
    uvec4 walkA = texelFetch(uFrames, ivec2(column, walkRow % walkCount), 0);
    uvec4 walkB = texelFetch(uFrames, ivec2(column, (walkRow + 1) % walkCount), 0);
    uvec4 idleA = texelFetch(uFrames, ivec2(column, walkCount + idleRow % idleCount), 0);
    uvec4 idleB = texelFetch(uFrames, ivec2(column, walkCount + (idleRow + 1) % idleCount), 0);
    float walkMix = fract(walkAt);
    float idleMix = fract(idleAt);
    vec3 local = mix(mix(placed(idleA), placed(idleB), idleMix), mix(placed(walkA), placed(walkB), walkMix), aMotion.z);
    vec3 turned = mix(mix(facing(idleA), facing(idleB), idleMix), mix(facing(walkA), facing(walkB), walkMix), aMotion.z);

    int slot = int(aInfo.x + 0.5);
    float pick = slot < 4 ? aLookA[slot] : aLookB[slot - 4];
    vTint = uPalette[int(pick + 0.5)];
    vShade = aInfo.y;
    vHeight = local.y;
    vPlace = aPlace;
    vFade = aMotion.w;
    vUv = uv;
    vec4 at = modelMatrix * instanceMatrix * vec4(local, 1.0);
    vWorld = at.xyz;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * turned);
    gl_Position = projectionMatrix * viewMatrix * at;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uSheet;
  uniform vec3 uFog;
  uniform vec3 uHeadAt;
  uniform vec3 uHeadWay;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vTint;
  varying vec3 vPlace;
  varying float vHeight;
  varying float vShade;
  varying float vFade;

  void main() {
    // Coming into view: a thinning screen of pixels, too far off to read as one.
    float screen = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (screen >= vFade) discard;

    float detail = texture2D(uSheet, vUv).r;
    vec3 albedo = vTint * detail * detail * 4.0;
    vec3 n = normalize(vNormal);
    vec3 toEye = normalize(cameraPosition - vWorld);

    // The street's own light: warm off the paving and the lit fronts, fading as it climbs.
    float street = exp(-vHeight * 0.3);
    float over = n.y * 0.5 + 0.5;
    vec3 warm = vec3(0.8, 0.65, 0.46);
    vec3 light = vec3(0.03, 0.036, 0.048) * (0.5 + over);
    light += warm * street * (0.42 + 0.24 * (1.0 - over));
    // The fronts themselves, from the wall's side, and the lamps from above and a little behind that.
    vec3 wall = normalize(vec3(vPlace.x, 0.34, vPlace.y));
    light += warm * street * 0.56 * max(dot(n, wall) * 0.72 + 0.28, 0.0);
    vec3 lamp = normalize(vec3(-vPlace.x * 0.4, 1.0, -vPlace.y * 0.4));
    light += vec3(1.0, 0.82, 0.66) * (0.16 + 0.42 * vPlace.z) * max(dot(n, lamp), 0.0);

    // The bike's own headlight, as the road sees it.
    vec3 toLamp = uHeadAt - vWorld;
    float away = length(toLamp);
    toLamp /= max(away, 0.001);
    float beam = smoothstep(0.9427, 0.9858, dot(-toLamp, uHeadWay));
    float reach = 1.0 - pow(min(away / 150.0, 1.0), 4.0);
    light += vec3(1.0, 0.96, 0.9) * (41.0 * beam * reach * reach / max(pow(away, 1.4), 1.0)) * max(dot(n, toLamp), 0.0);

    vec3 colour = albedo * light * mix(0.42, 1.0, vShade);
    // Cloth and skin catch the street along their edges.
    float edge = pow(1.0 - max(dot(n, toEye), 0.0), 3.0);
    colour += warm * street * edge * (0.03 + 0.5 * dot(albedo, vec3(0.33)));

    float fog = 1.0 - exp(-length(vWorld - cameraPosition) * 0.00016);
    gl_FragColor = vec4(mix(colour, uFog, fog), 1.0);
  }
`;

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** The soft dark each person stands in. */
function shadowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
      const fade = Math.max(1 - r, 0);
      data[(y * size + x) * 4 + 3] = 205 * fade * fade * (3 - 2 * fade);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Between the road's edge and the wall, a pavement, wider on the bigger streets. As street.ts lays them. */
const pavement = (edge: Edge) => (edge.half > 5 ? 3 : edge.half > 4 ? 2.4 : 1.7);

export class People {
  readonly group = new THREE.Group();
  private readonly people: Person[] = [];
  private readonly shapes: Shape[] = [];
  private readonly rand = random(2719);
  private readonly holder = new THREE.Object3D();
  private readonly work = new THREE.Matrix4();
  private readonly shadows: THREE.InstancedMesh;
  private readonly point = { x: 0, z: 0, forwardX: 0, forwardZ: 1 };
  private readonly spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };
  private readonly at = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, outX: 1, outZ: 0, lamp: 0 };
  private readonly push = { x: 0, z: 0, hit: false };
  private readonly headAt = { value: new THREE.Vector3() };
  private readonly headWay = { value: new THREE.Vector3(0, 0, 1) };
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(
    data: ArrayBuffer,
    sheet: THREE.Texture,
    private readonly ride: Ride,
    private readonly world: World,
    private readonly ground: Ground,
    small: boolean,
  ) {
    sheet.colorSpace = THREE.NoColorSpace;
    sheet.anisotropy = 4;
    const count = small ? 14 : 40;
    const casting = this.cast(count);
    this.read(data, sheet, casting);
    const floor = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const dark = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: "#000000", transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.shadows = new THREE.InstancedMesh(floor, dark, count);
    this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.shadows);
  }

  /** Who's in the city, by figure. */
  private cast(count: number) {
    const figures: number[] = [];
    let owed = 0;
    CASTING.forEach((share, figure) => {
      owed += share * count;
      while (figures.length + 0.5 < owed) figures.push(figure);
    });
    while (figures.length < count) figures.push(0);
    return figures;
  }

  /** Reads the figures out of the data file, and makes everyone who'll wear them. */
  private read(data: ArrayBuffer, sheet: THREE.Texture, casting: number[]) {
    const [figures, walkFrames, idleFrames] = new Uint32Array(data, 0, 4);
    const palette = PALETTE.map((hex) => new THREE.Color(hex));
    const shared = {
      uSheet: { value: sheet },
      uFog: { value: FOG },
      uPalette: { value: palette },
      uHeadAt: this.headAt,
      uHeadWay: this.headWay,
      uWalkFrames: { value: walkFrames },
      uIdleFrames: { value: idleFrames },
    };
    let head = 16;
    let body = 16 + figures * 48;
    for (let figure = 0; figure < figures; figure++) {
      const [columns, points, indices] = new Uint32Array(data, head, 3);
      const [lowX, lowY, lowZ, spanX, spanY, spanZ, stride, pace] = new Float32Array(data, head + 16, 8);
      head += 48;
      const texels = new Uint16Array(data, body, columns * (walkFrames + idleFrames) * 4);
      body += texels.byteLength;
      const column = new Uint16Array(data, body, points);
      body += column.byteLength;
      const uv = new Uint16Array(data, body, points * 2);
      body += uv.byteLength;
      const info = new Uint8Array(data, body, points * 2);
      body += info.byteLength + (info.byteLength % 2);
      const index = new Uint16Array(data, body, indices);
      body += index.byteLength;
      body += (4 - (body % 4)) % 4;

      const frames = new THREE.DataTexture(texels, columns, walkFrames + idleFrames, THREE.RGBAIntegerFormat, THREE.UnsignedShortType);
      frames.internalFormat = "RGBA16UI";
      frames.minFilter = frames.magFilter = THREE.NearestFilter;
      frames.generateMipmaps = false;
      frames.needsUpdate = true;
      const mine = casting.filter((who) => who === figure).length;
      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
      geometry.setAttribute("aColumn", new THREE.BufferAttribute(column, 1));
      geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2, true));
      // The slot as it is, the shade as a share: split, because one attribute can't be both.
      const slots = new Float32Array(points * 2);
      for (let k = 0; k < points; k++) {
        slots[k * 2] = info[k * 2];
        slots[k * 2 + 1] = info[k * 2 + 1] / 255;
      }
      geometry.setAttribute("aInfo", new THREE.BufferAttribute(slots, 2));
      const motion = new THREE.InstancedBufferAttribute(new Float32Array(mine * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const place = new THREE.InstancedBufferAttribute(new Float32Array(mine * 3), 3).setUsage(THREE.DynamicDrawUsage);
      const lookA = new THREE.InstancedBufferAttribute(new Float32Array(mine * 4), 4);
      const lookB = new THREE.InstancedBufferAttribute(new Float32Array(mine * 4), 4);
      geometry.setAttribute("aMotion", motion);
      geometry.setAttribute("aPlace", place);
      geometry.setAttribute("aLookA", lookA);
      geometry.setAttribute("aLookB", lookB);
      const material = new THREE.ShaderMaterial({
        uniforms: { ...shared, uFrames: { value: frames }, uLow: { value: new THREE.Vector3(lowX, lowY, lowZ) }, uSpan: { value: new THREE.Vector3(spanX, spanY, spanZ) } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, mine);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      const shape: Shape = { mesh, motion, place, stride, pace };
      this.shapes.push(shape);
      for (let slot = 0; slot < mine; slot++) {
        this.dress(figure, slot, lookA, lookB);
        this.people.push(this.make(shape, slot, this.people.length));
      }
    }
  }

  private pick(list: string[]) {
    return PALETTE.indexOf(list[Math.floor(this.rand() * list.length)]);
  }

  /** Clothes for one person, chosen once, from the colours of the slots the figure is built with. */
  private dress(figure: number, slot: number, lookA: THREE.InstancedBufferAttribute, lookB: THREE.InstancedBufferAttribute) {
    const hair = figure === ELDER ? this.pick(GREYS) : this.pick(HAIRS);
    lookA.setXYZW(slot, this.pick(SKINS), this.pick(TOPS), this.pick(UNDERS), this.pick(BOTTOMS));
    lookB.setXYZW(slot, this.pick(SHOES), hair, figure === HIJAB ? this.pick(SCARVES) : hair, PALETTE.indexOf(EYES[0]));
  }

  private make(shape: Shape, slot: number, index: number): Person {
    const scale = 0.95 + this.rand() * 0.1;
    return {
      shape,
      slot,
      index,
      edge: null,
      along: 0,
      way: 1,
      side: 1,
      lane: 0,
      from: 0,
      to: 0,
      x: 0,
      y: 0,
      z: 0,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      facing: 0,
      cruise: shape.pace * (0.9 + this.rand() * 0.24) * scale,
      going: 0,
      phase: this.rand(),
      walking: 1,
      idle: this.rand(),
      scale,
      stands: false,
      pause: 0,
      stepX: 0,
      stepZ: 0,
      stepping: 0,
      awayX: 0,
      awayZ: 0,
      wallX: 1,
      wallZ: 0,
      lamp: 0,
      fade: 0,
      wait: 0,
      hidden: true,
    };
  }

  /** Is this stretch of the main road somewhere people walk, and how much? */
  private busyOnRide(along: number) {
    const zone = this.ride.zoneAt(along);
    if (zone === CITY) return 1;
    if (zone === SEA) return 0.5;
    if (zone === BAY) return 0.14;
    if (zone === MOSQUE) return 0.2;
    return zone === HILL ? 0.06 : 0;
  }

  /** Only the bigger streets are busy, and mostly in the old centre. */
  private busyOnStreet(edge: Edge, x: number) {
    const size = edge.half > 5 ? 1 : edge.half > 4 ? 0.62 : 0.2;
    return size * (x < OLD_CENTRE_EAST ? 1 : 0.12);
  }

  private inMouth(along: number, side: number) {
    return this.ride.gaps.some(([at, gapSide, wide]) => gapSide === side && Math.abs(at - along) < wide / 2 + 2);
  }

  /** Where someone is, by how far along and how far out they are. */
  private locate(person: Person) {
    const { at, ground } = this;
    if (person.edge) {
      const { point } = this;
      this.world.pointOn(person.edge, person.along, point);
      at.outX = -point.forwardZ * person.side;
      at.outZ = point.forwardX * person.side;
      at.x = point.x + at.outX * person.lane;
      at.z = point.z + at.outZ * person.lane;
      at.forwardX = point.forwardX;
      at.forwardZ = point.forwardZ;
      at.y = ground.at(at.x, at.z) + KERB;
      at.lamp = 0.5;
      return at;
    }
    const { spot, ride } = this;
    ride.spot(person.along, spot);
    at.outX = spot.rightX * person.side;
    at.outZ = spot.rightZ * person.side;
    at.x = spot.x + at.outX * person.lane;
    at.z = spot.z + at.outZ * person.lane;
    at.forwardX = spot.forwardX;
    at.forwardZ = spot.forwardZ;
    // The road's a flat ribbon across, and the ground only shows where it rises through it.
    at.y = Math.max(spot.y + (this.inMouth(person.along, person.side) ? MOUTH_KERB : MAIN_KERB), ground.at(at.x, at.z) + 0.02);
    // The lanterns stand along each kerb, one side half a spacing on from the other.
    const cell = (((person.along + (person.side > 0 ? 0 : 17)) % 34) + 34) % 34;
    const gap = Math.min(cell, 34 - cell);
    at.lamp = Math.exp((-gap * gap) / 60);
    return at;
  }

  /** How far from a street's end people stop short of the junction. */
  private clearOf(edge: Edge, node: number) {
    let widest = 0;
    for (const index of this.world.nodes[node]) {
      const other = this.world.edges[index];
      if (index !== edge.index && other.kind !== PLAZA_EDGE) widest = Math.max(widest, other.half);
    }
    return widest + 5.5;
  }

  /** Finds a street or the main road near a point, and sets a person on its pavement. */
  private layOn(person: Person, px: number, pz: number, stands: boolean) {
    const { world, ride, rand } = this;
    const found: Edge[] = [];
    let total = 0;
    world.edgesNear(px, pz, 36, (edge) => {
      if (edge.kind === PLAZA_EDGE || (edge.kind < HERO && edge.length < 30)) return;
      found.push(edge);
      total += edge.kind >= HERO ? 1 : this.busyOnStreet(edge, px);
    });
    if (!found.length) return false;
    let chosen = rand() * total;
    let edge = found[0];
    for (const other of found) {
      chosen -= other.kind >= HERO ? 1 : this.busyOnStreet(other, px);
      edge = other;
      if (chosen <= 0) break;
    }
    person.side = rand() < 0.5 ? -1 : 1;
    person.way = rand() < 0.5 ? -1 : 1;
    if (edge.kind >= HERO) {
      const on = ride.locate(px, pz, 0, ride.count);
      const width = ride.widthAt(on.along);
      if (Math.abs(on.across) > 60 || rand() > this.busyOnRide(on.along)) return false;
      const inner = 13.25 * width + 0.6;
      const outer = 20 * width;
      person.edge = null;
      person.along = on.along;
      person.from = ride.exit + 30;
      person.to = ride.length - 30;
      person.lane = stands ? outer + 0.3 * rand() : inner + rand() * (outer - inner);
      return true;
    }
    if (rand() > this.busyOnStreet(edge, px)) return false;
    const from = this.clearOf(edge, edge.a);
    const to = edge.length - this.clearOf(edge, edge.b);
    if (to - from < 8) return false;
    // The nearest point of this street to where we're looking.
    let along = 0;
    let nearest = Infinity;
    for (let k = 0; k < edge.run.length; k++) {
      const gap = Math.hypot(edge.points[k * 2] - px, edge.points[k * 2 + 1] - pz);
      if (gap < nearest) {
        nearest = gap;
        along = edge.run[k];
      }
    }
    const inner = edge.half + 0.45;
    const outer = edge.half + pavement(edge) - 0.25;
    person.edge = edge;
    person.along = Math.min(Math.max(along, from), to);
    person.from = from;
    person.to = to;
    person.lane = stands ? outer : inner + rand() * (outer - inner);
    return true;
  }

  /** Takes a person's place on the ground as settled. */
  private stand(person: Person) {
    const at = this.locate(person);
    person.x = at.x;
    person.y = at.y;
    person.z = at.z;
    person.wallX = at.outX;
    person.wallZ = at.outZ;
    person.lamp = at.lamp;
    person.stepX = person.stepZ = person.stepping = person.moveX = person.moveZ = person.pause = 0;
    person.walking = person.stands ? 0 : 1;
    person.going = person.stands ? 0 : person.cruise;
    person.yaw = Math.atan2(at.forwardX * person.way, at.forwardZ * person.way);
    person.hidden = false;
  }

  /** Is this a fair spot: clear of walls and other people, and not in plain view of the bike? */
  private fair(person: Person, bikeX: number, bikeZ: number, near: number, forwardX: number, forwardZ: number, hiding: boolean) {
    const { world, push } = this;
    const at = this.locate(person);
    const gap = Math.hypot(at.x - bikeX, at.z - bikeZ);
    if (gap < near || gap > KEEP_WITHIN) return false;
    if (hiding && gap < IN_PLAIN_SIGHT) {
      const inFront = (at.x - bikeX) * forwardX + (at.z - bikeZ) * forwardZ > -8;
      if (inFront && !world.crosses(bikeX, bikeZ, at.x, at.z)) return false;
    }
    world.clear(at.x, at.z, SHOULDERS, push);
    if (push.hit && Math.hypot(push.x - at.x, push.z - at.z) > 0.3) return false;
    return !this.people.some((other) => other !== person && !other.hidden && Math.hypot(other.x - at.x, other.z - at.z) < 1.5);
  }

  /** Puts someone down near the bike, out of sight, walking or standing about with others. */
  private settle(person: Person, bikeX: number, bikeZ: number, heading: number, moving: boolean, near: number, hiding: boolean) {
    const { rand } = this;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    person.hidden = true;
    for (let tries = 0; tries < 4; tries++) {
      // Ahead of a moving bike, since that's where it'll need them.
      const bearing = moving ? heading + (rand() - 0.5) * 2.4 : rand() * Math.PI * 2;
      const gap = near + rand() * (KEEP_WITHIN - near);
      const px = bikeX + Math.sin(bearing) * gap;
      const pz = bikeZ + Math.cos(bearing) * gap;
      const groups = rand() < 0.3;
      const alone = rand() < 0.1;
      if (!this.layOn(person, px, pz, groups || alone)) continue;
      if (!this.fair(person, bikeX, bikeZ, near, forwardX, forwardZ, hiding)) continue;
      person.stands = groups || alone;
      person.fade = hiding ? 0 : 1;
      this.stand(person);
      const wall = Math.atan2(person.wallX, person.wallZ);
      // Looking in at a shop, or out across the street.
      person.facing = rand() < 0.6 ? wall : wall + Math.PI + (rand() - 0.5);
      person.yaw = person.facing;
      if (groups) this.gather(person, hiding);
      return;
    }
    person.wait = TRY_AGAIN * (0.5 + rand());
  }

  /** Brings one or two others to stand with someone, in a loose ring, talking. */
  private gather(lead: Person, hiding: boolean) {
    const { rand } = this;
    const others = this.people.filter((other) => other.hidden && other !== lead);
    const extra = Math.min(others.length, rand() < 0.45 ? 2 : 1);
    const members = [lead];
    for (let k = 0; k < extra; k++) {
      const other = others[Math.floor(rand() * others.length)];
      if (members.includes(other)) continue;
      other.edge = lead.edge;
      other.side = lead.side;
      other.way = lead.way;
      other.from = lead.from;
      other.to = lead.to;
      other.along = lead.along + (k === 0 ? 1 : -1) * (0.75 + rand() * 0.35);
      other.lane = lead.lane - 0.2 - rand() * 0.75;
      other.stands = true;
      other.fade = hiding ? 0 : 1;
      this.stand(other);
      members.push(other);
    }
    if (members.length < 2) return;
    const middleX = members.reduce((sum, member) => sum + member.x, 0) / members.length;
    const middleZ = members.reduce((sum, member) => sum + member.z, 0) / members.length;
    for (const member of members) {
      member.facing = Math.atan2(middleX - member.x, middleZ - member.z) + (rand() - 0.5) * 0.5;
      member.yaw = member.facing;
    }
  }

  private lift(person: Person) {
    person.hidden = true;
    person.wait = TRY_AGAIN * this.rand();
  }

  /** Has this person seen the bike coming for them? Then which way's away from it? */
  private watch(person: Person, bikeX: number, bikeZ: number, forwardX: number, forwardZ: number, speed: number, dt: number) {
    person.stepping = Math.max(person.stepping - dt, 0);
    const rx = person.x - bikeX;
    const rz = person.z - bikeZ;
    const gap = Math.hypot(rx, rz) || 1;
    const moving = Math.abs(speed);
    const wayX = forwardX * Math.sign(speed);
    const wayZ = forwardZ * Math.sign(speed);
    const closing = (rx * wayX + rz * wayZ) / gap;
    const fromPath = rx * wayZ - rz * wayX;
    const sees = Math.max(STEP_ASIDE_AT, Math.min(moving * SEES_AHEAD, SEES_AT_MOST));
    if (moving < 1 || closing < 0.15 || gap > sees || Math.abs(fromPath) > ITS_PATH) return;
    // Square off the bike's path, on the side they're already on, unless that's the road and the wall's clear.
    let sideX = wayZ * Math.sign(fromPath || 1);
    let sideZ = -wayX * Math.sign(fromPath || 1);
    if (sideX * person.wallX + sideZ * person.wallZ < -0.2 && Math.abs(fromPath) > 1.2) {
      // The bike's between them and the wall: the only way out is back toward the road.
      person.awayX = sideX;
      person.awayZ = sideZ;
    } else {
      sideX = person.wallX;
      sideZ = person.wallZ;
      const size = Math.hypot(sideX, sideZ) || 1;
      person.awayX = sideX / size;
      person.awayZ = sideZ / size;
    }
    person.stepping = STEP_FOR;
  }

  private walk(person: Person, dt: number) {
    if (person.stands) return;
    if (person.pause > 0) {
      person.pause -= dt;
      person.going = Math.max(person.going - 2.4 * dt, 0);
      if (person.pause <= 0) person.way = -person.way;
    } else {
      person.going += Math.min(Math.max(person.cruise - person.going, -2 * dt), 2 * dt);
    }
    person.along += person.going * person.way * dt;
    if (person.along < person.from || person.along > person.to) {
      person.along = Math.min(Math.max(person.along, person.from), person.to);
      if (person.pause <= 0) person.pause = 1 + this.rand() * 3.5;
    }
  }

  /** Moves everyone along, and writes where they all are for the shader. Nothing here can hurt the bike or anyone on foot. */
  update(dt: number, bikeX: number, bikeZ: number, bikeHeading: number, bikeSpeed: number, clock: number) {
    const { people, holder, work, world, push, ground } = this;
    const forwardX = Math.sin(bikeHeading);
    const forwardZ = Math.cos(bikeHeading);
    const moving = Math.abs(bikeSpeed) > 3;
    const jumped = Math.hypot(bikeX - this.lastX, bikeZ - this.lastZ) > 60;
    this.lastX = bikeX;
    this.lastZ = bikeZ;
    if (jumped) {
      for (const person of people) person.hidden = true;
      for (const person of people) if (person.hidden) this.settle(person, bikeX, bikeZ, bikeHeading, false, 9, false);
    }

    const ease = 1 - Math.exp(-dt * 8);
    let puts = PUT_PER_FRAME;
    for (const person of people) {
      if (person.hidden) {
        person.wait -= dt;
        if (person.wait <= 0 && puts > 0) {
          puts -= 1;
          this.settle(person, bikeX, bikeZ, bikeHeading, moving, NEAREST_PUT, true);
        }
      } else if (Math.hypot(person.x - bikeX, person.z - bikeZ) > LIFT_AT) {
        this.lift(person);
      }
    }

    // Two walkers meeting on a pavement each give a little way.
    for (let a = 0; a < people.length; a++) {
      const first = people[a];
      if (first.hidden) continue;
      for (let b = a + 1; b < people.length; b++) {
        const second = people[b];
        if (second.hidden) continue;
        const dx = second.x - first.x;
        const dz = second.z - first.z;
        const gap = Math.hypot(dx, dz);
        if (gap > 0.95 || gap < 1e-3 || (first.stands && second.stands)) continue;
        const shove = ((0.95 - gap) * dt * 2.2) / gap;
        first.stepX -= dx * shove;
        first.stepZ -= dz * shove;
        second.stepX += dx * shove;
        second.stepZ += dz * shove;
      }
    }

    for (const person of people) {
      const { shape, slot, index } = person;
      if (person.hidden) {
        shape.mesh.setMatrixAt(slot, work.makeScale(0, 0, 0));
        this.shadows.setMatrixAt(index, work);
        continue;
      }
      this.watch(person, bikeX, bikeZ, forwardX, forwardZ, bikeSpeed, dt);
      this.walk(person, dt);
      const at = this.locate(person);
      person.wallX = at.outX;
      person.wallZ = at.outZ;
      person.lamp = at.lamp;
      if (person.stepping > 0) {
        person.stepX += person.awayX * STEP_SPEED * dt;
        person.stepZ += person.awayZ * STEP_SPEED * dt;
      } else {
        // Back to where they were, in their own time.
        const size = Math.hypot(person.stepX, person.stepZ);
        if (size > 0.001) {
          const back = Math.min(DRIFT_BACK * dt, size) / size;
          person.stepX -= person.stepX * back;
          person.stepZ -= person.stepZ * back;
        }
      }
      // Solid things are walked round: walls, lamp posts and trees.
      world.clear(at.x + person.stepX, at.z + person.stepZ, SHOULDERS, push);
      world.clearPosts(0.36, push);
      const lastX = person.x;
      const lastZ = person.z;
      person.x += (push.x - person.x) * ease;
      person.z += (push.z - person.z) * ease;
      const groundY = person.edge ? ground.at(person.x, person.z) + KERB : at.y;
      person.y += (groundY - person.y) * ease;
      const rate = 1 - Math.exp(-dt * 10);
      person.moveX += ((person.x - lastX) / Math.max(dt, 1e-3) - person.moveX) * rate;
      person.moveZ += ((person.z - lastZ) / Math.max(dt, 1e-3) - person.moveZ) * rate;
      const speed = Math.hypot(person.moveX, person.moveZ);

      // The cycle runs at the speed they're really going, so feet stay where they're put.
      person.walking += (Math.min(speed / 0.45, 1) - person.walking) * (1 - Math.exp(-dt * 9));
      person.phase = (person.phase + (speed * dt) / (shape.stride * person.scale)) % 1;
      person.idle = (clock * 0.16 + person.index * 0.37) % 1;
      const want = speed > 0.3 ? Math.atan2(person.moveX, person.moveZ) : person.stands ? person.facing : person.yaw;
      person.yaw += Math.atan2(Math.sin(want - person.yaw), Math.cos(want - person.yaw)) * (1 - Math.exp(-dt * (person.stepping > 0 ? 11 : 5)));
      person.fade = Math.min(person.fade + dt / 0.7, 1);

      holder.position.set(person.x, person.y, person.z);
      holder.rotation.set(0, person.yaw, 0);
      holder.scale.setScalar(person.scale);
      holder.updateMatrix();
      shape.mesh.setMatrixAt(slot, holder.matrix);
      shape.motion.setXYZW(slot, person.phase, person.idle, person.walking, person.fade);
      shape.place.setXYZ(slot, person.wallX, person.wallZ, person.lamp);
      holder.position.y += 0.012;
      holder.scale.set(0.82, 1, 1.02 + person.walking * 0.26);
      holder.updateMatrix();
      this.shadows.setMatrixAt(index, holder.matrix);
    }
    for (const shape of this.shapes) {
      shape.mesh.instanceMatrix.needsUpdate = true;
      shape.motion.needsUpdate = true;
      shape.place.needsUpdate = true;
    }
    this.shadows.instanceMatrix.needsUpdate = true;

    // The headlight, where the road sees it: on the bike's nose, tipped a little down the road.
    this.headAt.value.set(bikeX + forwardX * 0.7, ground.at(bikeX, bikeZ) + 0.95, bikeZ + forwardZ * 0.7);
    this.headWay.value.set(forwardX, -0.024, forwardZ).normalize();
  }
}

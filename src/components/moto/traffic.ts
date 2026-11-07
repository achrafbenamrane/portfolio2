import * as THREE from "three";

import type { Ground } from "./city";
import { type Edge, HERO, PLAZA_EDGE, type World } from "./world";

/*
 * Other people on the road, and the cars parked along it: small hatchbacks, saloons, yellow taxis,
 * a few crossovers and the city bus. Each is built to be looked at from a few metres, so there are
 * few of them: vehicles only exist near the bike, wherever it's gone. They drive the city's real
 * streets, taking a turn at each junction, and anything left behind is lifted and put down again on
 * another street round the bike, past the point where a car can be made out, so nothing pops into view.
 */

const LANES = [3.1, 7.1, 11.1];
/** How far from the bike anything is allowed to get, ahead of it and behind. */
const TOO_FAR = 760;
const LEFT_BEHIND = 240;
/** Where traffic reappears. Nearer than SIGHT it must have a building between it and the bike. */
const COMES_BACK = 180;
const FAR_OUT = 620;
const SIGHT = 300;
/** Nothing starts nearer than this when the ride begins. */
const START_CLEAR = 40;
/** Half the bike, added to a vehicle's own size when looking for a hit. */
const BIKE_LENGTH = 0.77;
const BIKE_WIDTH = 0.37;
/** Clear road kept between two vehicles in a lane. */
const FOLLOW = 7;
const BRAKE = 3.2;
const SPEED_UP = 2.2;
const PAINT = ["#e8e6e0", "#e8e6e0", "#e8e6e0", "#b9bcc0", "#b9bcc0", "#6c7075", "#2a2c30", "#14161a", "#7a1420", "#24406a"];
const TAXI = "#d9a514";
const KINDS = ["Compact", "Saloon", "Crossover", "Bus"] as const;
/** Lamps that are off, on a car that's parked. */
const LAMPS_OFF = new THREE.Color(0.035, 0.035, 0.035);
const LAMPS_ON = new THREE.Color(1, 1, 1);

type Kind = (typeof KINDS)[number];

type Model = {
  halfLength: number;
  halfWidth: number;
  wheelRadius: number;
  /** Where each wheel sits on the car: odd ones are on the right, turned to face out. */
  wheels: THREE.Matrix4[];
  shadow: THREE.Matrix4;
  matrices: THREE.InstancedBufferAttribute;
  wheelMatrices: THREE.InstancedBufferAttribute;
};

type Car = {
  model: Model;
  slot: number;
  index: number;
  edge: Edge | null;
  /** How far along its street, which way it's going, and how far to its own right it keeps. */
  along: number;
  way: number;
  lane: number;
  /** Where it's drawn: eased toward the street, so it rounds a junction instead of jumping. */
  x: number;
  z: number;
  yaw: number;
  speed: number;
  cruise: number;
  roll: number;
  parked: boolean;
  bus: boolean;
  hidden: boolean;
};

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** The dark a vehicle stands in, where the street lamps can't reach under it. */
function shadowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs(((x + 0.5) / size) * 2 - 1);
      const v = Math.abs(((y + 0.5) / size) * 2 - 1);
      const fade = Math.max(1 - Math.hypot(Math.max(u - 0.6, 0), Math.max(v - 0.72, 0)) / 0.36, 0);
      data[(y * size + x) * 4 + 3] = 240 * fade * fade * (3 - 2 * fade);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The HDRI's ground is a bright street. Under a car it's dark asphalt, so nothing reflects it. Its
 * neon is held below the bloom's threshold too: only a car's own lamps should flare.
 */
function overDarkRoad(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    const lookup = THREE.ShaderChunk.envmap_physical_pars_fragment
      .replace("return PI * envMapColor.rgb * envMapIntensity;", "return PI * envMapColor.rgb * envMapIntensity * mix(0.12, 1.0, smoothstep(-0.35, 0.1, worldNormal.y));")
      .replace("return envMapColor.rgb * envMapIntensity;", "return min(envMapColor.rgb * envMapIntensity, vec3(2.0)) * mix(0.05, 1.0, smoothstep(-0.12, 0.06, reflectVec.y));");
    shader.fragmentShader = shader.fragmentShader.replace("#include <envmap_physical_pars_fragment>", lookup);
  };
}

function makeFinishes(plates: THREE.Texture | null) {
  if (plates) plates.anisotropy = 8;
  const paint = new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0.32, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.1 });
  const busPaint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.8, 0.8, 0.78), metalness: 0, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.012, 0.014, 0.018), metalness: 0, roughness: 0.08, transparent: true, opacity: 0.66, depthWrite: false });
  const lens = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.8, 0.82, 0.85), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.1, depthWrite: false });
  const chrome = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.86, 0.87, 0.88), metalness: 1, roughness: 0.1 });
  const rim = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.66, 0.67, 0.69), metalness: 0.92, roughness: 0.3 });
  const finishes: Record<string, THREE.Material> = {
    CarBody: paint,
    BusBody: busPaint,
    CarGlass: glass,
    CarLens: lens,
    CarChrome: chrome,
    CarRim: rim,
    // Seen from the cabin as well as down a shut line, so it has two sides.
    CarTrim: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.012, 0.014), roughness: 0.62, side: THREE.DoubleSide }),
    CarGloss: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.01, 0.01, 0.012), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    CarTyre: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.014, 0.014, 0.015), roughness: 0.84 }),
    CarDisc: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.32, 0.33), metalness: 0.9, roughness: 0.46 }),
    CarInterior: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.05, 0.055), roughness: 0.72 }),
    CarTailLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.13, 0.004, 0.006), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04 }),
    CarAmber: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.62, 0.22, 0.015), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    CarPlate: new THREE.MeshStandardMaterial({ map: plates, emissiveMap: plates, emissive: new THREE.Color(0.32, 0.32, 0.32), roughness: 0.5 }),
    CarHead: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 3.8) }),
    CarTail: new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 0.22, 0.12) }),
    CarTailGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.035, 0.018) }),
    BusSign: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 0.92, 0.1) }),
    BusGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.15) }),
    TaxiLamp: new THREE.MeshBasicMaterial({ map: plates, color: new THREE.Color(2.5, 2.2, 1.6) }),
  };
  // How much of the night each one shows: black rubber and plastic go grey at the scene's strength.
  const reflective: [THREE.Material, number][] = [
    [paint, 0.26],
    [busPaint, 0.26],
    [glass, 0.55],
    [lens, 0.25],
    [chrome, 0.4],
    [rim, 0.3],
    [finishes.CarTrim, 0.08],
    [finishes.CarGloss, 0.22],
    [finishes.CarTyre, 0.06],
    [finishes.CarDisc, 0.2],
    [finishes.CarInterior, 0.14],
    [finishes.CarTailLens, 0.3],
    [finishes.CarAmber, 0.3],
    [finishes.CarPlate, 0.2],
  ];
  return { finishes, reflective };
}

export class Traffic {
  readonly group = new THREE.Group();
  private readonly cars: Car[] = [];
  private readonly holder = new THREE.Object3D();
  private readonly point = { x: 0, z: 0, forwardX: 0, forwardZ: 1 };
  private readonly rand = random(1830);
  private readonly reflective: [THREE.Material, number][];
  private readonly shadows: THREE.InstancedMesh;
  private readonly work = new THREE.Matrix4();
  private readonly spin = new THREE.Matrix4();
  private readonly spinBack = new THREE.Matrix4();
  private lastX = Infinity;
  private lastZ = Infinity;
  private shone = false;
  /** Which way the last thing hit pushed the bike. */
  awayX = 0;
  awayZ = 0;

  constructor(
    model: THREE.Object3D,
    private readonly world: World,
    private readonly ground: Ground,
    moving: number,
    parked: number,
  ) {
    let plates: THREE.Texture | null = null;
    model.traverse((item) => {
      if (item instanceof THREE.Mesh && item.material.name.startsWith("CarPlate")) plates = item.material.map;
    });
    const { finishes, reflective } = makeFinishes(plates);
    this.reflective = reflective;

    // Who's on the road. Taxis come first among the saloons, so the sign can stop at the last one.
    const kinds: Kind[] = [];
    for (let index = 0; index < moving + parked; index++) kinds.push(this.pickKind(index >= moving, index));
    const taxis = kinds.map((kind) => kind === "Saloon" && this.rand() < 0.45);
    const order = kinds.map((_, index) => index).sort((a, b) => Number(taxis[b]) - Number(taxis[a]));

    for (const kind of KINDS) {
      const mine = order.filter((index) => kinds[index] === kind);
      const root = model.getObjectByName(kind);
      const wheel = model.getObjectByName(`${kind}Wheel`);
      if (!mine.length || !root || !wheel) continue;
      const shape = this.readModel(root, mine.length);
      mine.forEach((index, slot) => {
        const stands = index >= moving;
        const cruise = kind === "Bus" ? 10 + this.rand() * 4 : 13 + this.rand() * 11;
        this.cars.push({ model: shape, slot, index, edge: null, along: 0, way: 1, lane: 0, x: 0, z: 0, yaw: 0, speed: stands ? 0 : cruise, cruise: stands ? 0 : cruise, roll: 0, parked: stands, bus: kind === "Bus", hidden: true });
      });
      const paint = new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 3), 3);
      const lamps = new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 3), 3);
      const colour = new THREE.Color();
      mine.forEach((index, slot) => {
        colour.set(taxis[index] ? TAXI : PAINT[Math.floor(this.rand() * PAINT.length)]);
        colour.toArray(paint.array, slot * 3);
        (index >= moving ? LAMPS_OFF : LAMPS_ON).toArray(lamps.array, slot * 3);
      });
      this.fit(root, shape.matrices, mine.length, finishes, paint, lamps);
      this.fit(wheel, shape.wheelMatrices, mine.length * 4, finishes, null, null);
      const sign = model.getObjectByName("TaxiSign");
      const signs = taxis.filter(Boolean).length;
      if (kind === "Saloon" && sign && signs) this.fit(sign, shape.matrices, signs, finishes, null, null);
    }

    const floor = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const dark = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: "#000000", transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.shadows = new THREE.InstancedMesh(floor, dark, this.cars.length);
    this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.shadows);
  }

  /** Reads a vehicle's size and wheel positions, which came with it from Blender. */
  private readModel(root: THREE.Object3D, count: number): Model {
    const { half_length: halfLength, half_width: halfWidth, axles, wheel_x: wheelX, wheel_radius: wheelRadius } = root.userData as {
      half_length: number;
      half_width: number;
      axles: number[];
      wheel_x: number;
      wheel_radius: number;
    };
    const wheels: THREE.Matrix4[] = [];
    const turned = new THREE.Matrix4().makeRotationY(Math.PI);
    for (const axle of axles) {
      // Blender's front is -y, which is +z here.
      wheels.push(new THREE.Matrix4().makeTranslation(wheelX, wheelRadius, -axle));
      wheels.push(new THREE.Matrix4().makeTranslation(-wheelX, wheelRadius, -axle).multiply(turned));
    }
    const shadow = new THREE.Matrix4().makeTranslation(0, 0.03, 0).scale(new THREE.Vector3(halfWidth * 2.5, 1, halfLength * 2.25));
    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(count * 16), 16);
    const wheelMatrices = new THREE.InstancedBufferAttribute(new Float32Array(count * wheels.length * 16), 16);
    matrices.setUsage(THREE.DynamicDrawUsage);
    wheelMatrices.setUsage(THREE.DynamicDrawUsage);
    return { halfLength, halfWidth, wheelRadius, wheels, shadow, matrices, wheelMatrices };
  }

  /** Draws every piece of a model once per vehicle, all moved by the same matrices. */
  private fit(root: THREE.Object3D, matrices: THREE.InstancedBufferAttribute, count: number, finishes: Record<string, THREE.Material>, paint: THREE.InstancedBufferAttribute | null, lamps: THREE.InstancedBufferAttribute | null) {
    root.traverse((item) => {
      if (!(item instanceof THREE.Mesh)) return;
      const name = (item.material as THREE.Material).name.replace(/\.\d+$/, "");
      const mesh = new THREE.InstancedMesh(item.geometry, finishes[name] ?? finishes.CarTrim, 0);
      mesh.count = count;
      mesh.instanceMatrix = matrices;
      mesh.frustumCulled = false;
      if (name === "CarBody" && paint) mesh.instanceColor = paint;
      if ((name === "CarHead" || name === "CarTail" || name === "CarTailGlow") && lamps) mesh.instanceColor = lamps;
      this.group.add(mesh);
    });
  }

  private pickKind(parked: boolean, index: number): Kind {
    // One bus in every few on the move.
    if (!parked && index % 5 === 0) return "Bus";
    const roll = this.rand();
    if (roll < 0.48) return "Compact";
    if (roll < 0.82) return "Saloon";
    return "Crossover";
  }

  /** How far to its own right a vehicle keeps on this street. */
  private laneOn(edge: Edge, parked: boolean) {
    if (edge.kind >= HERO) {
      const width = edge.half / 13.25;
      return (parked ? 12.4 : LANES[Math.floor(this.rand() * LANES.length)]) * width;
    }
    return parked ? edge.half - 1 : edge.half * (edge.half > 5.5 ? 0.3 + this.rand() * 0.34 : 0.5);
  }

  private usable(edge: Edge, car: Car) {
    if (edge.kind === PLAZA_EDGE || edge.length < 20) return false;
    return !(car.bus && edge.kind < HERO && edge.kind > 4);
  }

  /**
   * Puts a vehicle down on a street round the bike, or keeps it off the road. It favours the bigger
   * roads and what's ahead, so traffic is where the rider's going, and nothing appears in plain view.
   */
  private settle(car: Car, bikeX: number, bikeZ: number, heading: number, near: number, far: number, hide: boolean) {
    const { world, point } = this;
    car.hidden = true;
    for (let tries = 0; tries < 10; tries++) {
      // Most go straight down the road ahead, where they'll be met, and the rest round about.
      const dead = this.rand() < 0.62;
      const bearing = dead ? heading + (this.rand() - 0.5) * 0.5 : this.rand() < 0.7 ? heading + (this.rand() - 0.5) * 2 : this.rand() * Math.PI * 2;
      const gap = dead ? Math.max(near, SIGHT) + this.rand() * (far - Math.max(near, SIGHT)) : near + this.rand() * (far - near);
      const px = bikeX + Math.sin(bearing) * gap;
      const pz = bikeZ + Math.cos(bearing) * gap;
      const found: Edge[] = [];
      let weight = 0;
      world.edgesNear(px, pz, 90, (edge) => {
        if (!this.usable(edge, car)) return;
        found.push(edge);
        weight += edge.half * edge.half;
      });
      if (!found.length) continue;
      let pick = this.rand() * weight;
      let edge = found[0];
      for (const other of found) {
        pick -= other.half * other.half;
        edge = other;
        if (pick <= 0) break;
      }
      const along = 6 + this.rand() * Math.max(edge.length - 12, 0);
      const way = this.rand() < 0.5 ? 1 : -1;
      const lane = this.laneOn(edge, car.parked);
      world.pointOn(edge, along, point);
      const fx = point.forwardX * way;
      const fz = point.forwardZ * way;
      const x = point.x - fz * lane;
      const z = point.z + fx * lane;
      const away = Math.hypot(x - bikeX, z - bikeZ);
      if (away < near) continue;
      if (hide && away < SIGHT && !world.crosses(bikeX, bikeZ, x, z)) continue;
      if (this.cars.some((other) => other !== car && !other.hidden && Math.hypot(other.x - x, other.z - z) < other.model.halfLength + car.model.halfLength + FOLLOW)) continue;
      car.edge = edge;
      car.along = along;
      car.way = way;
      car.lane = lane;
      car.x = x;
      car.z = z;
      car.yaw = Math.atan2(fx, fz);
      car.speed = car.cruise;
      car.hidden = false;
      return;
    }
  }

  /** Fills the streets round the bike, before the ride is on screen. */
  private scatter(bikeX: number, bikeZ: number, heading: number) {
    for (const car of this.cars) car.hidden = true;
    for (const car of this.cars) this.settle(car, bikeX, bikeZ, heading, START_CLEAR, FAR_OUT, false);
  }

  /** Anything close ahead, the bike included, that this one has to slow for. */
  private clearAhead(car: Car, bikeX: number, bikeZ: number) {
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    let target = car.cruise;
    const check = (x: number, z: number, length: number, speed: number) => {
      const rx = x - car.x;
      const rz = z - car.z;
      const ahead = rx * fx + rz * fz;
      if (ahead <= 0 || Math.abs(rx * fz - rz * fx) > 2.2) return;
      const room = ahead - car.model.halfLength - length;
      if (room < FOLLOW + car.speed * 0.9) target = Math.min(target, room < 2.5 ? 0 : speed);
    };
    for (const other of this.cars) {
      if (other !== car && !other.hidden) check(other.x, other.z, other.model.halfLength, other.speed);
    }
    check(bikeX, bikeZ, BIKE_LENGTH, 0);
    return target;
  }

  /** At the end of a street, on to another: mostly along the bigger roads, and back if it's a dead end. */
  private turn(car: Car, edge: Edge) {
    const { world } = this;
    const node = car.way > 0 ? edge.b : edge.a;
    const ways = world.nodes[node].map((index) => world.edges[index]).filter((other) => other !== edge && this.usable(other, car));
    if (!ways.length) {
      car.way = -car.way;
      car.along = car.way > 0 ? 0 : edge.length;
      return;
    }
    let total = 0;
    for (const other of ways) total += other.half * other.half;
    let pick = this.rand() * total;
    let next = ways[0];
    for (const other of ways) {
      pick -= other.half * other.half;
      next = other;
      if (pick <= 0) break;
    }
    car.edge = next;
    car.way = next.a === node ? 1 : -1;
    car.along = next.a === node ? 0 : next.length;
    car.lane = this.laneOn(next, false);
  }

  private drive(car: Car, edge: Edge, bikeX: number, bikeZ: number, dt: number) {
    const target = this.clearAhead(car, bikeX, bikeZ);
    car.speed += Math.min(Math.max(target - car.speed, -BRAKE * 2 * dt), SPEED_UP * dt);
    car.along += car.speed * car.way * dt;
    car.roll += (car.speed * dt) / car.model.wheelRadius;
    if (car.along < 0 || car.along > edge.length) this.turn(car, edge);
  }

  /** Moves everything along. Returns how hard the bike has just hit something, or zero. */
  update(dt: number, bikeX: number, bikeZ: number, bikeHeading: number, bikeSpeed: number) {
    const { holder, work, spin, spinBack, world, ground, point } = this;
    this.reflect();
    // A jump means the ride has started again.
    if (Math.hypot(bikeX - this.lastX, bikeZ - this.lastZ) > 60) this.scatter(bikeX, bikeZ, bikeHeading);
    this.lastX = bikeX;
    this.lastZ = bikeZ;
    const ease = 1 - Math.exp(-dt * 7);
    const turnEase = 1 - Math.exp(-dt * 6);
    const bikeForwardX = Math.sin(bikeHeading) * bikeSpeed;
    const bikeForwardZ = Math.cos(bikeHeading) * bikeSpeed;

    let struck = 0;
    this.cars.forEach((car, index) => {
      const { model } = car;
      if (car.edge && !car.hidden && !car.parked) this.drive(car, car.edge, bikeX, bikeZ, dt);
      // Lifted from far behind and put down again out of sight on another street.
      const rx0 = car.x - bikeX;
      const rz0 = car.z - bikeZ;
      const away = Math.hypot(rx0, rz0);
      const behind = rx0 * Math.sin(bikeHeading) + rz0 * Math.cos(bikeHeading) < 0;
      if (car.hidden || away > TOO_FAR || (behind && away > LEFT_BEHIND)) this.settle(car, bikeX, bikeZ, bikeHeading, COMES_BACK, FAR_OUT, true);
      const sides = model.wheels.length;
      if (car.hidden || !car.edge) {
        (model.matrices.array as Float32Array).fill(0, car.slot * 16, (car.slot + 1) * 16);
        (model.wheelMatrices.array as Float32Array).fill(0, car.slot * sides * 16, (car.slot + 1) * sides * 16);
        this.shadows.setMatrixAt(index, work.makeScale(0, 0, 0));
        return;
      }

      world.pointOn(car.edge, car.along, point);
      const fx = point.forwardX * car.way;
      const fz = point.forwardZ * car.way;
      if (!car.parked) {
        car.x += (point.x - fz * car.lane - car.x) * ease;
        car.z += (point.z + fx * car.lane - car.z) * ease;
        const want = Math.atan2(fx, fz);
        car.yaw += Math.atan2(Math.sin(want - car.yaw), Math.cos(want - car.yaw)) * turnEase;
      }
      const noseX = Math.sin(car.yaw) * model.halfLength;
      const noseZ = Math.cos(car.yaw) * model.halfLength;
      const front = ground.at(car.x + noseX, car.z + noseZ);
      const back = ground.at(car.x - noseX, car.z - noseZ);
      holder.position.set(car.x, (front + back) / 2 + 0.05, car.z);
      // The model faces +z, and tips with the street it's on.
      holder.rotation.set(-Math.atan((front - back) / (model.halfLength * 2)), car.yaw, 0, "YXZ");
      holder.updateMatrix();
      holder.matrix.toArray(model.matrices.array, car.slot * 16);
      this.shadows.setMatrixAt(index, work.multiplyMatrices(holder.matrix, model.shadow));

      spin.makeRotationX(car.roll);
      spinBack.makeRotationX(-car.roll);
      model.wheels.forEach((wheel, side) => {
        work.multiplyMatrices(holder.matrix, wheel).multiply(side % 2 ? spinBack : spin);
        work.toArray(model.wheelMatrices.array, (car.slot * sides + side) * 16);
      });

      // In the car's own frame: is the bike inside it?
      const rx = bikeX - car.x;
      const rz = bikeZ - car.z;
      const carX = Math.sin(car.yaw);
      const carZ = Math.cos(car.yaw);
      const ahead = rx * carX + rz * carZ;
      const beside = rx * carZ - rz * carX;
      if (Math.abs(ahead) < model.halfLength + BIKE_LENGTH && Math.abs(beside) < model.halfWidth + BIKE_WIDTH) {
        const hard = Math.hypot(bikeForwardX - carX * car.speed, bikeForwardZ - carZ * car.speed);
        if (hard > struck) {
          struck = hard;
          const size = Math.hypot(rx, rz) || 1;
          this.awayX = rx / size;
          this.awayZ = rz / size;
        }
      }
    });
    for (const car of this.cars) {
      car.model.matrices.needsUpdate = true;
      car.model.wheelMatrices.needsUpdate = true;
    }
    this.shadows.instanceMatrix.needsUpdate = true;
    return struck;
  }

  /** Gives some finishes the scene's night to reflect at their own strengths, once it exists. */
  private reflect() {
    const scene = this.group.parent;
    if (this.shone || !(scene instanceof THREE.Scene) || !scene.environment) return;
    for (const [material, strength] of this.reflective) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.envMap = scene.environment;
      material.envMapIntensity = strength;
      overDarkRoad(material);
      material.needsUpdate = true;
    }
    this.shone = true;
  }
}

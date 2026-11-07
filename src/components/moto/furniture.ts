import * as THREE from "three";

import street from "@/content/moto-street.json";

import { FOG, type Ground } from "./city";
import { BAY, CITY, HILL, MAQAM_X, MAQAM_Z, MOSQUE, type Ride, SEA, type Spot, STAGE_EDGE } from "./ride";
import { LAMP_SPACING } from "./street";
import { HERO, type World } from "./world";

/*
 * Everything that stands in the street, placed the way the city places it. Each kind of place has
 * its own furniture: gilded candelabra, flags and chains along the sea wall; lanterns and clipped
 * ficus on the pavements of the centre; flags round the esplanade of Maqam Echahid; palms and tall
 * lamps down the bay; motorway gantries and the striped gateway by the Great Mosque.
 *
 * Copies are drawn in bulk, a stretch of road at a time, so only what's near the bike costs anything.
 */

type Name = keyof typeof street.objects;
/** Side of a square of the map, in metres: each is built when the bike gets near it. */
const CHUNK = 240;
/** Lamps along the city's streets, in metres, and where the old centre ends. */
const STREET_LAMPS = 40;
const CENTRE_EAST = 400;
const MAQAM = { x: MAQAM_X, z: MAQAM_Z };
/** Where each kind of lamp's light is, to put a halo on it. */
const LAMPS: Partial<Record<Name, { at: number[][]; size: number }>> = {
  Candelabra: { at: street.objects.Candelabra.attach.lamps, size: 1.5 },
  Lantern: { at: [street.objects.Lantern.attach.lamp], size: 1.8 },
  RoadLamp: { at: [street.objects.RoadLamp.attach.lamp], size: 2.0 },
};
/** The wind off the sea: every flag in the city flies the same way. */
const WIND = 2.55;

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** The Algerian flag: green at the hoist, white at the fly, the red crescent and star between them. */
function flagPicture() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 512;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("No 2D canvas");
  const middle = 384;
  const high = 256;
  c.fillStyle = "#006233";
  c.fillRect(0, 0, middle, 512);
  c.fillStyle = "#ffffff";
  c.fillRect(middle, 0, middle, 512);
  c.fillStyle = "#d21034";
  c.beginPath();
  c.arc(middle, high, 160, 0, Math.PI * 2);
  c.fill();
  for (const [left, colour] of [
    [0, "#006233"],
    [middle, "#ffffff"],
  ] as const) {
    c.save();
    c.beginPath();
    c.rect(left, 0, middle, 512);
    c.clip();
    c.fillStyle = colour;
    c.beginPath();
    c.arc(middle + 40, high, 128, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  c.fillStyle = "#d21034";
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? 80 : 31;
    c.lineTo(middle + 68 + Math.cos(a) * r, high + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  const picture = new THREE.CanvasTexture(canvas);
  picture.colorSpace = THREE.SRGBColorSpace;
  picture.anisotropy = 4;
  return picture;
}

function makeFlags(places: THREE.Vector3[]) {
  const time = { value: 0 };
  const rand = random(1962);
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.7, 1.8, 14, 5).translate(1.35, -0.9, 0),
    new THREE.ShaderMaterial({
      uniforms: { uTime: time, uFlag: { value: flagPicture() }, uFog: { value: FOG } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying float vShade;
        varying vec3 vWorld;
        void main() {
          vec3 p = position;
          float along = uv.x;
          float phase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
          float time = uTime * 1.0 + phase;
          // Waves run out from the pole, growing toward the free edge, and the top leads the foot.
          float wave = sin(along * 8.0 - time * 5.2 + uv.y * 1.6) * 0.2 * along + sin(along * 15.0 - time * 8.5) * 0.022 * along;
          p.z += wave;
          p.y -= along * along * 0.32 + sin(time * 1.3) * along * 0.06;
          p.x -= along * 0.05 * (1.0 - cos(along * 8.0 - time * 5.2));
          float slope = cos(along * 8.0 - time * 5.2 + uv.y * 1.6);
          vShade = 0.76 + slope * 0.24;
          vUv = uv;
          vec4 at = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vWorld = at.xyz;
          gl_Position = projectionMatrix * viewMatrix * at;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uFlag;
        uniform vec3 uFog;
        varying vec2 vUv;
        varying float vShade;
        varying vec3 vWorld;
        void main() {
          // Floodlit from below, so the foot of the cloth is the brightest.
          vec3 colour = texture2D(uFlag, vUv).rgb * vShade * (0.66 + 0.3 * (1.0 - vUv.y));
          float fog = 1.0 - exp(-length(vWorld - cameraPosition) * 0.00016);
          gl_FragColor = vec4(mix(colour, uFog, fog), 1.0);
        }
      `,
    }),
    Math.max(places.length, 1),
  );
  const holder = new THREE.Object3D();
  places.forEach((place, index) => {
    holder.position.copy(place);
    holder.rotation.y = WIND + (rand() - 0.5) * 0.5;
    holder.updateMatrix();
    mesh.setMatrixAt(index, holder.matrix);
  });
  mesh.count = places.length;
  mesh.frustumCulled = false;
  return { mesh, time };
}

/**
 * The bloom a camera sees round a street lamp at night. One quad each, turned to the eye in the
 * vertex shader, so every lamp in the city costs next to nothing.
 */
function makeHalos(places: { at: THREE.Vector3; size: number }[]) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const instanced = new THREE.InstancedBufferGeometry();
  instanced.index = geometry.index;
  instanced.setAttribute("position", geometry.getAttribute("position"));
  instanced.setAttribute("uv", geometry.getAttribute("uv"));
  const centres = new Float32Array(places.length * 4);
  places.forEach((place, index) => {
    centres.set([place.at.x, place.at.y, place.at.z, place.size], index * 4);
  });
  instanced.setAttribute("aCentre", new THREE.InstancedBufferAttribute(centres, 4));
  instanced.instanceCount = places.length;
  const mesh = new THREE.Mesh(
    instanced,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aCentre;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 view = viewMatrix * vec4(aCentre.xyz, 1.0);
          float away = length(view.xyz);
          // Lamps keep a little size however far off they are, the way a lens renders them.
          float size = aCentre.w * (1.0 + away * 0.006);
          view.xy += position.xy * size;
          vUv = uv;
          vFade = smoothstep(5.0, 20.0, away) * exp(-away * 0.0016);
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFade;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float core = exp(-r * r * 26.0);
          float wide = pow(max(1.0 - r, 0.0), 2.6);
          vec3 colour = vec3(1.0, 0.8, 0.56) * (core * 0.9 + wide * 0.07);
          gl_FragColor = vec4(colour * vFade, 1.0);
        }
      `,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

/** Leaves, lit from the street below, with the crown's top going dark against the sky. */
function leafMaterial(leaves: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { uLeaves: { value: leaves }, uFog: { value: FOG } },
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vHeight;
      void main() {
        vec4 at = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = at.xyz;
        vHeight = position.y;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * at;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uLeaves;
      uniform vec3 uFog;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vHeight;
      void main() {
        vec4 leaf = texture2D(uLeaves, vUv);
        float alpha = smoothstep(0.3, 0.6, leaf.a);
        if (alpha < 0.02) discard;
        float street = exp(-vHeight * 0.3);
        vec3 lit = leaf.rgb * (vec3(0.012, 0.016, 0.016) + vec3(0.72, 0.56, 0.32) * street);
        float fog = 1.0 - exp(-length(vWorld - cameraPosition) * 0.00016);
        gl_FragColor = vec4(mix(lit, uFog, fog), alpha);
      }
    `,
  });
}

function finishes(signs: THREE.Texture, leaves: THREE.Texture) {
  signs.colorSpace = THREE.SRGBColorSpace;
  leaves.colorSpace = THREE.SRGBColorSpace;
  for (const map of [signs, leaves]) {
    map.flipY = false;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }
  const paint = (colour: string, rough: number, metal: number, glow = "#000000", glowing = 1) =>
    new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: metal, emissive: glow, emissiveIntensity: glowing });
  const gold = paint("#c9984a", 0.34, 1, "#6a4216", 0.55);
  // Lace and chain are cut out of the leaf sheet, with their relief painted in.
  const cutOut = (colour: string, metal: number, glow: string) =>
    new THREE.MeshStandardMaterial({ map: leaves, color: colour, metalness: metal, roughness: 0.4, emissive: glow, alphaTest: 0.45, side: THREE.DoubleSide });
  const table: Record<string, THREE.Material> = {
    StreetIron: paint("#111113", 0.44, 0.6, "#120d08", 1),
    StreetGold: gold,
    GoldLace: cutOut("#e0b060", 0.9, "#3a2410"),
    StreetSteel: paint("#7a7d80", 0.42, 0.8, "#0c0c0c", 1),
    StreetWhite: paint("#d8d6d0", 0.46, 0.1, "#2a2620", 1),
    StreetBronze: paint("#a8803c", 0.36, 1, "#2a1c08", 1),
    ChainLink: cutOut("#2a2a2c", 0.7, "#000000"),
    LampGlass: new THREE.MeshBasicMaterial({ color: new THREE.Color(7.5, 5.2, 2.7) }),
    LampHead: new THREE.MeshBasicMaterial({ color: new THREE.Color(8.5, 7.4, 5.6) }),
    SignFace: new THREE.MeshBasicMaterial({ map: signs, color: new THREE.Color(0.96, 0.94, 0.9) }),
    Leaf: leafMaterial(leaves),
    Bark: new THREE.MeshStandardMaterial({ map: leaves, roughness: 0.9, emissive: "#201408", emissiveMap: leaves }),
    Whitewash: paint("#d9d6cc", 0.9, 0, "#3a3226", 1),
    Planter: paint("#16130f", 0.6, 0.2, "#0c0806", 1),
    Letter: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.32, 1.05) }),
    Block0: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.42, 0.28) }),
    Block1: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.42, 0.06, 0.05) }),
    Block2: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.12, 0.13) }),
    Block3: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.2, 0.1) }),
    Block4: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.46, 0.2, 0.05) }),
  };
  return table;
}

type Part = { geometry: THREE.BufferGeometry; material: THREE.Material; offset: THREE.Matrix4 };

export class Furniture {
  readonly group = new THREE.Group();
  /** What stands in each square of the map, kind by kind, until it's needed. */
  private readonly plans = new Map<number, Map<Name, THREE.Matrix4[]>>();
  private readonly live = new Map<number, THREE.Group>();
  private readonly parts = new Map<Name, Part[]>();
  private readonly reach: number;
  private readonly spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };
  private readonly point = { x: 0, z: 0, forwardX: 0, forwardZ: 1 };
  private readonly holder = new THREE.Object3D();
  private readonly flagPlaces: THREE.Vector3[] = [];
  private readonly haloPlaces: { at: THREE.Vector3; size: number }[] = [];
  private readonly rand = random(2410);
  private readonly flagTime: { value: number };

  constructor(
    kit: THREE.Object3D,
    signs: THREE.Texture,
    leaves: THREE.Texture,
    private readonly ride: Ride,
    private readonly world: World,
    private readonly ground: Ground,
    private readonly small: boolean,
  ) {
    this.reach = small ? 280 : 520;
    this.layOut();
    const table = finishes(signs, leaves);
    for (const name of Object.keys(street.objects) as Name[]) this.readParts(kit, name, table);
    const flags = makeFlags(this.flagPlaces);
    this.flagTime = flags.time;
    this.group.add(flags.mesh);
    this.group.add(makeHalos(this.haloPlaces));
  }

  /** Sets one thing down, by where it is on the road, turned to face the given way. */
  private put(name: Name, along: number, across: number, turn: number, lift = 0, stretch = 1) {
    const { ride, spot, holder } = this;
    ride.spot(along, spot);
    holder.position.set(spot.x + spot.rightX * across, spot.y + lift, spot.z + spot.rightZ * across);
    holder.rotation.set(0, turn, 0);
    holder.scale.set(1, 1, stretch);
    this.keep(name);
    return holder.position;
  }

  private chunkOf(x: number, z: number) {
    return (Math.floor(x / CHUNK) + 128) * 512 + Math.floor(z / CHUNK) + 128;
  }

  private keep(name: Name) {
    const { holder } = this;
    holder.updateMatrix();
    const key = this.chunkOf(holder.position.x, holder.position.z);
    let plan = this.plans.get(key);
    if (!plan) {
      plan = new Map();
      this.plans.set(key, plan);
    }
    const list = plan.get(name);
    if (list) list.push(holder.matrix.clone());
    else plan.set(name, [holder.matrix.clone()]);
    const lamps = LAMPS[name];
    if (lamps) {
      for (const lamp of lamps.at) {
        this.haloPlaces.push({ at: new THREE.Vector3(lamp[0], lamp[1], lamp[2]).applyMatrix4(this.holder.matrix), size: lamps.size });
      }
    }
  }

  /** Which way something's front looks to face the road from this side, or look back at the rider. */
  private towardRoad(along: number, side: number) {
    this.ride.spot(along, this.spot);
    return Math.atan2(-this.spot.rightX * side, -this.spot.rightZ * side);
  }

  private towardRider(along: number) {
    this.ride.spot(along, this.spot);
    return Math.atan2(-this.spot.forwardX, -this.spot.forwardZ);
  }

  private flagpole(along: number, across: number) {
    const at = this.put("Flagpole", along, across, 0);
    const hoist = street.objects.Flagpole.attach.flag[1];
    this.flagPlaces.push(new THREE.Vector3(at.x, at.y + hoist, at.z));
  }

  /** Is there a side street here, on this side? Nothing goes in the mouth of one. */
  private inMouth(along: number, side: number) {
    return this.ride.gaps.some(([at, gapSide, wide]) => gapSide === side && Math.abs(at - along) < wide / 2 + 2.5);
  }

  private layOut() {
    const { ride, rand, small } = this;
    const length = ride.length;
    const sparse = small ? 2 : 1;

    this.esplanade();

    for (let along = 0; along < length; along += LAMP_SPACING) {
      const zone = ride.zoneAt(along);
      const width = ride.widthAt(along);
      const kerb = 13.25 * width;

      if (zone === BAY || zone === MOSQUE) {
        // Tall lamps down the median, one reaching over each carriageway.
        for (const side of [-1, 1]) this.put("RoadLamp", along + LAMP_SPACING / 2, 0, this.towardRoad(along, -side), 0.2, 2.1);
        if (Math.round(along / LAMP_SPACING) % 3 === 0) this.flagpole(along, 20.4 * width);
        if (Math.round(along / LAMP_SPACING) % 3 === 1) this.flagpole(along + 8, -20.4 * width);
      } else if (zone === HILL) {
        for (const side of [-1, 1]) this.put("RoadLamp", along + (side > 0 ? 0 : LAMP_SPACING / 2), side * (kerb + 1), this.towardRoad(along, side), 0.1);
      } else if (zone === CITY) {
        for (const side of [-1, 1]) {
          const at = along + (side > 0 ? 0 : LAMP_SPACING / 2);
          if (this.inMouth(at, side)) continue;
          this.put("Lantern", at, side * (kerb + 0.9), this.towardRoad(at, side), 0.16);
        }
      }
    }

    // The trees and palms, thinner on a phone.
    for (let along = 0; along < length; along += 15 * sparse) {
      const zone = ride.zoneAt(along);
      const width = ride.widthAt(along);
      for (const side of [-1, 1]) {
        const at = along + rand() * 5;
        const turn = rand() * Math.PI * 2;
        if (zone === CITY) {
          if (rand() < 0.42 && !this.inMouth(at, side)) this.put("Ficus", at, side * (13.25 * width + 2.1 + rand() * 0.6), turn, 0.14);
        } else if (zone === HILL) {
          const out = side * (21.5 * width + 2 + rand() * 12);
          this.put(rand() < 0.62 ? "Ficus" : "Palm", at, out, turn, -0.1);
        } else if (zone === BAY) {
          if (rand() < 0.5) this.put("Palm", at, side * (15.8 + rand() * 2.8), turn, 0.1);
        } else if (zone === MOSQUE) {
          this.put("Palm", at, side * (15.8 + rand() * 2.8), turn, 0.1);
          if (rand() < 0.5) this.put(rand() < 0.5 ? "Ficus" : "Palm", at, side * (24 + rand() * 18), turn, -0.1);
        }
      }
    }

    this.seafront();
    this.junctions();
    this.signs();
    this.streets();
  }

  /** Lamps, trees and flags down every other street in the city. */
  private streets() {
    const { world, ground, holder, point, rand, small } = this;
    for (const edge of world.edges) {
      if (edge.kind >= HERO || edge.length < 26) continue;
      const big = edge.kind < 4;
      let side = rand() < 0.5 ? -1 : 1;
      for (let along = 12; along < edge.length - 12; along += STREET_LAMPS) {
        world.pointOn(edge, along, point);
        const central = point.x < CENTRE_EAST;
        const rightX = -point.forwardZ;
        const rightZ = point.forwardX;
        const out = edge.half + 1.2;
        const x = point.x + rightX * side * out;
        const z = point.z + rightZ * side * out;
        // A lamp arm reaches out along its own +z, over the road.
        const name: Name = central && edge.kind >= 3 ? "Lantern" : "RoadLamp";
        holder.position.set(x, ground.at(x, z), z);
        holder.rotation.set(0, Math.atan2(-rightX * side, -rightZ * side), 0);
        holder.scale.set(1, 1, 1);
        this.keep(name);
        world.addPost(x, z, 0.3);
        side = -side;

        // Trees between the lamps, on the streets wide enough to hold them.
        if (!small && edge.half > 4 && rand() < (central ? 0.34 : 0.22)) {
          world.pointOn(edge, Math.min(along + STREET_LAMPS / 2, edge.length - 6), point);
          const tx = point.x - point.forwardZ * side * (edge.half + 1.4);
          const tz = point.z + point.forwardX * side * (edge.half + 1.4);
          holder.position.set(tx, ground.at(tx, tz), tz);
          holder.rotation.set(0, rand() * Math.PI * 2, 0);
          this.keep(central ? "Ficus" : "Palm");
          world.addPost(tx, tz, 0.5);
        }
        if (big && rand() < 0.2) {
          const fx = point.x - point.forwardZ * -side * (edge.half + 1.1);
          const fz = point.z + point.forwardX * -side * (edge.half + 1.1);
          holder.position.set(fx, ground.at(fx, fz), fz);
          holder.rotation.set(0, 0, 0);
          this.keep("Flagpole");
          this.flagPlaces.push(new THREE.Vector3(fx, holder.position.y + street.objects.Flagpole.attach.flag[1], fz));
          world.addPost(fx, fz, 0.25);
        }
      }
    }
  }

  /** Flags and palms round the disc of the esplanade, clear of the line of the lap. */
  private esplanade() {
    const level = 121.9;
    const clearOfRide = (x: number, z: number) => {
      for (let along = 0; along < 520; along += 10) {
        this.ride.spot(along, this.spot);
        if (Math.hypot(x - this.spot.x, z - this.spot.z) < 17) return false;
      }
      return true;
    };
    const at = (bearing: number, radius: number) => ({ x: MAQAM.x + Math.cos(bearing) * radius, z: MAQAM.z + Math.sin(bearing) * radius });
    for (let k = 0; k < 40; k++) {
      const { x, z } = at((k / 40) * Math.PI * 2, 214);
      if (!clearOfRide(x, z)) continue;
      this.holder.position.set(x, level, z);
      this.holder.rotation.set(0, 0, 0);
      this.holder.scale.set(1, 1, 1);
      this.keep("Flagpole");
      this.flagPlaces.push(new THREE.Vector3(x, level + street.objects.Flagpole.attach.flag[1], z));
      this.world.addPost(x, z, 0.6);
    }
    for (let k = 0; k < 30; k++) {
      const bearing = (k / 30) * Math.PI * 2;
      const { x, z } = at(bearing, 128 + (k % 2) * 14);
      if (!clearOfRide(x, z)) continue;
      this.holder.position.set(x, level, z);
      this.holder.rotation.set(0, bearing * 3, 0);
      this.holder.scale.set(1, 1, 1);
      this.keep("Washingtonia");
      this.world.addPost(x, z, 0.9);
    }
    for (let k = 0; k < 20; k++) {
      const bearing = ((k + 0.5) / 20) * Math.PI * 2;
      const { x, z } = at(bearing, 176);
      if (!clearOfRide(x, z)) continue;
      this.holder.position.set(x, level, z);
      this.holder.rotation.set(0, -bearing + Math.PI / 2, 0);
      this.holder.scale.set(1, 1, 1);
      this.keep("Candelabra");
      this.world.addPost(x, z, 0.9);
    }
    this.group.add(this.parapet(level));
  }

  /** The low stone wall round the esplanade, open where the road leaves it. */
  private parapet(level: number) {
    const { ride, spot } = this;
    ride.spot(ride.exit, spot);
    const open = Math.atan2(spot.z - MAQAM.z, spot.x - MAQAM.x);
    const radius = STAGE_EDGE + 1.4;
    const halfGap = (15.5 / radius) * 1.0;
    const positions: number[] = [];
    const shades: number[] = [];
    const index: number[] = [];
    const steps = 240;
    for (let k = 0; k <= steps; k++) {
      // Starting just past the gap, and going right round to the other side of it.
      const a = open + halfGap + (k / steps) * (Math.PI * 2 - halfGap * 2);
      const x = Math.cos(a);
      const z = Math.sin(a);
      for (const [out, up, shade] of [
        [0, -0.2, 0.3],
        [0, 0.72, 0.62],
        [0.1, 0.84, 1],
        [0.5, 0.84, 1],
        [0.6, 0.72, 0.4],
        [0.6, -5, 0.05],
      ] as const) {
        positions.push(MAQAM.x + x * (radius + out), level + up, MAQAM.z + z * (radius + out));
        shades.push(0.3 * shade, 0.25 * shade, 0.18 * shade);
      }
      if (k < steps) {
        for (let side = 0; side < 5; side++) {
          const p = k * 6 + side;
          index.push(p, p + 6, p + 1, p + 1, p + 6, p + 7);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    return mesh;
  }

  /** The sea wall: candelabra, a line of flags along the parapet, chains along the kerb. */
  private seafront() {
    const { ride } = this;
    for (let along = 0; along < ride.length; along += 2.4) {
      if (ride.zoneAt(along) !== SEA) continue;
      const width = ride.widthAt(along);
      const kerb = 13.25 * width;
      const turn = this.towardRider(along) + Math.PI / 2;
      const count = Math.round(along / 2.4);
      this.put("Bollard", along, -(kerb + 0.5), turn, 0.16);
      this.put("Chain", along + 1.2, -(kerb + 0.5), turn, 0.16);
      if (count % 14 === 0) this.put("Candelabra", along, -(kerb + 1.9), turn, 0.16);
      if (count % 7 === 3) this.flagpole(along, -20.2 * width);
      if (count % 14 === 7) this.put("Planter", along, -(kerb + 1.9), turn, 0.16);
    }
  }

  /** At the side streets: flags in pairs, chains at the corners, a sign pointing the way. */
  private junctions() {
    const { ride, rand } = this;
    const posts: Name[] = ["Signpost", "Signpost2", "Signpost3"];
    ride.gaps.forEach(([along, side, wide], index) => {
      const width = ride.widthAt(along);
      const kerb = 13.25 * width;
      const zone = ride.zoneAt(along);
      if (zone !== CITY && zone !== SEA) return;
      if (index % 2 === 0) {
        this.flagpole(along - wide / 2 - 1.5, side * (kerb + 1.6));
        this.flagpole(along + wide / 2 + 1.5, side * (kerb + 1.6));
      }
      if (index % 5 === 1) this.put(posts[Math.floor(rand() * posts.length)], along - wide / 2 - 3.2, side * (kerb + 1.2), this.towardRider(along), 0.16);
      for (const end of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const at = along + end * (wide / 2 + 2 + k * 2.4);
          const turn = this.towardRider(at) + Math.PI / 2;
          this.put("Bollard", at, side * (kerb + 0.5), turn, 0.16);
          if (k < 2) this.put("Chain", at + end * 1.2, side * (kerb + 0.5), turn, 0.16);
        }
      }
    });
  }

  /** The way to the mosque: motorway gantries, the striped gateway, and the big letters on the bank. */
  private signs() {
    const { ride } = this;
    const end = ride.length;
    for (const [name, back] of [
      ["GantryGreen", 4400],
      ["Gantry", 2700],
      ["GantryGreen", 1500],
      ["Gantry", 620],
    ] as [Name, number][]) {
      this.put(name, end - back, 7.1, this.towardRider(end - back), 0.1);
    }
    this.put("Totem", end - 430, 31, this.towardRider(end - 430), 0);
    // Turned a little to meet the rider, the way it's set to catch the eye on the motorway.
    const at = end - 3300;
    this.put("Letters", at, 44, this.towardRoad(at, 1) + 0.5, 4.2);
    this.group.add(this.bank(at));
  }

  /** The green bank the letters stand on, sloping up from the road. */
  private bank(along: number) {
    const { ride, spot } = this;
    const positions: number[] = [];
    const shades: number[] = [];
    const index: number[] = [];
    const rows = 22;
    for (let row = 0; row <= rows; row++) {
      const at = along + (row / rows - 0.5) * 150;
      ride.spot(at, spot);
      // Foot, slope, and the crest behind the letters.
      for (const [across, up, shade] of [
        [22, 0.1, 0.05],
        [38, 2.6, 0.075],
        [50, 5.6, 0.05],
        [60, 6.4, 0.012],
      ] as const) {
        // Round off the two ends, so it doesn't stop like a cut cake.
        const ends = Math.sin((row / rows) * Math.PI) ** 0.5;
        positions.push(spot.x + spot.rightX * across, spot.y + up * ends - 0.1, spot.z + spot.rightZ * across);
        shades.push(shade * 0.42, shade, shade * 0.3);
      }
      if (row < rows) {
        for (let k = 0; k < 3; k++) {
          const p = row * 4 + k;
          index.push(p, p + 4, p + 1, p + 1, p + 4, p + 5);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    return mesh;
  }

  private readParts(kit: THREE.Object3D, name: Name, table: Record<string, THREE.Material>) {
    const model = kit.getObjectByName(name);
    if (!model) throw new Error(`The street kit has no ${name}`);
    const parts: Part[] = [];
    model.updateWorldMatrix(true, true);
    const back = model.matrixWorld.clone().invert();
    model.traverse((item) => {
      if (!(item instanceof THREE.Mesh)) return;
      const key = (item.material as THREE.Material).name.replace(/\.\d+$/, "");
      const material = table[key];
      if (!material) throw new Error(`The street kit's ${name} has a surface with no finish: ${key}`);
      parts.push({ geometry: item.geometry as THREE.BufferGeometry, material, offset: back.clone().multiply(item.matrixWorld) });
    });
    this.parts.set(name, parts);
  }

  private build(key: number) {
    const group = new THREE.Group();
    const matrix = new THREE.Matrix4();
    for (const [name, copies] of this.plans.get(key) ?? []) {
      for (const part of this.parts.get(name) ?? []) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, copies.length);
        copies.forEach((copy, index) => mesh.setMatrixAt(index, matrix.multiplyMatrices(copy, part.offset)));
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
    return group;
  }

  /** Builds what's near the bike, one square a frame, and lets go of what's been left behind. */
  update(x: number, z: number, time: number) {
    this.flagTime.value = time;
    const steps = Math.ceil(this.reach / CHUNK);
    let nearest = -1;
    let best = Infinity;
    for (let a = -steps; a <= steps; a++) {
      for (let b = -steps; b <= steps; b++) {
        const gap = Math.hypot(a, b) * CHUNK;
        if (gap > this.reach + CHUNK * 0.5 || gap >= best) continue;
        const key = this.chunkOf(x + a * CHUNK, z + b * CHUNK);
        if (!this.live.has(key) && this.plans.has(key)) {
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
    const hereA = Math.floor(x / CHUNK) + 128;
    const hereB = Math.floor(z / CHUNK) + 128;
    for (const [key, chunk] of this.live) {
      if (Math.max(Math.abs(Math.floor(key / 512) - hereA), Math.abs((key % 512) - hereB)) <= steps + 1) continue;
      for (const mesh of chunk.children) (mesh as THREE.InstancedMesh).dispose();
      this.group.remove(chunk);
      this.live.delete(key);
    }
    return nearest >= 0;
  }
}

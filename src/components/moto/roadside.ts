import * as THREE from "three";

import type { Ground } from "./city";
import { FOG } from "./city";
import { type Ride, SEA, type Spot } from "./ride";

/*
 * The big things beside the road: the wall along the bay, the sea wall of the Front de Mer, and the
 * cranes of the port. The landmarks get a floodlit finish of their own, because that's how you see
 * them at night: lit from below, against the dark.
 */

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** The low wall along the road where nothing stands, and the old stone parapet of the sea wall. */
export function makeWalls(ride: Ride) {
  const spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };
  const rows = ride.count;
  const positions: number[] = [];
  const shades: number[] = [];
  const index: number[] = [];
  const low = new THREE.Color(0.1, 0.075, 0.05);
  const stone = new THREE.Color(0.66, 0.5, 0.3);
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    for (let row = 0; row < rows; row++) {
      const along = row * ride.step;
      ride.spot(along, spot);
      const zone = ride.zoneAt(along);
      const seaWall = zone === SEA && side < 0;
      const tall = seaWall ? 1.2 : 1.05;
      const tint = seaWall ? stone : low;
      const width = ride.widthAt(along);
      for (const [across, up, shade] of [
        [20.9, 0.1, 1],
        [20.9, tall, 0.72],
        [21.3, tall + 0.05, 0.5],
        [21.3, -2.2, 0.3],
      ] as const) {
        positions.push(spot.x + spot.rightX * across * side * width, spot.y + up, spot.z + spot.rightZ * across * side * width);
        shades.push(tint.r * shade, tint.g * shade, tint.b * shade);
      }
      const wanted = ride.hasWall(along, side) && !ride.gaps.some(([at, gapSide, wide]) => gapSide === side && Math.abs(at - along) < wide / 2 + 9);
      if (wanted && row < rows - 1) {
        const a = start + row * 4;
        for (let k = 0; k < 3; k++) {
          const p = a + k;
          const q = a + k + 4;
          index.push(p, q, p + 1, p + 1, q, q + 1);
        }
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

/** Ship-to-shore cranes along the port's quays, with their red lights. */
export function makeCranes(ride: Ride, ground: Ground) {
  const parts: THREE.BufferGeometry[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  for (const x of [-8, 8]) for (const z of [-7, 7]) box(x, 16, z, 1, 32, 1);
  box(0, 33, 0, 20, 2, 18);
  box(0, 37, 26, 3, 2.4, 96);
  box(0, 46, 0, 2, 26, 2);
  const merged = new THREE.BufferGeometry();
  const total = parts.reduce((sum, part) => sum + part.getAttribute("position").count, 0);
  const position = new Float32Array(total * 3);
  const index: number[] = [];
  let at = 0;
  for (const part of parts) {
    position.set(part.getAttribute("position").array as Float32Array, at * 3);
    for (const i of part.getIndex()?.array ?? []) index.push(i + at);
    at += part.getAttribute("position").count;
  }
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setIndex(index);
  merged.computeVertexNormals();

  const rand = random(1516);
  const spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };
  const places: { x: number; y: number; z: number; turn: number }[] = [];
  for (let along = 7700; along < 11000 && places.length < 22; along += 170) {
    ride.spot(along, spot);
    // The port is on the left, heading east along the bay.
    const across = -(130 + rand() * 260);
    const x = spot.x + spot.rightX * across;
    const z = spot.z + spot.rightZ * across;
    const height = ground.at(x, z);
    if (height > 0) places.push({ x, y: height, z, turn: Math.atan2(spot.rightX, spot.rightZ) });
  }
  const cranes = new THREE.InstancedMesh(merged, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.016) }), Math.max(places.length, 1));
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.6, 0.3) }), Math.max(places.length, 1) * 2);
  const holder = new THREE.Object3D();
  places.forEach((place, index) => {
    holder.position.set(place.x, place.y, place.z);
    holder.rotation.y = place.turn;
    holder.updateMatrix();
    cranes.setMatrixAt(index, holder.matrix);
    holder.position.set(place.x, place.y + 60, place.z);
    holder.updateMatrix();
    lights.setMatrixAt(index * 2, holder.matrix);
    holder.position.set(place.x + Math.sin(place.turn) * 70, place.y + 38, place.z + Math.cos(place.turn) * 70);
    holder.updateMatrix();
    lights.setMatrixAt(index * 2 + 1, holder.matrix);
  });
  cranes.count = places.length;
  lights.count = places.length * 2;
  const group = new THREE.Group();
  for (const item of [cranes, lights]) {
    item.frustumCulled = false;
    group.add(item);
  }
  return group;
}

const LANDMARK = /* glsl */ `
  uniform vec3 uFog;
  uniform float uKind;
  uniform float uBase;
  uniform float uTime;
  uniform vec2 uAxis;
  varying vec3 vWorld;
  varying vec3 vNormal;

  float markHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    float up = vWorld.y - uBase;
    float kind = uKind;
    vec3 colour;
    vec2 flat2 = vec2(vWorld.x * 0.96 + vWorld.z * 0.28, vWorld.z * 0.96 - vWorld.x * 0.28);
    float along = abs(normal.x) > abs(normal.z) ? flat2.y : flat2.x;
    float wall = 1.0 - abs(normal.y);
    if (kind < 0.5) {
      // Stone, warm in the floods.
      colour = vec3(0.86, 0.62, 0.32) * (0.3 + 0.5 * wall);
    } else if (kind < 1.5) {
      // The arcades: a long run of pointed arches, gold from inside, under a lit band.
      float cell = abs(fract(along / 7.0) - 0.5) * 7.0;
      float arch = step(cell, 2.6) * step(1.0, up) * step(up, 8.2 - cell * cell * 0.42);
      colour = mix(vec3(0.42, 0.3, 0.17), vec3(3.0, 1.9, 0.72), arch) * (0.1 + 0.9 * wall);
      colour += vec3(3.4, 2.3, 1.0) * step(9.6, up) * step(up, 10.3) * wall;
    } else if (kind < 2.5) {
      // The prayer hall: pale walls washed from below, a glowing gold band under the roof.
      float cell = abs(fract(along / 9.0) - 0.5) * 9.0;
      float opening = step(cell, 2.8) * step(2.4, up) * step(up, 14.0);
      vec3 wallLit = vec3(1.1, 0.74, 0.36) * (0.34 + 0.66 * exp(-up * 0.07));
      colour = mix(wallLit, vec3(2.8, 1.8, 0.8), opening * 0.8);
      colour += vec3(3.0, 2.0, 0.9) * step(27.0, up) * step(up, 29.0);
      colour *= 0.12 + 0.88 * wall;
    } else if (kind < 3.5) {
      // The minaret, as the photographs show it: every edge of the shaft strung with gold, framing
      // tall dark panels of screen, stage above stage.
      vec2 local = vWorld.xz - uAxis;
      float turn = 0.2793;
      // The plan is turned sixteen degrees, and z runs south, so this undoes it with z flipped.
      vec2 square = abs(vec2(local.x * cos(turn) + local.y * sin(turn), local.x * sin(turn) - local.y * cos(turn)));
      float across = min(square.x, square.y);
      float stage = fract(up / 37.0);
      float frame = smoothstep(10.2, 10.5, across) + step(stage, 0.05) * step(across, 10.5);
      float screenCell = step(0.5, fract(across * 1.1)) * step(0.5, fract(up * 1.1));
      float glassBay = step(0.62, stage) * step(stage, 0.8) * step(across, 4.6);
      vec3 panel = vec3(0.02, 0.018, 0.016) + vec3(0.36, 0.22, 0.09) * screenCell * 0.55;
      panel = mix(panel, vec3(1.3, 0.92, 0.46), glassBay);
      vec3 gold = vec3(4.2, 2.7, 0.95) * (0.8 + 0.2 * sin(up * 1.7));
      colour = mix(panel, gold, min(frame, 1.0));
    } else if (kind < 4.5) {
      // The dome: a gold lattice of ribs, lit from inside against the dark.
      float angle = atan(normal.z, normal.x);
      float ribs = smoothstep(0.32, 0.46, abs(fract(angle * 3.8) - 0.5));
      float rings = smoothstep(0.32, 0.46, abs(fract(normal.y * 7.0) - 0.5));
      colour = mix(vec3(0.26, 0.17, 0.07), vec3(3.2, 2.2, 1.0), max(ribs, rings));
    } else if (kind < 5.5) {
      // Maqam Echahid, from the photographs: bright green on the outer faces of the fronds, all
      // the way to the ground, and pale cast concrete on their edges and inner faces, lit from
      // the flame's terrace below. You can see the board marks and the lifts of the pour.
      vec2 radial = normalize(vWorld.xz - uAxis);
      float facing = dot(normal.xz, radial);
      float outer = smoothstep(0.1, 0.34, facing);
      float height = up / 92.0;
      float lifts = 0.78 + 0.22 * smoothstep(0.02, 0.06, fract(up / 2.6));
      float pours = 0.8 + 0.2 * smoothstep(0.015, 0.05, fract(along / 3.1));
      lifts *= 0.92 + 0.16 * markHash(floor(vec2(along / 3.1, up / 2.6)));
      // Floods at the foot throw their light up the curve, so it's strongest low down and on the crown.
      float lit = 0.46 + 0.54 * pow(max(facing, 0.0), 1.6);
      float seams = 0.82 + 0.18 * smoothstep(0.0, 0.05, abs(fract(along / 11.0) - 0.5)) * smoothstep(0.0, 0.04, abs(fract(up / 13.0) - 0.5));
      vec3 green = vec3(0.012, 0.5, 0.075) * lit * seams * (1.12 - height * 0.5);
      vec3 concrete = vec3(1.0, 0.8, 0.52) * (0.05 + 0.3 * exp(-height * 3.4));
      colour = mix(concrete, green, outer) * lifts * pours;
    } else if (kind < 6.5) {
      // The tower: dark below, then the stage of red windows, and the red-lit lattice above it.
      float windows = step(0.5, fract(along * 0.9)) * step(66.0, up) * step(up, 72.0);
      colour = vec3(0.05, 0.035, 0.03);
      colour = mix(colour, vec3(1.3, 0.02, 0.015), windows);
      colour += vec3(0.7, 0.012, 0.01) * smoothstep(72.0, 78.0, up);
    } else if (kind < 7.5) {
      colour = vec3(2.8, 2.0, 0.85);
    } else if (kind < 8.5) {
      colour = vec3(1.7, 0.03, 0.02);
    } else if (kind < 9.5) {
      colour = vec3(1.6, 1.4, 1.05);
    } else if (kind < 10.5) {
      float lick = 0.7 + 0.3 * sin(uTime * 14.0 + vWorld.y * 3.0) * sin(uTime * 9.0);
      colour = vec3(9.0, 3.6, 0.7) * lick;
    } else if (kind < 11.5) {
      // The esplanade. A round star of pale blue and white at the heart of it, then wide slabs,
      // washed with the monument's green and the warmth of the floods.
      vec2 at = vWorld.xz - uAxis;
      float radius = length(at);
      float angle = atan(at.y, at.x);
      vec2 grid = abs(fract(vWorld.xz / 3.4) - 0.5);
      float tiny = fwidth(vWorld.x / 3.4) + fwidth(vWorld.z / 3.4);
      float joint = smoothstep(0.47, 0.5, max(grid.x, grid.y)) * (1.0 - smoothstep(0.06, 0.26, tiny));
      vec3 slab = vec3(0.1, 0.098, 0.09) * (0.86 + 0.3 * markHash(floor(vWorld.xz / 3.4)));
      slab *= 1.0 - joint * 0.4;
      float star = smoothstep(0.1, 0.5, abs(fract(angle * 3.82 + radius * 0.06) - 0.5) * 2.0);
      vec3 mosaic = mix(vec3(0.03, 0.08, 0.11), vec3(0.14, 0.17, 0.18), star);
      slab = mix(slab, mosaic, (1.0 - smoothstep(38.0, 41.0, radius)) * (1.0 - smoothstep(0.1, 0.5, tiny)));
      float near = exp(-radius * 0.012);
      // The candelabra round the rim leave a pool each, and the flood at the foot reaches out to them.
      float ring = exp(-pow((radius - 176.0) / 34.0, 2.0)) * (0.55 + 0.45 * cos(angle * 20.0));
      colour = slab * (0.3 + 1.3 * near + 1.1 * ring) * vec3(1.0, 0.9, 0.8) + vec3(0.0, 0.016, 0.004) * exp(-radius * 0.018);
    } else if (kind < 12.5) {
      // The Grande Poste: white, washed from the foot, with great horseshoe arches, lit from inside,
      // and a gallery of small ones under the battlements.
      float wide = abs(fract(along / 11.0) - 0.5) * 11.0;
      float arch = step(length(vec2(wide, (up - 6.4) * 0.94)), 3.5) + step(wide, 2.9) * step(up, 6.4);
      float narrow = abs(fract(along / 3.67) - 0.5) * 3.67;
      float gallery = (step(length(vec2(narrow, up - 16.6)), 1.25) + step(narrow, 1.05) * step(14.2, up) * step(up, 16.6));
      vec3 plaster = vec3(1.0, 0.86, 0.66) * (0.075 + 0.5 * exp(-up * 0.13));
      float band = step(abs(up - 11.4), 0.32) + step(abs(up - 19.2), 0.26) + step(22.6, up);
      plaster *= 1.0 + band * 0.5;
      colour = plaster;
      colour = mix(colour, vec3(0.012, 0.014, 0.022) + vec3(0.42, 0.28, 0.12) * smoothstep(13.0, 19.0, up), min(gallery, 1.0));
      colour = mix(colour, vec3(0.92, 0.6, 0.27) * (0.5 + 0.5 * smoothstep(9.8, 2.0, up)), min(arch, 1.0));
      colour *= 0.1 + 0.9 * wall;
    } else if (kind < 13.5) {
      colour = vec3(0.92, 0.88, 0.78) * (0.08 + 0.3 * max(normal.y, 0.0));
    } else if (kind < 14.5) {
      // The glass lantern on top of the minaret: dark blue-green, with its gold dome showing through.
      colour = vec3(0.012, 0.05, 0.06) + vec3(0.08, 0.3, 0.2) * smoothstep(0.42, 0.5, abs(fract(up / 1.7) - 0.5));
      colour += vec3(1.0, 0.7, 0.3) * (1.0 - wall) * 0.6;
    } else {
      // The square before the Grande Poste: stone setts, warm from the lamps round it.
      vec2 grid = abs(fract(vWorld.xz / 1.6) - 0.5);
      float tiny = fwidth(vWorld.x / 1.6) + fwidth(vWorld.z / 1.6);
      float joint = smoothstep(0.46, 0.5, max(grid.x, grid.y)) * (1.0 - smoothstep(0.06, 0.26, tiny));
      colour = vec3(0.13, 0.115, 0.09) * (0.84 + 0.32 * markHash(floor(vWorld.xz / 1.6))) * (1.0 - joint * 0.45);
    }
    float fog = 1.0 - exp(-length(vWorld - cameraPosition) * 0.00005);
    gl_FragColor = vec4(mix(colour, uFog, fog), 1.0);
  }
`;

const KINDS = ["Stone", "Arcade", "Hall", "Lattice", "Dome", "Leaf", "Tower", "Gold", "Beacon", "Flood", "Flame", "Paving", "Poste", "PosteDome", "Crown", "Square"];
const MAQAM_AXIS = new THREE.Vector2(-1808, 2147);
const MINARET_AXIS = new THREE.Vector2(4276, 3252);

/** How the landmarks look at night, one finish for each surface, on the photographs' colours. */
export function dressLandmarks(model: THREE.Object3D, bases: Record<string, number>) {
  const time = { value: 0 };
  const made = new Map<string, THREE.ShaderMaterial>();
  const finish = (name: string, base: number) => {
    const key = `${name}:${base}`;
    let material = made.get(key);
    if (!material) {
      material = new THREE.ShaderMaterial({
        uniforms: {
          uFog: { value: FOG },
          uKind: { value: KINDS.indexOf(name) },
          uBase: { value: base },
          uTime: time,
          uAxis: { value: name === "Lattice" ? MINARET_AXIS : MAQAM_AXIS },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          varying vec3 vNormal;
          void main() {
            vec4 at = modelMatrix * vec4(position, 1.0);
            vWorld = at.xyz;
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * at;
          }
        `,
        fragmentShader: LANDMARK,
        side: THREE.DoubleSide,
      });
      made.set(key, material);
    }
    return material;
  };
  model.traverse((item) => {
    if (!(item instanceof THREE.Mesh)) return;
    const name = (item.material as THREE.Material).name.replace(/\.\d+$/, "");
    const base = name === "Leaf" || name === "Tower" ? bases.maqam : name === "Lattice" || name === "Crown" ? bases.minaret : name === "Poste" || name === "Square" ? bases.poste : bases.hall;
    item.material = finish(KINDS.includes(name) ? name : "Stone", base);
    item.frustumCulled = false;
  });
  return time;
}

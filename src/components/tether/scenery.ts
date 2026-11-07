import * as THREE from "three";

import type { Ground } from "./ground";

/*
 * What's around the machines. The sky is painted from real star catalogues and the Earth and
 * Moon from real NASA imagery, by way of Solar System Scope. The rocks are real rocks, scanned.
 */

const SKY_RADIUS = 28000;

export async function addSky(scene: THREE.Scene, textures: THREE.TextureLoader) {
  const stars = await textures.loadAsync("/2090/stars.webp");
  stars.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 48, 24),
    new THREE.MeshBasicMaterial({ map: stars, side: THREE.BackSide, color: new THREE.Color(0.55, 0.55, 0.6), depthWrite: false, fog: false }),
  );
  sky.rotation.set(0.4, 1.1, 0.2);
  scene.add(sky);
  return sky;
}

/** Sunlight on Earth is a brighter thing than on grey dust, so it's drawn by hand. */
export async function addEarth(scene: THREE.Scene, textures: THREE.TextureLoader, sun: THREE.Vector3) {
  const [day, night, clouds] = await Promise.all([
    textures.loadAsync("/2090/earth-day.webp"),
    textures.loadAsync("/2090/earth-night.webp"),
    textures.loadAsync("/2090/earth-clouds.webp"),
  ]);
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(650, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { day: { value: day }, night: { value: night }, clouds: { value: clouds }, sun: { value: sun } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vUv = uv;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 at = modelMatrix * vec4(position, 1.0);
          vView = normalize(cameraPosition - at.xyz);
          gl_Position = projectionMatrix * viewMatrix * at;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D day;
        uniform sampler2D night;
        uniform sampler2D clouds;
        uniform vec3 sun;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float light = dot(normalize(vNormal), sun);
          float lit = smoothstep(-0.08, 0.22, light);
          float cloud = texture2D(clouds, vUv).r;
          vec3 surface = texture2D(day, vUv).rgb * 1.15;
          surface = mix(surface, vec3(1.0), cloud * 0.9) * lit;
          surface += texture2D(night, vUv).rgb * (1.0 - lit) * 0.5 * (1.0 - cloud);
          float edge = 1.0 - max(dot(normalize(vNormal), vView), 0.0);
          edge = edge * edge * edge;
          surface += vec3(0.2, 0.42, 1.0) * edge * (lit * 0.8 + 0.02);
          gl_FragColor = vec4(surface * 0.95, 1.0);
        }
      `,
    }),
  );
  earth.position.set(5200, 3900, -9400);
  earth.rotation.set(0.3, 2.3, 0.1);
  scene.add(earth);
  return earth;
}

/** The sun, which nothing here ever gets to soften: a small, savage disc. */
export function addSun(scene: THREE.Scene) {
  const sun = new THREE.Mesh(new THREE.SphereGeometry(125, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(90, 86, 78), fog: false }));
  scene.add(sun);
  return sun;
}

/**
 * The Moon from orbit. Its map is real, but only good to twenty metres a pixel, which is mush from
 * six hundred metres up. So the relief is the crater field simulated for the surface, laid over
 * the globe at three sizes: craters look the same at every scale, so it holds up. It's lit the
 * way dust is: a full Moon has no dark edge, which is why it looks flat in the sky.
 */
export async function addMoon(scene: THREE.Scene, textures: THREE.TextureLoader, sun: THREE.Vector3, small: boolean) {
  const [map, relief] = await Promise.all([textures.loadAsync("/2090/moon.webp"), textures.loadAsync("/2090/ground-normal.webp")]);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  relief.flipY = false;
  relief.wrapS = relief.wrapT = THREE.MirroredRepeatWrapping;
  relief.colorSpace = THREE.NoColorSpace;
  relief.anisotropy = 8;
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(14000, small ? 192 : 384, small ? 96 : 192),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, relief: { value: relief }, sun: { value: sun } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vAt;
        varying vec3 vView;
        varying mat3 vTurn;
        void main() {
          vUv = uv;
          vAt = position;
          vTurn = mat3(modelMatrix);
          vec4 at = modelMatrix * vec4(position, 1.0);
          vView = cameraPosition - at.xyz;
          gl_Position = projectionMatrix * viewMatrix * at;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform sampler2D relief;
        uniform vec3 sun;
        varying vec2 vUv;
        varying vec3 vAt;
        varying vec3 vView;
        varying mat3 vTurn;

        // The tile is mirrored at its edges, so a slope has to change sign with it, or every
        // other crater would read as a dome.
        vec2 slope(vec2 uv) {
          vec2 flip = 1.0 - 2.0 * mod(floor(uv), 2.0);
          vec3 n = texture2D(relief, uv).rgb * 2.0 - 1.0;
          return n.xz / max(n.y, 0.3) * flip;
        }

        vec3 craters(vec3 at, vec3 weight, float scale) {
          vec2 a = slope(at.zy * scale);
          vec2 b = slope(at.xz * scale);
          vec2 c = slope(at.xy * scale);
          return vec3(0.0, a.y, a.x) * weight.x + vec3(b.x, 0.0, b.y) * weight.y + vec3(c.x, c.y, 0.0) * weight.z;
        }

        void main() {
          vec3 up = normalize(vAt);
          vec3 weight = up * up;
          weight *= weight;
          weight /= weight.x + weight.y + weight.z;
          vec3 bent = craters(vAt, weight, 1.0 / 430.0) * 0.38;
          bent += craters(vAt, weight, 1.0 / 1600.0) * 0.45;
          bent += craters(vAt, weight, 1.0 / 6100.0) * 0.5;
          bent += craters(vAt, weight, 1.0 / 23000.0) * 0.5;
          vec3 normal = normalize(vTurn * normalize(up + bent));
          vec3 view = normalize(vView);

          // The sun's half a degree wide and the ground throws light back up into its own shade,
          // so a shadow's edge has a little give in it.
          float toSun = max(dot(normal, sun) + 0.05, 0.0) / 1.05;
          float toEye = max(dot(normal, view), 0.08);
          float dust = 2.0 * toSun / (toSun + toEye + 0.001);
          float light = mix(dust, toSun * 1.6, 0.45);
          // The terminator doesn't care what the craters do: past it, there's no sun at all.
          light *= smoothstep(-0.03, 0.05, dot(vTurn * up, sun));

          vec3 surface = texture2D(map, vUv).rgb;
          gl_FragColor = vec4(surface * (light * 0.95 + 0.02), 1.0);
        }
      `,
    }),
  );
  moon.position.set(0, -16500, 0);
  moon.rotation.set(0.5, 0.3, 0);
  scene.add(moon);
  return moon;
}

/** The rubble field is this wide, and wraps round the ship, so there's always more ahead. */
const FIELD = new THREE.Vector3(3600, 1100, 3600);
const GRIT_FIELD = 170;

const wrap = (value: number, centre: number, size: number) => centre + THREE.MathUtils.euclideanModulo(value - centre + size / 2, size) - size / 2;

type Rock = { rocks: THREE.InstancedMesh; index: number; at: THREE.Vector3; size: number; reach: number; axis: THREE.Vector3; spin: number; turn: THREE.Quaternion; gone: boolean };

/**
 * Rubble from some old impact, hanging in orbit, with a fine grit close in: it's what shows how
 * fast the ship is going. Every rock turns, and every rock is solid.
 */
export class Debris {
  readonly group = new THREE.Group();
  private field: Rock[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private grit: THREE.Points;
  private gritAt: Float32Array;
  private gritHome: Float32Array;
  private holder = new THREE.Object3D();
  private step = new THREE.Quaternion();
  private spot = new THREE.Vector3();

  constructor(source: THREE.Object3D, small: boolean) {
    let seed = 90;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const shapes: THREE.Mesh[] = [];
    source.traverse((item) => {
      if (item instanceof THREE.Mesh) shapes.push(item);
    });
    const each = small ? 8 : 16;
    const shade = new THREE.Color();
    for (const shape of shapes) {
      shape.geometry.computeBoundingSphere();
      const reach = shape.geometry.boundingSphere?.radius ?? 1;
      const rocks = new THREE.InstancedMesh(shape.geometry, shape.material as THREE.Material, each);
      rocks.frustumCulled = false;
      rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let index = 0; index < each; index++) {
        const size = 1.5 + random() ** 7 * 44;
        const axis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
        const at = new THREE.Vector3((random() - 0.5) * FIELD.x, (random() - 0.5) * FIELD.y, (random() - 0.5) * FIELD.z);
        const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6.28, random() * 6.28, random() * 6.28));
        // A big one turns slowly: nothing has spun it up in a long time.
        this.field.push({ rocks, index, at, size, reach: reach * size, axis, spin: (0.04 + random() * 0.3) / (1 + size * 0.2), turn, gone: false });
        rocks.setColorAt(index, shade.setScalar(0.34 + random() * 0.16));
      }
      this.meshes.push(rocks);
      this.group.add(rocks);
    }

    const grains = small ? 120 : 320;
    this.gritHome = new Float32Array(grains * 3);
    for (let index = 0; index < this.gritHome.length; index++) this.gritHome[index] = (random() - 0.5) * GRIT_FIELD;
    this.gritAt = this.gritHome.slice();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.gritAt, 3).setUsage(THREE.DynamicDrawUsage));
    this.grit = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying float vNear;
          void main() {
            vec4 at = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * at;
            gl_PointSize = clamp(150.0 / -at.z, 1.2, 3.4);
            vNear = smoothstep(84.0, 40.0, -at.z);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vNear;
          void main() {
            float soft = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
            gl_FragColor = vec4(vec3(0.72, 0.7, 0.66), soft * vNear * 0.75);
          }
        `,
      }),
    );
    this.grit.frustumCulled = false;
    this.group.add(this.grit);
  }

  /** Moves the field along with the ship. Says where, if the ship has just hit something. */
  update(dt: number, ship: THREE.Vector3, shipReach: number) {
    let struck: THREE.Vector3 | null = null;
    const { holder, step, spot } = this;
    for (const rock of this.field) {
      step.setFromAxisAngle(rock.axis, rock.spin * dt);
      rock.turn.premultiply(step);
      spot.set(wrap(rock.at.x, ship.x, FIELD.x), wrap(rock.at.y, ship.y, FIELD.y), wrap(rock.at.z, ship.z, FIELD.z));
      // One that's been smashed stays gone until the field brings it round again, out of sight.
      if (rock.gone && spot.distanceTo(ship) > 1400) rock.gone = false;
      if (!rock.gone && spot.distanceTo(ship) < rock.reach * 0.8 + shipReach) {
        rock.gone = true;
        struck = spot.clone();
      }
      holder.position.copy(spot);
      holder.quaternion.copy(rock.turn);
      holder.scale.setScalar(rock.gone ? 0 : rock.size);
      holder.updateMatrix();
      rock.rocks.setMatrixAt(rock.index, holder.matrix);
    }
    for (const rocks of this.meshes) rocks.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < this.gritAt.length; index += 3) {
      this.gritAt[index] = wrap(this.gritHome[index], ship.x, GRIT_FIELD);
      this.gritAt[index + 1] = wrap(this.gritHome[index + 1], ship.y, GRIT_FIELD);
      this.gritAt[index + 2] = wrap(this.gritHome[index + 2], ship.z, GRIT_FIELD);
    }
    this.grit.geometry.attributes.position.needsUpdate = true;
    return struck;
  }
}

/** A scatter of scanned rocks: few and large on the plain, none on the pad. */
export function scatterRocks(source: THREE.Object3D, group: THREE.Group, ground: Ground, small: boolean, keepClear: THREE.Vector3[]) {
  let seed = 2090;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const meshes: THREE.Mesh[] = [];
  source.traverse((item) => {
    if (item instanceof THREE.Mesh) meshes.push(item);
  });
  const each = small ? 22 : 70;
  const holder = new THREE.Object3D();
  for (const mesh of meshes) {
    const scattered = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, each);
    scattered.castShadow = true;
    scattered.receiveShadow = true;
    scattered.frustumCulled = false;
    for (let index = 0; index < each; index++) {
      let x = 0;
      let z = 0;
      do {
        const turn = random() * Math.PI * 2;
        const far = 24 + random() ** 0.7 * 340;
        x = Math.cos(turn) * far;
        z = Math.sin(turn) * far;
      } while (keepClear.some((point) => Math.hypot(point.x - x, point.z - z) < 62));
      // Rock sizes follow the same law as craters: mostly small, the odd boulder.
      const size = 0.35 + random() ** 5 * 3.4;
      holder.position.set(x, ground.surfaceAt(x, z) + size * 0.16, z);
      holder.rotation.set(random() * 6.28, random() * 6.28, random() * 6.28);
      holder.scale.setScalar(size);
      holder.updateMatrix();
      scattered.setMatrixAt(index, holder.matrix);
    }
    group.add(scattered);
  }
}

import * as THREE from "three";

import { GRAVITY } from "./robot";

/*
 * Everything that gets thrown about. There's no air on the Moon, so dust doesn't billow or hang:
 * each grain flies in a clean arc and comes straight back down. That one fact is most of what
 * makes footage from the surface look unlike anywhere else, so the particles do exactly that,
 * worked out on the GPU from where and when they were thrown.
 */

const PARTICLE_VERTEX = /* glsl */ `
  attribute vec3 velocity;
  attribute vec3 birth;
  uniform float now;
  uniform float gravity;
  uniform float scale;
  varying float age;
  varying float heat;
  void main() {
    float t = now - birth.x;
    age = clamp(t / birth.y, 0.0, 1.0);
    heat = 1.0 - age;
    vec3 at = position + velocity * t;
    at.y -= 0.5 * gravity * t * t;
    vec4 view = viewMatrix * vec4(at, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = t < 0.0 || t > birth.y ? 0.0 : birth.z * scale / -view.z;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  varying float age;
  void main() {
    float round = length(gl_PointCoord - 0.5) * 2.0;
    float soft = smoothstep(1.0, 0.25, round);
    float fade = (1.0 - age) * smoothstep(0.0, 0.05, age);
    gl_FragColor = vec4(vec3(0.34, 0.31, 0.27), soft * fade * 0.5);
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  varying float heat;
  void main() {
    float round = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(1.0, 0.0, round);
    vec3 colour = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.86, 0.6), heat) * 9.0 * heat;
    gl_FragColor = vec4(colour * core, core);
  }
`;

class Particles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: THREE.BufferAttribute;
  private readonly velocities: THREE.BufferAttribute;
  private readonly births: THREE.BufferAttribute;
  private next = 0;

  constructor(
    private readonly count: number,
    fragmentShader: string,
    blending: THREE.Blending,
    gravity: number,
  ) {
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.velocities = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.births = new THREE.BufferAttribute(new Float32Array(count * 3).fill(-100), 3);
    for (const attribute of [this.positions, this.velocities, this.births]) attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", this.positions);
    geometry.setAttribute("velocity", this.velocities);
    geometry.setAttribute("birth", this.births);
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader,
      uniforms: { now: { value: 0 }, gravity: { value: gravity }, scale: { value: 900 } },
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, now: number, life: number, size: number) {
    const index = this.next;
    this.next = (index + 1) % this.count;
    this.positions.setXYZ(index, x, y, z);
    this.velocities.setXYZ(index, vx, vy, vz);
    this.births.setXYZ(index, now, life, size);
    this.positions.needsUpdate = true;
    this.velocities.needsUpdate = true;
    this.births.needsUpdate = true;
  }

  tick(now: number, scale: number) {
    this.material.uniforms.now.value = now;
    this.material.uniforms.scale.value = scale;
  }
}

/** A sole's print, pressed into the dust. Drawn once on a canvas, then stamped everywhere. */
function printTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.clearRect(0, 0, 128, 256);
  for (let lug = 0; lug < 9; lug++) {
    const y = 16 + lug * 25;
    const width = lug < 2 ? 76 : 100;
    context.fillStyle = "rgba(0,0,0,0.92)";
    context.fillRect(64 - width / 2, y, width, 12);
    context.fillStyle = "rgba(255,255,255,0.16)";
    context.fillRect(64 - width / 2, y + 12, width, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const MOST_PRINTS = 260;
const holder = new THREE.Object3D();
const flat = new THREE.Vector3(0, 1, 0);

export class Effects {
  readonly group = new THREE.Group();
  private readonly dust: Particles;
  private readonly sparks: Particles;
  private readonly debris: Particles;
  private readonly prints: THREE.InstancedMesh;
  private nextPrint = 0;
  private now = 0;
  private scale = 900;

  constructor(small: boolean) {
    this.dust = new Particles(small ? 2500 : 7000, DUST_FRAGMENT, THREE.NormalBlending, GRAVITY);
    this.sparks = new Particles(1400, SPARK_FRAGMENT, THREE.AdditiveBlending, GRAVITY);
    // In orbit nothing falls: whatever's thrown just keeps going.
    this.debris = new Particles(2600, SPARK_FRAGMENT, THREE.AdditiveBlending, 0);
    this.prints = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.62, 1.12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: printTexture(), transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      MOST_PRINTS,
    );
    this.prints.frustumCulled = false;
    holder.scale.setScalar(0);
    holder.updateMatrix();
    for (let index = 0; index < MOST_PRINTS; index++) this.prints.setMatrixAt(index, holder.matrix);
    this.group.add(this.prints, this.dust.points, this.sparks.points, this.debris.points);
  }

  /** A spray of soil: fast and flat from a kick, high from a blast. */
  kick(at: THREE.Vector3, strength: number, spread = 1) {
    const count = Math.floor(14 + strength * 34);
    for (let index = 0; index < count; index++) {
      const turn = Math.random() * Math.PI * 2;
      const out = (0.4 + Math.random() * 2.4) * strength * spread;
      const rise = (0.3 + Math.random() * 1.6) * strength;
      this.dust.emit(
        at.x + (Math.random() - 0.5) * 0.6,
        at.y - 0.42,
        at.z + (Math.random() - 0.5) * 0.6,
        Math.cos(turn) * out,
        rise,
        Math.sin(turn) * out,
        this.now,
        0.5 + (rise / 2.5) * 1.4 + Math.random() * 0.4,
        0.08 + Math.random() * 0.2,
      );
    }
  }

  /** Metal on metal: white-hot grains that cool as they fall. */
  strike(at: THREE.Vector3, strength: number) {
    const count = Math.floor(30 + strength * 5);
    for (let index = 0; index < count; index++) {
      const way = new THREE.Vector3().randomDirection();
      const fast = 2 + Math.random() * 9;
      this.sparks.emit(at.x, at.y, at.z, way.x * fast, way.y * fast + 1.5, way.z * fast, this.now, 0.3 + Math.random() * 0.9, 0.02 + Math.random() * 0.035);
    }
  }

  /** A ship coming apart: a hot ball that's gone in a moment, and fragments that aren't. */
  blast(at: THREE.Vector3, size: number) {
    for (let index = 0; index < 340; index++) {
      const way = new THREE.Vector3().randomDirection();
      const fast = (20 + Math.random() ** 2 * 170) * size;
      this.debris.emit(at.x, at.y, at.z, way.x * fast, way.y * fast, way.z * fast, this.now, 0.5 + Math.random() * 2.4, (0.5 + Math.random() * 3) * size);
    }
  }

  /** Rounds hitting armour: a short spit of sparks. */
  hit(at: THREE.Vector3) {
    for (let index = 0; index < 14; index++) {
      const way = new THREE.Vector3().randomDirection();
      const fast = 30 + Math.random() * 60;
      this.debris.emit(at.x, at.y, at.z, way.x * fast, way.y * fast, way.z * fast, this.now, 0.2 + Math.random() * 0.4, 0.6);
    }
  }

  /** A footprint, which stays: nothing on the Moon will ever fill it in. */
  press(at: THREE.Vector3, yaw: number, normal: THREE.Vector3) {
    holder.position.copy(at);
    holder.position.y -= 0.41;
    holder.quaternion.setFromUnitVectors(flat, normal);
    holder.rotateY(yaw);
    holder.scale.setScalar(1);
    holder.updateMatrix();
    this.prints.setMatrixAt(this.nextPrint, holder.matrix);
    this.prints.instanceMatrix.needsUpdate = true;
    this.nextPrint = (this.nextPrint + 1) % MOST_PRINTS;
  }

  tick(dt: number, height: number, fov: number) {
    this.now += dt;
    this.scale = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.dust.tick(this.now, this.scale);
    this.sparks.tick(this.now, this.scale);
    this.debris.tick(this.now, this.scale);
  }
}

/** The Heron's two engines: blue-white plumes that lengthen with the throttle. */
export function makeEngines(ship: THREE.Object3D) {
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      uniform float power;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 at = position;
        at.z *= 0.5 + power;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float power;
      varying vec2 vUv;
      void main() {
        float along = clamp(vUv.y, 0.0, 1.0);
        float core = along * along * power;
        gl_FragColor = vec4(vec3(0.42, 0.66, 1.0) * core * 12.0 + vec3(1.0) * along * along * along * along * power * 16.0, core);
      }
    `,
    uniforms: { power: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shape = new THREE.ConeGeometry(0.76, 11, 22, 1, true).translate(0, -5.5, 0).rotateX(Math.PI / 2).rotateY(0);
  shape.rotateX(Math.PI);
  shape.rotateX(Math.PI);
  for (const x of [-7, 7]) {
    const plume = new THREE.Mesh(shape, material);
    plume.position.set(x, 3.4, -13.76);
    plume.frustumCulled = false;
    ship.add(plume);
  }
  return material.uniforms.power;
}

/** A robot's two jets: a cone of hot gas, nearly invisible in vacuum except at the nozzle. */
export function makeJets(chest: THREE.Object3D) {
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float power;
      varying vec2 vUv;
      void main() {
        float along = clamp(vUv.y, 0.0, 1.0);
        float core = along * along * sqrt(along) * power;
        float throat = along * along;
        throat = throat * throat * throat * throat;
        gl_FragColor = vec4(vec3(0.5, 0.75, 1.0) * core * 7.0 + vec3(1.0, 0.8, 0.6) * throat * power * 10.0, core);
      }
    `,
    uniforms: { power: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shape = new THREE.ConeGeometry(0.2, 2.2, 18, 1, true).translate(0, -1.1, 0).rotateX(Math.PI);
  shape.rotateX(Math.PI);
  for (const x of [-0.26, 0.26]) {
    const jet = new THREE.Mesh(shape, material);
    jet.position.set(x, -0.2, -0.82);
    chest.add(jet);
  }
  return material.uniforms.power;
}

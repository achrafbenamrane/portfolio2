"use client";

/*
 * Same exemption as vision/character.tsx, for the same reason: `useFrame` is a
 * callback the React Compiler's lint rules read as running during render, and
 * moving three.js objects every frame is how R3F is meant to be driven.
 */
/* eslint-disable react-hooks/immutability */

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { PIZZA_MAP } from "@/content/pizza";

/** Where the fire is, in the scene: scripts/blender/build_oven.py's FIRE, turned Y-up. */
const FIRE = new THREE.Vector3(-0.42, 0, -0.62);

const FLAME_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float time;
  uniform float seed;
  uniform float still;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amount = 0.5;
    for (int i = 0; i < 5; i++) {
      total += amount * noise(p);
      p = p * 2.03 + 11.7;
      amount *= 0.5;
    }
    return total;
  }

  void main() {
    float t = time * (1.0 - still);
    vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);

    // Air rushes up the middle and pulls the flame in, and it tears apart as it climbs.
    float climb = t * 1.25 + seed * 9.0;
    float sway = (fbm(vec2(p.y * 1.6 - climb * 0.6, seed * 3.0)) - 0.5) * 0.9 * p.y;
    vec2 q = vec2((p.x + sway) * 2.4, p.y * 2.1 - climb);
    float body = fbm(q + fbm(q * 1.4 + 3.1) * 0.9);

    // Wide at the foot, gone by the top.
    float width = mix(0.86, 0.04, pow(p.y, 0.72));
    float inside = 1.0 - smoothstep(width * 0.45, width, abs(p.x + sway));
    float fade = 1.0 - smoothstep(0.42, 1.0, p.y);
    float flame = inside * fade * smoothstep(0.26 + p.y * 0.42, 0.62 + p.y * 0.3, body + 0.2);
    flame *= smoothstep(0.0, 0.05, p.y);

    // Hot at the core, and redder as it cools.
    vec3 colour = mix(vec3(1.0, 0.1, 0.01), vec3(1.0, 0.42, 0.06), smoothstep(0.1, 0.5, flame));
    colour = mix(colour, vec3(1.0, 0.82, 0.46), smoothstep(0.55, 0.95, flame));
    gl_FragColor = vec4(colour * flame * (0.4 + 0.56 * flame), 1.0);
  }
`;

const SPARK_VERTEX = /* glsl */ `
  attribute float seed;
  uniform float time;
  uniform float still;
  varying float glow;

  void main() {
    float life = fract(seed * 7.3 + time * (0.22 + seed * 0.2) * (1.0 - still));
    vec3 at = position;
    at.y += life * (0.3 + seed * 0.2);
    at.x += sin(life * 8.0 + seed * 40.0) * 0.05 * life + life * 0.12;
    at.z += cos(life * 6.0 + seed * 31.0) * 0.04 * life + life * 0.1;
    glow = (1.0 - life) * smoothstep(0.0, 0.08, life);
    vec4 view = modelViewMatrix * vec4(at, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (1.4 + seed * 2.6) * glow * 5.0 / max(-view.z, 0.2);
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  varying float glow;
  void main() {
    float round = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vec3(1.0, 0.5, 0.12) * round * glow * 7.0, 1.0);
  }
`;

/** A flame on a flat card, turned to the camera by whoever owns it. */
export function makeFlame(time: { value: number }, still: { value: number }, seed: number) {
  return new THREE.ShaderMaterial({
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    uniforms: { time, still, seed: { value: seed } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

const FLAMES = [
  { x: -0.14, z: 0.05, width: 0.34, height: 0.42 },
  { x: 0.02, z: 0.08, width: 0.42, height: 0.52 },
  { x: 0.16, z: 0.03, width: 0.32, height: 0.38 },
  { x: 0.28, z: 0.0, width: 0.26, height: 0.3 },
  { x: -0.04, z: -0.04, width: 0.5, height: 0.6 },
];

const SPARKS = 90;

/** The same scatter every time, so a render stays pure. */
const scatter = (number: number) => {
  const wave = Math.sin(number * 12.9898) * 43758.5453;
  return wave - Math.floor(wave);
};

function bakedMaterial(texture: THREE.Texture) {
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}

/**
 * The inside of the oven. Its light is baked, and the fire itself is drawn live, because
 * it's the fire moving that makes it a fire: the brick, the floor and the pizza all follow
 * one flicker, so they read as lit by it.
 */
export default function OvenFire({
  flicker,
  reducedMotion,
}: {
  /** Written here every frame, for the pizza and the light to follow. */
  flicker: { value: number };
  reducedMotion: boolean;
}) {
  const { nodes } = useGLTF("/pizza/oven.glb");
  const [dome, floor, bed] = useTexture(["/pizza/oven-dome.webp", "/pizza/oven-floor.webp", "/pizza/oven-bed.webp"]);

  const parts = useMemo(() => {
    const materials = [bakedMaterial(dome), bakedMaterial(floor), bakedMaterial(bed)];
    const meshes = ["Dome", "Floor", "Bed"].map((name, index) => {
      const mesh = new THREE.Mesh((nodes[name] as THREE.Mesh).geometry, materials[index]);
      const source = nodes[name];
      mesh.position.copy(source.position);
      mesh.quaternion.copy(source.quaternion);
      mesh.scale.copy(source.scale);
      return mesh;
    });
    return { materials, meshes };
  }, [nodes, dome, floor, bed]);

  const time = useMemo(() => ({ value: 0 }), []);
  const still = useMemo(() => ({ value: reducedMotion ? 1 : 0 }), [reducedMotion]);

  const flames = useMemo(
    () =>
      FLAMES.map((_, index) => makeFlame(time, still, index * 0.37 + 0.13)),
    [time, still],
  );

  const sparks = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const places = new Float32Array(SPARKS * 3);
    const seeds = new Float32Array(SPARKS);
    for (let index = 0; index < SPARKS; index++) {
      places[index * 3] = FIRE.x + (scatter(index + 1) - 0.5) * 0.4;
      places[index * 3 + 1] = 0.06 + scatter(index + 101) * 0.1;
      places[index * 3 + 2] = FIRE.z + (scatter(index + 201) - 0.5) * 0.26;
      seeds[index] = scatter(index + 301);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(places, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      uniforms: { time, still },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return new THREE.Points(geometry, material);
  }, [time, still]);

  const group = useRef<THREE.Group>(null);
  const planes = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ camera }, delta) => {
    time.value += Math.min(delta, 0.05);
    const t = time.value;

    // A slow breath, with quicker catches on top of it.
    const wave = reducedMotion
      ? 0
      : Math.sin(t * 7.1) * 0.05 + Math.sin(t * 13.7 + 1.3) * 0.04 + Math.sin(t * 2.3) * 0.08;
    flicker.value = 1 + wave;

    const light = PIZZA_MAP.beautyRange * (1 + wave * 0.9);
    for (const material of parts.materials) material.color.setScalar(light);

    // Flames turn to face the camera, around the upright only.
    for (const plane of planes.current) {
      if (plane) plane.rotation.y = Math.atan2(camera.position.x - plane.position.x, camera.position.z - plane.position.z);
    }
  });

  return (
    <group ref={group}>
      {parts.meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      {FLAMES.map((flame, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            planes.current[index] = mesh;
          }}
          position={[FIRE.x + flame.x, flame.height / 2 + 0.02, FIRE.z + flame.z]}
          material={flames[index]}
          renderOrder={3}
        >
          <planeGeometry args={[flame.width, flame.height]} />
        </mesh>
      ))}
      <primitive object={sparks} renderOrder={4} />
    </group>
  );
}

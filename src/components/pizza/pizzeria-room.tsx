"use client";

/*
 * Same exemption as vision/character.tsx, for the same reason: `useFrame` is a
 * callback the React Compiler's lint rules read as running during render, and
 * moving three.js objects every frame is how R3F is meant to be driven.
 */
/* eslint-disable react-hooks/immutability */

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import { PIZZA_MAP } from "@/content/pizza";
import FILM from "@/content/pizza-film.json";
import layout from "@/content/pizzeria-layout.json";

import { makeFlame } from "./oven-fire";

/** The restaurant stands off to one side of the scene: the bench and the oven are at the origin. */
export const ROOM_AT = new THREE.Vector3(40, 0, 0);

/** Blender's Z-up metres, in the scene. */
export const inRoom = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y).add(ROOM_AT);

/** Baked light against the page's film: set by eye against the reference render. */
const ROOM_GAIN = 1.02;

const mouth = layout.ovenMouth;

function baked(texture: THREE.Texture) {
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
  material.color.setScalar(PIZZA_MAP.beautyRange * ROOM_GAIN);
  return material;
}

/** The restaurant: everything but the people is baked, and the fire moves in the oven's mouth. */
export function PizzeriaShell({ flicker, reducedMotion }: { flicker: { value: number }; reducedMotion: boolean }) {
  const { nodes } = useGLTF("/pizza/pizzeria.glb");
  const maps = useTexture([
    "/pizza/room-floor.webp",
    "/pizza/room-walls.webp",
    "/pizza/room-props.webp",
    "/pizza/room-hero.webp",
    "/pizza/room-oven.webp",
  ]);

  const meshes = useMemo(
    () =>
      ["Floor", "Walls", "Props", "Hero", "Oven"].map((name, index) => {
        const source = nodes[name];
        const mesh = new THREE.Mesh((source as THREE.Mesh).geometry, baked(maps[index]));
        mesh.position.copy(source.position);
        mesh.quaternion.copy(source.quaternion);
        mesh.scale.copy(source.scale);
        return mesh;
      }),
    [nodes, maps],
  );

  const time = useMemo(() => ({ value: 0 }), []);
  const still = useMemo(() => ({ value: reducedMotion ? 1 : 0 }), [reducedMotion]);
  const flames = useMemo(() => [makeFlame(time, still, 0.2), makeFlame(time, still, 0.71)], [time, still]);

  useFrame((_, delta) => {
    time.value += Math.min(delta, 0.05);
    const oven = meshes[4].material as THREE.MeshBasicMaterial;
    oven.color.setScalar(PIZZA_MAP.beautyRange * ROOM_GAIN * (0.97 + (flicker.value - 1) * 0.5));
  });

  const flameAt = inRoom(mouth.x, mouth.y - 0.06, mouth.z + 0.16).sub(ROOM_AT);

  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      {/* The sky outside the windows. */}
      <mesh position={[-layout.room.halfWidth - 2.4, 2, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[16, 8]} />
        <meshBasicMaterial color={new THREE.Color(1.5, 1.72, 1.95)} toneMapped={false} />
      </mesh>
      <mesh position={[flameAt.x - 0.1, flameAt.y, flameAt.z]} material={flames[0]} renderOrder={3}>
        <planeGeometry args={[0.42, 0.36]} />
      </mesh>
      <mesh position={[flameAt.x + 0.12, flameAt.y - 0.02, flameAt.z + 0.01]} material={flames[1]} renderOrder={3}>
        <planeGeometry args={[0.36, 0.3]} />
      </mesh>
    </>
  );
}

/**
 * The chef, seen from across the room: a cut-out of the same render as the films, stood up
 * where he works. Up close the film takes over, so he gives way to it.
 */
export function ChefCard({ plate }: { plate: { mix: number } }) {
  const picture = useTexture("/pizza/chef-card.webp");

  const { geometry, material } = useMemo(() => {
    const corners = FILM.card.corners.map(([x, y, z]) => inRoom(x, y, z).sub(ROOM_AT));
    const shape = new THREE.BufferGeometry().setFromPoints(corners);
    shape.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    shape.setIndex([0, 3, 1, 1, 3, 2]);
    picture.colorSpace = THREE.SRGBColorSpace;
    picture.anisotropy = 8;
    const card = new THREE.MeshBasicMaterial({
      map: picture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    card.color.setScalar(PIZZA_MAP.beautyRange * ROOM_GAIN);
    return { geometry: shape, material: card };
  }, [picture]);

  useFrame(() => {
    material.opacity = 1 - plate.mix;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

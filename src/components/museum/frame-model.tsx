"use client";

/*
 * Same exemption as vision/character.tsx: this runs in a render loop, and moving
 * three.js objects every frame is how R3F is meant to be driven.
 */
/* eslint-disable react-hooks/immutability */

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { type FrameSlug, MUSEUM_FRAMES, museumLayout } from "@/content/museum";

import {
  asBaked,
  asPicture,
  glassTexture,
  glowTexture,
  plateGeometry,
  reliefGeometry,
  SPREAD_OUT,
} from "./frame-parts";

const { frame, frames } = museumLayout;

export const FRAME_URL = "/museum/frame.glb";
export const FRAME_WOOD_URL = "/museum/bake/frame.webp";

export const frameLayerUrls = (slug: FrameSlug) => [
  `/museum/frames/${slug}-plate.webp`,
  `/museum/frames/${slug}-subject.webp`,
  `/museum/frames/${slug}-relief.webp`,
];

/** Dims anything drawn with it by how far along the hall it is. See Lights in the
 *  scene. Off everywhere but the hall. */
export type Sweep = { value: number };

export function sweptMaterial<T extends THREE.Material>(material: T, sweep: Sweep): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sweep = sweep;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vHallX;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvHallX = (modelMatrix * vec4(transformed, 1.0)).x;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float sweep;\nvarying float vHallX;")
      .replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\ngl_FragColor.rgb *= 1.0 - smoothstep(sweep - 3.2, sweep, vHallX);",
      );
  };
  return material;
}

/**
 * One ONEFRAME: the black box, its LED bar, the print at the back and the car standing
 * in front of it. Its origin is the middle of the back of the box, facing +Z.
 *
 * `spread` opens it: the subject comes forward out of the box, past the glass.
 */
export default function FrameModel({
  slug,
  sweep,
  spread,
  sheen,
  snap = false,
}: {
  slug: FrameSlug;
  sweep: Sweep;
  /**
   * Read every frame: 0 shut, 1 open. It must already hold the new value when this
   * component draws. The scene draws on demand, so a value written later in the same
   * frame is missed, and nothing asks for another.
   */
  spread: { readonly value: number };
  /** Read every frame: how far the glass's reflection has slid, -1..1. */
  sheen: { readonly value: number };
  /** Cut to open or shut instead of easing there, for reduced motion. */
  snap?: boolean;
}) {
  const { nodes } = useGLTF(FRAME_URL);
  const wood = useTexture(FRAME_WOOD_URL);
  const [plate, subject, relief] = useTexture(frameLayerUrls(slug));
  const invalidate = useThree((state) => state.invalidate);
  const index = MUSEUM_FRAMES.findIndex((item) => item.slug === slug);
  const place = frames[index];

  const box = useMemo(() => {
    const group = new THREE.Group();
    const parts: [string, THREE.Material][] = [
      ["Wood", sweptMaterial(new THREE.MeshBasicMaterial({ map: asBaked(wood) }), sweep)],
      ["Bar", sweptMaterial(new THREE.MeshBasicMaterial({ color: "#6d6f71" }), sweep)],
      ["Lamp", sweptMaterial(new THREE.MeshBasicMaterial({ color: "#fffaf2" }), sweep)],
    ];
    for (const [name, material] of parts) {
      group.add(new THREE.Mesh((nodes[name] as THREE.Mesh).geometry, material));
    }
    return group;
  }, [nodes, wood, sweep]);

  const plateMaterial = useMemo(
    () => sweptMaterial(new THREE.MeshBasicMaterial({ map: asPicture(plate) }), sweep),
    [plate, sweep],
  );
  const plateShape = useMemo(() => plateGeometry(), []);

  const subjectMaterial = useMemo(
    () =>
      sweptMaterial(
        new THREE.MeshBasicMaterial({ map: asPicture(subject), transparent: true, alphaTest: 0.03 }),
        sweep,
      ),
    [subject, sweep],
  );
  const subjectShape = useMemo(
    () => reliefGeometry(place.subject.width, place.subject.height, relief.image as HTMLImageElement, 0.1),
    [place, relief],
  );

  const glow = useMemo(() => glowTexture(), []);
  const glass = useMemo(() => glassTexture(), []);

  const standing = useRef<THREE.Mesh>(null);
  const pane = useRef<THREE.Mesh>(null);
  const shown = useRef(0);

  useFrame((_, delta) => {
    const goal = spread.value;
    shown.current = snap ? goal : THREE.MathUtils.damp(shown.current, goal, 5, delta);
    if (Math.abs(shown.current - goal) < 0.001) shown.current = goal;
    else invalidate();
    const open = shown.current;

    if (standing.current) {
      standing.current.position.z = -place.subject.y + open * SPREAD_OUT;
      const grow = 1 + open * 0.16;
      standing.current.scale.set(grow, grow, 1 + open * 1.6);
    }

    // The reflection on the glass slides against the head, and goes once it's open.
    glass.offset.x = 0.3 + sheen.value * 0.22 + index * 0.17;
    if (pane.current) {
      pane.current.visible = open < 0.5;
      (pane.current.material as THREE.MeshBasicMaterial).opacity = 0.05 * (1 - open * 2);
    }
  });

  return (
    <>
      <primitive object={box} />
      <mesh position={[0, 0, -frame.plateY]} geometry={plateShape} material={plateMaterial} />
      <mesh
        ref={standing}
        position={[place.subject.x, place.subject.z, -place.subject.y]}
        geometry={subjectShape}
        material={subjectMaterial}
        renderOrder={2}
      />
      {/* The LED's light in the air: it's what makes the bar look lit, not white. */}
      <mesh
        position={[-0.12, frame.openingHeight / 2 - 0.1, frame.depth - 0.03]}
        scale={[frame.openingWidth * 1.5, 0.52, 1]}
        renderOrder={3}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glow}
          color="#fff3e0"
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={pane} position={[0, 0, frame.depth - 0.012]} renderOrder={4}>
        <planeGeometry args={[frame.openingWidth, frame.openingHeight]} />
        <meshBasicMaterial
          map={glass}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

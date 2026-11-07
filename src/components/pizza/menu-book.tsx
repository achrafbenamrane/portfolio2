"use client";

import { useFrame } from "@react-three/fiber";
import { type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { MENU_PIZZAS } from "@/content/pizza";

import {
  drawPage,
  LEAVES,
  type MenuHotspot,
  PAGE_HIGH,
  PAGE_WIDE,
  type PageName,
  pageFonts,
} from "./menu-pages";

/** The book, in metres: a little bigger than a real menu, so it reads on a phone. */
const PAGE_W = 0.23;
const PAGE_H = (PAGE_W * PAGE_HIGH) / PAGE_WIDE;
const LEAF_GAP = 0.0016;

const LEAF_VERTEX = /* glsl */ `
  uniform float flip;
  uniform float curl;
  uniform float lift;
  uniform float width;
  varying vec2 vUv;
  varying vec3 vNormalUp;
  varying float vAlong;

  void main() {
    vUv = uv;
    float s = position.x;
    vAlong = s / width;

    // The sheet is a circular arc: it leaves the spine at one angle and arrives at another,
    // which is what a page does when it's turned by its edge.
    float start = flip * 3.14159265;
    float bend = curl / width;
    float end = start + bend * s;
    float x = abs(bend) < 0.001 ? s * cos(start) : (sin(end) - sin(start)) / bend;
    float y = abs(bend) < 0.001 ? s * sin(start) : (cos(start) - cos(end)) / bend;

    vNormalUp = normalize(vec3(-sin(end), cos(end), 0.0));
    vec3 at = vec3(x, y + lift, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
  }
`;

const LEAF_FRAGMENT = /* glsl */ `
  uniform sampler2D front;
  uniform sampler2D back;
  uniform vec3 lightFrom;
  uniform float brightness;
  varying vec2 vUv;
  varying vec3 vNormalUp;
  varying float vAlong;

  void main() {
    bool showingFront = gl_FrontFacing;
    vec2 uv = showingFront ? vUv : vec2(1.0 - vUv.x, vUv.y);
    vec3 paper = showingFront ? texture2D(front, uv).rgb : texture2D(back, uv).rgb;

    vec3 normal = showingFront ? vNormalUp : -vNormalUp;
    float light = 0.72 + 0.34 * max(dot(normal, lightFrom), 0.0);

    // The gutter: pages fall away into the spine, and it's darker in there.
    float gutter = smoothstep(0.0, 0.14, vAlong);
    light *= mix(0.46, 1.0, gutter);
    gl_FragColor = vec4(paper * light * brightness, 1.0);
  }
`;

function leafGeometry() {
  const geometry = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 28, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(PAGE_W / 2, 0, 0);
  return geometry;
}

function pageTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export type MenuBookProps = {
  /** 0 is shut; each step on turns one more leaf. */
  spread: number;
  chosenPizza: string | null;
  quantities: Record<string, number>;
  reducedMotion: boolean;
  onPress: (spot: MenuHotspot) => void;
  onOpen: () => void;
};

/**
 * The menu, as a book on the table. Every page is drawn to a canvas, so it can show what's
 * been ordered, and each leaf bends as it turns. The pages can be pressed where the
 * printing is, through flat stand-ins that lie where the open pages lie.
 */
export default function MenuBook({ spread, chosenPizza, quantities, reducedMotion, onPress, onOpen }: MenuBookProps) {
  const geometry = useMemo(() => leafGeometry(), []);
  const [fontsReady, setFontsReady] = useState(0);
  const [pictures, setPictures] = useState<Map<string, HTMLImageElement> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fonts = pageFonts();
    const loading = MENU_PIZZAS.map(
      (pizza) =>
        new Promise<[string, HTMLImageElement]>((resolve) => {
          const image = new Image();
          image.onload = () => resolve([pizza.id, image]);
          image.onerror = () => resolve([pizza.id, image]);
          image.src = `/pizza/menu-${pizza.id}.webp`;
        }),
    );
    Promise.all([
      Promise.all(loading),
      document.fonts.load(`60px ${fonts.serif}`),
      document.fonts.load(`italic 60px ${fonts.serif}`),
      document.fonts.load(`500 24px ${fonts.mono}`),
    ]).then(([images]) => {
      if (cancelled) return;
      setPictures(new Map(images));
      setFontsReady((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const canvases = useMemo(() => {
    const made = new Map<PageName, HTMLCanvasElement>();
    for (const [front, back] of LEAVES) {
      for (const name of [front, back]) {
        const canvas = document.createElement("canvas");
        canvas.width = PAGE_WIDE;
        canvas.height = PAGE_HIGH;
        made.set(name, canvas);
      }
    }
    return made;
  }, []);

  const textures = useMemo(() => {
    const made = new Map<PageName, THREE.CanvasTexture>();
    canvases.forEach((canvas, name) => made.set(name, pageTexture(canvas)));
    return made;
  }, [canvases]);

  const hotspots = useRef(new Map<PageName, MenuHotspot[]>());

  useEffect(() => {
    if (!pictures) return;
    const fonts = pageFonts();
    canvases.forEach((canvas, name) => {
      hotspots.current.set(name, drawPage(canvas, name, fonts, { pictures, chosenPizza, quantities }));
      const texture = textures.get(name);
      if (texture) texture.needsUpdate = true;
    });
  }, [canvases, textures, pictures, chosenPizza, quantities, fontsReady]);

  const leaves = useMemo(
    () =>
      LEAVES.map(([front, back], index) => ({
        material: new THREE.ShaderMaterial({
          vertexShader: LEAF_VERTEX,
          fragmentShader: LEAF_FRAGMENT,
          side: THREE.DoubleSide,
          toneMapped: false,
          uniforms: {
            front: { value: textures.get(front) },
            back: { value: textures.get(back) },
            flip: { value: 0 },
            curl: { value: 0 },
            lift: { value: (LEAVES.length - index) * LEAF_GAP },
            width: { value: PAGE_W },
            lightFrom: { value: new THREE.Vector3(-0.4, 0.86, 0.3).normalize() },
            brightness: { value: 1.25 },
          },
        }),
      })),
    [textures],
  );

  useEffect(
    () => () => {
      for (const leaf of leaves) leaf.material.dispose();
    },
    [leaves],
  );

  const body = useRef<THREE.Group>(null);
  const opening = useRef(0);

  useFrame((_, delta) => {
    const rate = reducedMotion ? 1 : 1 - Math.exp(-delta * 4.2);
    let flipped = 0;
    leaves.forEach((leaf, index) => {
      const u = leaf.material.uniforms;
      const goal = spread > index ? 1 : 0;
      u.flip.value += (goal - u.flip.value) * rate;
      if (Math.abs(goal - u.flip.value) < 0.002) u.flip.value = goal;
      u.curl.value = Math.sin(u.flip.value * Math.PI) * 0.95;
      // Whichever side a leaf lies on, the ones turned last lie on top.
      const count = LEAVES.length;
      const left = (index + 1) * LEAF_GAP;
      const right = (count - index) * LEAF_GAP;
      u.lift.value = left * u.flip.value + right * (1 - u.flip.value);
      flipped += u.flip.value;
    });

    // Shut, the book sits in the middle of the place; open, its spine does.
    opening.current = Math.min(flipped, 1);
    if (body.current) body.current.position.x = -PAGE_W / 2 * (1 - opening.current);
  });

  const pressAt = (name: PageName | null, event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!name || !event.uv) return;
    const u = event.uv.x;
    const v = 1 - event.uv.y;
    const spot = hotspots.current
      .get(name)
      ?.find((item) => u >= item.left && u <= item.right && v >= item.top && v <= item.bottom);
    if (spot) onPress(spot);
  };

  const hoverAt = (name: PageName | null, event: ThreeEvent<PointerEvent>) => {
    if (!name || !event.uv) return;
    const u = event.uv.x;
    const v = 1 - event.uv.y;
    const over = hotspots.current
      .get(name)
      ?.some((item) => u >= item.left && u <= item.right && v >= item.top && v <= item.bottom);
    document.body.style.cursor = over ? "pointer" : "";
  };

  const leftPage = spread > 0 ? LEAVES[spread - 1][1] : null;
  const rightPage = spread > 0 && spread < LEAVES.length ? LEAVES[spread][0] : null;

  return (
    <group ref={body}>
      {/* The boards under the pages. */}
      <mesh position={[PAGE_W / 2, -0.004, 0]}>
        <boxGeometry args={[PAGE_W + 0.008, 0.006, PAGE_H + 0.012]} />
        <meshBasicMaterial color="#0d2c1d" toneMapped={false} />
      </mesh>
      {spread > 0 && (
        <mesh position={[-PAGE_W / 2, -0.004, 0]}>
          <boxGeometry args={[PAGE_W + 0.008, 0.006, PAGE_H + 0.012]} />
          <meshBasicMaterial color="#0d2c1d" toneMapped={false} />
        </mesh>
      )}

      {leaves.map((leaf, index) => (
        <mesh key={index} geometry={geometry} material={leaf.material} frustumCulled={false} />
      ))}

      {/* What the pointer actually hits. */}
      {spread === 0 && (
        <mesh
          position={[PAGE_W / 2, 0.012, 0]}
          rotation-x={-Math.PI / 2}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <planeGeometry args={[PAGE_W, PAGE_H]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {spread > 0 && (
        <>
          <mesh
            position={[-PAGE_W / 2, 0.016, 0]}
            rotation-x={-Math.PI / 2}
            onClick={(event) => pressAt(leftPage, event)}
            onPointerMove={(event) => hoverAt(leftPage, event)}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          >
            <planeGeometry args={[PAGE_W, PAGE_H]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh
            position={[PAGE_W / 2, 0.016, 0]}
            rotation-x={-Math.PI / 2}
            onClick={(event) => pressAt(rightPage, event)}
            onPointerMove={(event) => hoverAt(rightPage, event)}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          >
            <planeGeometry args={[PAGE_W, PAGE_H]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

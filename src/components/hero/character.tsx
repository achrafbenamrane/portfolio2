"use client";

/*
 * `useFrame` is a third-party callback the React Compiler's lint rules don't
 * model — they read its body as running during render and flag every uniform
 * write. Mutating uniforms per frame is exactly how R3F is meant to be driven,
 * and routing them through React instead would put a 60 Hz signal back into the
 * render path, which is the one thing this hero must not do. Scoped to this
 * file; nothing else in the codebase gets the exemption.
 */
/* eslint-disable react-hooks/immutability */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { HeroSignal } from "@/lib/vision/hero-signal";
import {
  buildPortraitGeometry,
  createMorphMaterial,
  loadHeroTextures,
} from "./portrait-morph";

function PortraitMesh({ signal }: { signal: HeroSignal }) {
  "use no memo";

  const geometry = useMemo(() => buildPortraitGeometry(), []);
  const material = useMemo(() => createMorphMaterial(), []);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let disposed = false;
    let loaded: THREE.Texture[] = [];

    loadHeroTextures(({ portrait, origami }) => {
      // The load is async and the component can unmount first — without this
      // guard a fast navigation leaks the textures and writes to dead uniforms.
      if (disposed) {
        portrait.dispose();
        origami.dispose();
        return;
      }
      loaded = [portrait, origami];
      material.uniforms.uPortrait.value = portrait;
      material.uniforms.uOrigami.value = origami;
      invalidate(); // on-demand loop won't redraw for a texture swap by itself
    });

    return () => {
      disposed = true;
      for (const texture of loaded) texture.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material, invalidate]);

  // Drives the on-demand render loop. While the portrait sits still this asks
  // for nothing and the GPU stays idle — the common case, since every visitor
  // without a camera sees a motionless image for their whole visit.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!signal.settled) invalidate();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [invalidate, signal]);

  // The mesh never moves. It sits square to camera and the fold happens
  // entirely in the vertex shader, so the only per-frame work is two uniforms.
  useFrame((state) => {
    // The signal arrives already damped — read it, never smooth it again, or
    // the two filters fight and the response goes soggy.
    material.uniforms.uMorph.value = 1 - signal.value;
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  // Two canvases, two fits. On a wide screen it is a tall column beside the
  // copy, and the portrait is held back from the edges so it does not crowd
  // the text; on a phone it is a short full-width band of its own, where the
  // same treatment leaves the subject small with a band of empty sky above
  // it — which reads as a gap in the page rather than as breathing room.
  const band = size.width > size.height;
  const scale = band ? 1 : Math.min(1, Math.max(0.6, size.width / 640));

  // Sat lower in the frame so the head clears the nav bar. Done here, in
  // world space, rather than by translating the canvas with CSS: the camera's
  // visible height is 3.22 world units, so a fixed offset is a fixed FRACTION
  // of the viewport — about 126px on a 900px screen — and scales with it
  // instead of being a pixel count that is right on one monitor. In the band
  // there is nothing overhead to clear, so it sits nearly centred.
  return (
    <mesh
      geometry={geometry}
      material={material}
      scale={scale}
      position={[0, band ? -0.08 : -0.45, 0]}
    />
  );
}

export default function Character({ signal }: { signal: HeroSignal }) {
  return (
    <Canvas
      // Capping DPR at 1.75 costs almost nothing on flat-shaded facets and
      // saves roughly 40% of the fill rate on a 3× phone.
      dpr={[1, 1.75]}
      // On-demand: frames are drawn only while the fold is actually moving.
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      style={{ pointerEvents: "none" }}
    >
      <PortraitMesh signal={signal} />
    </Canvas>
  );
}

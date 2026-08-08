"use client";

import dynamic from "next/dynamic";

import { useHeroSignal } from "./hero-signal-context";

/**
 * Three.js is ~150 KB gzipped — more than the rest of the site combined. Kept
 * out of the initial bundle so the hero's text paints from server HTML while
 * the canvas streams in behind it.
 */
const Character = dynamic(() => import("./character"), { ssr: false });

export default function HeroCanvas() {
  const signal = useHeroSignal();

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-full lg:w-[56%]">
      <Character signal={signal} />
    </div>
  );
}

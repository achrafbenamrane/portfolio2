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
      {/* A wide, soft pool behind the subject. The portrait is a cut-out of a
          man in a black suit: on the old near-white page it separated on its
          own, but against this ground the shoulders merge into the
          background. Lifting the area behind him is what keeps the silhouette
          readable without putting a hard edge or a box around him. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 55% 45%, rgba(79,211,230,0.18) 0%, rgba(15,90,109,0.12) 45%, transparent 72%)",
        }}
      />
      <Character signal={signal} />
    </div>
  );
}

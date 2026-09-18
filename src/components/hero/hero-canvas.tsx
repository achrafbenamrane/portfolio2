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

  // Full height, untransformed. The portrait's vertical placement is set in
  // world space inside Character — see the mesh position there — because a
  // CSS transform on this box was the kind of change a cached stylesheet can
  // hide, and because shortening the box instead shrinks the render: the
  // camera's field of view is vertical, so size follows canvas height.
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-full lg:w-[56%]">
      {/* A soft pool behind the subject. The portrait is a cut-out of a man in
          a black suit: on a white page it separated on its own, but against
          this blue the shoulders merge into the background. Lifting the area
          behind him keeps the silhouette readable without a hard edge. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 50% at 52% 46%, rgba(124,196,240,0.22) 0%, rgba(27,74,120,0.16) 45%, transparent 72%)",
        }}
      />
      <Character signal={signal} />
    </div>
  );
}

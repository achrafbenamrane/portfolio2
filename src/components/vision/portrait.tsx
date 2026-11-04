"use client";

import dynamic from "next/dynamic";

import { useVisionSignal } from "./vision-signal";

/**
 * Three.js is ~150 KB gzipped. Kept out of the initial bundle, so whatever
 * the portrait sits in paints from server HTML while the canvas streams in.
 */
const Character = dynamic(() => import("./character"), { ssr: false });

/** The live portrait — the photograph that folds into paper as a hand
 *  closes in front of the camera — sized by its container. Until `live`,
 *  only the box: it holds its place in the page while three.js waits. */
export default function Portrait({
  className = "",
  live = true,
}: {
  className?: string;
  live?: boolean;
}) {
  const signal = useVisionSignal();

  return (
    <div className={`pointer-events-none relative ${className}`}>
      {/* A soft pool behind the subject. The portrait is a cut-out of a man
          in a black suit, and against red the shoulders merge into the
          background; lifting the area behind him keeps the silhouette
          readable without a hard edge. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 50% at 52% 46%, rgba(255,150,140,0.22) 0%, rgba(184,26,51,0.16) 45%, transparent 72%)",
        }}
      />
      {live && <Character signal={signal} />}
    </div>
  );
}

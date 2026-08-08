"use client";

import { useCallback, useEffect, useRef } from "react";

import { useAimTarget } from "./desktop-pointer";

/**
 * macOS dock.
 *
 * Magnification is a raised-cosine (Hann) window, which is what the real dock
 * uses — it reaches zero gradient at both ends of its influence radius, so
 * neighbouring tiles ease in instead of kinking the way the common linear-tent
 * clones do.
 *
 *   size(d) = TILE + (MAX − TILE) · (1 + cos(π·d/R)) / 2,  |d| ≤ R
 *
 * Sizes are written straight to the DOM from a rAF loop rather than through
 * React, matching the rule the rest of this codebase follows for anything that
 * changes at pointer rate.
 */

const TILE = 36;
const MAX = 64;
const RADIUS = 2.75 * TILE;

export interface DockApp {
  id: string;
  label: string;
  icon: React.ReactNode;
  onOpen: () => void;
  tint: string;
}

export default function Dock({ apps }: { apps: readonly DockApp[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const pointerX = useRef<number | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    let raf = 0;
    const tiles = Array.from(
      rail.querySelectorAll<HTMLElement>("[data-tile]"),
    );

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cursor = pointerX.current;

      for (const tile of tiles) {
        let size = TILE;
        if (cursor !== null) {
          const centre = tile.offsetLeft + tile.offsetWidth / 2;
          const d = cursor - centre;
          if (Math.abs(d) < RADIUS) {
            size =
              TILE +
              (MAX - TILE) * 0.5 * (1 + Math.cos((Math.PI * d) / RADIUS));
          }
        }
        // Damped toward the target so the bulge trails the cursor slightly
        // instead of snapping, without needing a spring library.
        const current = parseFloat(tile.dataset.size ?? String(TILE));
        const next = current + (size - current) * 0.28;
        tile.dataset.size = String(next);
        tile.style.width = `${next}px`;
        tile.style.height = `${next}px`;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [apps]);

  const handleMove = useCallback((event: React.PointerEvent) => {
    const rail = railRef.current;
    if (!rail) return;
    pointerX.current = event.clientX - rail.getBoundingClientRect().left;
  }, []);

  return (
    <div className="dock-shell">
      <div
        ref={railRef}
        className="dock-rail"
        onPointerMove={handleMove}
        onPointerLeave={() => {
          pointerX.current = null;
        }}
      >
        {apps.map((app) => (
          <DockTile key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}

function DockTile({ app }: { app: DockApp }) {
  const ref = useAimTarget<HTMLButtonElement>(`dock:${app.id}`, app.onOpen);

  return (
    <button
      ref={ref}
      type="button"
      data-tile
      data-size={TILE}
      onClick={app.onOpen}
      className="dock-tile"
      style={{ width: TILE, height: TILE, background: app.tint }}
      aria-label={app.label}
      title={app.label}
    >
      <span className="dock-glyph">{app.icon}</span>
      <span className="dock-label">{app.label}</span>
    </button>
  );
}

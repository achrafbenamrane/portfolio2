"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import type { HeroSignal } from "@/lib/vision/hero-signal";
import { DESKTOP_CSS } from "./geometry";

/**
 * Finger pointer for the desktop overlaid on the monitor.
 *
 * Hit-testing is done against layout coordinates, not `getBoundingClientRect`.
 * The desktop is authored at a fixed size and scaled onto the glass, so client
 * rects come back in scaled page space and would have to be divided back out.
 * `offsetLeft` / `offsetTop` are pre-transform layout values in exactly the
 * coordinate system the pointer already speaks, so walking the offsetParent
 * chain is both cheaper and correct by construction.
 *
 * The cursor is strictly additive: every target is a real button or link with
 * its own handler, and the finger just invokes the same one. Nothing here is
 * reachable only by hand.
 */

interface Region {
  element: HTMLElement;
  activate: () => void;
}

/** Handlers receive their own element, so a target that needs its geometry —
 *  the folders, which animate out of their own rect — doesn't have to close
 *  over a ref that isn't declared yet. */
export type AimHandler<T extends HTMLElement> = (element: T) => void;

interface DesktopPointerValue {
  register: (id: string, region: Region | null) => void;
  /** Ref holding the id under the cursor, or null. Read in rAF, never state. */
  hoveredRef: React.RefObject<string | null>;
  /** Registers the scrollable surface a pinch-drag should move. */
  registerScroll: (element: HTMLElement | null) => void;
}

const DesktopPointerContext = createContext<DesktopPointerValue | null>(null);

/** Layout position relative to the desktop root, in authored CSS pixels. */
export function localRect(element: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

export function DesktopPointerProvider({
  signal,
  rootRef,
  cursorRef,
  enabled,
  children,
}: {
  signal: HeroSignal;
  rootRef: React.RefObject<HTMLDivElement | null>;
  cursorRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  children: ReactNode;
}) {
  const regions = useRef(new Map<string, Region>());
  const hoveredRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);

  const register = useCallback((id: string, region: Region | null) => {
    if (region) regions.current.set(id, region);
    else regions.current.delete(id);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let lastClick = signal.sensor.frame.clickCount;
    let lastHovered: string | null = null;
    let dragY: number | null = null;

    const tick = () => {
      raf = requestAnimationFrame(tick);

      const root = rootRef.current;
      const cursor = cursorRef.current;
      const frame = signal.sensor.frame;
      if (!root || !cursor) return;

      const tracking = signal.mode === "hand" && frame.hasHand;
      cursor.style.opacity = tracking ? "1" : "0";
      if (!tracking) {
        if (lastHovered) {
          regions.current.get(lastHovered)?.element.classList.remove("aimed");
          lastHovered = null;
          hoveredRef.current = null;
        }
        lastClick = frame.clickCount;
        return;
      }

      const px = frame.pointerX * DESKTOP_CSS.width;
      const py = frame.pointerY * DESKTOP_CSS.height;
      cursor.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${frame.pinching ? 0.7 : 1})`;

      // Pinch and drag to scroll, so long lists aren't mouse-only. Content
      // follows the hand rather than moving opposite it — the touch
      // convention, since you are grabbing the page itself.
      if (frame.pinching) {
        const surface = scrollRef.current;
        if (surface && dragY !== null) surface.scrollTop -= py - dragY;
        dragY = py;
      } else {
        dragY = null;
      }

      let found: string | null = null;
      for (const [id, region] of regions.current) {
        const r = localRect(region.element, root);
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
          found = id;
          break;
        }
      }

      if (found !== lastHovered) {
        if (lastHovered) {
          regions.current.get(lastHovered)?.element.classList.remove("aimed");
        }
        if (found) regions.current.get(found)?.element.classList.add("aimed");
        lastHovered = found;
        hoveredRef.current = found;
      }

      // Diffing a monotonic counter rather than consuming a flag means the
      // pointer and any other observer can both see the same click.
      if (frame.clickCount !== lastClick) {
        lastClick = frame.clickCount;
        if (found) regions.current.get(found)?.activate();
      }
    };

    raf = requestAnimationFrame(tick);
    const registry = regions.current;
    return () => {
      cancelAnimationFrame(raf);
      for (const region of registry.values()) {
        region.element.classList.remove("aimed");
      }
    };
  }, [enabled, signal, rootRef, cursorRef]);

  const registerScroll = useCallback((element: HTMLElement | null) => {
    scrollRef.current = element;
  }, []);

  const value = useMemo(
    () => ({ register, hoveredRef, registerScroll }),
    [register, registerScroll],
  );

  return (
    <DesktopPointerContext.Provider value={value}>
      {children}
    </DesktopPointerContext.Provider>
  );
}

/**
 * Attach the returned ref to any element the finger should be able to press.
 * `activate` must be the same handler the mouse uses.
 */
export function useAimTarget<T extends HTMLElement>(
  id: string,
  activate: AimHandler<T>,
) {
  const context = useContext(DesktopPointerContext);
  const ref = useRef<T>(null);
  const activateRef = useRef(activate);

  // Written in an effect rather than during render: a ref write in the render
  // body is exactly what the compiler's rules-of-refs check forbids.
  useEffect(() => {
    activateRef.current = activate;
  });

  useEffect(() => {
    const element = ref.current;
    if (!context || !element) return;
    context.register(id, {
      element,
      activate: () => activateRef.current(element),
    });
    return () => context.register(id, null);
  }, [context, id]);

  return ref;
}

/** Marks the surface a pinch-drag scrolls. Only one is active at a time.
 *  Goes through a callback rather than writing to a ref reached via context —
 *  the provider owns that ref, and reaching in to mutate it is exactly what the
 *  compiler rules forbid. */
export function useScrollSurface<T extends HTMLElement>() {
  const context = useContext(DesktopPointerContext);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!context) return;
    context.registerScroll(ref.current);
    return () => context.registerScroll(null);
  }, [context]);

  return ref;
}

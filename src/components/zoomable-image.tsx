"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Rect = { left: number; top: number; width: number; height: number };

export type ZoomableSource = {
  src: string;
  width: number;
  height: number;
};

/**
 * An image that opens large when you want it: rest the mouse on it and it
 * lifts out to the centre of the page; move away from it, click beside it,
 * scroll, or press Escape and it flies back to where it came from.
 *
 * Just the image and its behaviour — the frame, caption or card around it
 * is the caller's, which is what lets a photograph on the experience page
 * and a certificate on the credentials page share one implementation.
 *
 * The large view is the bare image — no frame, no caption — over a dimmed
 * page. It opens and closes as one motion from and to the card (a FLIP:
 * lay the big image out where it will end, start it transformed to where
 * the small one is, and release), so it reads as the card's own photo
 * growing rather than a second thing appearing.
 *
 * Hover-to-open needs care or it misfires. Two rules keep it honest: the
 * pointer has to rest on the card for a moment before anything opens, so
 * scrolling past a card does nothing; and once open, heading *for* the
 * big image never closes it — only going anywhere else for long enough,
 * or leaving it after having reached it. Touch has no hover, so there a
 * tap opens and a tap beside the image closes.
 */

const HOVER_INTENT_MS = 160;
/** How much movement that is not towards the image closes it. */
const OFF_COURSE_PX = 140;
const OPEN_MS = 380;
const CLOSE_MS = 300;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Where the large image sits: fitted to the viewport, centred. */
function fitToViewport(width: number, height: number): Rect {
  const maxW = Math.min(window.innerWidth * 0.9, 1100);
  const maxH = window.innerHeight * 0.86;
  const scale = Math.min(maxW / width, maxH / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return {
    width: w,
    height: h,
    left: Math.round((window.innerWidth - w) / 2),
    top: Math.round((window.innerHeight - h) / 2),
  };
}

/** The transform that lays a box at `to` over a box at `from`. */
function transformBetween(from: Rect, to: Rect) {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${
    from.width / to.width
  }, ${from.height / to.height})`;
}

function inside(x: number, y: number, r: Rect) {
  return (
    x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height
  );
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * The lightbox itself, as a hook: `openFrom(element)` flies the image out
 * of that element's box, `overlay` is what to render, and the flight back
 * measures the element again, so it lands wherever the element is by then.
 * ZoomableImage is the common case (the element is the small image); the
 * certificate book opens from a page while a separate button is pressed.
 */
export function useLightbox(image: ZoomableSource, alt: string) {
  const origin = useRef<Element | null>(null);
  const big = useRef<HTMLImageElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  /** Pointer tracking while open: where it was, whether it has reached the
   *  big image, and how far it has moved in any direction but towards it. */
  const approach = useRef({ x: NaN, y: NaN, offCourse: 0, reached: false });

  const [view, setView] = useState<{ from: Rect; to: Rect } | null>(null);

  const openFrom = (el: Element) => {
    if (view) return;
    origin.current = el;
    approach.current = { x: NaN, y: NaN, offCourse: 0, reached: false };
    closing.current = false;
    setView({ from: rectOf(el), to: fitToViewport(image.width, image.height) });
  };

  const close = () => {
    const img = big.current;
    const dim = scrim.current;
    const el = origin.current;
    if (!view || !img || !dim || !el || closing.current) return;
    closing.current = true;
    // Measured again now — the page may have moved since it opened.
    const back = transformBetween(rectOf(el), view.to);
    const flight = img.animate(
      [{ transform: "none" }, { transform: back }],
      { duration: CLOSE_MS, easing: EASE, fill: "forwards" },
    );
    dim.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_MS,
      fill: "forwards",
    });
    flight.onfinish = () => {
      setView(null);
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    };
  };

  // Fly in from the origin once the large image is in the DOM.
  useEffect(() => {
    const img = big.current;
    const dim = scrim.current;
    if (!view || !img || !dim) return;
    img.animate(
      [{ transform: transformBetween(view.from, view.to) }, { transform: "none" }],
      { duration: OPEN_MS, easing: EASE, fill: "both" },
    );
    dim.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: OPEN_MS,
      fill: "both",
    });
    dim.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `close` is recreated each render but only reads refs and `view`,
    // which is this effect's dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const onMove = (e: React.PointerEvent) => {
    if (!view || e.pointerType !== "mouse") return;
    const a = approach.current;
    const { clientX: x, clientY: y } = e;

    if (inside(x, y, view.to)) {
      a.reached = true;
    } else if (a.reached) {
      // Was on the image and has now left it.
      close();
      return;
    } else if (!Number.isNaN(a.x)) {
      // On the way there, or not: the part of each movement that is not
      // aimed at the image's centre accumulates, and enough of it means
      // the pointer is going somewhere else.
      const dx = x - a.x;
      const dy = y - a.y;
      const length = Math.hypot(dx, dy);
      const cx = view.to.left + view.to.width / 2 - a.x;
      const cy = view.to.top + view.to.height / 2 - a.y;
      const toCentre = Math.hypot(cx, cy) || 1;
      const towards = Math.max((dx * cx + dy * cy) / toCentre, 0);
      a.offCourse += length - towards;
      if (a.offCourse > OFF_COURSE_PX) {
        close();
        return;
      }
    }
    a.x = x;
    a.y = y;
  };

  /** Begin fetching the full file, so it is there by the time it opens. */
  const preload = () => {
    new window.Image().src = image.src;
  };

  const overlay =
    view &&
    createPortal(
      <div
        ref={scrim}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        tabIndex={-1}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onPointerMove={onMove}
        onWheel={close}
        className="fixed inset-0 z-100 bg-[#0E2438]/60 outline-none backdrop-blur-sm"
      >
        {/* The bare photograph, laid out where it will rest; the animation
            starts it over the origin. Not next/image: this is the file
            itself, already fetched, at its own size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={big}
          src={image.src}
          alt=""
          width={view.to.width}
          height={view.to.height}
          draggable={false}
          className="fixed origin-top-left rounded-2xl shadow-[0_40px_90px_-30px_rgba(0,0,0,0.6)] select-none"
          style={{
            left: view.to.left,
            top: view.to.top,
            width: view.to.width,
            height: view.to.height,
          }}
        />
      </div>,
      document.body,
    );

  return { openFrom, preload, isOpen: view !== null, overlay };
}

export default function ZoomableImage({
  image,
  alt,
  label,
  sizes,
  className = "",
  imageClassName = "",
  fit = "natural",
}: {
  image: ZoomableSource;
  /** Describes the image for readers of the small one and the large one. */
  alt: string;
  /** What the button does, e.g. "View larger: graduation day". */
  label: string;
  /** The `sizes` hint for the small image, since its width is the caller's. */
  sizes: string;
  className?: string;
  imageClassName?: string;
  /** "natural": the box takes the image's shape. "contain": the caller sizes
   *  the box and the image sits whole inside it, so a row of them lines up. */
  fit?: "natural" | "contain";
}) {
  const card = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const { openFrom, preload, overlay } = useLightbox(image, alt);

  const open = () => {
    if (card.current) openFrom(card.current);
  };

  const onCardEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    preload();
    hoverTimer.current = window.setTimeout(open, HOVER_INTENT_MS);
  };

  const onCardLeave = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  return (
    <>
      <button
        ref={card}
        type="button"
        onPointerEnter={onCardEnter}
        onPointerLeave={onCardLeave}
        onClick={open}
        aria-label={label}
        className={`block w-full cursor-zoom-in overflow-hidden bg-surface-2 ${className}`}
      >
        <Image
          src={image.src}
          alt={alt}
          width={image.width}
          height={image.height}
          sizes={sizes}
          className={`block w-full ${
            fit === "contain" ? "h-full object-contain" : "h-auto"
          } ${imageClassName}`}
        />
      </button>
      {overlay}
    </>
  );
}

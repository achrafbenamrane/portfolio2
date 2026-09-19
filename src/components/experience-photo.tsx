"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Experience } from "@/content/site";

type Photo = NonNullable<Experience["image"]>;

type Rect = { left: number; top: number; width: number; height: number };

/**
 * A photograph in its card, and the same photograph large when you want
 * it: rest the mouse on the card and it lifts out to the centre of the
 * page; move away from it, click beside it, scroll, or press Escape and it
 * flies back into the card it came from.
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

export default function ExperiencePhoto({
  image,
  className = "",
}: {
  image: Photo;
  className?: string;
}) {
  const card = useRef<HTMLButtonElement>(null);
  const big = useRef<HTMLImageElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const closing = useRef(false);
  /** Pointer tracking while open: where it was, whether it has reached the
   *  big image, and how far it has moved in any direction but towards it. */
  const approach = useRef({ x: NaN, y: NaN, offCourse: 0, reached: false });

  const [view, setView] = useState<{ from: Rect; to: Rect } | null>(null);

  const open = () => {
    const el = card.current;
    if (!el || view) return;
    const r = el.getBoundingClientRect();
    approach.current = { x: NaN, y: NaN, offCourse: 0, reached: false };
    closing.current = false;
    setView({
      from: { left: r.left, top: r.top, width: r.width, height: r.height },
      to: fitToViewport(image.width, image.height),
    });
  };

  const close = () => {
    const img = big.current;
    const dim = scrim.current;
    const el = card.current;
    if (!view || !img || !dim || !el || closing.current) return;
    closing.current = true;
    // Measured again now — the page may have moved since it opened.
    const r = el.getBoundingClientRect();
    const back = transformBetween(r, view.to);
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
      el.focus({ preventScroll: true });
    };
  };

  // Fly in from the card once the large image is in the DOM.
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

  const onCardEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    // Start fetching the full file now, so it is there when the card opens.
    new window.Image().src = image.src;
    hoverTimer.current = window.setTimeout(open, HOVER_INTENT_MS);
  };

  const onCardLeave = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

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

  return (
    <>
      <figure className={className}>
        <div className="rounded-xl bg-canvas p-1.5 shadow-[0_24px_48px_-28px_rgba(24,38,49,0.45)] ring-1 ring-line">
          <button
            ref={card}
            type="button"
            onPointerEnter={onCardEnter}
            onPointerLeave={onCardLeave}
            onClick={open}
            aria-label={`View larger: ${image.caption}`}
            className="block w-full cursor-zoom-in overflow-hidden rounded-lg bg-surface-2"
          >
            <Image
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              sizes="15rem"
              className="block h-auto w-full transition-transform duration-700 group-hover:scale-[1.03]"
            />
          </button>
          <figcaption className="meta px-1 pb-1 pt-2.5 text-dim">
            {image.caption}
          </figcaption>
        </div>
      </figure>

      {view &&
        createPortal(
          <div
            ref={scrim}
            role="dialog"
            aria-modal="true"
            aria-label={image.alt}
            tabIndex={-1}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
            onPointerMove={onMove}
            onWheel={close}
            className="fixed inset-0 z-100 bg-[#0E2438]/60 outline-none backdrop-blur-sm"
          >
            {/* The bare photograph, laid out where it will rest; the
                animation starts it over the card. Not next/image: this is
                the file itself, already fetched on hover, at its own size. */}
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
        )}
    </>
  );
}

"use client";

import { useRef, useState } from "react";

import Plate from "@/components/showcase/plate";
import type { Project } from "@/content/site";

/**
 * A row of plates you scroll through: arrows, a grab-and-drag with the
 * mouse, a swipe on a phone, and a progress line so the length of the row
 * is never a mystery.
 *
 * Built on native horizontal scrolling with scroll-snap rather than a
 * translated track: swipe, trackpad, shift-wheel and the arrow keys all
 * work without a line of code for any of them, and the arrows just call
 * scrollBy. The one thing a mouse cannot do natively is drag a scroller,
 * so that is added by hand — and snapping is switched off for the length
 * of the drag, because a container that snaps while you are still holding
 * it fights your hand.
 */

const DRAG_THRESHOLD = 5;

export default function PlateCarousel({
  projects,
  label,
  showBlurb = false,
  onSelect,
  selected = null,
}: {
  projects: readonly Project[];
  label: string;
  /** Print the description under each plate — for work a picture alone
   *  cannot explain, like an automation's canvas. */
  showBlurb?: boolean;
  onSelect?: (project: Project) => void;
  selected?: Project | null;
}) {
  const track = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const readPosition = () => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? el.scrollLeft / max : 1);
  };

  /** One plate's width plus the gap, measured, so the arrows step a card. */
  const step = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const first = el.firstElementChild;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const by = first
      ? first.getBoundingClientRect().width + gap
      : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * by, behavior: "smooth" });
  };

  /** After a drag: settle on the nearest plate, since snapping was off. */
  const settle = () => {
    const el = track.current;
    if (!el) return;
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    const origin = el.getBoundingClientRect().left + pad;
    let best = 0;
    let bestDistance = Infinity;
    for (const child of el.children) {
      const offset = child.getBoundingClientRect().left - origin;
      if (Math.abs(offset) < bestDistance) {
        bestDistance = Math.abs(offset);
        best = offset;
      }
    }
    el.scrollBy({ left: best, behavior: "smooth" });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLUListElement>) => {
    // Touch already scrolls natively; this is for the mouse only.
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = track.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const el = track.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > DRAG_THRESHOLD) d.moved = true;
    el.scrollLeft = d.left - dx;
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    // A drag that moved must not also count as a click on the plate under
    // the pointer, or every drag would open a project.
    swallowClick.current = d.moved;
    drag.current = null;
    setDragging(false);
    if (d.moved) settle();
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const atStart = progress <= 0.001;
  const atEnd = progress >= 0.999;

  return (
    <div>
      {/* Controls above the row, where the eye lands before the plates, in
          ink rather than the hairline grey — a control you have to hunt
          for is not a control. */}
      <div className="mb-5 flex items-center justify-between gap-5">
        <div aria-hidden className="relative h-px flex-1 bg-line">
          {/* Never narrower than a marker: at the start there is nothing
              to fill, and a bare line reads as a rule, not a position. */}
          <span
            className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-150"
            style={{ width: `${8 + progress * 92}%` }}
          />
        </div>

        <div className="flex gap-2">
          <ArrowButton
            label="Previous"
            onClick={() => step(-1)}
            disabled={atStart}
          >
            ←
          </ArrowButton>
          <ArrowButton label="Next" onClick={() => step(1)} disabled={atEnd}>
            →
          </ArrowButton>
        </div>
      </div>

      {/* Bleeds past the column on the right (and both sides on a phone)
          so the next plate peeks in from the edge — the strongest cue
          that there is more without a single control. scroll-p keeps the
          snap points aligned with the visible edge, not the bleed, and the
          hair of padding is room for the chosen plate's ring, which the
          scroller would otherwise clip. */}
      <ul
        ref={track}
        onScroll={readPosition}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        // Otherwise the browser starts dragging the image or link itself.
        onDragStart={(e) => e.preventDefault()}
        tabIndex={0}
        aria-label={label}
        className={`-mx-6 flex gap-5 overflow-x-auto scroll-px-6 px-6 pt-1 pb-3 [scrollbar-width:none] md:-ml-1 md:-mr-12 md:scroll-pl-1 md:pl-1 md:pr-12 [&::-webkit-scrollbar]:hidden ${
          dragging
            ? "cursor-grabbing snap-none select-none"
            : "cursor-grab snap-x snap-mandatory"
        }`}
      >
        {projects.map((project) => (
          <Plate
            key={project.slug}
            project={project}
            showBlurb={showBlurb}
            onSelect={onSelect}
            selected={selected?.slug === project.slug}
            className={`shrink-0 snap-start ${
              showBlurb ? "w-[19rem] sm:w-[22rem]" : "w-[17rem] sm:w-[19rem]"
            }`}
            sizes={showBlurb ? "22rem" : "19rem"}
          />
        ))}
      </ul>
    </div>
  );
}

function ArrowButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-11 place-items-center rounded-full border border-ink text-ink transition-colors hover:bg-ink hover:text-canvas disabled:cursor-default disabled:border-line disabled:text-dim/60 disabled:hover:bg-transparent disabled:hover:text-dim/60"
    >
      {children}
    </button>
  );
}

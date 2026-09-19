"use client";

import { useRef, useState } from "react";

import Plate from "@/components/showcase/plate";
import type { Project } from "@/content/site";

/**
 * A row of plates you scroll through, with arrows for the mouse and a
 * progress line so the length of the row is never a mystery.
 *
 * Built on native horizontal scrolling with scroll-snap rather than a
 * translated track: a swipe on a phone, a trackpad flick, shift-wheel and
 * the arrow keys all work without a line of code for any of them, and the
 * arrows just call scrollBy. The cost is that the browser owns the position,
 * so the only state here is a read-back of it for the progress line.
 */
export default function PlateCarousel({
  projects,
  label,
}: {
  projects: readonly Project[];
  label: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [progress, setProgress] = useState(0);

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

  const atStart = progress <= 0.001;
  const atEnd = progress >= 0.999;

  return (
    <div>
      {/* Bleeds past the column on the right (and both sides on a phone)
          so the next plate peeks in from the edge — the strongest cue
          that there is more without a single control. scroll-p keeps the
          snap points aligned with the visible edge, not the bleed. */}
      <ul
        ref={track}
        onScroll={readPosition}
        tabIndex={0}
        aria-label={label}
        className="-mx-6 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-6 px-6 pb-2 [scrollbar-width:none] md:mx-0 md:-mr-12 md:scroll-pl-0 md:pl-0 md:pr-12 [&::-webkit-scrollbar]:hidden"
      >
        {projects.map((project) => (
          <Plate
            key={project.slug}
            project={project}
            className="w-[17rem] shrink-0 snap-start sm:w-[19rem]"
            sizes="19rem"
          />
        ))}
      </ul>

      <div className="mt-6 flex items-center gap-5">
        <div
          aria-hidden
          className="relative h-px flex-1 bg-line"
        >
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
      className="grid size-10 place-items-center rounded-full border border-line text-dim transition-colors hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-line disabled:hover:text-dim"
    >
      {children}
    </button>
  );
}

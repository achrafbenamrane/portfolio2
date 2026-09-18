"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

import { testimonials } from "@/content/site";

/**
 * Client quotes, one at a time.
 *
 * Returns null while `testimonials` is empty — the section does not exist
 * until there is something true to put in it. That is deliberate: a portfolio
 * is the one place a reader can verify a claim, and placeholder praise from
 * placeholder people is worse than silence.
 *
 * Inverted against the page on purpose. Everything around it is dark; a light
 * card is what makes a quote read as someone else speaking rather than more of
 * the same voice.
 */
export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const total = testimonials.length;

  // Wraps in both directions, so the arrows never dead-end on a short list.
  const go = useCallback(
    (step: number) => setIndex((i) => (i + step + total) % total),
    [total],
  );

  if (total === 0) return null;
  const current = testimonials[index];

  return (
    <section className="px-6 pb-24 md:px-12" aria-label="Testimonials">
      <div className="mx-auto max-w-350 rounded-2xl bg-canvas px-7 py-10 text-ink md:px-12 md:py-14">
        <div className="grid gap-10 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-16">
          <div>
            <p className="meta text-dim">TESTIMONIALS</p>
            <h2 className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] font-bold leading-[1.05] tracking-tight">
              What my
              <br />
              clients say
            </h2>

            {total > 1 && (
              <div className="mt-8 flex gap-3">
                <ArrowButton label="Previous testimonial" onClick={() => go(-1)}>
                  ←
                </ArrowButton>
                <ArrowButton label="Next testimonial" onClick={() => go(1)}>
                  →
                </ArrowButton>
              </div>
            )}
          </div>

          <div className="relative">
            {/* Decorative, and behind the text — a quote mark that competes
                with the quote is just a big grey shape. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-6 right-0 select-none font-serif text-[7rem] leading-none text-surface-2 md:text-[9rem]"
            >
              &rdquo;
            </span>

            {/* aria-live so the quote is announced when the arrows change it;
                without it a screen reader user hears nothing happen. */}
            <blockquote aria-live="polite" className="relative">
              <p className="text-balance text-[clamp(1.05rem,1.9vw,1.4rem)] leading-relaxed">
                &ldquo;{current.quote}&rdquo;
              </p>

              <footer className="mt-8 flex items-center justify-between gap-6">
                <div className="flex items-center gap-3.5">
                  {current.avatar ? (
                    <Image
                      src={current.avatar}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 rounded-full object-cover"
                    />
                  ) : (
                    <span className="meta grid size-11 place-items-center rounded-full bg-surface-2 text-dim">
                      {initials(current.name)}
                    </span>
                  )}
                  <div>
                    <p className="font-medium leading-tight">{current.name}</p>
                    <p className="text-sm leading-tight text-dim">
                      {current.role}
                    </p>
                  </div>
                </div>

                {total > 1 && (
                  <span className="meta shrink-0 text-dim tabular-nums">
                    {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                  </span>
                )}
              </footer>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-10 place-items-center rounded-full border border-line text-dim transition-colors hover:border-ink hover:text-ink"
    >
      {children}
    </button>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import type { Project } from "@/content/site";

/**
 * A working laptop: a browser with a tab per site, and picking one loads it.
 *
 * Same idea as the phone — the site is shown running on a machine rather than
 * cropped onto a card. The address bar carries the project's real domain, and
 * "Visit" opens the real thing, so nothing in the chrome is decorative.
 *
 * Drawn entirely in CSS, so it stays sharp at any size with no stock artwork.
 */

function hostOf(href?: string) {
  if (!href) return "localhost";
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "localhost";
  }
}

export default function LaptopShowcase({ sites }: { sites: readonly Project[] }) {
  const [index, setIndex] = useState(0);
  const site = sites[index];
  if (!site) return null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Lid. The camera dot and the thin inner bezel are the two details that
          separate "laptop" from "screenshot with a dark border". */}
      <div className="rounded-t-2xl bg-gradient-to-b from-[#3A4754] to-[#1A2027] p-[3px] shadow-[0_28px_60px_-26px_rgba(11,16,21,0.7)]">
        <div className="rounded-t-[0.9rem] bg-[#0B1015] px-3 pb-3 pt-4">
          <span
            aria-hidden
            className="mx-auto mb-2 block size-1.5 rounded-full bg-[#2A333C] ring-1 ring-black/40"
          />

          <div className="overflow-hidden rounded-md bg-canvas">
            <BrowserChrome
              sites={sites}
              index={index}
              onSelect={setIndex}
              host={hostOf(site.href)}
            />

            {/* 16 : 10, held by padding so the viewport cannot collapse. */}
            <div className="relative w-full bg-surface-2">
              <div style={{ paddingTop: "58%" }} />
              <div className="absolute inset-0">
                <Image
                  key={site.images[0]}
                  src={site.images[0]}
                  alt={`${site.title} — ${site.category}`}
                  fill
                  sizes="(min-width: 768px) 60vw, 92vw"
                  unoptimized={site.images[0].startsWith("http")}
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Base. It must OVERHANG the lid — that overhang is the single
          strongest cue that this is a laptop and not a floating screen. */}
      <div className="relative -mx-[3%] h-4 rounded-b-xl bg-gradient-to-b from-[#2A333C] to-[#151C23] sm:h-5">
        <span
          aria-hidden
          className="absolute left-1/2 top-0 h-2 w-24 -translate-x-1/2 rounded-b-lg bg-[#11181F]"
        />
      </div>

      <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-baseline justify-center gap-x-5 gap-y-2 text-center">
        <h3 className="text-lg font-medium tracking-tight">{site.title}</h3>
        <span className="meta text-dim">
          {site.category} · {site.year}
        </span>
        {site.href && (
          <Link
            href={site.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link inline-flex items-center gap-1.5 border-b border-line pb-0.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Visit
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover/link:translate-x-1"
            >
              →
            </span>
          </Link>
        )}
      </div>

      <p className="mt-3 text-balance text-center text-sm leading-relaxed text-dim">
        {site.description}
      </p>
    </div>
  );
}

function BrowserChrome({
  sites,
  index,
  onSelect,
  host,
}: {
  sites: readonly Project[];
  index: number;
  onSelect: (i: number) => void;
  host: string;
}) {
  return (
    <div className="border-b border-line bg-surface-2">
      {/* Tab strip — one tab per site, and they are the navigation. */}
      <div className="flex items-end gap-1 overflow-x-auto px-2 pt-2">
        <span aria-hidden className="mb-2 mr-1 flex shrink-0 gap-1.5 pl-1">
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
        </span>

        {sites.map((site, i) => (
          <button
            key={site.slug}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={i === index}
            className={`max-w-[9rem] shrink-0 truncate rounded-t-md px-3 py-1.5 text-[11px] transition-colors ${
              i === index
                ? "bg-canvas font-medium text-ink"
                : "text-dim hover:bg-canvas/60 hover:text-ink"
            }`}
          >
            {site.title}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-canvas px-3 py-2">
        <span aria-hidden className="flex gap-1 text-dim">
          <span className="text-[11px]">←</span>
          <span className="text-[11px]">→</span>
        </span>
        <span className="meta flex-1 truncate rounded-full bg-surface-2 px-3 py-1 text-dim">
          {host}
        </span>
      </div>
    </div>
  );
}

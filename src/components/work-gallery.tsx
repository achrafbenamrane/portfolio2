"use client";

import Link from "next/link";
import { useState } from "react";

import LaptopShowcase from "@/components/showcase/laptop-showcase";
import PhoneShowcase from "@/components/showcase/phone-showcase";
import PlateCarousel from "@/components/showcase/plate-carousel";
import { projects, type Project } from "@/content/site";

/**
 * Work, grouped by the device the work actually runs on.
 *
 * This replaces a filtered list of cards. A filter asks the reader to do the
 * sorting; grouping by device does it for them, and it lets each group be
 * shown the right way — apps launching on a phone, sites loading in a browser,
 * print and automations as plates in a row. The category chips were doing the
 * same job worse, because picking "Mobile Development" still only produced
 * more cards.
 *
 * Every band has the same anatomy: its title centred over everything, then
 * the showcase on the right with a panel on the left that describes
 * whatever is currently chosen in it — the open tab, the launched app, the
 * clicked plate. The description belongs beside the thing, not under it,
 * so it can be read while the thing is looked at.
 */

const APPS = projects.filter((p) => p.category === "Mobile Development");

/** Anything with a URL you can actually open belongs in the browser. */
const SITES = projects.filter(
  (p) =>
    p.href &&
    (p.category === "Web Development" ||
      p.category === "Desktop Development" ||
      p.category === "AI Automation"),
);

/**
 * Automations with nothing to open, and the design work — two bands, not one.
 * Lumping them together put Shopify-to-Telegram pipelines under a heading that
 * said "print and identity", which is just untrue.
 */
const AUTOMATIONS = projects.filter(
  (p) => p.category === "AI Automation" && !SITES.includes(p),
);

const DESIGN = projects.filter((p) => p.category === "Graphic Design");

export default function WorkGallery() {
  return (
    <div className="pb-24">
      {APPS.length > 0 && (
        <Band
          label="APPS"
          title="Built for the phone"
          blurb="Tap an icon to open the app and watch it run."
          count={APPS.length}
          initial={null}
          hint="Open an app on the phone and what it does is described here."
        >
          {(select) => <PhoneShowcase apps={APPS} onSelect={select} />}
        </Band>
      )}

      {SITES.length > 0 && (
        <Band
          label="WEB"
          title="Built for the browser"
          blurb="Pick a tab to load the site. Visit opens the real thing."
          count={SITES.length}
          initial={SITES[0]}
        >
          {(select) => <LaptopShowcase sites={SITES} onSelect={select} />}
        </Band>
      )}

      {AUTOMATIONS.length > 0 && (
        <Band
          label="AUTOMATION"
          title="Built to run itself"
          blurb="Workflows that fire without anyone watching them. Click one to read about it."
          count={AUTOMATIONS.length}
          initial={AUTOMATIONS[0]}
        >
          {(select, selected) => (
            <PlateCarousel
              projects={AUTOMATIONS}
              label="Automation work"
              onSelect={select}
              selected={selected}
            />
          )}
        </Band>
      )}

      {DESIGN.length > 0 && (
        <Band
          label="DESIGN"
          title="Print and identity"
          blurb="Swipe through, or use the arrows. Click a piece to read about it."
          count={DESIGN.length}
          initial={DESIGN[0]}
        >
          {(select, selected) => (
            <PlateCarousel
              projects={DESIGN}
              label="Print and identity work"
              onSelect={select}
              selected={selected}
            />
          )}
        </Band>
      )}
    </div>
  );
}

function Band({
  label,
  title,
  blurb,
  count,
  initial,
  hint,
  children,
}: {
  label: string;
  title: string;
  blurb?: string;
  count: number;
  /** What the panel describes before anything is chosen. */
  initial: Project | null;
  /** What the panel says when nothing is chosen. */
  hint?: string;
  children: (
    select: (project: Project | null) => void,
    selected: Project | null,
  ) => React.ReactNode;
}) {
  const [selected, setSelected] = useState<Project | null>(initial);

  return (
    <section className="border-b border-line px-6 py-16 last:border-0 md:px-12 md:py-24">
      <div className="mx-auto max-w-350">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4">
          <span className="meta text-dim">{label}</span>
          <span className="meta text-dim">
            {count.toString().padStart(3, "0")}
          </span>
        </div>

        <div className="mx-auto max-w-2xl pt-12 text-center">
          <h2 className="text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[1.05] tracking-tight">
            {title}
          </h2>
          {blurb && (
            <p className="mx-auto mt-4 max-w-prose text-balance leading-relaxed text-dim">
              {blurb}
            </p>
          )}
        </div>

        {/* On a phone the showcase comes first and the panel under it, so a
            tap on the device puts its description just below the thumb. */}
        <div className="grid gap-10 pt-12 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-16 md:pt-16">
          <div className="order-2 md:order-1">
            <Details project={selected} hint={hint} />
          </div>
          <div className="order-1 min-w-0 md:order-2">
            {children(setSelected, selected)}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The chosen project, described. Keyed on the project by its caller so a
 * change rises into place rather than flickering. The live link lives here,
 * beside the words, rather than on the thumbnail — a click on the thumbnail
 * chooses; this is where you go through.
 */
function Details({
  project,
  hint,
}: {
  project: Project | null;
  hint?: string;
}) {
  if (!project) {
    return (
      <p className="max-w-prose text-balance leading-relaxed text-dim md:sticky md:top-28">
        {hint ?? "Choose something to read about it."}
      </p>
    );
  }

  return (
    <div key={project.slug} className="rise md:sticky md:top-28">
      <p className="meta text-accent">
        {project.category} · {project.year}
      </p>
      <h3 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
        {project.title}
      </h3>
      {project.description && (
        <p className="mt-4 max-w-prose leading-relaxed text-dim">
          {project.description}
        </p>
      )}

      {project.tags.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <li
              key={tag}
              className="meta rounded-full border border-line px-2 py-1 text-dim"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      {project.href && (
        <Link
          href={project.href}
          target="_blank"
          rel="noopener noreferrer"
          className="group/link mt-6 inline-flex items-center gap-2 border-b border-line pb-0.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
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
  );
}

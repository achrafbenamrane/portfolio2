"use client";

import Link from "next/link";
import { useState } from "react";

import Badges from "@/components/badges";
import ImacStage from "@/components/imac/imac-stage";
import PhoneShowcase from "@/components/showcase/phone-showcase";
import PlateCarousel from "@/components/showcase/plate-carousel";
import SiteWall from "@/components/showcase/site-wall";
import { VisionSignalProvider } from "@/components/vision/vision-signal";
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
 * whatever is currently chosen in it — the clicked plate. The description
 * belongs beside the thing, not under it, so it can be read while the thing
 * is looked at. The apps and the websites are the exception: their stage and
 * their wall lay out their own write-ups, so those bands are only a shell.
 * So is computer vision, whose showcase is the work itself, running.
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

/** Wolfexo sells brand identity on one body of work: ONEFRAME's logo and
 *  packaging. The rest of the print work stays in site.ts, off this page. */
const DESIGN = projects.filter(
  (p) => p.category === "Graphic Design" && p.slug.startsWith("oneframe"),
);

const VISION = projects.filter((p) => p.category === "Computer Vision");

export default function WorkGallery() {
  return (
    <div className="pb-24">
      {APPS.length > 0 && (
        <BandShell
          label="APPS"
          title="Built for the phone"
          blurb="Pick an app and it opens on the phone — its real screens, running."
          count={APPS.length}
        >
          <div className="pt-10 md:pt-14">
            <PhoneShowcase apps={APPS} />
          </div>
        </BandShell>
      )}

      {SITES.length > 0 && (
        <BandShell
          label="WEB"
          title="Built for the browser"
          blurb="Every site on its own shelf. Choose one to step closer."
          count={SITES.length}
        >
          <div className="pt-10 md:pt-14">
            <SiteWall sites={SITES} />
          </div>
        </BandShell>
      )}

      {VISION.length > 0 && (
        <BandShell
          id="computer-vision"
          label="COMPUTER VISION"
          title="Built to see"
          blurb="Hand tracking that runs in the browser. Close your hand and the portrait folds into paper; point to move the cursor, pinch to click. The video never leaves your machine."
          count={VISION.length}
        >
          {/* The provider is scoped to the band: the camera is asked for
              here, and the page only downloads the hand model once someone
              turns it on. */}
          <VisionSignalProvider>
            <div className="pt-10 md:pt-14">
              <ImacStage />
            </div>
          </VisionSignalProvider>
        </BandShell>
      )}

      {AUTOMATIONS.length > 0 && (
        <Band
          label="AUTOMATION"
          title="Built to run itself"
          blurb="Workflows that fire without anyone watching them. Choose one to read about it."
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
          id="design"
          label="BRAND IDENTITY"
          title="Built to be recognised"
          blurb="We build brand identities for businesses: the logo, then everything it lives on. Choose a piece to read about it."
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
  id,
  label,
  title,
  blurb,
  count,
  initial,
  children,
}: {
  id?: string;
  label: string;
  title: string;
  blurb?: string;
  count: number;
  /** What the panel describes before anything is chosen. */
  initial: Project | null;
  children: (
    select: (project: Project | null) => void,
    selected: Project | null,
  ) => React.ReactNode;
}) {
  const [selected, setSelected] = useState<Project | null>(initial);

  return (
    <BandShell id={id} label={label} title={title} blurb={blurb} count={count}>
      {/* On a phone the showcase comes first and the panel under it, so a
          tap on the device puts its description just below the thumb. */}
      <div className="grid gap-10 pt-12 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-16 md:pt-16">
        <div className="order-2 md:order-1">
          <Details project={selected} />
        </div>
        <div className="order-1 min-w-0 md:order-2">
          {children(setSelected, selected)}
        </div>
      </div>
    </BandShell>
  );
}

/** A band's frame: its rule, label and count, and its title centred. */
function BandShell({
  id,
  label,
  title,
  blurb,
  count,
  children,
}: {
  /** Makes the band a link target. Scroll margin clears the fixed nav. */
  id?: string;
  label: string;
  title: string;
  blurb?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-16 border-b border-line px-6 py-16 last:border-0 md:px-12 md:py-24"
    >
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

        {children}
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
function Details({ project }: { project: Project | null }) {
  if (!project) {
    return (
      <p className="max-w-prose text-balance leading-relaxed text-dim md:sticky md:top-28">
        Choose something to read about it.
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

      <Badges tags={project.tags} brand={project.brand} className="mt-5" />

      {project.caseStudy && (
        <Link
          href={project.caseStudy}
          className="group/case mt-6 mr-6 inline-flex items-center gap-2 border-b border-ink pb-0.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Read the case study
          <span
            aria-hidden
            className="transition-transform duration-200 group-hover/case:translate-x-1"
          >
            →
          </span>
        </Link>
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

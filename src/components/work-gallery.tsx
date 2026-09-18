"use client";

import Image from "next/image";
import Link from "next/link";

import LaptopShowcase from "@/components/showcase/laptop-showcase";
import PhoneShowcase from "@/components/showcase/phone-showcase";
import { projects, type Project } from "@/content/site";

/**
 * Work, grouped by the device the work actually runs on.
 *
 * This replaces a filtered list of cards. A filter asks the reader to do the
 * sorting; grouping by device does it for them, and it lets each group be
 * shown the right way — apps launching on a phone, sites loading in a browser,
 * print as flat plates. The category chips were doing the same job worse,
 * because picking "Mobile Development" still only produced more cards.
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
        >
          <PhoneShowcase apps={APPS} />
        </Band>
      )}

      {SITES.length > 0 && (
        <Band
          label="WEB"
          title="Built for the browser"
          blurb="Pick a tab to load the site. Visit opens the real thing."
          count={SITES.length}
        >
          <LaptopShowcase sites={SITES} />
        </Band>
      )}

      {AUTOMATIONS.length > 0 && (
        <Band
          label="AUTOMATION"
          title="Built to run itself"
          blurb="Workflows that fire without anyone watching them."
          count={AUTOMATIONS.length}
        >
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {AUTOMATIONS.map((project) => (
              <Plate key={project.slug} project={project} showBlurb />
            ))}
          </ul>
        </Band>
      )}

      {DESIGN.length > 0 && (
        <Band label="DESIGN" title="Print and identity" count={DESIGN.length}>
          <ul className="grid grid-cols-2 gap-5 lg:grid-cols-3">
            {DESIGN.map((project) => (
              <Plate key={project.slug} project={project} />
            ))}
          </ul>
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
  children,
}: {
  label: string;
  title: string;
  blurb?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line px-6 py-16 last:border-0 md:px-12 md:py-24">
      <div className="mx-auto max-w-350">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4">
          <span className="meta text-dim">{label}</span>
          <span className="meta text-dim">
            {count.toString().padStart(3, "0")}
          </span>
        </div>

        <div className="grid gap-10 pt-10 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-16">
          <div>
            <h2 className="text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[1.05] tracking-tight">
              {title}
            </h2>
            {blurb && (
              <p className="mt-4 max-w-prose text-balance leading-relaxed text-dim">
                {blurb}
              </p>
            )}
          </div>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Plate({
  project,
  showBlurb = false,
}: {
  project: Project;
  showBlurb?: boolean;
}) {
  const body = (
    <>
      <div className="relative w-full overflow-hidden rounded-lg bg-surface-2">
        <div style={{ paddingTop: "75%" }} />
        <div className="absolute inset-0">
          <Image
            src={project.images[0]}
            alt={`${project.title} — ${project.category}`}
            fill
            sizes="(min-width: 1024px) 22vw, 45vw"
            unoptimized={project.images[0].startsWith("http")}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      </div>

      <p className="mt-3 text-sm font-medium transition-colors group-hover:text-accent">
        {project.title}
      </p>
      <p className="meta text-dim">{project.year}</p>

      {/* Automations are the one group a thumbnail cannot explain — a
          screenshot of a Make.com canvas says nothing on its own. */}
      {showBlurb && (
        <p className="mt-2 text-balance text-sm leading-relaxed text-dim">
          {project.description}
        </p>
      )}
    </>
  );

  return (
    <li className="group">
      {/* Only a live project links out; the rest must not look clickable. */}
      {project.href ? (
        <Link
          href={project.href}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          {body}
        </Link>
      ) : (
        <article>{body}</article>
      )}
    </li>
  );
}

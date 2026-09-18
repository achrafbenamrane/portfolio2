import Link from "next/link";

import DeviceFrame, { deviceFor } from "@/components/device-frame";
import { projects } from "@/content/site";

/**
 * The featured projects, each shown in the device it was actually built for.
 *
 * This sits above the index rather than replacing it. Nineteen projects as
 * nineteen cards is a scrolling wall — the reason the index exists — but an
 * index alone opens the page with a list of words and asks the reader to
 * imagine the work. Six mockups carry the range, and the full index still
 * follows for anyone scanning.
 *
 * A server component: images and links, no state.
 */
export default function WorkShowcase() {
  const featured = projects.filter((project) => project.featured);
  if (featured.length === 0) return null;

  return (
    <section className="px-6 pb-20 md:px-12" aria-label="Selected work">
      <div className="mx-auto max-w-350">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4">
          <span className="meta text-dim">SELECTED</span>
          <span className="meta text-dim">
            {featured.length.toString().padStart(3, "0")} OF{" "}
            {projects.length.toString().padStart(3, "0")}
          </span>
        </div>

        <ul className="grid gap-x-10 gap-y-14 pt-10 md:grid-cols-2">
          {featured.map((project, index) => {
            const device = deviceFor(project.category);
            const remote = project.images[0].startsWith("http");

            const card = (
              <>
                <DeviceFrame
                  device={device}
                  src={project.images[0]}
                  alt={`${project.title} — ${project.category}`}
                  href={project.href}
                  title={project.title}
                  unoptimized={remote}
                  /* Only the first is above the fold; the rest would compete
                     with it for bandwidth if they were all marked priority. */
                  priority={index === 0}
                />

                <div className="mt-6 flex items-baseline justify-between gap-4">
                  <h3 className="text-xl font-medium tracking-tight transition-colors group-hover:text-accent md:text-2xl">
                    {project.title}
                  </h3>
                  <span
                    aria-hidden
                    className="text-dim transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent"
                  >
                    {project.href ? "↗" : ""}
                  </span>
                </div>

                <p className="mt-2 text-sm text-dim">
                  {project.category} · {project.year}
                </p>

                <p className="mt-3 max-w-prose text-balance text-sm leading-relaxed text-dim">
                  {project.description}
                </p>

                <ul className="mt-4 flex flex-wrap gap-2">
                  {project.tags.slice(0, 4).map((tag) => (
                    <li
                      key={tag}
                      className="meta rounded-full border border-line px-2.5 py-1 text-dim"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </>
            );

            // A live project is a link; one without a URL must not pretend to
            // be clickable, so it renders as a plain article instead.
            return (
              <li key={project.slug} className="group">
                {project.href ? (
                  <Link
                    href={project.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {card}
                  </Link>
                ) : (
                  <article>{card}</article>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

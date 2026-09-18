"use client";

import Link from "next/link";
import { useState } from "react";

import ProjectMockup from "@/components/project-mockup";
import { projectCategories, projects, type Project } from "@/content/site";

/**
 * Work as a gallery of alternating rows.
 *
 * Rebuilt from a tile grid. Nineteen equal tiles give every project the same
 * weight and read as a catalogue; alternating full-width rows give the page a
 * rhythm and let each mockup be large enough to actually see, which is the
 * only reason to have mockups at all.
 *
 * Filtering is the one piece of state, and the only reason this is a client
 * component.
 */
export default function WorkGallery() {
  const [category, setCategory] = useState<string>("All");

  const visible =
    category === "All"
      ? projects
      : projects.filter((project) => project.category === category);

  return (
    <section className="px-6 pb-24 md:px-12">
      <div className="mx-auto max-w-350">
        {/* Sticky, because the filter is useless once you have scrolled past
            it — and this page is now very tall. */}
        <div className="sticky top-0 z-20 -mx-6 bg-canvas/85 px-6 backdrop-blur-sm md:-mx-12 md:px-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4 pt-4">
            <span className="meta text-dim">FILTER</span>
            <span className="meta text-dim">
              {visible.length.toString().padStart(3, "0")} OF{" "}
              {projects.length.toString().padStart(3, "0")}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 py-4">
            {projectCategories.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                aria-pressed={category === option}
                className={`meta rounded-full border px-3 py-1.5 transition-colors ${
                  category === option
                    ? "border-accent text-accent"
                    : "border-line text-dim hover:text-ink"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="py-20 text-center text-dim">
            Nothing in this discipline yet.
          </p>
        ) : (
          <ol className="pt-10">
            {visible.map((project, index) => (
              <ProjectRow
                key={project.slug}
                project={project}
                index={index}
                priority={index === 0}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  index,
  priority,
}: {
  project: Project;
  index: number;
  priority: boolean;
}) {
  const remote = project.images[0].startsWith("http");
  // Alternate which side the mockup falls on, so the eye is not dragged down
  // a single column for nineteen rows.
  const flipped = index % 2 === 1;

  return (
    <li className="group border-b border-line py-14 last:border-0 md:py-20">
      <div className="grid items-center gap-8 md:grid-cols-12 md:gap-14">
        <div
          className={`md:col-span-7 ${flipped ? "md:order-2 md:col-start-6" : ""}`}
        >
          <ProjectMockup
            category={project.category}
            src={project.images[0]}
            alt={`${project.title} — ${project.category}`}
            unoptimized={remote}
            priority={priority}
          />
        </div>

        <div className={`md:col-span-5 ${flipped ? "md:order-1 md:row-start-1" : ""}`}>
          <p className="meta text-dim">
            {(index + 1).toString().padStart(2, "0")} · {project.category}
          </p>

          <h2 className="mt-4 text-[clamp(1.6rem,3vw,2.5rem)] font-bold leading-[1.05] tracking-tight">
            {project.title}
          </h2>

          <p className="mt-4 max-w-prose text-balance leading-relaxed text-dim">
            {project.description}
          </p>

          <ul className="mt-6 flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <li
                key={tag}
                className="meta rounded-full border border-line px-2.5 py-1 text-dim"
              >
                {tag}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex items-center gap-5">
            <span className="meta text-dim">{project.year}</span>

            {/* Only a live project gets a link. One without a URL must not
                pretend to be clickable. */}
            {project.href && (
              <Link
                href={project.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link inline-flex items-center gap-2 border-b border-line pb-0.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
              >
                Visit project
                <span
                  aria-hidden
                  className="transition-transform duration-200 group-hover/link:translate-x-1"
                >
                  →
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

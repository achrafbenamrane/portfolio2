"use client";

import Link from "next/link";
import { useState } from "react";

import ProjectMockup from "@/components/project-mockup";
import { projectCategories, projects, type Project } from "@/content/site";

/**
 * Every project as a mockup, filtered by discipline.
 *
 * This replaces a document-style index. The index scanned nineteen projects
 * quickly, but it opened the page with a list of words and asked the reader to
 * picture the work — on a portfolio, seeing it is the point. Featured entries
 * span the full width so the page has a rhythm rather than nineteen identical
 * tiles.
 *
 * Filtering is the only reason this is a client component.
 */
export default function WorkGrid() {
  const [category, setCategory] = useState<string>("All");

  const visible =
    category === "All"
      ? projects
      : projects.filter((project) => project.category === category);

  return (
    <section className="px-6 pb-24 md:px-12">
      <div className="mx-auto max-w-350">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4">
          <span className="meta text-dim">FILTER</span>
          <span className="meta text-dim">
            {visible.length.toString().padStart(3, "0")} OF{" "}
            {projects.length.toString().padStart(3, "0")}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 py-6">
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

        {visible.length === 0 ? (
          <p className="py-16 text-center text-dim">
            Nothing in this discipline yet.
          </p>
        ) : (
          <ul className="grid gap-x-8 gap-y-16 md:grid-cols-2">
            {visible.map((project, index) => (
              <ProjectCard
                key={project.slug}
                project={project}
                priority={index === 0}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ProjectCard({
  project,
  priority,
}: {
  project: Project;
  priority: boolean;
}) {
  const remote = project.images[0].startsWith("http");

  const body = (
    <>
      <ProjectMockup
        category={project.category}
        src={project.images[0]}
        alt={`${project.title} — ${project.category}`}
        unoptimized={remote}
        priority={priority}
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

      <p className="mt-1.5 text-sm text-dim">
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

  return (
    <li className={`group ${project.featured ? "md:col-span-2" : ""}`}>
      {/* A project without a live URL must not pretend to be clickable. */}
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

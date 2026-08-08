"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

import { projectCategories, projects, type Project } from "@/content/site";

/**
 * Work as a document index rather than a card grid. Nineteen projects scan in
 * seconds this way, where nineteen cards would be a scrolling wall — and the
 * preview only costs bandwidth for the row you actually point at.
 */
export default function WorkIndex() {
  const [category, setCategory] = useState<string>("All");
  const [active, setActive] = useState<Project | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const visible =
    category === "All"
      ? projects
      : projects.filter((project) => project.category === category);

  // The preview follows the cursor from a rAF-free direct write. Putting mouse
  // coordinates into React state would re-render the whole list on every pixel
  // of movement.
  const handleMove = useCallback((event: React.MouseEvent) => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.style.transform = `translate3d(${event.clientX + 24}px, ${event.clientY - 90}px, 0)`;
  }, []);

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
              onClick={() => setCategory(option)}
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

        <ul onMouseLeave={() => setActive(null)}>
          {visible.map((project, index) => (
            <li key={project.slug}>
              <a
                href={project.href ?? undefined}
                target={project.href ? "_blank" : undefined}
                rel={project.href ? "noopener noreferrer" : undefined}
                onMouseEnter={() => setActive(project)}
                onMouseMove={handleMove}
                className="group grid grid-cols-[2.5rem_1fr_1.5rem] items-baseline gap-x-4 border-b border-line py-5 transition-colors hover:border-accent md:grid-cols-[3.5rem_minmax(0,1.3fr)_minmax(0,1fr)_9rem_4rem_1.5rem] md:gap-x-8"
              >
                <span className="meta text-dim transition-colors group-hover:text-accent">
                  {(index + 1).toString().padStart(3, "0")}
                </span>

                <span className="text-lg font-medium tracking-tight transition-colors group-hover:text-accent md:text-2xl">
                  {project.title}
                </span>

                <span className="col-start-2 text-sm text-dim md:col-start-auto">
                  {project.category}
                </span>

                <span className="col-start-2 hidden font-mono text-xs text-dim md:col-start-auto md:block">
                  {project.tags.slice(0, 2).join(" · ")}
                </span>

                <span className="meta col-start-2 text-dim md:col-start-auto">
                  {project.year}
                </span>

                <span
                  aria-hidden
                  className="col-start-3 row-start-1 justify-self-end text-dim transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent md:col-start-auto md:row-start-auto"
                >
                  {project.href ? "↗" : "—"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Pinned to the cursor, outside the list so hovering it can't retrigger. */}
      <div
        ref={previewRef}
        aria-hidden
        className={`pointer-events-none fixed left-0 top-0 z-40 hidden w-64 overflow-hidden rounded-lg border border-line bg-surface-1 transition-opacity duration-200 lg:block ${
          active ? "opacity-100" : "opacity-0"
        }`}
      >
        {active && (
          <Image
            src={active.images[0]}
            alt=""
            width={512}
            height={384}
            className="h-40 w-full object-cover"
            unoptimized={active.images[0].startsWith("http")}
          />
        )}
      </div>
    </section>
  );
}

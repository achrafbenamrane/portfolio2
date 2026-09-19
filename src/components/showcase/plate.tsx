import Image from "next/image";
import Link from "next/link";

import type { Project } from "@/content/site";

/**
 * A flat plate: the piece at 4:3, its name and year. For work that is
 * itself flat — print, identity, an automation's canvas — and needs no
 * device around it.
 */
export default function Plate({
  project,
  showBlurb = false,
  className = "",
  sizes = "(min-width: 1024px) 22vw, 45vw",
  onSelect,
  selected = false,
}: {
  project: Project;
  showBlurb?: boolean;
  className?: string;
  /** The `sizes` hint for the image, since the plate's width is the caller's. */
  sizes?: string;
  /** With this, a click selects the plate (for details printed elsewhere)
   *  instead of leaving the page; the live link belongs to that panel. */
  onSelect?: (project: Project) => void;
  selected?: boolean;
}) {
  const body = (
    <>
      <div
        className={`relative w-full overflow-hidden rounded-lg bg-surface-2 transition-shadow ${
          selected ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : ""
        }`}
      >
        <div style={{ paddingTop: "75%" }} />
        <div className="absolute inset-0">
          <Image
            src={project.images[0]}
            alt={`${project.title} — ${project.category}`}
            fill
            sizes={sizes}
            unoptimized={project.images[0].startsWith("http")}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      </div>

      <p
        className={`mt-3 text-sm font-medium transition-colors group-hover:text-accent ${
          selected ? "text-accent" : ""
        }`}
      >
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
    <li className={`group ${className}`}>
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(project)}
          aria-pressed={selected}
          className="block w-full text-left"
        >
          {body}
        </button>
      ) : /* Only a live project links out; the rest must not look clickable. */
      project.href ? (
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

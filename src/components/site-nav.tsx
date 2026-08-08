"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECTIONS } from "@/content/nav";
import { site } from "@/content/site";

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-canvas/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-350 items-center justify-between gap-4 px-6 md:px-12">
        <Link
          href="/"
          className="meta rounded-full border border-line px-2.5 py-1.5 transition-colors hover:border-accent hover:text-accent"
          aria-label={site.name}
        >
          {site.initials}
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {SECTIONS.map((section) => {
            const active = pathname.startsWith(section.href);
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`meta transition-colors ${
                  active ? "text-accent" : "text-dim hover:text-ink"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>

        <a
          href={site.cvHref}
          download
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-xs font-medium text-canvas transition-opacity hover:opacity-80"
        >
          Get my CV
        </a>
      </nav>

      {/* The desktop links don't fit under ~768px, so small screens get a
          scrollable strip rather than a hamburger — four items don't justify
          hiding navigation behind a tap. */}
      <div className="flex gap-5 overflow-x-auto border-t border-line/60 px-6 py-2.5 md:hidden">
        {SECTIONS.map((section) => {
          const active = pathname.startsWith(section.href);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={`meta whitespace-nowrap transition-colors ${
                active ? "text-accent" : "text-dim"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

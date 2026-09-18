"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECTIONS } from "@/content/nav";
import { site } from "@/content/site";

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10"
      style={{
        /* The same blue as the closing banner, turned horizontal: the CTA's
           135deg diagonal would show only one end across a bar this wide and
           short. Opaque, not translucent — over a white page a see-through
           bar lightens as you scroll and the measured contrast below stops
           holding. */
        background:
          "linear-gradient(100deg, #0E2438 0%, #1B4A78 55%, #133A5E 100%)",
      }}
    >
      <nav className="mx-auto flex h-16 max-w-350 items-center justify-between gap-4 px-6 md:px-12">
        <Link
          href="/"
          className="meta rounded-full border border-white/35 px-2.5 py-1.5 text-white transition-colors hover:border-white hover:text-white"
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
                  active ? "text-[#7CC4F0]" : "text-white/75 hover:text-white"
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
          className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#0E2438] transition-opacity hover:opacity-85"
        >
          Get my CV
        </a>
      </nav>

      {/* The desktop links don't fit under ~768px, so small screens get a
          scrollable strip rather than a hamburger — four items don't justify
          hiding navigation behind a tap. */}
      <div className="flex gap-5 overflow-x-auto border-t border-white/10 px-6 py-2.5 md:hidden">
        {SECTIONS.map((section) => {
          const active = pathname.startsWith(section.href);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={`meta whitespace-nowrap transition-colors ${
                active ? "text-[#7CC4F0]" : "text-white/75"
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

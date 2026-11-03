"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { wide } from "@/components/home/wide-font";
import { SECTIONS } from "@/content/nav";
import { site } from "@/content/site";

/**
 * The bar and its full-screen menu, after treize.pro: a wordmark, two
 * underlined links and a round button that opens the whole menu, numbered
 * and set huge. Hovering one title fills it and turns the rest to outline.
 */
export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // While the menu is open: no page scroll behind it, Escape closes it, and
  // focus goes in on opening and back to the button on closing.
  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [open]);

  // The padding sits outside the 1400px column, as on every page section, so
  // the wordmark lines up with each page's heading.
  return (
    <header className={`site-bar fixed inset-x-0 top-0 z-50 px-6 md:px-12 ${wide.variable}`}>
      <nav className="mx-auto flex h-18 max-w-350 items-center justify-between gap-4" aria-label="Main">
        <Link href="/" className="site-wordmark" aria-label={`${site.brand} — home`}>
          {site.brand}
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/case-studies" className="site-underline hidden md:inline-block">
            Case studies
          </Link>
          <Link href="/contact" className="site-underline hidden sm:inline-block">
            Let&apos;s talk
          </Link>
          <button
            ref={buttonRef}
            type="button"
            className="site-round"
            aria-label="Open the menu"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 7h10M4 11h10" />
            </svg>
          </button>
        </div>
      </nav>

      <div
        id="site-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`site-menu px-6 md:px-12 ${open ? "is-open" : ""}`}
        hidden={!open}
      >
        <div className="mx-auto flex h-18 max-w-350 items-center justify-between">
          <Link href="/" onClick={close} className="site-wordmark text-white" aria-label={`${site.brand} — home`}>
            {site.brand}
          </Link>
          <button type="button" className="site-round" aria-label="Close the menu" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="mx-auto grid max-w-350 gap-12 pb-12 pt-6 md:grid-cols-[1fr_auto] md:pt-10">
          <ol className="site-menu-list">
            {SECTIONS.map((section, index) => {
              const current = pathname === section.href || pathname.startsWith(`${section.href}/`);
              return (
                <li key={section.href}>
                  <span className="site-menu-num">{String(index + 1).padStart(2, "0")}</span>
                  <Link
                    ref={index === 0 ? firstLinkRef : undefined}
                    href={section.href}
                    onClick={close}
                    aria-current={current ? "page" : undefined}
                    className="site-menu-link"
                  >
                    {section.label}
                  </Link>
                  {"note" in section && <span className="site-menu-note">* {section.note}</span>}
                </li>
              );
            })}
          </ol>

          <div className="site-menu-side">
            <span className="site-lang" aria-label="Language: English">EN</span>
            <a href={`mailto:${site.email}`} className="break-all">
              {site.email}
            </a>
            <a href={site.phoneHref}>{site.phone}</a>
            <div className="flex gap-3">
              {site.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="site-round site-round-ghost"
                  aria-label={link.label}
                >
                  {link.label === "GitHub" ? <GithubGlyph /> : <LinkedinGlyph />}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function GithubGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function LinkedinGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11.25H3V9.75Zm6.5 0h3.83v1.54h.06c.53-1.01 1.84-2.07 3.79-2.07 4.05 0 4.8 2.66 4.8 6.13V21h-4v-4.95c0-1.18-.02-2.7-1.65-2.7-1.65 0-1.9 1.29-1.9 2.62V21h-4V9.75Z" />
    </svg>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SECTIONS } from "@/content/nav";
import { site } from "@/content/site";

export default function SiteNav() {
  const pathname = usePathname();
  const stripRef = useRef<HTMLDivElement>(null);
  // Whether the phone strip has links out of sight at either end.
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      setMore({ left: strip.scrollLeft > 2, right: strip.scrollLeft < max - 2 });
    };
    // On the narrowest phones the strip is wider than the screen, and the
    // link cut off at its end was the current page's own. Bring it in.
    const active = strip.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const pad = 24;
      const past =
        active.offsetLeft + active.offsetWidth + pad -
        (strip.scrollLeft + strip.clientWidth);
      if (past > 0) strip.scrollLeft += past;
      else if (active.offsetLeft - pad < strip.scrollLeft) {
        strip.scrollLeft = Math.max(0, active.offsetLeft - pad);
      }
    }
    // The observer reports once as soon as it starts watching, which takes
    // the first reading; scrolling and resizing take the rest.
    strip.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    return () => {
      strip.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [pathname]);

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
        {/* Face and wordmark, the way a byline sits: the photo says whose
            site it is, the italic says what it is, and neither is shouting
            next to the mono links. */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 text-white"
          aria-label={`${site.name} — home`}
        >
          <span className="relative size-9 overflow-hidden rounded-full ring-1 ring-white/35 transition-[box-shadow] group-hover:ring-white/70">
            <Image
              src="/avatar.webp"
              alt=""
              fill
              sizes="36px"
              priority
              className="object-cover"
            />
          </span>
          <span className="font-brand text-[1.35rem] italic leading-none tracking-[-0.01em]">
            my portfolio
          </span>
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

        {/* On the narrowest phones the wordmark and the full label do not
            both fit, so the button says "CV" — "Get my" stays in its
            accessible name. */}
        <a
          href={site.cvHref}
          download
          className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#0E2438] transition-opacity hover:opacity-85"
        >
          <span className="max-[339px]:sr-only">Get my </span>CV
        </a>
      </nav>

      {/* The desktop links don't fit under ~768px, so small screens get a
          scrollable strip rather than a hamburger — four items don't justify
          hiding navigation behind a tap. */}
      <div className="relative border-t border-white/10 md:hidden">
        {/* The links carry the padding rather than the strip, so each one is
            a ~36px tap target instead of a 12px line of type. */}
        <div
          ref={stripRef}
          className="relative flex gap-5 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((section) => {
            const active = pathname.startsWith(section.href);
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`meta block whitespace-nowrap py-3 transition-colors ${
                  active ? "text-[#7CC4F0]" : "text-white/75"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>

        {/* A scrollbar under four words is clutter, so the strip hides its
            own and fades the end with links still past it — the cue that it
            scrolls. Each fade is the bar's own blue at that edge. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-linear-to-r from-[#0E2438] to-transparent transition-opacity duration-200 ${
            more.left ? "opacity-100" : "opacity-0"
          }`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-[#133A5E] to-transparent transition-opacity duration-200 ${
            more.right ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </header>
  );
}

import Link from "next/link";

import { wide } from "@/components/home/wide-font";
import { SECTIONS } from "@/content/nav";
import { site } from "@/content/site";

/**
 * The footer: the wordmark, the menu and the contacts. Red under the home
 * page, white under the others (see .home-light).
 */
export default function SiteFooter() {
  return (
    <footer className={`site-footer home ${wide.variable} border-t border-[var(--home-line)] px-6 pb-10 pt-16 md:px-12`}>
      <div className="mx-auto grid max-w-350 gap-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Link href="/" className="site-wordmark">
            {site.brand}
          </Link>
          <p className="mt-5 max-w-xs leading-relaxed text-[var(--home-dim)]">
            Certified auto-entrepreneur and full-stack developer: web and
            mobile apps, computer vision and brand identity.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] uppercase tracking-wider">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link href={section.href} className="transition-colors hover:text-[var(--home-sky)]">
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3 text-[15px] md:text-right">
          {/* On a narrow phone the address wraps after the "@", not mid-word. */}
          <a href={`mailto:${site.email}`} className="block [overflow-wrap:anywhere] transition-colors hover:text-[var(--home-sky)]">
            {site.email.split("@")[0]}@<wbr />
            {site.email.split("@")[1]}
          </a>
          <a href={site.phoneHref} className="block transition-colors hover:text-[var(--home-sky)]">
            {site.phone}
          </a>
          <div className="flex gap-4 pt-2 text-[12px] uppercase tracking-wider md:justify-end">
            {site.links.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--home-sky)]">
                {link.label} ↗
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-14 flex max-w-350 flex-wrap justify-between gap-4 border-t border-[var(--home-line)] pt-6 text-[11px] uppercase tracking-wider text-[var(--home-dim)]">
        <span>© {site.brand}</span>
        <span>Designed and built by me</span>
      </div>
    </footer>
  );
}

import Link from "next/link";

import Hero from "@/components/hero/hero";
import { HeroSignalProvider } from "@/components/hero/hero-signal-context";
import ImacSection from "@/components/imac/imac-section";
import { SECTIONS } from "@/content/nav";

export default function Home() {
  return (
    /* One provider for both sections: the hero's morph and the iMac's finger
       cursor read the same sensor, so the page opens one camera stream and
       downloads the hand model once. */
    <HeroSignalProvider>
      <Hero />
      <ImacSection />

      {/* The 3D desktop needs a camera and a pointer. This is the plain-text
          route to the same four pages, and the only one on a phone. */}
      <nav aria-label="Sections" className="px-6 pb-24 md:px-12">
        <ul className="mx-auto max-w-350 border-t border-line">
          {SECTIONS.map((section, index) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="group flex items-baseline justify-between gap-6 border-b border-line py-6 transition-colors hover:border-accent"
              >
                <span className="flex items-baseline gap-5">
                  <span className="meta text-dim transition-colors group-hover:text-accent">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="text-2xl font-medium tracking-tight transition-colors group-hover:text-accent md:text-3xl">
                    {section.label}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-dim transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </HeroSignalProvider>
  );
}

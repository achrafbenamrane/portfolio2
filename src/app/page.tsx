import Link from "next/link";

import CtaBanner from "@/components/cta-banner";
import Hero from "@/components/hero/hero";
import Services from "@/components/services";
import Testimonials from "@/components/testimonials";
import { SECTIONS } from "@/content/nav";

export default function Home() {
  return (
    <>
      <Hero />

      <Services />

      {/* The plain-text route to the four pages. */}
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

      {/* Renders nothing until there are real quotes. */}
      <Testimonials />

      <CtaBanner />
    </>
  );
}

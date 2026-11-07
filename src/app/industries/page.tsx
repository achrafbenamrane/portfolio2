import type { Metadata } from "next";
import Link from "next/link";

import { BuildYours, Chapter } from "@/components/brand/chapter";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Industries",
  description:
    "The industries I build for, and the shipped projects behind each one.",
};

/** Each industry with what I build there and the real work that proves it. */
const INDUSTRIES = [
  {
    name: "Restaurants & food delivery",
    builds: "Ordering apps, loyalty programmes, digital menus and delivery booking.",
    work: [{ name: "La Casa da Pizza", href: "/projects" }, { name: "NeemaFood", href: "/projects" }],
  },
  {
    name: "Retail & e-commerce",
    builds: "Online stores with cash on delivery, order tracking and Arabic-first checkouts.",
    work: [{ name: "Aloulou 93", href: "/projects" }, { name: "Boutique Amine", href: "/projects" }],
  },
  {
    name: "Real estate & marketplaces",
    builds: "Listings, swipeable discovery feeds, escrow and mobile-money payments.",
    work: [{ name: "Linky", href: "/projects" }],
  },
  {
    name: "Sport & recruiting",
    builds: "Talent profiles, matching, rankings and in-app chat between athletes and scouts.",
    work: [{ name: "Getdraft", href: "/projects" }],
  },
  {
    name: "Public safety & services",
    builds: "Geolocated alerts, responder networks and the sites that explain them.",
    work: [{ name: "La Réserve", href: "/projects" }],
  },
  {
    name: "Consumer brands & products",
    builds: "Logos, packaging lines, online stores and the social pages that launch them.",
    work: [{ name: "ONEFRAME", href: "/case-studies/oneframe" }],
  },
  {
    name: "Technology & AI",
    builds: "Computer vision, gesture control and interactive experiences that run in the browser.",
    work: [{ name: "Origami Portrait", href: "/projects#computer-vision" }, { name: "Point & Pinch Desktop", href: "/projects#computer-vision" }],
  },
];

export default function IndustriesPage() {
  return (
    <>
      <PageHeader
        index="06"
        label="Industries"
        title="Industries"
        outline="I know"
        description="Every business has its habits: ordering on WhatsApp, paying on delivery, a menu in two languages. I know them because I have built for them."
      />

      <Chapter n={String(INDUSTRIES.length).padStart(2, "0")} label="Where I have shipped">
        <ul className="mt-14 border-t border-[var(--home-line)] md:mt-20">
          {INDUSTRIES.map((industry, index) => (
            <li key={industry.name} className="grid gap-4 border-b border-[var(--home-line)] py-8 md:grid-cols-[64px_1.1fr_1.2fr_1fr] md:items-baseline md:gap-8">
              <span className="text-[13px] tracking-wider text-[var(--home-dim)]">{String(index + 1).padStart(2, "0")}</span>
              <h2 className="home-display text-[clamp(1.2rem,2vw,1.7rem)] leading-snug">{industry.name}</h2>
              <p className="leading-relaxed text-[var(--home-dim)]">{industry.builds}</p>
              <ul className="flex flex-wrap gap-2 md:justify-end">
                {industry.work.map((item) => (
                  <li key={item.name}>
                    <Link href={item.href} className="inline-block rounded-full border border-[var(--home-line)] px-3 py-1.5 text-[12px] uppercase tracking-wider transition-colors hover:border-[var(--home-sky)] hover:text-[var(--home-sky)]">
                      {item.name} ↗
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-6 rounded-[6px] border border-[var(--home-line)] p-8">
          <div>
            <h2 className="home-display text-[clamp(1.2rem,2vw,1.7rem)]">Your industry next</h2>
            <p className="mt-2 text-[var(--home-dim)]">Health, education, tourism, industry: tell me how your business works.</p>
          </div>
          <Link href="/contact" className="home-btn">
            Start a project
          </Link>
        </div>
      </Chapter>

      <BuildYours />
    </>
  );
}

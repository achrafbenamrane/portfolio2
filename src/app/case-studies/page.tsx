import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BuildYours, Chapter } from "@/components/brand/chapter";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Case studies",
  description:
    "The thinking behind AXIOM's work: the problem, the decisions and what shipped.",
};

/** Every case study, in the order of their numbers (04.1, 04.2…). */
const CASES = [
  {
    href: "/case-studies/oneframe",
    client: "ONEFRAME",
    title: "Each frame tells a story in 3D",
    summary:
      "A brand for one-of-a-kind lit 3D frames: the boxed wordmark, six packaging designs where every box tells its own story, the online store and the Instagram page.",
    tags: ["Brand identity", "Packaging", "Online store"],
    image: "/projects/oneframe/products-grid.webp",
    alt: "Six ONEFRAME frames in a grid",
    year: "2025",
  },
  {
    href: "/case-studies/getdraft",
    client: "Getdraft",
    title: "Get discovered. It's a Draft!",
    summary:
      "A sports recruiting app for iOS and Android, and its website: athletes, coaches and recruiters swipe to Draft, and chat opens only when it's mutual.",
    tags: ["Mobile app", "Back-end", "Website"],
    image: "/projects/getdraft-web/screen-1.webp",
    alt: "Getdraft's website: Get discovered. It's a Draft!",
    year: "2026",
  },
  {
    href: "/case-studies/linky",
    client: "Linky",
    title: "A marketplace where trust is built in",
    summary:
      "A marketplace and real-estate app, and its website: verified sellers, Mobile Money, and payments held in escrow until the buyer confirms delivery.",
    tags: ["Mobile app", "Payments", "Website"],
    image: "/projects/linky-web/screen-1.webp",
    alt: "Linky's website: the marketplace and real estate, in one app",
    year: "2026",
  },
  {
    href: "/case-studies/aloulou93",
    client: "Aloulou 93",
    title: "A streetwear store that ships nationwide",
    summary:
      "An online store in three languages, Arabic laid out right to left: sizes and colours in stock, delivery fees by region, cash on delivery, and a back-office for the orders.",
    tags: ["Online store", "Back-office", "Three languages"],
    image: "/projects/aloulou93/screen-2.webp",
    alt: "Aloulou 93's online store: shop by category",
    year: "2026",
  },
];

export default function CaseStudiesPage() {
  return (
    <>
      <PageHeader
        index="04"
        label="Case studies"
        title="Case"
        outline="studies"
        description="The thinking behind the work: the problem we were handed, the decisions we made, and what shipped."
      />

      <Chapter n={String(CASES.length).padStart(2, "0")} label="Featured">
        <ul className="grid gap-x-10 gap-y-20 pt-14 md:grid-cols-2 md:pt-20">
          {CASES.map((item, index) => (
            <li key={item.href} className={index % 2 === 1 ? "md:mt-28" : ""}>
              <Link href={item.href} className="home-card group block">
                <div className="home-card-img relative aspect-[1280/828] overflow-hidden rounded-[4px]">
                  <Image src={item.image} alt={item.alt} fill sizes="(min-width: 768px) 45vw, 100vw" />
                </div>
                <p className="mt-6 text-[11px] uppercase tracking-wider text-[var(--home-sky)]">
                  04.{index + 1} · {item.client} · {item.year}
                </p>
                <h2 className="home-display mt-3 text-[clamp(1.5rem,2.4vw,2.2rem)] leading-[1.08]">{item.title}</h2>
                <p className="mt-4 leading-relaxed text-[var(--home-dim)]">{item.summary}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <li key={tag} className="rounded-full border border-[var(--home-line)] px-3 py-1.5 text-[12px] uppercase tracking-wider">
                      {tag}
                    </li>
                  ))}
                </ul>
                <span className="home-btn mt-7">Read the case study →</span>
              </Link>
            </li>
          ))}
        </ul>
      </Chapter>

      <BuildYours line="Could yours be the next one?" />
    </>
  );
}

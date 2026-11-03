import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BuildYours, Chapter } from "@/components/brand/chapter";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Expertise",
  description:
    "Full-stack development, computer vision and brand identity: what AXIOM builds, with what, and the projects that prove it.",
};

const SERVICES = [
  {
    id: "full-stack",
    label: "Full-stack development",
    title: "Full-stack",
    outline: "development",
    intro:
      "The whole product, front to back: what your customers see, the back end that runs it, and the servers it lives on. Then we keep it running.",
    builds: ["Web apps and platforms", "Mobile apps for iOS and Android", "Online stores with cash on delivery", "APIs, databases and admin panels", "Hosting, monitoring and maintenance"],
    tools: ["Next.js", "React", "React Native", "Node.js", "PostgreSQL", "Firebase", "Stripe"],
    proof: [
      { name: "Getdraft", note: "App in both stores, and its website" },
      { name: "Aloulou 93", note: "Online store, nationwide delivery" },
      { name: "Boutique Amine", note: "Arabic-first online store" },
      { name: "Linky", note: "Marketplace and real-estate platform" },
    ],
    image: "/projects/getdraft-web/screen-1.webp",
    href: "/projects",
    cta: "See the projects",
  },
  {
    id: "computer-vision",
    label: "Computer vision",
    title: "Computer",
    outline: "vision",
    intro:
      "Software that sees: it tracks hands, reads gestures and analyses images and video, in the browser or on a server. We prototype first, so you can try it before you invest.",
    builds: ["Hand tracking and gesture control", "Image and video analysis", "Detection, counting and tracking", "Interactive installations on the web", "Prototypes you can try in a browser"],
    tools: ["MediaPipe", "Three.js", "WebGL", "TypeScript"],
    proof: [
      { name: "Origami Portrait", note: "A photo that folds as a hand closes" },
      { name: "Point & Pinch Desktop", note: "A desktop steered with one finger" },
    ],
    image: "/portrait.webp",
    href: "/projects#computer-vision",
    cta: "Try the demo",
  },
  {
    id: "brand-identity",
    label: "Brand identity",
    title: "Brand",
    outline: "identity",
    intro:
      "The logo, then everything it lives on: colours, type, packaging and the pages and posts that carry it. Identities that work as hard in print as on a screen.",
    builds: ["Logos and wordmarks", "Visual identity and guidelines", "Packaging lines", "Store and social media visuals"],
    tools: ["Adobe Illustrator", "Photoshop", "Figma"],
    proof: [{ name: "ONEFRAME", note: "Logo, six packaging designs, store" }],
    image: "/projects/oneframe/road-to-your-walls.webp",
    href: "/case-studies/oneframe",
    cta: "Read the ONEFRAME case study",
  },
];

export default function ExpertisePage() {
  return (
    <>
      <PageHeader
        index="02"
        label="Expertise"
        title="Three disciplines,"
        outline="one studio"
        description="Full-stack development, computer vision and brand identity, under one roof and in one pair of hands, so nothing gets lost between them."
      />

      {SERVICES.map((service, index) => (
        <Chapter key={service.id} id={service.id} n={String(index + 1).padStart(2, "0")} label={service.label}>
          <div className="grid items-start gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
            <div>
              <h2 className="home-display text-[clamp(1.7rem,3.3vw,3.1rem)] leading-[1.04]">
                <span className="block">{service.title}</span>
                <span className="home-outline block">{service.outline}</span>
              </h2>
              <p className="mt-6 max-w-lg leading-relaxed text-[var(--home-dim)]">
                {service.intro}
              </p>
              <div className="relative mt-10 aspect-[16/10] overflow-hidden rounded-[4px] bg-[#0e2438]">
                <Image src={service.image} alt="" fill sizes="(min-width: 768px) 45vw, 100vw" className="object-cover object-top" />
              </div>
            </div>

            <div className="space-y-12">
              <Block title="What we build">
                <ul className="divide-y divide-current/10">
                  {service.builds.map((item) => (
                    <li key={item} className="py-3 text-[17px]">{item}</li>
                  ))}
                </ul>
              </Block>
              <Block title="Tools">
                <ul className="flex flex-wrap gap-2">
                  {service.tools.map((tool) => (
                    <li key={tool} className="rounded-full border border-current/25 px-3 py-1.5 text-[13px]">{tool}</li>
                  ))}
                </ul>
              </Block>
              <Block title="Proof">
                <ul className="space-y-3">
                  {service.proof.map((item) => (
                    <li key={item.name} className="flex items-baseline justify-between gap-6">
                      <span className="home-display text-[15px]">{item.name}</span>
                      <span className="text-right text-[13px] opacity-75">{item.note}</span>
                    </li>
                  ))}
                </ul>
              </Block>
              <Link href={service.href} className="home-btn">
                {service.cta}
              </Link>
            </div>
          </div>
        </Chapter>
      ))}

      <BuildYours />
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-4 border-b border-[var(--home-line)] pb-3 text-[11px] uppercase tracking-wider text-[var(--home-sky)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

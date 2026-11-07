import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CertifiedBadge } from "@/components/brand/certified-badge";
import { BuildYours, Chapter } from "@/components/brand/chapter";
import PageHeader from "@/components/page-header";
import { certifications, experiences, projects, site } from "@/content/site";

export const metadata: Metadata = {
  title: "About me",
  description:
    "I'm Achraf Benamrane, a certified auto-entrepreneur and full-stack developer: web and mobile apps, computer vision and brand identity.",
};

const STEPS = [
  { title: "I listen", body: "A call to understand your business, your users and what success looks like.", get: "A clear written quote" },
  { title: "I design", body: "Every screen drawn before a line of code, in every language your customers read.", get: "A clickable prototype" },
  { title: "I build", body: "Front end, back end and infrastructure, with a working version to test at every step.", get: "A version you can use" },
  { title: "I launch, and stay", body: "Online, in the app stores, then monitored, maintained and improved.", get: "Your product, live" },
];

const PRINCIPLES = [
  { title: "Fixed scope, written quote", body: "The price is agreed before work starts, and it does not move." },
  { title: "Paid in stages", body: "A deposit to start and the balance on delivery. Never everything up front." },
  { title: "You own everything", body: "The code, the designs, the domain and every account are yours." },
  { title: "Three languages built in", body: "French, Arabic and English, with Arabic laid out right to left, at no extra cost." },
  { title: "Security by default", body: "HTTPS, backups and least-privilege access in every project, from a security engineer." },
  { title: "Support after launch", body: "I stay on: fixes, updates and new features as your product grows." },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        index="01"
        label="About me"
        title="Achraf Benamrane"
        outline="your developer"
        description="A certified auto-entrepreneur and full-stack developer for web and mobile apps, computer vision and brand identity. One senior specialist across every role, from the first call to launch."
      />

      <Chapter n="01" label="Why me">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            <span className="whitespace-nowrap">One person,</span>{" "}
            <span className="home-outline">by design</span>
          </h2>
          <div className="space-y-5 leading-relaxed text-[var(--home-dim)]">
            <p>
              I&apos;m the person you talk to, and the person who designs,
              builds and launches your product. No account managers, no
              juniors, no hand-offs: decisions are made fast, and nothing gets
              lost between the idea and the code that ships.
            </p>
            <p>
              I take on a limited number of projects at a time, so each one
              gets my full attention, and I stay on after launch.
            </p>
          </div>
        </div>
        <dl className="mt-16 grid gap-px overflow-hidden rounded-[4px] border border-[var(--home-line)] bg-[var(--home-line)] sm:grid-cols-2 lg:grid-cols-4">
          <Fact value={String(projects.length)} label="Projects shipped" />
          <Fact value="3" label="Disciplines, one person" />
          <Fact value="1" label="Point of contact, start to finish" />
          <Fact value="3" label="Languages in every project" />
        </dl>
      </Chapter>

      <Chapter n="02" label="How I work">
        <h2 className="home-display pt-14 text-[clamp(2.2rem,5vw,4.6rem)] md:pt-20">
          Four steps, <span className="home-outline-dark">no surprises</span>
        </h2>
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col rounded-[6px] border border-[#281b1c]/15 p-6">
              <span className="home-display text-[2rem] text-[#b3122a]">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="home-display mt-5 text-[15px] leading-snug">{step.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[#281b1c]/75">{step.body}</p>
              <p className="mt-auto border-t border-dashed border-[#281b1c]/20 pt-4 text-[11px] uppercase tracking-wider text-[#b3122a]">
                → {step.get}
              </p>
            </li>
          ))}
        </ol>
      </Chapter>

      <Chapter n="03" label="Principles">
        <h2 className="home-display pt-14 text-[clamp(2.2rem,5vw,4.6rem)] md:pt-20">
          What you <span className="home-outline">can count on</span>
        </h2>
        <ul className="mt-14 grid gap-x-10 gap-y-10 border-t border-[var(--home-line)] pt-10 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((item, index) => (
            <li key={item.title}>
              <span className="text-[11px] tracking-wider text-[var(--home-dim)]">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="home-display mt-2 text-[16px] leading-snug">{item.title}</h3>
              <p className="mt-3 leading-relaxed text-[var(--home-dim)]">{item.body}</p>
            </li>
          ))}
        </ul>
      </Chapter>

      <Chapter n="04" label="Who I am">
        <div className="grid items-center gap-12 pt-14 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-20 md:pt-20">
          <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-[4px] bg-[#8f1024]">
            <Image src="/portrait.webp" alt="Achraf Benamrane" fill sizes="(min-width: 768px) 420px, 90vw" className="object-cover object-top" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#b3122a]">Full-stack developer</p>
            <h2 className="home-display mt-3 text-[clamp(1.8rem,3.2vw,2.9rem)]">{site.brand}</h2>
            <div className="mt-5">
              <CertifiedBadge className="border border-[#15803d]/40 bg-[#15803d]/[0.07]" />
            </div>
            <p className="mt-6 max-w-xl leading-relaxed text-[#281b1c]/75">
              I&apos;m a certified auto-entrepreneur and full-stack engineer,
              with a Master&apos;s in network and information security. My work:
              apps live in the App Store and on Google Play, online stores
              taking orders every day, computer vision running in the browser,
              and brands printed on real boxes.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/experience" className="home-btn home-btn-dark">
                Track record · {experiences.length}
              </Link>
              <Link href="/certifications" className="home-btn home-btn-ghost">
                Credentials · {certifications.length}
              </Link>
            </div>
          </div>
        </div>
      </Chapter>

      <BuildYours />
    </>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--home-bg)] p-6">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="home-display block text-[clamp(2.4rem,4vw,3.4rem)]">{value}</span>
        <span className="mt-3 block text-[13px] uppercase tracking-wider text-[var(--home-dim)]">{label}</span>
      </dd>
    </div>
  );
}

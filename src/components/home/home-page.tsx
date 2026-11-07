import Image from "next/image";
import Link from "next/link";

import { CertifiedBadge } from "@/components/brand/certified-badge";
import { site } from "@/content/site";
import CoffeeCountdown from "./coffee-countdown";
import { wide } from "./wide-font";

/**
 * The home page, laid out after treize.pro: wide uppercase headlines, words
 * in outline, numbered section rules, tilted photos, a logo wall, staggered
 * project cards, a numbered FAQ and a three-column contact.
 */

type Client = {
  name: string;
  /** A square picture, shown cut to a circle. */
  logo: string;
  field?: string;
  /** What I made for them. */
  work: string;
  /** Their own colour, which the card takes on under the pointer. */
  brand: string;
};

/**
 * Who I have built for, in two rows that slide past each other. The rows
 * mix apps, stores and logos, so each shows all three kinds of work. The
 * logos in /clients were cut from the clients' own artwork; DMD's leaves off
 * the tagline under its monogram.
 */
const CLIENT_ROWS: Client[][] = [
  [
    { name: "Getdraft", logo: "/apps/getdraft.png", field: "Sport", work: "App & website", brand: "#0C0C0C" },
    { name: "Aloulou 93", logo: "/clients/aloulou93.webp", field: "Fashion", work: "Online store", brand: "#2B4739" },
    { name: "OSCA", logo: "/clients/osca.webp", field: "Open source", work: "Logo", brand: "#1E4F86" },
    { name: "Linky", logo: "/apps/linky.png", field: "Real estate", work: "App & website", brand: "#006C54" },
    { name: "La Réserve", logo: "/clients/la-reserve.webp", field: "Public safety", work: "Landing page", brand: "#E8342C" },
    { name: "Berchicha", logo: "/clients/berchicha.webp", field: "Sneakers", work: "Logo", brand: "#2E8B3E" },
  ],
  [
    { name: "NeemaFood", logo: "/apps/neemafood.png", field: "Food", work: "Mobile app", brand: "#0CB478" },
    { name: "Boutique Amine", logo: "/clients/boutique-amine.webp", field: "Retail", work: "Online store", brand: "#C82868" },
    { name: "DMD", logo: "/clients/dmd.webp", field: "Clothing", work: "Logo", brand: "#9AA3AB" },
    { name: "La Casa da Pizza", logo: "/apps/la-casa.png", field: "Restaurant", work: "Mobile app", brand: "#D20612" },
    { name: "Wave", logo: "/apps/wave.png", work: "Mobile app", brand: "#249CA8" },
    { name: "M", logo: "/apps/m.png", work: "Mobile app", brand: "#C00C24" },
  ],
];

const PROJECTS = [
  { title: "Getdraft", field: "Sport", type: "Mobile app & website", image: "/projects/getdraft-web/screen-1.webp" },
  { title: "Aloulou 93", field: "Fashion", type: "Online store", image: "/projects/aloulou93/screen-1.webp" },
  { title: "Boutique Amine", field: "Retail", type: "Online store", image: "/projects/boutique-amine/screen-1.webp" },
  { title: "Linky", field: "Real estate", type: "Web platform", image: "/projects/linky-web/screen-1.webp" },
];

const FAQ = [
  {
    q: "Who will actually work on my project?",
    a: "Me, from the first call to launch. No account managers, no juniors, no hand-offs. You always talk to the person doing the work, which is why projects move fast and nothing gets lost.",
  },
  {
    q: "Are you a registered professional?",
    a: "Yes. I'm a certified auto-entrepreneur, so you're hiring a registered professional, with the scope and the price agreed in writing before any work begins.",
  },
  {
    q: "Why hire one person for the whole product?",
    a: "Because nothing gets lost in the handover. The same hands design your screens, build the front end and the back end, and put it online, so what you approve is what ships.",
  },
  {
    q: "What can computer vision do for my business?",
    a: "Detect, count, recognise and track: products on a shelf, people in a queue, documents to read, gestures to control a screen. I build a working prototype first, often right in the browser, so you can try it before you invest.",
  },
  {
    q: "Do you use artificial intelligence to build?",
    a: "Yes, as a tool: for research, structure and some of the code. But I make every decision, and I check every line that ships.",
  },
  {
    q: "Do you subcontract any of the work?",
    a: "Never. Development, computer vision, brand identity and launch are all done by me, from the first sketch to the app stores.",
  },
  {
    q: "How do payments work?",
    a: "In stages: a deposit to start and the balance on delivery. Never everything up front, and we agree the price in writing before any work begins.",
  },
  {
    q: "Can my site be in Arabic, French and English?",
    a: "Yes. I build sites and apps in all three, with Arabic laid out right to left. Boutique Amine, for example, I built Arabic-first.",
  },
];

export default function HomePage() {
  return (
    <div className={`home home-stage ${wide.variable}`}>
      <Hero />

      <Section id="expertise" label="Full-stack development" n="01">
        <div className="grid items-center gap-14 pt-16 md:grid-cols-2 md:gap-20 md:pt-24">
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              One developer, your whole product
            </h2>
            <p className="mt-6 max-w-lg leading-relaxed text-[var(--home-dim)]">
              Web apps, mobile apps, websites, APIs and databases: I build it
              front to back, put it online, and keep it running for years after
              launch. I do three things, full-stack development, computer vision
              and brand identity, because I&apos;d rather be the best at three
              things than decent at ten.
            </p>
            <Link href="/projects" className="home-btn mt-8">
              See my work
            </Link>
          </div>
          <Devices />
        </div>
      </Section>

      <Section id="vision" label="Computer vision" n="02">
        <div className="grid items-center gap-14 pt-16 md:grid-cols-2 md:gap-20 md:pt-24">
          <div className="md:order-2">
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              I teach software to see
            </h2>
            <p className="mt-6 max-w-lg leading-relaxed text-[var(--home-dim)]">
              Hand tracking, gesture control, image and video analysis, running
              in the browser or on a server. Try it on my own site: a portrait
              that folds into paper when you close your hand, and a desktop you
              steer with one finger. The video never leaves your machine.
            </p>
            <Link href="/projects#computer-vision" className="home-btn mt-8">
              Try the hand-tracking demo
            </Link>
          </div>
          <Photos
            a="/vision/street-detection.webp"
            b="/vision/cctv-tracking.webp"
            center
            sticker="Computer · Vision · "
            id="ring-vision"
            eye
            flip
          />
        </div>
      </Section>

      <Section id="identity" label="Brand identity" n="03">
        <div className="grid items-center gap-14 pt-16 md:grid-cols-2 md:gap-20 md:pt-24">
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              I build brand identities for businesses
            </h2>
            <p className="mt-6 max-w-lg leading-relaxed text-[var(--home-dim)]">
              A logo is where it starts. Then come the colours, the type, the
              packaging and everything your customers hold in their hands.
              ONEFRAME, my own brand of 3D car frames, is the proof: I drew
              its wordmark and a packaging line where every box tells its own
              story.
            </p>
            <Link href="/case-studies/oneframe" className="home-btn mt-8">
              Read the ONEFRAME case study
            </Link>
          </div>
          <Photos
            a="/projects/oneframe/products-grid.webp"
            b="/projects/oneframe/road-to-your-walls.webp"
            center
            sticker="Logo · Packaging · Identity · "
            id="ring-identity"
          />
        </div>
      </Section>

      <Section id="about" label="About" n="04">
        <div className="grid items-center gap-14 pt-16 md:grid-cols-2 md:gap-20 md:pt-24">
          <div className="md:order-2">
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              You work with me, from first call to launch
            </h2>
            <p className="mt-6 max-w-lg leading-relaxed text-[var(--home-dim)]">
              I&apos;m a certified auto-entrepreneur, so you hire me directly.
              The person you talk to is the person who designs, builds and
              launches your product: no account managers, no juniors, no
              hand-offs. I take on a limited number of projects at a time, so
              each one gets my full attention.
            </p>
            <Link href="/about" className="home-btn mt-8">
              Get to know me
            </Link>
          </div>
          <Photos
            a="/projects/boutique-amine/screen-1.webp"
            b="/projects/aloulou93/screen-1.webp"
            sticker="Build · Ship · Support · "
            id="ring-about"
            flip
          />
        </div>
      </Section>

      {/* Not a <Section>: the rows run the full width of the page, past
          the column the heading sits in. */}
      <section id="clients" className="scroll-mt-16 py-20 md:py-28">
        <div className="px-6 md:px-12">
          <div className="mx-auto max-w-350">
            <div className="home-row">
              <span>
                <span aria-hidden>/</span>
                <span>Clients</span>
              </span>
              <span>05</span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6 pt-16 md:pt-24">
              <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
                Brands that <span className="home-outline">trust me</span>
              </h2>
              <p className="max-w-sm leading-relaxed text-[var(--home-dim)]">
                Apps, online stores and logos for businesses in sport, real
                estate, fashion, food and public safety.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-14 space-y-2 md:mt-20">
          {CLIENT_ROWS.map((row, index) => (
            <ClientRow key={index} clients={row} reverse={index % 2 === 1} />
          ))}
        </div>
      </section>

      <Section id="projects" label="Projects" n="06">
        <h2 className="home-display pt-16 text-[clamp(2.2rem,5vw,4.6rem)] md:pt-24">
          Recent <span className="home-outline">projects</span>
        </h2>
        <div className="mt-14 grid gap-x-10 gap-y-16 md:grid-cols-2">
          {PROJECTS.map((project, index) => (
            <Link
              key={project.title}
              href="/projects"
              className={`home-card block ${index % 2 === 1 ? "md:mt-28" : ""}`}
            >
              <div className="home-card-img relative aspect-[1280/828]">
                <Image
                  src={project.image}
                  alt={`${project.title}, ${project.type.toLowerCase()}`}
                  fill
                  sizes="(min-width: 768px) 45vw, 100vw"
                />
              </div>
              <div className="mt-5 flex items-start justify-between gap-6">
                <div>
                  <h3 className="home-display text-[15px] md:text-base">{project.title}</h3>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--home-dim)]">
                    {project.field}
                  </p>
                </div>
                <span className="text-right text-xs text-[var(--home-dim)]">{project.type}</span>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-16 flex justify-center">
          <Link href="/projects" className="home-btn">
            Discover my projects
          </Link>
        </div>
      </Section>

      <Section id="faq" label="FAQ" n="07">
        <h2 className="home-display pt-16 text-[clamp(1.8rem,3.2vw,2.9rem)] md:pt-24">
          Frequently asked questions
        </h2>
        <div className="home-faq mt-12 border-t border-[var(--home-line)]">
          {FAQ.map((item, index) => (
            <details key={item.q}>
              <summary>
                <span className="num">{index + 1}</span>
                <span className="home-display text-[clamp(1rem,1.6vw,1.35rem)] leading-snug">
                  {item.q}
                </span>
                <span className="plus" aria-hidden />
              </summary>
              <p className="max-w-3xl pb-8 pl-[42px] leading-relaxed text-[var(--home-dim)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </Section>

      <Contact />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-dvh flex-col justify-end px-6 pb-14 pt-36 md:px-12">
      <div className="mx-auto w-full max-w-350">
        <div className="border-t border-[var(--home-line)] pt-8 md:ml-[7%]">
          <CertifiedBadge className="mb-6 bg-[#f8fafc]" />
          <h1 className="home-display text-[clamp(1.7rem,8vw,2.3rem)] leading-[1.02] md:text-[clamp(1.6rem,4.6vw,4.6rem)]">
            <span className="block">
              I&apos;m {site.brand}
              <span className="home-chip" aria-hidden>
                <Image src="/hero-face.webp" alt="" width={96} height={96} priority />
              </span>
            </span>
            <span className="home-outline block">full-stack developer</span>
            <span className="block md:pl-[9%]">web and mobile apps</span>
          </h1>
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-8 md:ml-[7%]">
          <a href="#expertise" className="home-badge" aria-label="Scroll to the next section">
            <Ring id="ring-hero" text="Scroll · Scroll · Scroll · " />
            <span className="home-badge-core">
              <svg width="18" height="22" viewBox="0 0 18 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 2v18M2 13l7 7 7-7" />
              </svg>
            </span>
          </a>
          <div className="max-w-sm">
            <p className="flex gap-3 text-[12px] uppercase leading-relaxed tracking-wide">
              <svg className="mt-0.5 flex-none text-[var(--home-sky)]" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <path d="M7 1v12M1 7h12M2.8 2.8l8.4 8.4M11.2 2.8l-8.4 8.4" />
              </svg>
              I design, build and launch your app myself. One person from the first idea to launch, a price agreed in writing, and everything is yours.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/contact" className="home-btn">
                Get a quote
              </Link>
              <Link href="/projects" className="home-btn home-btn-ghost">
                See my work
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-[var(--home-line)] pt-4 text-[11px] uppercase tracking-wider md:ml-[7%]">
          {site.availability}
        </div>
      </div>
    </section>
  );
}

function Section({
  id,
  label,
  n,
  children,
}: {
  id: string;
  label: string;
  n: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 px-6 py-20 md:px-12 md:py-28">
      <div className="mx-auto max-w-350">
        <div className="home-row">
          <span>
            <span aria-hidden>/</span>
            <span>{label}</span>
          </span>
          <span>{n}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * One product on both screens: Getdraft's website playing in the laptop and
 * its app in the phone, the plainest proof of what full-stack means.
 */
function Devices() {
  return (
    <div className="home-devices" aria-label="Getdraft, on a laptop and a phone">
      <div className="home-laptop">
        <div className="home-laptop-screen">
          <video
            src="/projects/getdraft-web/site.mp4"
            poster="/projects/getdraft-web/site-poster.webp"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="The Getdraft website, scrolling"
          />
        </div>
        <div className="home-laptop-base" aria-hidden />
      </div>

      <div className="home-phone">
        {/* The app's home screen, held still. */}
        <div className="home-phone-screen">
          <Image
            src="/projects/getdraft-app/discover.webp"
            alt="The Getdraft app's home screen"
            fill
            sizes="(min-width: 768px) 14vw, 27vw"
          />
        </div>
      </div>

      <span className="home-sticker" style={{ left: "62%", top: "-6%" }}>
        <Ring id="ring-expertise" text="Web · Mobile · Back-end · " />
        <span className="home-sticker-core" />
      </span>
    </div>
  );
}

/**
 * One row of client cards, sliding sideways for ever. The list is drawn
 * three times so the row stays full on the widest screen while it slides one
 * copy's width and starts over; the copies are hidden from screen readers.
 * The row stops under the pointer, and stands still for reduced motion.
 */
function ClientRow({ clients, reverse }: { clients: Client[]; reverse: boolean }) {
  return (
    <div className={`home-marquee ${reverse ? "home-marquee-reverse" : ""}`}>
      <div className="home-marquee-track">
        {[0, 1, 2].map((copy) => (
          <ul key={copy} aria-hidden={copy > 0 || undefined}>
            {clients.map((client) => (
              <li
                key={client.name}
                className="home-client"
                style={{ "--brand": client.brand } as React.CSSProperties}
              >
                <Image src={client.logo} alt="" width={72} height={72} sizes="72px" />
                <span>
                  <b>{client.name}</b>
                  <small>{[client.field, client.work].filter(Boolean).join(" · ")}</small>
                </span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/** Two tilted photos, overlapping, with a spinning sticker on top. */
function Photos({
  a,
  b,
  sticker,
  id,
  flip = false,
  eye = false,
  center = false,
}: {
  a: string;
  b: string;
  sticker: string;
  id: string;
  flip?: boolean;
  eye?: boolean;
  /** Frame both pictures on their middle, not their top: for pictures whose
   *  subject sits in the centre, such as a logo. Inline, because the photo
   *  stylesheet's object-position would beat a utility class. */
  center?: boolean;
}) {
  const fit = center ? { objectPosition: "center" } : undefined;
  return (
    <div className={`relative h-[340px] sm:h-[420px] ${flip ? "md:order-1" : ""}`} aria-hidden>
      <div
        className="home-photo"
        style={{ left: flip ? "30%" : "4%", top: "4%", width: "62%", height: "62%", transform: `rotate(${flip ? 5 : -4}deg)` }}
      >
        <Image src={a} alt="" fill sizes="(min-width: 768px) 30vw, 60vw" style={fit} />
      </div>
      <div
        className="home-photo"
        style={{ left: flip ? "4%" : "34%", top: "36%", width: "60%", height: "58%", transform: `rotate(${flip ? -6 : 5}deg)` }}
      >
        <Image src={b} alt="" fill sizes="(min-width: 768px) 30vw, 60vw" style={fit} />
      </div>
      <span className="home-sticker" style={{ left: flip ? "68%" : "58%", top: "-4%" }}>
        <Ring id={id} text={sticker} />
        {eye ? (
          <span className="home-sticker-core grid place-items-center">
            <EyeGlyph />
          </span>
        ) : (
          <span className="home-sticker-core" />
        )}
      </span>
    </div>
  );
}

/**
 * Text running round a circle, for the badge and the stickers. Stretched to
 * exactly the circumference (2π × 38 ≈ 238), so the words meet end to end
 * whatever their length, instead of running over each other.
 */
function Ring({ id, text }: { id: string; text: string }) {
  return (
    <svg className="home-ring" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <path id={id} d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
      </defs>
      <text fill="currentColor" fontSize="9.5" fontWeight="600" style={{ textTransform: "uppercase" }}>
        <textPath href={`#${id}`} textLength="236" lengthAdjust="spacing">
          {text}
        </textPath>
      </text>
    </svg>
  );
}

function EyeGlyph() {
  return (
    <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Contact() {
  return (
    <section id="contact" className="bg-white px-6 py-20 text-[#281b1c] md:px-12 md:py-28">
      <div className="mx-auto max-w-350">
        <p className="border-t border-[#281b1c]/15 pt-4 text-center text-[11px] uppercase tracking-wider">
          Contact
        </p>

        <h2 className="home-display mt-16 text-center text-[clamp(2.4rem,6vw,5.6rem)] leading-[1.02]">
          {["Let's build", "your project"].map((line) => (
            <span key={line} className="home-fill">
              <span className="home-outline-dark">{line}</span>
              <span aria-hidden>{line}</span>
            </span>
          ))}
        </h2>

        <div className="mt-10 flex justify-center">
          <Link href="/contact" className="home-btn home-btn-dark">
            Get a quote
          </Link>
        </div>

        <div className="mt-20 grid gap-12 border-t border-[#281b1c]/15 pt-10 md:grid-cols-3">
          <div>
            <h3 className="home-display text-[17px] leading-snug">Want to chat?</h3>
            <p className="mt-5 text-[13px] uppercase tracking-wide">
              <a href={`mailto:${site.email}`} className="break-all underline-offset-4 hover:underline">
                {site.email}
              </a>
              <br />
              <a href={site.phoneHref} className="underline-offset-4 hover:underline">
                {site.phone}
              </a>
            </p>
          </div>
          <div>
            <h3 className="home-display text-[17px] leading-snug">
              Otherwise, I&apos;m old-school: I like talking face to face.
            </h3>
            <p className="mt-5 text-[13px] uppercase tracking-wide">
              A video call or a coffee, your pick.
            </p>
          </div>
          <div>
            <h3 className="home-display text-[17px] leading-snug">
              And I like it even more over a coffee!
            </h3>
            <CoffeeCountdown />
            <p className="mt-3 text-[13px] uppercase tracking-wide">Until our next coffee</p>
          </div>
        </div>
      </div>
    </section>
  );
}

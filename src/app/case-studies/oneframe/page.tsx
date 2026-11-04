import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { NextCase } from "@/components/brand/case-parts";
import { wide } from "@/components/home/wide-font";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "ONEFRAME case study",
  description:
    "How we built ONEFRAME's brand: the boxed wordmark, a packaging line where every box tells its own story, the storefront and the Instagram page.",
};

const CDN = "https://res.cloudinary.com/dwvgbojw0/image/upload/f_auto,q_auto";
const INSTAGRAM = "https://www.instagram.com/oneframe.dz";
const STORE = "https://oneframe.me";

/** The frames in the product photo, left to right, with their lines. */
const PRODUCTS = [
  { name: "Chevrolet Camaro", line: "Born to Lead" },
  { name: "Mercedes-AMG", line: "Power in Motion" },
  { name: "Lotus T127", line: "The Lotus Legacy" },
  { name: "Brezina", line: "Explore the Algerian Arizona" },
  { name: "Just Go Out", line: "Make memories with your van" },
  { name: "Bike Life", line: "Where bikes meet mountains, adventure is born" },
];

/** The packaging line, in the words printed on each box. */
const PACKAGING = [
  { name: "Mercedes Frame", line: "Power in Motion", src: `${CDN}/v1765668611/3_mvdmkz.webp` },
  { name: "Just Go Out Frame", line: "The Road to Freedom", src: `${CDN}/v1765668606/5_zsjru0.webp` },
  { name: "F1 Frame", line: "The Lotus Legacy", src: `${CDN}/v1765668604/2_wdhnke.webp` },
  { name: "Brezina Frame", line: "Explore the Algerian Arizona", src: `${CDN}/v1765668609/4_hrie4t.webp` },
];

/**
 * A case study in Wolfexo's own look: the home page's red, its wide uppercase
 * headlines, outlined words and numbered section rules. ONEFRAME's black
 * and white appear only where ONEFRAME itself is shown.
 */
export default function OneFrameCase() {
  return (
    <div className={`home home-light ${wide.variable}`}>
      <PageHeader
        index="04.1"
        label="Case studies — ONEFRAME"
        title="ONEFRAME"
        outline="a story in 3D"
        description="Each frame tells a story in 3D. How we built the brand: the boxed wordmark, a packaging line where every box tells its own story, the storefront and the Instagram page."
      />

      {/* ── the brief, and the brand at a glance ── */}
      <section className="px-6 pb-16 md:px-12 md:pb-24">
        <div className="mx-auto max-w-350">
          <dl className="grid gap-8 border-t border-[var(--home-line)] pt-8 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Client">ONEFRAME, our own brand, 2025</Fact>
            <Fact label="What we did">Logo, brand identity, packaging line, online store</Fact>
            <Fact label="Product">Lit 3D frames, each made only once</Fact>
            <Fact label="Live">
              <a href={STORE} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                oneframe.me ↗
              </a>
              <br />
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                @oneframe.dz ↗
              </a>
            </Fact>
          </dl>

          <div className="relative mx-auto mt-16 aspect-[1080/1056] max-w-[880px] overflow-hidden rounded-[4px] bg-black">
            <Image src="/projects/oneframe/road-to-your-walls.webp" alt="ONEFRAME, on the road to your walls: the logo over a wall of lit frames" fill priority sizes="(min-width: 900px) 880px, 100vw" className="object-cover" />
          </div>
        </div>
      </section>

      {/* ── 01 the story ── */}
      <Chapter n="01" label="The story">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            One frame, <span className="home-outline">one owner</span>
          </h2>
          <div className="space-y-5 leading-relaxed text-[var(--home-dim)]">
            <p>
              ONEFRAME makes lit 3D frames: a model car set inside its own
              scene, a road, a desert, a racetrack, lit from above like a shop
              window. They are not prints. Each one is built once, and then
              never again.
            </p>
            <p>
              That rarity is the whole product, so the brand had to feel like a
              collector&apos;s piece, not a souvenir. The name says it before
              anything else: one frame, for one owner.
            </p>
          </div>
        </div>
      </Chapter>

      {/* ── 02 the logo ── */}
      <Chapter n="02" label="The logo">
        <div className="grid items-center gap-12 pt-14 md:grid-cols-[1.2fr_1fr] md:gap-20 md:pt-20">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[4px]">
            <Image src="/projects/oneframe/logo-bw.webp" alt="The ONEFRAME wordmark: ONE in white on black, FRAME in black inside a white box" fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
          </div>
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              A name in a frame
            </h2>
            <p className="mt-6 leading-relaxed text-[var(--home-dim)]">
              The wordmark is boxed in on purpose: the outline frames the
              name, the way the product frames a car. &quot;ONE&quot; sits
              white on black, &quot;FRAME&quot; turns over into the white
              box, so the logo reads as one object in two halves.
            </p>
            <ul className="mt-8 grid grid-cols-2 gap-3 text-[12px] uppercase tracking-wider">
              <Swatch hex="#000000" name="Black" />
              <Swatch hex="#FFFFFF" name="White" />
            </ul>
          </div>
        </div>
      </Chapter>

      {/* ── 03 the products ── */}
      <Chapter n="03" label="The products">
        <h2 className="home-display pt-14 text-[clamp(2.2rem,5vw,4.6rem)] md:pt-20">
          Six frames, <span className="home-outline">six stories</span>
        </h2>
        <p className="mt-6 max-w-2xl leading-relaxed text-[var(--home-dim)]">
          Six frames in the collection, each a model car in its own scene,
          behind a black wooden frame, lit by the bar along the top. The
          backdrop carries the car&apos;s own numbers, top speed, engine, 0 to
          100, and the ONEFRAME mark at the foot.
        </p>
        <div className="relative mt-14 aspect-[5366/1160] overflow-hidden rounded-[4px] bg-white">
          <Image
            src="/projects/oneframe/products.webp"
            alt="The six ONEFRAME frames side by side: the Chevrolet Camaro, the Mercedes-AMG, the Lotus F1 car, the Brezina Land Rover, the Volkswagen van and the Bike Life mountain bike"
            fill
            sizes="(min-width: 1400px) 1300px, 100vw"
            className="object-contain"
          />
        </div>
        <ul className="mt-8 grid gap-6 border-t border-[var(--home-line)] pt-6 sm:grid-cols-3 lg:grid-cols-6">
          {PRODUCTS.map((product) => (
            <li key={product.name}>
              <h3 className="home-display text-[15px]">{product.name}</h3>
              <p className="mt-1 text-[12px] uppercase tracking-wider text-[var(--home-dim)]">
                “{product.line}”
              </p>
            </li>
          ))}
        </ul>
      </Chapter>

      {/* ── 04 the packaging ── */}
      <section className="px-6 py-20 text-[#281b1c] md:px-12 md:py-28">
        <div className="mx-auto max-w-350">
          <div className="home-row" style={{ borderTopColor: "rgba(40, 27, 28, 0.15)" }}>
            <span>
              <span aria-hidden>/</span>
              <span>The packaging</span>
            </span>
            <span>04</span>
          </div>
          <div className="grid items-center gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
            <div>
              <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
                Every box tells its own story
              </h2>
              <p className="mt-6 leading-relaxed text-[#281b1c]/75">
                The box is the first thing an owner holds, so it does the
                talking: the frame&apos;s name, a few lines on what the car
                stands for, and, on the side, what makes it rare. We wrote it
                as a certificate as much as a label.
              </p>
            </div>
            <blockquote className="border-l-2 border-[#281b1c] pl-6 font-mono text-[15px] leading-relaxed">
              <p className="home-display mb-3 text-[13px] tracking-wider">What&apos;s inside?</p>
              A unique OneFrame created only once, just for you.
              <br />
              No second copy. No reprint.
              <br />
              One edition. One owner. OneFrame.
              <footer className="mt-4 text-[11px] uppercase tracking-wider text-[#281b1c]/60">
                Printed on every ONEFRAME box
              </footer>
            </blockquote>
          </div>

          <h3 className="home-display mt-20 text-center text-[clamp(2.4rem,6vw,5.6rem)] leading-[1.02]">
            {["One edition.", "One owner."].map((line) => (
              <span key={line} className="home-fill">
                <span className="home-outline-dark">{line}</span>
                <span aria-hidden>{line}</span>
              </span>
            ))}
          </h3>

          <ul className="mt-20 grid gap-6 sm:grid-cols-2">
            {PACKAGING.map((box) => (
              <li key={box.name}>
                <div className="relative aspect-[1123/794] overflow-hidden rounded-[4px] shadow-[0_20px_40px_-24px_rgba(40,27,28,0.5)]">
                  <Image src={box.src} alt={`Packaging for the ${box.name}, “${box.line}”`} fill sizes="(min-width: 640px) 45vw, 100vw" className="object-cover" />
                </div>
                <p className="mt-3 text-[12px] uppercase tracking-wider text-[#281b1c]/70">
                  {box.name} · “{box.line}”
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 05 the store ── */}
      <Chapter n="05" label="The store">
        <div className="grid items-center gap-12 pt-14 md:grid-cols-[1.2fr_1fr] md:gap-20 md:pt-20">
          <div className="overflow-hidden rounded-[10px] bg-[#5a0b18] shadow-[0_30px_60px_-30px_rgba(40,27,28,0.55)]">
            <div className="flex h-8 items-center gap-1.5 border-b border-white/10 px-3">
              <span className="size-2 rounded-full bg-white/25" />
              <span className="size-2 rounded-full bg-white/25" />
              <span className="size-2 rounded-full bg-white/25" />
              <span className="ml-3 text-[11px] text-white/60">oneframe.me</span>
            </div>
            <div className="relative aspect-[1097/740]">
              <Image src="/projects/ONEFRAME.webp" alt="ONEFRAME's online store, showing the Vanlife frame" fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover object-top" />
            </div>
          </div>
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              A store that shows one piece at a time
            </h2>
            <p className="mt-6 leading-relaxed text-[var(--home-dim)]">
              On oneframe.me each frame takes the whole stage, lit against a
              dark wall like the frames themselves, with its own page and a
              button to buy it. The store also reads in Arabic.
            </p>
            <a href={STORE} target="_blank" rel="noopener noreferrer" className="home-btn mt-8">
              Visit oneframe.me ↗
            </a>
          </div>
        </div>
      </Chapter>

      {/* ── 06 instagram ── */}
      <Chapter n="06" label="Instagram">
        <div className="flex flex-wrap items-end justify-between gap-8 pt-14 md:pt-20">
          <h2 className="home-display text-[clamp(2.2rem,5vw,4.6rem)]">
            Follow <span className="home-outline">the frames</span>
          </h2>
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="home-btn">
            <InstagramGlyph />
            @oneframe.dz
          </a>
        </div>
        <p className="mt-6 max-w-2xl leading-relaxed text-[var(--home-dim)]">
          The same black-and-white wordmark and the same stories carry over to
          Instagram, where each new frame is unveiled.
        </p>
        <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="mt-12 grid grid-cols-3 gap-2 sm:gap-3" aria-label="ONEFRAME on Instagram">
          {[
            "/projects/oneframe/road-to-your-walls.webp",
            "/projects/oneframe/packaging-six.webp",
            "/projects/oneframe/products-square.webp",
          ].map((src) => (
            <span key={src} className="home-card relative block aspect-square overflow-hidden rounded-[4px] bg-white">
              <span className="home-card-img absolute inset-0">
                <Image src={src} alt="" fill sizes="(min-width: 768px) 30vw, 33vw" className="object-cover" />
              </span>
            </span>
          ))}
        </a>
      </Chapter>

      <NextCase href="/case-studies/getdraft" client="Getdraft" title="It's a Draft!" />

      {/* ── next ── */}
      <section className="px-6 py-20 text-[#281b1c] md:px-12 md:py-28">
        <div className="mx-auto max-w-350 text-center">
          <p className="border-t border-[#281b1c]/15 pt-4 text-[11px] uppercase tracking-wider">
            Your brand next
          </p>
          <h2 className="home-display mt-14 text-[clamp(2.4rem,6vw,5.6rem)] leading-[1.02]">
            {["Can we build", "yours?"].map((line) => (
              <span key={line} className="home-fill">
                <span className="home-outline-dark">{line}</span>
                <span aria-hidden>{line}</span>
              </span>
            ))}
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/contact" className="home-btn home-btn-dark">
              Get a quote
            </Link>
            <Link href="/projects" className="home-btn home-btn-ghost">
              More of our work
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Chapter({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <section className="px-6 py-20 md:px-12 md:py-28">
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-[var(--home-dim)]">{label}</dt>
      <dd className="mt-2 leading-relaxed">{children}</dd>
    </div>
  );
}

function Swatch({ hex, name }: { hex: string; name: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="size-10 flex-none rounded-[4px] border border-[var(--home-line)]" style={{ background: hex }} />
      <span>
        {name}
        <span className="block font-mono text-[11px] text-[var(--home-dim)]">{hex}</span>
      </span>
    </li>
  );
}

function InstagramGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

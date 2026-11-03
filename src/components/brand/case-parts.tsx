import Image from "next/image";
import Link from "next/link";

import { wide } from "@/components/home/wide-font";

/**
 * The pieces every case study is built from, in the home page's look: the
 * facts strip under the heading, a browser and a phone to show the work in,
 * numbered decisions, the stack, and the way on to the next case.
 */

/** One fact under the heading: "Client", "What we did", "Live"… */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-[var(--home-dim)]">{label}</dt>
      <dd className="mt-2 leading-relaxed">{children}</dd>
    </div>
  );
}

/** A link out of the site, marked as one. */
export function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
      {children} ↗
    </a>
  );
}

/** A website, in a browser window with its address in the bar. */
export function Browser({
  url,
  children,
  className = "",
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-[10px] bg-[#0b1c2c] shadow-[0_30px_60px_-30px_rgba(14,36,56,0.55)] ${className}`}>
      <div className="flex h-8 items-center gap-1.5 border-b border-white/10 px-3" aria-hidden>
        <span className="size-2 rounded-full bg-white/25" />
        <span className="size-2 rounded-full bg-white/25" />
        <span className="size-2 rounded-full bg-white/25" />
        <span className="ml-3 truncate text-[11px] text-white/60">{url}</span>
      </div>
      {children}
    </div>
  );
}

/** A screenshot of a site, filling a browser window. */
export function BrowserShot({ url, src, alt, priority = false }: { url: string; src: string; alt: string; priority?: boolean }) {
  return (
    <Browser url={url}>
      <div className="relative aspect-[1280/828]">
        <Image src={src} alt={alt} fill priority={priority} sizes="(min-width: 1400px) 1300px, 100vw" className="object-cover object-top" />
      </div>
    </Browser>
  );
}

/** An app screen, in a phone. `ratio` is the screenshot's width / height. */
export function Phone({ src, alt, ratio, sizes = "(min-width: 768px) 16vw, 45vw" }: { src: string; alt: string; ratio: string; sizes?: string }) {
  return (
    <div className="rounded-[2rem] bg-[#0b1220] p-[5%] shadow-[0_30px_50px_-24px_rgba(14,36,56,0.6)] ring-1 ring-white/10">
      <div className="relative overflow-hidden rounded-[1.5rem] bg-black" style={{ aspectRatio: ratio }}>
        <Image src={src} alt={alt} fill sizes={sizes} className="object-cover object-top" />
      </div>
    </div>
  );
}

/** Decisions, numbered: a title and a few lines each, two to a row. */
export function Points({ items }: { items: { title: string; text: string }[] }) {
  return (
    <ol className="mt-14 grid gap-x-16 gap-y-12 border-t border-[var(--home-line)] pt-10 md:grid-cols-2">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-5">
          <span className="grid size-[26px] flex-none place-items-center rounded-full border border-current text-[11px]">
            {index + 1}
          </span>
          <div>
            <h3 className="home-display text-[clamp(1rem,1.5vw,1.25rem)] leading-snug">{item.title}</h3>
            <p className="mt-3 leading-relaxed text-[var(--home-dim)]">{item.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One colour of a client's palette, with its name and hex. */
export function Swatch({ hex, name }: { hex: string; name: string }) {
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

/** What it is built with, as tags. */
export function Stack({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full border border-[var(--home-line)] px-3 py-1.5 text-[12px] uppercase tracking-wider">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** The way on: the next case study, by name. */
export function NextCase({ href, client, title }: { href: string; client: string; title: string }) {
  return (
    <section className={`home home-light px-6 md:px-12 ${wide.variable}`}>
      <div className="mx-auto max-w-350">
        <Link href={href} className="group flex flex-wrap items-end justify-between gap-6 border-t border-[var(--home-line)] py-14 md:py-20">
          <span>
            <span className="text-[11px] uppercase tracking-wider text-[var(--home-dim)]">Next case study</span>
            <span className="home-display mt-4 block text-[clamp(2rem,5vw,4.4rem)] leading-[1.02]">
              {client} <span className="home-outline">{title}</span>
            </span>
          </span>
          <span className="home-btn transition-transform group-hover:translate-x-1">Read it →</span>
        </Link>
      </div>
    </section>
  );
}

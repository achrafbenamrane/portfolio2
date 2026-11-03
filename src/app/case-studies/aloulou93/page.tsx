import type { Metadata } from "next";
import Image from "next/image";

import { BrowserShot, Fact, NextCase, Out, Points, Stack, Swatch } from "@/components/brand/case-parts";
import { BuildYours, Chapter } from "@/components/brand/chapter";
import { wide } from "@/components/home/wide-font";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Aloulou 93 case study",
  description:
    "How we built Aloulou 93's online store: three languages with Arabic right to left, delivery priced for 58 regions, cash on delivery, and a back-office for the orders.",
};

// The domain is aloulou98.com; the brand calls itself Aloulou 93.
const SITE = "https://aloulou98.com/";

/** A few of the products, as the store shows them: on its own cream. */
const PRODUCTS = [
  { src: "/projects/aloulou93/tn-white.webp", name: "Nike Air Max Plus, white and black" },
  { src: "/projects/aloulou93/tn-navy.webp", name: "Nike Air Max Plus, navy" },
  { src: "/projects/aloulou93/lacoste-polo.webp", name: "Lacoste polo, green" },
  { src: "/projects/aloulou93/tech-fleece.webp", name: "Nike Tech Fleece joggers, grey" },
];

const DECISIONS = [
  {
    title: "Delivery priced region by region",
    text: "Checkout prices delivery for all 58 regions and 124 communes, to the door or to a pickup desk, and makes it free above a set basket. No add-on, no flat rate that's wrong for half the country.",
  },
  {
    title: "Cash on delivery first, cards ready",
    text: "Customers pay cash when the parcel arrives, so that's what the store takes today. Card payment is already built behind the same interface: switching it on changes no page.",
  },
  {
    title: "A total nobody can tamper with",
    text: "At checkout the server works out every price, fee and stock level again, so an edited cart can't set its own total. Each order keeps the prices it was sold at.",
  },
  {
    title: "Arabic, right to left",
    text: "French, Arabic and English, with the whole layout mirrored for Arabic and set in its own typeface. A missing translation stops the build before it can reach a customer.",
  },
  {
    title: "Every size and colour in stock, or crossed out",
    text: "Each size in each colour is its own item with its own stock. Sold-out ones stay on the page, crossed out, and stock is held the moment an order is confirmed.",
  },
  {
    title: "WhatsApp, where trust is won",
    text: "Customers ask before they buy, so WhatsApp is one tap away on the product, confirmation, tracking and contact pages. Tracking an order takes its number and a phone number, nothing more.",
  },
];

/** What the owner sees at /admin. */
const BACK_OFFICE = [
  "Revenue, orders, average basket and low stock at a glance",
  "Sales over the last seven days, and the best sellers",
  "Orders found by number, name or phone, moved through six statuses",
  "Every status change timestamped, as proof in a dispute with a carrier",
  "Products added with their sizes, colours, stock and photos",
];

export default function AloulouCase() {
  return (
    <div className={`home home-light ${wide.variable}`}>
      <PageHeader
        index="04.4"
        label="Case studies — Aloulou 93"
        title="Aloulou 93"
        outline="streetwear, delivered"
        description="An online store for authentic shoes, clothes and football shirts, in three languages with Arabic right to left, cash on delivery to every region, and a back-office for the orders."
      />

      {/* ── the facts, and the store ── */}
      <section className="px-6 pb-16 md:px-12 md:pb-24">
        <div className="mx-auto max-w-350">
          <dl className="grid gap-8 border-t border-[var(--home-line)] pt-8 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Client">Aloulou 93, 2026</Fact>
            <Fact label="What we did">Store design, online store, back-office</Fact>
            <Fact label="What it sells">Shoes, clothes and football shirts from Nike, Adidas and Lacoste</Fact>
            <Fact label="Live">
              <Out href={SITE}>aloulou98.com</Out>
            </Fact>
          </dl>

          <div className="mt-16">
            <BrowserShot url="aloulou98.com" src="/projects/aloulou93/screen-2.webp" alt="Aloulou 93's online store: shop by category, shoes, clothes, football shirts and caps" priority />
          </div>
        </div>
      </section>

      {/* ── 01 the brief ── */}
      <Chapter n="01" label="The brief">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            From Instagram <span className="home-outline">to the door</span>
          </h2>
          <div className="space-y-5 leading-relaxed text-[var(--home-dim)]">
            <p>
              Aloulou 93 sells authentic shoes, clothes and football shirts.
              Most of its customers arrive from Instagram, on a phone. They pay
              in cash when the parcel reaches the door, and many want a word on
              WhatsApp before they order.
            </p>
            <p>
              So the store had to be quick on a phone, speak three languages
              and price delivery to every region. An off-the-shelf store builder
              does those only with paid add-ons, and still looks like a theme.
            </p>
          </div>
        </div>
      </Chapter>

      {/* ── 02 the look ── */}
      <Chapter n="02" label="The look">
        <div className="grid items-center gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              Cream, forest green, <span className="home-outline">a line of gold</span>
            </h2>
            <blockquote className="mt-8 border-l-2 border-[var(--home-fg)] pl-6 leading-relaxed">
              Cream and forest green do 90% of the work. Gold stays a hairline,
              never a fill. Red and green appear only as signals: a sale, the
              stock.
              <footer className="mt-3 text-[11px] uppercase tracking-wider text-[var(--home-dim)]">
                From our design brief for the store
              </footer>
            </blockquote>
            <ul className="mt-8 grid grid-cols-3 gap-3 text-[12px] uppercase tracking-wider">
              <Swatch hex="#F7F3EA" name="Cream" />
              <Swatch hex="#2B4739" name="Forest" />
              <Swatch hex="#C7A96B" name="Gold" />
            </ul>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4">
            {PRODUCTS.map((product) => (
              <li key={product.src} className="relative aspect-square overflow-hidden rounded-[4px] bg-[#F7F3EA]">
                <Image src={product.src} alt={product.name} fill sizes="(min-width: 768px) 22vw, 45vw" className="object-cover" />
              </li>
            ))}
          </ul>
        </div>
      </Chapter>

      {/* ── 03 the decisions ── */}
      <Chapter n="03" label="The decisions">
        <h2 className="home-display pt-14 text-[clamp(1.8rem,3.2vw,2.9rem)] md:pt-20">
          Built for how <span className="home-outline">people really buy</span>
        </h2>
        <Points items={DECISIONS} />
      </Chapter>

      {/* ── 04 the back-office ── */}
      <Chapter n="04" label="The back-office">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              The shop, <span className="home-outline">run from one screen</span>
            </h2>
            <p className="mt-6 leading-relaxed text-[var(--home-dim)]">
              Behind the store, a back-office of its own, in French, for the
              people who pack the orders.
            </p>
            <a href={SITE} target="_blank" rel="noopener noreferrer" className="home-btn mt-8">
              Visit aloulou98.com ↗
            </a>
          </div>
          <ul className="border-t border-[var(--home-line)]">
            {BACK_OFFICE.map((line) => (
              <li key={line} className="flex gap-4 border-b border-[var(--home-line)] py-4 leading-relaxed">
                <span aria-hidden className="mt-[0.55em] size-1.5 flex-none rounded-full bg-[var(--home-sky)]" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </Chapter>

      {/* ── 05 under the hood ── */}
      <Chapter n="05" label="Under the hood">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            Light on a phone, <span className="home-outline">strict at checkout</span>
          </h2>
          <div>
            <p className="leading-relaxed text-[var(--home-dim)]">
              The cart lives in the browser, to save round trips on mobile
              data. Background videos stay off on slow connections, in
              data-saver mode and for reduced motion. Text meets 5:1 contrast,
              touch targets are 44px, and every page was checked at 320, 390
              and 1440 pixels wide without scrolling sideways.
            </p>
            <Stack items={["Next.js", "TypeScript", "Tailwind CSS", "Prisma", "PostgreSQL", "Neon", "Vercel"]} />
          </div>
        </div>
      </Chapter>

      <NextCase href="/case-studies/oneframe" client="ONEFRAME" title="a story in 3D" />
      <BuildYours line="Can we build yours?" />
    </div>
  );
}

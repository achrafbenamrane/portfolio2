import type { Metadata } from "next";
import Image from "next/image";

import { BrowserShot, Fact, NextCase, Out, Points, Stack } from "@/components/brand/case-parts";
import { BuildYours, Chapter } from "@/components/brand/chapter";
import { wide } from "@/components/home/wide-font";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Linky case study",
  description:
    "How I built Linky, a marketplace and real-estate app with escrow payments by Mobile Money, verified sellers, a courier app, an admin console and its website.",
};

const SITE = "https://linkygroup.com/";

/**
 * Store screens, each a French headline over the app. Three of the eight:
 * the others show a seller's name or a street address.
 */
const SCREENS = [
  { src: "/projects/linky-app/welcome.webp", alt: "Linky's welcome screen: the market in your pocket" },
  { src: "/projects/linky-app/roles.webp", alt: "Choosing a role at sign-up: buyer, seller or real-estate agent" },
  { src: "/projects/linky-app/wallet.webp", alt: "The seller's wallet, with withdrawals to Orange Money or MTN" },
];

const DECISIONS = [
  {
    title: "Escrow, kept as a ledger",
    text: "Mobile Money can't split one payment between a seller and a platform, so the app holds every payment and keeps its own books. The seller is paid once the buyer confirms delivery, the commission is taken at release, and an order nobody confirms is refunded on its own.",
  },
  {
    title: "Only verified sellers",
    text: "Sellers scan an ID and take a selfie to earn a Verified seller badge, and the shops tab lists verified shops only. A buyer always knows who they're paying.",
  },
  {
    title: "Delivery you can prove",
    text: "At the door, the courier scans a QR code on the buyer's phone. Until then, the buyer follows the courier live on the map, in a courier app of its own.",
  },
  {
    title: "A wallet that needs no licence",
    text: "The wallet shows balances and withdrawals, but nobody can top it up or send money to someone else. That one choice keeps Linky clear of e-money licensing.",
  },
  {
    title: "Homes, rented from the app",
    text: "Homes to rent or buy, with a price you can negotiate. For a rental, the contract is signed in the app, and the rent and deposit are held until move-in.",
  },
  {
    title: "Made for 3G, in three languages",
    text: "French, English and Spanish, with 2,125 strings in each, and a data-saver mode that holds videos back on a slow connection.",
  },
];

export default function LinkyCase() {
  return (
    <div className={`home home-light ${wide.variable}`}>
      <PageHeader
        index="04.3"
        label="Case studies — Linky"
        title="Linky"
        outline="trust built in"
        description="A marketplace and real-estate app in one, with a courier app, an admin console and a website. All of it built around one problem: buyers afraid to pay, and sellers afraid to ship."
      />

      {/* ── the facts, and the site ── */}
      <section className="px-6 pb-16 md:px-12 md:pb-24">
        <div className="mx-auto max-w-350">
          <dl className="grid gap-8 border-t border-[var(--home-line)] pt-8 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Client">Linky, 2026</Fact>
            <Fact label="What I did">Android and iOS app, courier app, back end, admin console, website</Fact>
            <Fact label="Payments">Orange Money and MTN Mobile Money, card, cash on delivery</Fact>
            <Fact label="Live">
              <Out href={SITE}>linkygroup.com</Out>
              <br />
              <span className="text-[var(--home-dim)]">App in testing on Android</span>
            </Fact>
          </dl>

          <div className="mt-16">
            <BrowserShot url="linkygroup.com" src="/projects/linky-web/screen-1.webp" alt="Linky's website: the marketplace and real estate, in one app" priority />
          </div>
        </div>
      </section>

      {/* ── 01 the brief ── */}
      <Chapter n="01" label="The brief">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            Trust is <span className="home-outline">the product</span>
          </h2>
          <div className="space-y-5 leading-relaxed text-[var(--home-dim)]">
            <p>
              Buying online in Guinea starts with a question of trust. The
              buyer is afraid to pay and receive nothing, and the seller is
              afraid to ship and never be paid. Linky had to answer that
              before anything else, in one app that also lists homes to rent
              or buy.
            </p>
            <p>
              It had to run on 3G, in three languages, with the ways people
              already pay: Orange Money, MTN and cash. And it had to let
              family abroad pay for an order back home.
            </p>
          </div>
        </div>
      </Chapter>

      {/* ── 02 the app ── */}
      <Chapter n="02" label="The app">
        <div className="grid items-center gap-12 pt-14 md:grid-cols-[1fr_1.4fr] md:gap-20 md:pt-20">
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
              One account, <span className="home-outline">three roles</span>
            </h2>
            <p className="mt-6 leading-relaxed text-[var(--home-dim)]">
              Buyers, sellers and real-estate agents sign up once, choose what
              they do, and can change it later. A Discover feed mixes products
              and homes to swipe through, and sellers follow their sales and
              withdraw to Orange Money or MTN whenever they like.
            </p>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:gap-4">
            {SCREENS.map((screen) => (
              <li key={screen.src} className="relative aspect-[9/16] overflow-hidden rounded-[6px] shadow-[0_24px_40px_-24px_rgba(40,27,28,0.55)]">
                <Image src={screen.src} alt={screen.alt} fill sizes="(min-width: 768px) 18vw, 31vw" className="object-cover" />
              </li>
            ))}
          </ul>
        </div>
      </Chapter>

      {/* ── 03 the decisions ── */}
      <Chapter n="03" label="The decisions">
        <h2 className="home-display pt-14 text-[clamp(1.8rem,3.2vw,2.9rem)] md:pt-20">
          The seller is paid <span className="home-outline">when it arrives</span>
        </h2>
        <Points items={DECISIONS} />
      </Chapter>

      {/* ── 04 the website ── */}
      <Chapter n="04" label="The website">
        <div className="grid items-center gap-12 pt-14 md:grid-cols-[1.2fr_1fr] md:gap-20 md:pt-20">
          <BrowserShot url="linkygroup.com" src="/projects/linky-web/screen-3.webp" alt="Linky's website: the Discover feed, the wallet and escrow, each in its own card" />
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">Five reasons, one download</h2>
            <p className="mt-6 leading-relaxed text-[var(--home-dim)]">
              linkygroup.com speaks French, like Linky&apos;s customers. It
              makes the case in five reasons, from verified sellers to escrow,
              shows the Discover feed in motion, and keeps the download one tap
              away.
            </p>
            <a href={SITE} target="_blank" rel="noopener noreferrer" className="home-btn mt-8">
              Visit linkygroup.com ↗
            </a>
          </div>
        </div>
      </Chapter>

      {/* ── 05 under the hood ── */}
      <Chapter n="05" label="Under the hood">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            Two apps, <span className="home-outline">one back end</span>
          </h2>
          <div>
            <p className="leading-relaxed text-[var(--home-dim)]">
              Linky and its courier app are built with Expo and React Native,
              the website and the admin console with Next.js, all on one
              Supabase back end. In five months: 99 app screens, 14 courier
              screens, 11 admin pages, 146 serverless functions and 152
              database migrations.
            </p>
            <Stack items={["Expo", "React Native", "Next.js", "TypeScript", "Supabase", "PostgreSQL", "Orange Money", "MTN Mobile Money", "Stripe", "Twilio", "Mapbox"]} />
          </div>
        </div>
      </Chapter>

      <NextCase href="/case-studies/aloulou93" client="Aloulou 93" title="streetwear, delivered" />
      <BuildYours />
    </div>
  );
}

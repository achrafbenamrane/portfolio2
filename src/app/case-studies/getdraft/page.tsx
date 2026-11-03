import type { Metadata } from "next";

import { Browser, BrowserShot, Fact, NextCase, Out, Phone, Points, Stack } from "@/components/brand/case-parts";
import { BuildYours, Chapter } from "@/components/brand/chapter";
import { wide } from "@/components/home/wide-font";
import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Getdraft case study",
  description:
    "How we built Getdraft, a sports recruiting app for iOS and Android: swipe to Draft, chat on a match, ID-verified adults and parent-approved minors, its back end and its website.",
};

const SITE = "https://getdraft.net/";
const APP_STORE = "https://apps.apple.com/us/app/getdraft/id6802070784";
const GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=com.getdraft.app";

/** The app, screen by screen, as it is used. */
const SCREENS = [
  { src: "/projects/getdraft-app/discover.webp", ratio: "772/1655", name: "Discover", line: "Swipe to pass or Draft" },
  { src: "/projects/getdraft-app/screen-1.webp", ratio: "591/1280", name: "It's a Draft!", line: "A match opens the chat" },
  { src: "/projects/getdraft-app/screen-2.webp", ratio: "597/1280", name: "Global network", line: "Talent on a globe" },
  { src: "/projects/getdraft-app/screen-3.webp", ratio: "597/1280", name: "Rankings", line: "Top prospects by sport" },
  { src: "/projects/getdraft-app/screen-4.webp", ratio: "589/1280", name: "Draft Board", line: "Every match in one place" },
];

const DECISIONS = [
  {
    title: "Chat opens only on a match",
    text: "Every swipe is kept as a Draft or a Pass. When two people Draft each other it's a match, and only then does the conversation open, so nobody gets messages they never asked for. Chat runs over an authenticated live connection.",
  },
  {
    title: "Every adult is ID-verified",
    text: "An identity check sits between the profile and the payment. It runs through a dedicated verification service, and the result reaches our back end through signed webhooks, so it can't be faked from the phone.",
  },
  {
    title: "Minors go live with a guardian",
    text: "A young athlete links a parent by showing a QR code that expires after ten minutes. The parent answers a short questionnaire and records a declaration video, and the account is reviewed before it goes live.",
  },
  {
    title: "A map of where the talent is",
    text: "A 3D globe shows athletes around the world, with talent hotspots graded by level, so a recruiter can scout a region at a glance instead of scrolling a list.",
  },
  {
    title: "Highlights from where athletes already post",
    text: "Profiles take highlight videos from YouTube, Vimeo, Hudl and MaxPreps, so no one has to upload again what they've already published.",
  },
  {
    title: "Plans and swipe packs",
    text: "A free plan with daily swipes, paid plans above it, and one-off packs of swipes, all paid through Stripe's native payment sheet, with cancel and resume built in.",
  },
];

export default function GetdraftCase() {
  return (
    <div className={`home home-light ${wide.variable}`}>
      <PageHeader
        index="04.2"
        label="Case studies — Getdraft"
        title="Getdraft"
        outline="It's a Draft!"
        description="A sports recruiting app for iOS and Android, its back end and its website. Athletes, coaches and recruiters swipe to Draft, and when it's mutual, the chat opens."
      />

      {/* ── the facts, and the site playing ── */}
      <section className="px-6 pb-16 md:px-12 md:pb-24">
        <div className="mx-auto max-w-350">
          <dl className="grid gap-8 border-t border-[var(--home-line)] pt-8 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Client">Getdraft, 2026</Fact>
            <Fact label="What we did">iOS and Android app, back end and payments, website</Fact>
            <Fact label="Who it's for">Athletes, parents, coaches, recruiters and agents, across 15 sports</Fact>
            <Fact label="Live">
              <Out href={SITE}>getdraft.net</Out>
              <br />
              <Out href={APP_STORE}>App Store</Out>
              {" · "}
              <Out href={GOOGLE_PLAY}>Google Play</Out>
            </Fact>
          </dl>

          <Browser url="getdraft.net" className="mt-16">
            <video
              src="/projects/getdraft-web/site.mp4"
              poster="/projects/getdraft-web/site-poster.webp"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="The Getdraft website, scrolling"
              className="block aspect-[1280/680] w-full bg-[#0e2438] object-cover"
            />
          </Browser>
        </div>
      </section>

      {/* ── 01 the brief ── */}
      <Chapter n="01" label="The brief">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            Recruiting, <span className="home-outline">the way people swipe</span>
          </h2>
          <div className="space-y-5 leading-relaxed text-[var(--home-dim)]">
            <p>
              Getdraft set out to make sports recruiting as quick as the apps
              people already use every day. Athletes put their profile and
              their highlights in front of coaches, recruiters and agents, who
              swipe to pass or to Draft. When both sides Draft each other,
              it&apos;s a match.
            </p>
            <p>
              The hard part was never the swipe. It was trust: a real person
              behind every profile, and young athletes protected by the adults
              responsible for them. That shaped the whole product, from sign-up
              to the first message.
            </p>
          </div>
        </div>
      </Chapter>

      {/* ── 02 the app ── */}
      <Chapter n="02" label="The app">
        <h2 className="home-display pt-14 text-[clamp(2.2rem,5vw,4.6rem)] md:pt-20">
          Draft, match, <span className="home-outline">talk</span>
        </h2>
        <ul className="mt-14 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {SCREENS.map((screen) => (
            <li key={screen.name}>
              <Phone src={screen.src} ratio={screen.ratio} alt={`Getdraft's ${screen.name} screen: ${screen.line.toLowerCase()}`} />
              <h3 className="home-display mt-5 text-[14px]">{screen.name}</h3>
              <p className="mt-1 text-[12px] uppercase tracking-wider text-[var(--home-dim)]">{screen.line}</p>
            </li>
          ))}
        </ul>
      </Chapter>

      {/* ── 03 the decisions ── */}
      <Chapter n="03" label="The decisions">
        <h2 className="home-display pt-14 text-[clamp(1.8rem,3.2vw,2.9rem)] md:pt-20">
          Built on trust, <span className="home-outline">not just swipes</span>
        </h2>
        <Points items={DECISIONS} />
      </Chapter>

      {/* ── 04 the website ── */}
      <Chapter n="04" label="The website">
        <div className="grid items-center gap-12 pt-14 md:grid-cols-[1.2fr_1fr] md:gap-20 md:pt-20">
          <BrowserShot url="getdraft.net" src="/projects/getdraft-web/screen-3.webp" alt="Getdraft's website: the sports it covers, its numbers, and how it works in three steps" />
          <div>
            <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">A site that sells the download</h2>
            <p className="mt-6 leading-relaxed text-[var(--home-dim)]">
              getdraft.net explains the app in three steps, sets out the
              safety rules for minors, lays out the plans and answers the
              questions parents and recruiters ask, with the App Store and
              Google Play one tap away the whole way down.
            </p>
            <a href={SITE} target="_blank" rel="noopener noreferrer" className="home-btn mt-8">
              Visit getdraft.net ↗
            </a>
          </div>
        </div>
      </Chapter>

      {/* ── 05 under the hood ── */}
      <Chapter n="05" label="Under the hood">
        <div className="grid gap-12 pt-14 md:grid-cols-2 md:gap-20 md:pt-20">
          <h2 className="home-display text-[clamp(1.8rem,3.2vw,2.9rem)]">
            One codebase, <span className="home-outline">two stores</span>
          </h2>
          <div>
            <p className="leading-relaxed text-[var(--home-dim)]">
              One TypeScript app for iOS and Android. A NestJS back end on
              Fastify serves it, with the data in Postgres on Supabase and
              row-level security on every table, Stripe for payments and a
              live socket for chat. We audited the back end before release:
              six critical issues found and fixed, and all 45 tests passing.
            </p>
            <Stack items={["Expo", "React Native", "TypeScript", "Redux Toolkit", "NestJS", "Fastify", "Supabase", "PostgreSQL", "Stripe", "Socket.IO"]} />
          </div>
        </div>
      </Chapter>

      <NextCase href="/case-studies/linky" client="Linky" title="trust built in" />
      <BuildYours line="Can we build yours?" />
    </div>
  );
}

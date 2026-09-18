"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

import type { Project } from "@/content/site";

/**
 * A working phone: a home screen of app icons, and tapping one opens it.
 *
 * The point of a mockup is to show the app running on a device rather than as
 * a screenshot on a page, so the device has to behave like one. Tapping an
 * icon launches, the app fills the screen — its screen recording if it has
 * one, its screenshots if not, a launch screen if it has neither yet — and
 * the home indicator takes you back. A static frame around a screenshot does
 * none of that.
 *
 * Drawn entirely in CSS. Nothing is rasterised, so it stays sharp at any size
 * and there is no stock artwork licence to carry.
 */

/** Static, like every Apple marketing shot — and it sidesteps a hydration
 *  mismatch between the server's clock and the visitor's. */
const CLOCK = "9:41";

export default function PhoneShowcase({ apps }: { apps: readonly Project[] }) {
  const [open, setOpen] = useState<Project | null>(null);
  const [shot, setShot] = useState(0);

  const launch = useCallback((app: Project) => {
    setOpen(app);
    setShot(0);
  }, []);

  // The icon doubles as the index-row preview, so it may sit first in
  // `images`; it is not a screen and must not be shown as one.
  const shots = open ? open.images.filter((src) => src !== open.icon) : [];

  // Screenshots and recordings carry the phone's own status bar; drawing ours
  // on top would put two clocks in the corner.
  const contentHasBar = Boolean(open && (open.video || shots.length > 0));

  const step = useCallback(
    (delta: number) =>
      setShot((i) => (i + delta + shots.length) % shots.length),
    [shots.length],
  );

  return (
    <div className="mx-auto w-full max-w-[15rem]">
      <div className="relative">
        {/* Side buttons. Four divs, and they do more to sell the device than
            any amount of bezel detail — without them it is a rounded rect. */}
        <span aria-hidden className="absolute -left-[3px] top-[17%] h-7 w-[3px] rounded-l bg-[#0B1015]" />
        <span aria-hidden className="absolute -left-[3px] top-[26%] h-12 w-[3px] rounded-l bg-[#0B1015]" />
        <span aria-hidden className="absolute -left-[3px] top-[39%] h-12 w-[3px] rounded-l bg-[#0B1015]" />
        <span aria-hidden className="absolute -right-[3px] top-[30%] h-16 w-[3px] rounded-r bg-[#0B1015]" />

        {/* Rail, bezel, screen — three layers, because a single border reads
            flat where a real phone has a polished edge around a black face. */}
        <div className="relative rounded-[2.6rem] bg-gradient-to-b from-[#2A333C] via-[#11181F] to-[#20272E] p-[3px] shadow-[0_30px_60px_-20px_rgba(11,16,21,0.65)]">
          <div className="rounded-[2.5rem] bg-[#0B1015] p-[9px]">
            <div className="relative overflow-hidden rounded-[2rem] bg-[#0E2438]">
              {/* 9 : 19.5, held by padding so the screen cannot collapse. */}
              <div style={{ paddingTop: "216%" }} />

              <div className="absolute inset-0">
                {open ? (
                  <AppView app={open} shots={shots} shot={shot} onStep={step} />
                ) : (
                  <HomeScreen apps={apps} onLaunch={launch} />
                )}

                {!contentHasBar && <StatusBar />}

                {/* A real control, not decoration: this is how you get back,
                    which is most of what makes the phone feel operable. */}
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  aria-label="Home"
                  className="absolute inset-x-0 bottom-0 z-20 flex h-8 items-end justify-center pb-2"
                >
                  <span
                    className={`h-1 w-24 rounded-full transition-colors ${
                      open ? "bg-white/70 hover:bg-white" : "bg-white/45"
                    }`}
                  />
                </button>

                {/* Over the screen, never cut from the bezel — a carved notch
                    would clip whatever is behind it. */}
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1.5 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="meta mt-5 text-center text-dim">
        {open ? "TAP THE BAR TO GO HOME" : "TAP AN APP TO OPEN IT"}
      </p>
    </div>
  );
}

function StatusBar() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-2 text-[9px] font-semibold text-white"
    >
      <span>{CLOCK}</span>

      <span className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]">
          {[3, 5, 7, 9].map((height) => (
            <span
              key={height}
              style={{ height }}
              className="w-[2px] rounded-sm bg-current"
            />
          ))}
        </span>

        <svg viewBox="0 0 16 12" className="h-2.5 w-3.5 fill-current">
          <path d="M8 10.5 6.2 8.6a2.6 2.6 0 0 1 3.6 0L8 10.5Zm0-3.6a4.6 4.6 0 0 0-3.3 1.4L3.3 6.9a6.6 6.6 0 0 1 9.4 0l-1.4 1.4A4.6 4.6 0 0 0 8 6.9Zm0-3.5a8.1 8.1 0 0 0-5.8 2.4L.8 4.4a10.1 10.1 0 0 1 14.4 0l-1.4 1.4A8.1 8.1 0 0 0 8 3.4Z" />
        </svg>

        <span className="relative ml-0.5 h-2.5 w-5 rounded-[3px] border border-current">
          <span className="absolute inset-[1.5px] right-[6px] rounded-[1px] bg-current" />
        </span>
      </span>
    </div>
  );
}

function HomeScreen({
  apps,
  onLaunch,
}: {
  apps: readonly Project[];
  onLaunch: (app: Project) => void;
}) {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#12304A] via-[#0E2438] to-[#1B4A78]">
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-4 pt-12">
        {apps.map((app) => (
          <button
            key={app.slug}
            type="button"
            onClick={() => onLaunch(app)}
            className="group/icon flex flex-col items-center gap-1.5"
          >
            <AppIcon
              app={app}
              size="home"
              className="transition-transform duration-200 group-hover/icon:scale-105 group-active/icon:scale-95"
            />

            <span className="max-w-full truncate text-[8px] leading-tight text-white/90">
              {app.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ICON_SIZES = {
  home: { box: "size-10", img: "40px", text: "text-[11px]" },
  splash: { box: "size-16", img: "64px", text: "text-lg" },
} as const;

/**
 * One icon, drawn the same on the home screen and on an app's launch screen.
 *
 * The radius is a real home-screen tile's (≈22%), not a round number: the
 * icons were cut from a screenshot at that radius, and a tile rounded any
 * tighter would show a sliver of the tint behind them in every corner.
 */
function AppIcon({
  app,
  size,
  className = "",
}: {
  app: Project;
  size: keyof typeof ICON_SIZES;
  className?: string;
}) {
  const { box, img, text } = ICON_SIZES[size];

  return (
    <span
      className={`relative block overflow-hidden rounded-[22.5%] bg-white/15 shadow-[0_4px_10px_rgba(0,0,0,0.35)] ring-1 ring-white/20 ${box} ${className}`}
    >
      {app.icon ? (
        <Image src={app.icon} alt="" fill sizes={img} className="object-cover" />
      ) : (
        /* Initials until a logo lands, so a missing icon reads as deliberate
           rather than as a broken image. */
        <span
          className={`grid size-full place-items-center font-bold text-white ${text}`}
        >
          {initials(app.title)}
        </span>
      )}
    </span>
  );
}

/**
 * What a phone shows while an app starts: its icon on a dark field. It is
 * also the honest state for an app with nothing to show yet — a launch
 * screen, rather than a gallery with nothing in it.
 */
function Splash({ app, note }: { app: Project; note?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0B1015]">
      <AppIcon app={app} size="splash" />
      <p className="text-[11px] font-medium text-white/90">{app.title}</p>
      {note && <p className="meta absolute bottom-12 text-white/45">{note}</p>}
    </div>
  );
}

/**
 * The screen recording, faded in over the launch screen once its first frame
 * is up — which is what launching an app looks like. Muted and looping
 * because it is a demo on a page, not a film someone pressed play on; the
 * home bar is the way out, same as for any app.
 */
function Recording({ app }: { app: Project }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="absolute inset-0 bg-[#0B1015]">
      <Splash app={app} />
      <video
        src={app.video}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onPlaying={() => setPlaying(true)}
        aria-label={`${app.title}, screen recording`}
        className={`absolute inset-0 size-full object-cover object-top transition-opacity duration-300 ${
          playing ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

function AppView({
  app,
  shots,
  shot,
  onStep,
}: {
  app: Project;
  shots: readonly string[];
  shot: number;
  onStep: (delta: number) => void;
}) {
  if (app.video) return <Recording app={app} />;
  if (shots.length === 0) return <Splash app={app} note="SCREENS COMING SOON" />;

  return (
    <div className="absolute inset-0 bg-black">
      <Image
        key={shots[shot]}
        src={shots[shot]}
        alt={`${app.title}, screen ${shot + 1} of ${shots.length}`}
        fill
        sizes="260px"
        unoptimized={shots[shot]?.startsWith("http")}
        className="object-cover object-top"
      />

      {shots.length > 1 && (
        <>
          {/* Tap the left or right third, the way a phone gallery works. The
              middle is left alone so it does not swallow every tap. */}
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label="Previous screen"
            className="absolute inset-y-0 left-0 z-10 w-1/3"
          />
          <button
            type="button"
            onClick={() => onStep(1)}
            aria-label="Next screen"
            className="absolute inset-y-0 right-0 z-10 w-1/3"
          />

          <span className="absolute inset-x-0 bottom-9 z-10 flex justify-center gap-1.5">
            {shots.map((src, index) => (
              <span
                key={src}
                className={`size-1.5 rounded-full transition-colors ${
                  index === shot ? "bg-white" : "bg-white/40"
                }`}
              />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

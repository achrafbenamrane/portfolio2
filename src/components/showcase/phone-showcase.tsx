"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import BackButton from "@/components/back-button";
import Badges from "@/components/badges";
import StoreButtons, {
  ACTION_BUTTON,
  ACTION_ICON,
} from "@/components/store-buttons";
import type { Project } from "@/content/site";

/**
 * The apps, as a stage rather than a list.
 *
 * Until something is chosen the apps drift about the section as bubbles —
 * enough movement that nobody mistakes them for decoration. Choosing one
 * sends them all, still drifting, to the right of the phone; the phone
 * rises from below, the app launches on it (its screen recording if it has
 * one, its screenshots if not, its launch screen if it has neither yet), and
 * its name and write-up rise in on the left. From there the bubbles switch
 * apps, and the back button above the name lets them spread out again.
 *
 * Every position is computed from the stage's measured width, so the same
 * choreography lays out beside the phone on a wide screen and around it on a
 * narrow one. The phone is drawn entirely in CSS: nothing is rasterised, so
 * it stays sharp at any size and there is no stock artwork licence to carry.
 */

/** Static, like every Apple marketing shot — and it sidesteps a hydration
 *  mismatch between the server's clock and the visitor's. */
const CLOCK = "9:41";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const query = matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getMotion = () => matchMedia(REDUCED_MOTION).matches;
const getServerMotion = () => false;

/** Below this stage width the details go under the phone, not beside it. */
const WIDE_FROM = 900;

const SIZES = {
  wide: { phone: 260, bubble: 88, dock: 68, gap: 12, top: 40, gutter: 56 },
  narrow: { phone: 228, bubble: 72, dock: 44, gap: 8, top: 16, gutter: 16 },
} as const;

/** Where the bubbles drift before anything is chosen, as fractions of the
 *  stage — loose enough to look scattered, apart enough never to overlap. */
const SCATTER = {
  wide: [
    [0.1, 0.32], [0.26, 0.72], [0.41, 0.24], [0.59, 0.74],
    [0.74, 0.27], [0.9, 0.7], [0.88, 0.12], [0.12, 0.86],
  ],
  narrow: [
    [0.26, 0.12], [0.73, 0.25], [0.3, 0.41], [0.74, 0.56],
    [0.27, 0.71], [0.72, 0.86], [0.5, 0.33], [0.5, 0.64],
  ],
  /** Once an app is open on a wide screen: the region right of the phone,
   *  where the bubbles carry on drifting. */
  docked: [
    [0.2, 0.1], [0.68, 0.2], [0.34, 0.42], [0.8, 0.52],
    [0.18, 0.74], [0.62, 0.84], [0.92, 0.06], [0.94, 0.86],
  ],
} as const;

/** How far each bubble sits off its row on a narrow screen, in pixels. */
const NUDGE = [-6, -16, 6, 10, -4, 16, -12, 6, 0];

/** Rail and bezel around a 9 : 19.5 screen. */
const phoneHeight = (width: number) => 24 + (width - 24) * 2.16;

/** Milliseconds between the bubbles setting off and the phone following. */
const PHONE_DELAY = 380;

/**
 * The tap demonstration: a hand taps one bubble, over and over, each tap
 * ringing out, whenever the stage is idle on screen. It holds while the
 * pointer or focus is on a bubble — so it never fights the visitor's own
 * hand — and while an app is open, and picks up again after. One tap every
 * HINT_MS, starting HINT_START after it is free to.
 */
const HINT_MS = 2600;
const HINT_START = 1400;
/** The bubble it taps: Getdraft's, the app shown most fully — its site
 *  and both stores. The first bubble stands in if it is ever missing. */
const HINT_APP = "getdraft";

function layoutFor(width: number, count: number) {
  const wide = width >= WIDE_FROM;
  const s = wide ? SIZES.wide : SIZES.narrow;
  const pitch = s.dock + s.gap;
  const phoneH = phoneHeight(s.phone);

  if (wide) {
    const height = s.top + phoneH + 104;
    const r = s.dock / 2;
    // A region rather than a row: the bubbles keep drifting once docked.
    // Its foot stops short of the stage's faded edge, names included.
    const region = {
      x: width / 2 + s.phone / 2 + s.gutter + r,
      y: s.top + r,
      right: width - 8 - r,
      bottom: height - 96 - r,
    };
    const aside = width / 2 - s.phone / 2 - s.gutter;
    return {
      wide,
      s,
      height,
      phone: { x: width / 2 - s.phone / 2, y: s.top },
      dock: (i: number) => {
        const [fx, fy] = SCATTER.docked[i % SCATTER.docked.length];
        return {
          x: region.x + fx * (region.right - region.x),
          y: region.y + fy * (region.bottom - region.y),
        };
      },
      /** The column left of the phone, as tall as the phone, so the
       *  write-up can sit centred against it. */
      details: {
        x: Math.max(8, aside - 440),
        y: s.top,
        width: Math.min(440, aside - 8),
        height: phoneH,
      },
      closed: null,
    };
  }

  const cols = Math.max(1, Math.floor((width + s.gap) / pitch));
  const rows = Math.ceil(count / cols);
  const phoneY = s.top + rows * pitch + 14;
  // Until an app is chosen, a phone needs no room for one: the bubbles sit
  // three to a row, each nudged off the line so they still read as loose,
  // and the stage grows to take the phone when one is opened.
  const closedRows = Math.ceil(count / 3);
  return {
    wide,
    s,
    height: phoneY + phoneH + 72,
    closed: {
      height: 64 + (closedRows - 1) * 136 + 90,
      at: (i: number) => ({
        x: (0.18 + 0.32 * (i % 3)) * width,
        y: 64 + Math.floor(i / 3) * 136 + NUDGE[i % NUDGE.length],
      }),
    },
    phone: { x: width / 2 - s.phone / 2, y: phoneY },
    dock: (i: number) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, count - row * cols);
      const start = (width - (inRow * s.dock + (inRow - 1) * s.gap)) / 2;
      return {
        x: start + s.dock / 2 + (i % cols) * pitch,
        y: s.top + s.dock / 2 + row * pitch,
      };
    },
    details: null,
  };
}

export default function PhoneShowcase({
  apps,
}: {
  apps: readonly Project[];
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [inView, setInView] = useState(false);
  // The app on the phone outlives `isOpen`, so the screen is not blanked
  // while the phone is still sliding away.
  const [current, setCurrent] = useState<Project | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // Bumped on every open, so the details replay their entrance even when
  // the same app is opened again.
  const [opens, setOpens] = useState(0);
  // The pointer or focus is on a bubble: the tap demonstration holds.
  const [holding, setHolding] = useState(false);
  // Unlike `inView`, this follows the stage on and off the screen, so the
  // demonstration pauses while nobody can see it.
  const [onScreen, setOnScreen] = useState(false);
  const [hint, setHint] = useState<{ index: number; tick: number } | null>(
    null,
  );
  const reduced = useSyncExternalStore(
    subscribeMotion,
    getMotion,
    getServerMotion,
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Latches: the bubbles surface once, the first time the section is seen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setInView(true);
        observer.disconnect();
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // By how much of it is showing, not merely whether any of it is: a
    // sliver of the stage at the screen's edge is not somewhere to watch.
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.intersectionRatio >= 0.3),
      { threshold: [0, 0.3] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hinting = inView && onScreen && !isOpen && !holding && !reduced;

  useEffect(() => {
    if (!hinting) return;
    const index = Math.max(0, apps.findIndex((a) => a.slug === HINT_APP));
    let tick = 0;
    let loop: ReturnType<typeof setInterval> | undefined;
    const tap = () => {
      setHint({ index, tick });
      tick += 1;
    };
    const start = setTimeout(() => {
      tap();
      loop = setInterval(tap, HINT_MS);
    }, HINT_START);
    return () => {
      clearTimeout(start);
      clearInterval(loop);
      // So that picking up again starts on a fresh tap, not the end of the
      // one that was interrupted.
      setHint(null);
    };
  }, [hinting, apps]);

  const open = useCallback(
    (app: Project) => {
      if (isOpen && current?.slug === app.slug) return;
      setCurrent(app);
      setIsOpen(true);
      setOpens((n) => n + 1);
    },
    [isOpen, current],
  );

  const close = useCallback(() => setIsOpen(false), []);

  const layout = width > 0 ? layoutFor(width, apps.length) : null;

  return (
    <div>
      <div
        ref={stageRef}
        role="group"
        aria-label="Mobile apps"
        onKeyDown={(e) => {
          if (e.key === "Escape" && isOpen) close();
        }}
        className="stage-fade relative overflow-hidden"
        style={{
          height: layout
            ? layout.closed && !isOpen
              ? layout.closed.height
              : layout.height
            : phoneHeight(SIZES.wide.phone) + 144,
          transition: reduced ? undefined : "height 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {layout && (
          <>
            {/* The invitation, set like the apps' own names, in the page's
                display weight — its second half in the red accent with a
                light passing over it. It mounts as the bubbles surface, so
                its lines rise with them. */}
            {layout.wide && inView && (
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center transition-opacity duration-300 ${
                  isOpen ? "opacity-0" : "opacity-100"
                }`}
              >
                <p className="text-[clamp(1.75rem,2.7vw,2.6rem)] font-extrabold uppercase leading-[0.98] tracking-[-0.035em] text-ink">
                  <span className="inline-block overflow-hidden pb-[0.06em] align-bottom">
                    <span className="word-up" style={{ animationDelay: "550ms" }}>
                      Tap an app
                    </span>
                  </span>
                  <br />
                  <span className="inline-block overflow-hidden pb-[0.06em] align-bottom">
                    <span className="word-up" style={{ animationDelay: "680ms" }}>
                      <span className="accent-sheen">to open it.</span>
                    </span>
                  </span>
                </p>
              </div>
            )}

            {/* The phone waits below the stage's edge, clipped, and rises
                once the bubbles are on their way. Everything that fades or
                drops away on closing is made inert too, so a keyboard or a
                screen reader cannot reach what the eye no longer sees. */}
            <div
              inert={!isOpen}
              className="absolute"
              style={{
                left: layout.phone.x,
                top: layout.phone.y,
                width: layout.s.phone,
                transform: isOpen
                  ? "translate3d(0, 0, 0)"
                  : `translate3d(0, ${layout.height - layout.phone.y + 60}px, 0)`,
                transition: `transform ${reduced ? 0 : 1000}ms cubic-bezier(0.16, 1, 0.3, 1) ${
                  isOpen && !reduced ? PHONE_DELAY : 0
                }ms`,
              }}
            >
              <Phone app={current} />
            </div>

            {layout.details && current && (
              <div
                inert={!isOpen}
                className={`absolute flex flex-col justify-center transition-opacity duration-300 ${
                  isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                style={{
                  left: layout.details.x,
                  top: layout.details.y,
                  width: layout.details.width,
                  height: layout.details.height,
                }}
              >
                <AppDetails
                  key={`${current.slug}-${opens}`}
                  app={current}
                  onClose={close}
                />
              </div>
            )}

            {apps.map((app, i) => {
              const docked = isOpen;
              const chosen = docked && current?.slug === app.slug;
              const [fx, fy] =
                (layout.wide ? SCATTER.wide : SCATTER.narrow)[
                  i % SCATTER.wide.length
                ];
              const r = layout.s.bubble / 2;
              const at = docked
                ? layout.dock(i)
                : layout.closed
                  ? layout.closed.at(i)
                  : {
                      x: Math.min(Math.max(fx * width, r + 6), width - r - 6),
                      y: fy * layout.height,
                    };
              const scale = docked
                ? (chosen ? layout.s.dock * 1.14 : layout.s.dock) /
                  layout.s.bubble
                : 1;
              // Only the narrow screen's tight row stands still, and drops
              // the names it has no room for.
              const inRow = docked && !layout.wide;

              return (
                <Bubble
                  key={app.slug}
                  app={app}
                  index={i}
                  size={layout.s.bubble}
                  x={at.x}
                  y={at.y}
                  scale={scale}
                  docked={docked}
                  inRow={inRow}
                  chosen={chosen}
                  visible={inView}
                  reduced={reduced}
                  hint={hinting && hint?.index === i ? hint.tick : null}
                  onHold={setHolding}
                  onOpen={() => open(app)}
                />
              );
            })}
          </>
        )}
      </div>

      {/* On a narrow screen the details follow the phone down the page. */}
      {layout && !layout.wide && current && isOpen && (
        <div className="pt-4">
          <AppDetails
            key={`${current.slug}-${opens}`}
            app={current}
            onClose={close}
          />
        </div>
      )}
    </div>
  );
}

function Bubble({
  app,
  index,
  size,
  x,
  y,
  scale,
  docked,
  inRow,
  chosen,
  visible,
  reduced,
  hint,
  onHold,
  onOpen,
}: {
  app: Project;
  index: number;
  size: number;
  x: number;
  y: number;
  scale: number;
  docked: boolean;
  /** Lined up in a row (a narrow screen): still, and without a name. */
  inRow: boolean;
  chosen: boolean;
  visible: boolean;
  reduced: boolean;
  /** Set while the hand is tapping this bubble — a new number each tap, so
   *  the tap plays again even on the same bubble. */
  hint: number | null;
  /** The pointer or focus has come onto a bubble (true) or left it. */
  onHold: (held: boolean) => void;
  onOpen: () => void;
}) {
  const glassRef = useRef<HTMLSpanElement>(null);

  // The bubble gives under the hand's press, and springs back.
  useEffect(() => {
    const glass = glassRef.current;
    if (hint === null || !glass) return;
    const press = glass.animate(
      [
        { scale: 1 },
        { scale: 1, offset: 0.27 },
        { scale: 0.92, offset: 0.32 },
        { scale: 1.04, offset: 0.42 },
        { scale: 1, offset: 0.52 },
        { scale: 1 },
      ],
      { duration: HINT_MS, easing: "ease-out" },
    );
    return () => press.cancel();
  }, [hint]);

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
      aria-label={app.title}
      aria-pressed={chosen}
      title={docked ? app.title : undefined}
      className="group absolute left-0 top-0 z-10 cursor-pointer rounded-full"
      style={{
        width: size,
        height: size,
        transform: `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) scale(${scale})`,
        // Together, but not in lockstep: each sets off a beat after the last.
        transition: reduced
          ? "none"
          : `transform 900ms cubic-bezier(0.65, 0, 0.35, 1) ${index * 45}ms`,
      }}
    >
      <span
        className="swim"
        data-docked={inRow || undefined}
        style={
          {
            "--swim-duration": `${6 + ((index * 1.7) % 3)}s`,
            "--swim-delay": `${-index * 1.3}s`,
          } as React.CSSProperties
        }
      >
        <span
          className={visible ? "bubble-in" : "block size-full opacity-0"}
          style={{ animationDelay: `${index * 90}ms` }}
        >
          <span
            ref={glassRef}
            className={`bubble-glass relative grid size-full place-items-center rounded-full bg-white/75 shadow-[0_18px_40px_-14px_rgba(117,16,31,0.45),inset_0_-6px_14px_rgba(117,16,31,0.08)] ring-1 backdrop-blur-sm transition-[scale,box-shadow] duration-300 ${
              chosen ? "ring-2 ring-accent" : "ring-white"
            } ${docked ? "" : "group-hover:scale-110"}`}
          >
            <AppIcon app={app} className="size-[62%]" sizes={`${size}px`} />
          </span>

          {hint !== null && (
            <span key={hint} aria-hidden className="bubble-hint">
              <span className="bubble-ripple" />
              <span className="bubble-ripple bubble-ripple-late" />
              <TapHand />
            </span>
          )}

          <span
            className={`absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-xs font-medium transition-[opacity,color] duration-300 ${
              inRow ? "opacity-0" : "opacity-100"
            } ${chosen ? "text-accent" : "text-ink"}`}
          >
            {app.title}
          </span>
        </span>
      </span>
    </button>
  );
}

/** The hand of the tap demonstration: a white pointing hand, outlined in
 *  ink. Drawn as overlapping rounded parts — first outlined, then filled
 *  white over the top, so only the outer edge of the whole hand shows. */
function TapHand() {
  const parts = (
    <>
      <rect x="8" y="1.6" width="3.4" height="12.4" rx="1.7" />
      <rect x="11.4" y="7.4" width="3.2" height="7.2" rx="1.6" />
      <rect x="14.6" y="8.5" width="3.1" height="6.6" rx="1.55" />
      <rect x="17.6" y="9.9" width="2.8" height="5.8" rx="1.4" />
      <rect x="8" y="11.6" width="12.4" height="9.2" rx="3.6" />
      <rect x="3.6" y="12.2" width="6.8" height="3.1" rx="1.55" transform="rotate(40 7 13.75)" />
    </>
  );
  return (
    <svg viewBox="0 0 24 24" className="bubble-hand">
      <g fill="none" stroke="#281b1c" strokeWidth="2.6" strokeLinejoin="round">
        {parts}
      </g>
      <g fill="#fff">{parts}</g>
      <path
        d="M11.4 11.2v2.2M14.6 12v1.8M17.6 12.6v1.4"
        stroke="#281b1c"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

/** The app's name and write-up, with the way back to all the bubbles
 *  above them, on the same left edge. The name rises a word at a time out
 *  of its own line, then the rest lifts in under it. */
function AppDetails({
  app,
  onClose,
}: {
  app: Project;
  onClose: () => void;
}) {
  const words = app.title.split(" ");
  const start = PHONE_DELAY + 150;
  const after = start + words.length * 70 + 200;

  return (
    <div>
      <BackButton
        label="Back to all apps"
        onClick={onClose}
        className="lift-in mb-8 transition-colors"
        style={{ animationDelay: `${start - 100}ms` }}
      />

      <h3 className="text-[clamp(2.25rem,3.6vw,3.25rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-balance">
        {words.map((word, i) => (
          <Fragment key={i}>
            <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
              <span
                className="word-up"
                style={{ animationDelay: `${start + i * 70}ms` }}
              >
                {word}
              </span>
            </span>
            {/* Outside the clipped box: a trailing space inside an
                inline-block collapses, and the words run together. */}
            {i < words.length - 1 && " "}
          </Fragment>
        ))}
      </h3>

      <p
        className="lift-in mt-5 max-w-[38ch] text-[1.0625rem] leading-[1.7] text-dim"
        style={{ animationDelay: `${after}ms` }}
      >
        {app.description ||
          "Screens and a write-up for this app are on their way."}
      </p>

      <Badges
        tags={app.tags}
        brand={app.brand}
        className="lift-in mt-6"
        style={{ animationDelay: `${after + 120}ms` }}
      />

      {/* The way through, in one row: the app's site, then the stores it
          can be installed from. */}
      {(app.href || app.stores) && (
        <div
          className="lift-in @container mt-8"
          style={{ animationDelay: `${after + 240}ms` }}
        >
          <div className="flex flex-wrap items-center gap-2 @max-[28rem]:gap-1.5">
          {app.href && (
            <Link
              href={app.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group/link ${ACTION_BUTTON} gap-2 pl-2.5 pr-4 text-sm font-semibold hover:text-accent @max-[28rem]:gap-1.5 @max-[28rem]:px-2 @max-[28rem]:text-[12.5px]`}
            >
              <GlobeIcon />
              Visit site
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover/link:translate-x-1 @max-[28rem]:hidden"
              >
                →
              </span>
            </Link>
          )}
          <StoreButtons app={app.title} stores={app.stores} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The site's mark in the row of ways through, in the red accent. */
function GlobeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={`${ACTION_ICON} text-accent`}
    >
      <circle cx="12" cy="12" r="9.2" />
      <path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.7 3.9 9.2s-1.3 6.6-3.9 9.2c-2.6-2.6-3.9-5.7-3.9-9.2S9.4 5.4 12 2.8Z" />
    </svg>
  );
}

/** The icon doubles as the index-row preview, so it may sit first in
 *  `images`; it is not a screen and must not be shown as one. */
const screensOf = (app: Project) =>
  app.images.filter((src) => src !== app.icon);

function Phone({ app }: { app: Project | null }) {
  const shots = app ? screensOf(app) : [];

  // Screenshots and recordings carry the phone's own status bar; drawing ours
  // on top would put two clocks in the corner. A bare recording has only an
  // empty strip there, left for ours.
  const contentHasBar = app
    ? app.video
      ? !app.videoBare
      : shots.length > 0
    : false;

  return (
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
          <div className="relative overflow-hidden rounded-[2rem] bg-[#0B1015]">
            {/* 9 : 19.5, held by padding so the screen cannot collapse. */}
            <div style={{ paddingTop: "216%" }} />

            <div className="absolute inset-0">
              {app && (
                <div key={app.slug} className="app-launch absolute inset-0">
                  <Screen app={app} shots={shots} />
                </div>
              )}

              {!contentHasBar && <StatusBar />}

              <span
                aria-hidden
                className="absolute bottom-2 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-white/70"
              />

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
  );
}

function Screen({ app, shots }: { app: Project; shots: readonly string[] }) {
  if (app.video) return <Recording app={app} />;
  if (shots.length > 0) return <Gallery app={app} shots={shots} />;
  return <Splash app={app} note="SCREENS COMING SOON" />;
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

/**
 * One icon, drawn the same in a bubble and on an app's launch screen.
 *
 * The radius is a real home-screen tile's, measured off the screenshot the
 * icons were cut from: circular corners at 28% of the tile (the straight
 * edge starts 27% in and the diagonal inset is 16px of 189 — both figures
 * for a circle, not a squircle). The icons carry that same shape in their
 * alpha, so tile and image round along one line.
 */
function AppIcon({
  app,
  className,
  sizes,
}: {
  app: Project;
  className: string;
  sizes: string;
}) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-[28%] shadow-[0_4px_10px_rgba(0,0,0,0.25)] ${className}`}
    >
      {app.icon ? (
        /* A touch over size, so an icon trimmed inside its own edge (the
           ones cut from a screenshot) is clipped by the tile rather than
           showing a hairline of background around itself. */
        <Image src={app.icon} alt="" fill sizes={sizes} className="scale-[1.04] object-cover" />
      ) : (
        /* Initials on a tinted tile until a logo lands, so a missing icon
           reads as deliberate rather than as a broken image. */
        <span className="grid size-full place-items-center bg-[#75101F] text-[0.7em] font-bold text-white">
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
      <AppIcon app={app} className="size-16" sizes="64px" />
      <p className="text-[11px] font-medium text-white/90">{app.title}</p>
      {note && <p className="meta absolute bottom-12 text-white/45">{note}</p>}
    </div>
  );
}

/**
 * The screen recording, faded in over the launch screen once its first frame
 * is up — which is what launching an app looks like. Muted and looping
 * because it is a demo on a page, not a film someone pressed play on.
 *
 * It plays only while the phone is on screen: not while the phone is still
 * rising into view, and not once the visitor has scrolled past.
 */
function Recording({ app }: { app: Project }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="absolute inset-0 bg-[#0B1015]">
      <Splash app={app} />
      <video
        ref={videoRef}
        src={app.video}
        muted
        loop
        playsInline
        preload="auto"
        onLoadedData={() => setReady(true)}
        aria-label={`${app.title}, screen recording`}
        className={`absolute inset-0 size-full object-cover object-top transition-opacity duration-300 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/** Screenshots, advancing on their own so a still app reads as a running
 *  one, and on a tap at either side the way a phone gallery works. */
function Gallery({ app, shots }: { app: Project; shots: readonly string[] }) {
  const [shot, setShot] = useState(0);
  const step = (delta: number) =>
    setShot((i) => (i + delta + shots.length) % shots.length);

  // Restarted on every change of screen, so a tap gets a full beat before
  // the gallery moves on by itself.
  useEffect(() => {
    if (shots.length < 2 || matchMedia(REDUCED_MOTION).matches) return;
    const id = setTimeout(
      () => setShot((i) => (i + 1) % shots.length),
      2600,
    );
    return () => clearTimeout(id);
  }, [shot, shots.length]);

  return (
    <div className="absolute inset-0 bg-black">
      <Image
        key={shots[shot]}
        src={shots[shot]}
        alt={`${app.title}, screen ${shot + 1} of ${shots.length}`}
        fill
        sizes="260px"
        unoptimized={shots[shot]?.startsWith("http")}
        className="rise object-cover object-top"
      />

      {shots.length > 1 && (
        <>
          {/* The middle is left alone so it does not swallow every tap. */}
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous screen"
            className="absolute inset-y-0 left-0 z-10 w-1/3"
          />
          <button
            type="button"
            onClick={() => step(1)}
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

"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import BackButton from "@/components/back-button";
import Badges from "@/components/badges";
import type { Project } from "@/content/site";

/**
 * The websites, kept in a wardrobe.
 *
 * The section arrives as a closed cabinet, the sites a soft blur behind its
 * fluted glass doors. The doors are worked by the scroll itself: they swing
 * open as the wardrobe rises to the middle of the screen, stand open while
 * it is there, and swing shut as it leaves — and wherever the scrolling
 * stops, they stop. A site under the pointer lights the strip it stands on. Clicking one lifts it off its
 * shelf and carries it, in one continuous move, to a close-up inside the
 * wardrobe — its name on one side, what it is and the way through to it on
 * the other — where its screen recording plays, or its screens turn over
 * until one arrives. Back puts it on its shelf again the same way.
 *
 * The move is measured, not faked: the card's place on the shelf and its
 * place in the close-up are both read off the page, and the card is scaled
 * and slid between them. Everything on a card is drawn in proportion to its
 * width, so scaling it is exact.
 */

/** The flight off the shelf: a lift, then the glide to the close-up. */
const ZOOM_MS = 950;
/** The way back is quicker — returning a thing is not an event. */
const ZOOM_BACK_MS = 780;
/** The lift: how much larger, and how far up, before it sets off. */
const LIFT_SCALE = 1.06;
const LIFT_RISE = 10;

/** Below this interior width the shelves hold two sites, not three. */
const THREE_FROM = 720;

/**
 * How far the wardrobe's centre is from the screen's, as a share of the
 * distance at which it leaves the screen entirely: inside OPEN_WITHIN the
 * doors stand fully open, beyond SHUT_FROM they are shut.
 */
const OPEN_WITHIN = 0.22;
const SHUT_FROM = 0.82;

/** How much of the remaining way the doors cover each frame — a little
 *  weight, so they settle rather than stop dead when the scroll does. */
const DOOR_FOLLOW = 0.24;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const query = matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getMotion = () => matchMedia(REDUCED_MOTION).matches;
const getServerMotion = () => false;

type Box = { x: number; y: number; w: number };

/** Where `el` sits inside `root`, so scrolling between two reads is moot. */
function boxIn(el: Element, root: Element): Box {
  const a = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width };
}

function hostOf(href?: string) {
  if (!href) return "";
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const pad = (n: number) => n.toString().padStart(2, "0");

export default function SiteWall({ sites }: { sites: readonly Project[] }) {
  const wardrobeRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // How open the doors are, 0 to 1. Kept off React state: it changes every
  // frame of a scroll, and only the CSS needs it.
  const openness = useRef(0);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<{ index: number; from: Box } | null>(null);
  const [closing, setClosing] = useState(false);
  // The shelf a closed close-up came from, to hand focus back to once the
  // shelves are live again — they are inert until the close-up has gone.
  const returnTo = useRef<number | null>(null);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    getMotion,
    getServerMotion,
  );

  // The doors follow the scroll. Each scroll reads where the wardrobe sits
  // and sets a target openness; a frame loop eases the doors towards it and
  // stops as soon as they arrive, so nothing runs while the page is still.
  // Everything that moves with the doors — the light, the shade, the blur
  // behind the glass — reads the one `--open` variable this writes.
  useEffect(() => {
    const el = wardrobeRef.current;
    if (!el) return;
    const write = (value: number) => {
      openness.current = value;
      el.style.setProperty("--open", value.toFixed(4));
    };
    if (reduced) {
      write(1);
      return;
    }

    let target = 0;
    let frame = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const half = innerHeight / 2;
      const off = Math.abs(r.top + r.height / 2 - half) / (half + r.height / 2);
      const t = Math.min(1, Math.max(0, (SHUT_FROM - off) / (SHUT_FROM - OPEN_WITHIN)));
      // Eased at both ends: slow off the catch, slow into the stop.
      target = t * t * (3 - 2 * t);
    };
    const tick = () => {
      const now = openness.current;
      const next =
        Math.abs(target - now) < 0.0008 ? target : now + (target - now) * DOOR_FOLLOW;
      write(next);
      frame = next === target ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => {
      measure();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // Arrive in the right state, without swinging into it on load.
    measure();
    write(target);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  // The doors open by scrolling, so a click on a shut door — or a keyboard
  // reaching a site behind one — scrolls the wardrobe to the middle, which
  // is what opens them.
  const bringToMiddle = () => {
    const el = wardrobeRef.current;
    if (!el || openness.current > 0.95) return;
    const r = el.getBoundingClientRect();
    window.scrollBy({
      top: r.top + r.height / 2 - innerHeight / 2,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cols = width === 0 || width >= THREE_FROM ? 3 : 2;
  const rows: Project[][] = [];
  for (let i = 0; i < sites.length; i += cols) {
    rows.push(sites.slice(i, i + cols));
  }

  const open = (index: number) => {
    const wall = wallRef.current;
    const card = cardRefs.current[index];
    if (!wall || !card || zoom) return;
    setClosing(false);
    setZoom({ index, from: boxIn(card, wall) });
    // The close-up fills the wardrobe: centre it, which also swings the
    // doors fully open if they were part way.
    const el = wardrobeRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const off = r.top + r.height / 2 - innerHeight / 2;
      if (Math.abs(off) > 40) {
        window.scrollBy({ top: off, behavior: reduced ? "auto" : "smooth" });
      }
    }
  };

  const close = useCallback(() => {
    if (zoom) setClosing(true);
  }, [zoom]);

  const closed = useCallback(() => {
    returnTo.current = zoom?.index ?? null;
    setZoom(null);
    setClosing(false);
  }, [zoom]);

  useEffect(() => {
    if (zoom || returnTo.current === null) return;
    buttonRefs.current[returnTo.current]?.focus({ preventScroll: true });
    returnTo.current = null;
  }, [zoom]);

  const originOf = useCallback(
    (index: number) => {
      const wall = wallRef.current;
      const card = cardRefs.current[index];
      return wall && card ? boxIn(card, wall) : null;
    },
    [],
  );

  return (
    // Bleeds to the page's edges so the open doors, which swing out past the
    // cabinet, are clipped there rather than widening the page.
    <div className="-mx-6 overflow-x-clip px-6 pt-16 md:-mx-12 md:px-12">
      <div
        ref={wardrobeRef}
        className="wardrobe mx-auto max-w-[820px]"
      >
        <div className="wardrobe-crown">
          <span className="wardrobe-plate">My websites — I built them</span>
        </div>

        <div
          className="wardrobe-body"
          // Deep in proportion to the cabinet, so the doors swing with the
          // same depth on a phone as on a wide screen.
          style={{ perspective: `${Math.max(1200, width * 3.4)}px` }}
        >
          <div
            ref={wallRef}
            onFocus={bringToMiddle}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            className="wardrobe-interior site-wall relative overflow-hidden"
          >
            <span aria-hidden className="interior-led" />

            <div
              inert={zoom !== null}
              // While a site is out, the rest step back; they come forward
              // again as it is carried home.
              className={`wardrobe-shelves pt-4 ${zoom && !closing ? "is-zoomed" : ""}`}
            >
              {rows.map((row, r) => (
                <div key={r} className="pt-7">
                  <ul
                    aria-label={r === 0 ? "Websites" : undefined}
                    className="grid gap-x-[5%] px-[5%]"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {row.map((site, c) => {
                      const i = r * cols + c;
                      return (
                        <li
                          key={site.slug}
                          className={`shelf-spot relative flex flex-col items-center ${
                            zoom?.index === i ? "is-picked" : ""
                          }`}
                        >
                          <button
                            ref={(el) => {
                              buttonRefs.current[i] = el;
                            }}
                            type="button"
                            onClick={() => open(i)}
                            aria-label={`Open ${site.title}`}
                            className="block w-[92%] cursor-zoom-in"
                          >
                            <div
                              ref={(el) => {
                                cardRefs.current[i] = el;
                              }}
                              className={`wall-card relative rounded-[10px] ${
                                zoom?.index === i ? "opacity-0" : ""
                              }`}
                            >
                              <SiteCard
                                site={site}
                                sizes="(min-width: 768px) 230px, 42vw"
                              />
                            </div>
                          </button>

                          <div aria-hidden className="shelf w-full">
                            <span className="shelf-spill" />
                          </div>

                          {/* Hangs under the shelf board, like a price tag. */}
                          <div
                            aria-hidden
                            className="shelf-label absolute left-1/2 top-[calc(100%+26px)] w-max max-w-[110%] text-center"
                          >
                            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink">
                              {site.title}
                            </p>
                            <p className="mt-1 font-mono text-[9px] tracking-[0.1em] text-dim">
                              {hostOf(site.href)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div aria-hidden className="board mb-14" />
                </div>
              ))}
            </div>

            {/* The dark inside of a shut cabinet, lifted as the light comes on. */}
            <span aria-hidden className="interior-shade" />

            {zoom && (
              <CloseUp
                key={zoom.index}
                site={sites[zoom.index]}
                index={zoom.index}
                total={sites.length}
                from={zoom.from}
                closing={closing}
                reduced={reduced}
                wallRef={wallRef}
                originOf={originOf}
                onClose={close}
                onClosed={closed}
              />
            )}
          </div>

          {(["left", "right"] as const).map((side) => (
            <div
              key={side}
              aria-hidden
              onClick={bringToMiddle}
              className={`wardrobe-door door-${side}`}
            >
              <span className="door-face door-front">
                <span className="door-glass" />
                <span className="door-handle" />
              </span>
              <span className="door-face door-back">
                <span className="door-glass" />
              </span>
              {/* The door's own thickness, seen as it turns. */}
              <span className="door-edge" />
              <span className="door-hinge door-hinge-top" />
              <span className="door-hinge door-hinge-bottom" />
            </div>
          ))}
        </div>

        <div aria-hidden className="wardrobe-plinth" />
      </div>

      <p className="meta mt-14 text-center text-dim">
        Hover a shelf · click a site to step closer
      </p>
    </div>
  );
}

function CloseUp({
  site,
  index,
  total,
  from,
  closing,
  reduced,
  wallRef,
  originOf,
  onClose,
  onClosed,
}: {
  site: Project;
  index: number;
  total: number;
  from: Box;
  closing: boolean;
  reduced: boolean;
  wallRef: React.RefObject<HTMLDivElement | null>;
  originOf: (index: number) => Box | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  // Off the shelf: the card starts exactly over its place on the wall, lifts
  // a little — larger, and up off the strip — then glides to where the
  // close-up lays it out, slowing all the way in.
  useLayoutEffect(() => {
    const wall = wallRef.current;
    const card = cardRef.current;
    let flight: Animation | undefined;
    if (wall && card && !reduced) {
      const to = boxIn(card, wall);
      const s = from.w / to.w;
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      const w = card.offsetWidth * s;
      const h = card.offsetHeight * s;
      // The lift grows the card about its own centre, not its corner.
      const grow = (LIFT_SCALE - 1) / 2;
      card.style.transformOrigin = "0 0";
      flight = card.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) scale(${s})`,
            easing: "cubic-bezier(0.3, 0, 0.2, 1)",
          },
          {
            transform: `translate(${dx - w * grow}px, ${dy - h * grow - LIFT_RISE}px) scale(${s * LIFT_SCALE})`,
            offset: 0.22,
            easing: "cubic-bezier(0.45, 0, 0.12, 1)",
          },
          { transform: "none" },
        ],
        { duration: ZOOM_MS },
      );
    }
    backRef.current?.focus({ preventScroll: true });
    // Cancelled on cleanup, so a second run of this effect (React runs it
    // twice in development) measures the card where it really is, not where
    // a flight still in progress has put it.
    return () => flight?.cancel();
  }, [from, reduced, wallRef]);

  // And back onto it, measured again in case the page has reflowed since.
  useEffect(() => {
    if (!closing) return;
    const wall = wallRef.current;
    const card = cardRef.current;
    const origin = originOf(index);
    if (!wall || !card || !origin || reduced) {
      const id = setTimeout(onClosed, 0);
      return () => clearTimeout(id);
    }
    const to = boxIn(card, wall);
    card.style.transformOrigin = "0 0";
    const flight = card.animate(
      [
        { transform: "none" },
        {
          transform: `translate(${origin.x - to.x}px, ${origin.y - to.y}px) scale(${origin.w / to.w})`,
        },
      ],
      {
        duration: ZOOM_BACK_MS,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "forwards",
      },
    );
    const id = setTimeout(onClosed, ZOOM_BACK_MS);
    return () => {
      clearTimeout(id);
      flight.cancel();
    };
  }, [closing, index, originOf, onClosed, reduced, wallRef]);

  // The copy waits for the card to land on the way in, and must not wait on
  // the way out: an inline delay would hold its fade-out back too.
  const copyDelay = closing
    ? undefined
    : { animationDelay: `${reduced ? 0 : ZOOM_MS - 200}ms` };

  return (
    <div
      role="region"
      aria-label={site.title}
      data-closing={closing || undefined}
      className="absolute inset-0 z-10 flex items-center overflow-y-auto"
    >
      <div aria-hidden className="wall-zoom-backdrop interior-bg absolute inset-0" />

      <div className="closeup-grid relative w-full px-5 py-3 md:px-8 md:py-4">
        {/* Above the name, on its left edge — where the apps keep theirs. */}
        <BackButton
          ref={backRef}
          label="Back to all sites"
          onClick={onClose}
          style={copyDelay}
          className="closeup-back wall-zoom-copy lift-in transition-colors"
        />

        <div className="closeup-card relative">
          <div ref={cardRef} className="relative will-change-transform">
            <SiteCard site={site} sizes="(min-width: 768px) 26rem, 88vw" live />
          </div>
          <div aria-hidden className="wall-zoom-shelf shelf shelf-lit -mx-[4%]">
            <span className="shelf-spill" />
          </div>
        </div>

        <div className="closeup-copy wall-zoom-copy lift-in" style={copyDelay}>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
            {pad(index + 1)} / {pad(total)} · {site.category} · {site.year}
          </p>
          <h3 className="mt-2 text-[clamp(1.5rem,2.2vw,2.1rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-balance text-ink">
            {site.title}
          </h3>
          <p className="mt-1.5 font-mono text-[11px] tracking-[0.1em] text-dim">
            {hostOf(site.href)}
          </p>

          {site.description && (
            <p className="mt-3 line-clamp-4 text-[0.9375rem] leading-[1.6] text-dim md:line-clamp-5">
              {site.description}
            </p>
          )}

          <Badges tags={site.tags} brand={site.brand} className="mt-4" />

          {site.href && (
            <Link
              href={site.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link mt-3.5 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 md:mt-5 text-[13px] font-semibold text-canvas shadow-[0_8px_24px_-6px_rgba(36,104,155,0.55)] transition-colors hover:bg-ink"
            >
              Visit site
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover/link:translate-x-1"
              >
                →
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A site as a framed browser window: a bar with the three dots, then the
 * page. Every part is sized as a share of the card, so the card scales as
 * one piece when it flies off the shelf.
 */
function SiteCard({
  site,
  sizes,
  live = false,
}: {
  site: Project;
  sizes: string;
  /** The close-up: play the recording, or turn the screens over. */
  live?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-surface-1 shadow-[0_26px_40px_-18px_rgba(14,36,56,0.4)] ring-1 ring-ink/10">
      <div className="flex aspect-[16/11] flex-col">
        <div className="flex h-[6%] items-center gap-[1%] bg-surface-2 px-[2.4%]">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="aspect-square h-[34%] rounded-full bg-ink/20"
            />
          ))}
          <span className="ml-[3%] h-[44%] w-[38%] rounded-full bg-canvas/80" />
        </div>
        <div className="relative flex-1 bg-black">
          {live ? (
            <Screens site={site} sizes={sizes} />
          ) : (
            <Image
              src={site.images[0]}
              alt=""
              fill
              sizes={sizes}
              className="object-cover object-top"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The recording once the card has landed; until one exists, the site's
 *  screens crossfading in turn. */
function Screens({ site, sizes }: { site: Project; sizes: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shot, setShot] = useState(0);
  const shots = site.images;

  useEffect(() => {
    if (site.video) {
      const id = setTimeout(
        () => void videoRef.current?.play().catch(() => {}),
        ZOOM_MS,
      );
      return () => clearTimeout(id);
    }
    if (shots.length < 2 || matchMedia(REDUCED_MOTION).matches) return;
    const id = setInterval(
      () => setShot((i) => (i + 1) % shots.length),
      3200,
    );
    return () => clearInterval(id);
  }, [site.video, shots.length]);

  if (site.video) {
    return (
      <video
        ref={videoRef}
        src={site.video}
        poster={shots[0]}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={`${site.title}, screen recording`}
        className="absolute inset-0 size-full object-cover object-top"
      />
    );
  }

  return shots.map((src, i) => (
    <Image
      key={src}
      src={src}
      alt={i === shot ? `${site.title}, screen ${i + 1} of ${shots.length}` : ""}
      fill
      sizes={sizes}
      className={`wall-slide object-cover object-top ${
        i === shot ? "opacity-100" : "opacity-0"
      }`}
    />
  ));
}

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

import Badges from "@/components/badges";
import type { Project } from "@/content/site";

/**
 * The websites, kept in a wardrobe.
 *
 * The section arrives as a closed cabinet. Once it is properly in view the
 * two doors swing open, the light along the top comes on, and the sites
 * turn out to be standing on its shelves, one after another; scrolled away
 * from, it shuts again, and opens again on the way back. A site under
 * the pointer lights the strip it stands on. Clicking one lifts it off its
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

const ZOOM_MS = 700;
const ZOOM_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Below this interior width the shelves hold two sites, not three. */
const THREE_FROM = 760;

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
  const [opened, setOpened] = useState(false);
  // Latches: the sites are found on the shelves once, and stay there while
  // the doors close over them and open on them again.
  const [revealed, setRevealed] = useState(false);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<{ index: number; from: Box } | null>(null);
  const [closing, setClosing] = useState(false);
  // The close-up can be taller than the shelves on a narrow screen; the
  // wardrobe grows to hold it.
  const [zoomHeight, setZoomHeight] = useState(0);
  // The shelf a closed close-up came from, to hand focus back to once the
  // shelves are live again — they are inert until the close-up has gone.
  const returnTo = useRef<number | null>(null);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    getMotion,
    getServerMotion,
  );

  // Opens once enough of the wardrobe is in view for the opening to be
  // watched rather than missed, and shuts only once it is nearly out of view
  // — the gap between the two keeps it from flapping at the edge.
  useEffect(() => {
    const el = wardrobeRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.35) {
          setOpened(true);
          setRevealed(true);
        } else if (entry.intersectionRatio < 0.15) {
          setOpened(false);
        }
      },
      { threshold: [0, 0.15, 0.35] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    // The close-up fills the wardrobe; bring the top of it into view.
    const top = wall.getBoundingClientRect().top;
    if (top < 72) {
      window.scrollBy({ top: top - 96, behavior: reduced ? "auto" : "smooth" });
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
        className={`wardrobe mx-auto max-w-[1000px] ${opened ? "is-open" : ""} ${
          revealed ? "is-revealed" : ""
        }`}
      >
        <div className="wardrobe-crown">
          <span className="wardrobe-plate">Web · {pad(sites.length)} sites</span>
        </div>

        <div
          className="wardrobe-body"
          // Deep in proportion to the cabinet, so the doors swing with the
          // same depth on a phone as on a wide screen.
          style={{ perspective: `${Math.max(1200, width * 3.4)}px` }}
        >
          <div
            ref={wallRef}
            // A keyboard reaching a site behind closed doors opens them.
            onFocus={() => {
              setOpened(true);
              setRevealed(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            className="wardrobe-interior site-wall relative overflow-hidden"
            style={{ minHeight: zoom ? zoomHeight : undefined }}
          >
            <span aria-hidden className="interior-led" />

            <div inert={zoom !== null} className="pt-4">
              {rows.map((row, r) => (
                <div key={r} className="pt-9">
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
                          className="shelf-spot relative flex flex-col items-center"
                          style={{ "--i": i } as React.CSSProperties}
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
                                sizes="(min-width: 768px) 280px, 42vw"
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
                  <div aria-hidden className="board mb-16" />
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
                onHeight={setZoomHeight}
              />
            )}
          </div>

          {(["left", "right"] as const).map((side) => (
            <div
              key={side}
              aria-hidden
              onClick={() => {
                setOpened(true);
                setRevealed(true);
              }}
              className={`wardrobe-door door-${side}`}
            >
              <span className="door-face door-front">
                <span className="door-handle" />
              </span>
              <span className="door-face door-back" />
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
  onHeight,
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
  onHeight: (height: number) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  // Off the shelf: start the card exactly over its place on the wall, then
  // let it travel to where the close-up lays it out.
  useLayoutEffect(() => {
    const wall = wallRef.current;
    const card = cardRef.current;
    if (wall && card && !reduced) {
      const to = boxIn(card, wall);
      card.style.transition = "none";
      card.style.transformOrigin = "0 0";
      card.style.transform = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w})`;
      void card.offsetWidth;
      card.style.transition = `transform ${ZOOM_MS}ms ${ZOOM_EASE}`;
      card.style.transform = "";
    }
    backRef.current?.focus({ preventScroll: true });
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
    card.style.transition = `transform ${ZOOM_MS}ms ${ZOOM_EASE}`;
    card.style.transformOrigin = "0 0";
    card.style.transform = `translate(${origin.x - to.x}px, ${origin.y - to.y}px) scale(${origin.w / to.w})`;
    const id = setTimeout(onClosed, ZOOM_MS);
    return () => clearTimeout(id);
  }, [closing, index, originOf, onClosed, reduced, wallRef]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => onHeight(content.offsetHeight));
    observer.observe(content);
    return () => observer.disconnect();
  }, [onHeight]);

  // The copy waits for the card to land on the way in, and must not wait on
  // the way out: an inline delay would hold its fade-out back too.
  const copyDelay = closing
    ? undefined
    : { animationDelay: `${reduced ? 0 : ZOOM_MS - 250}ms` };

  return (
    <div
      role="region"
      aria-label={site.title}
      data-closing={closing || undefined}
      className="absolute inset-0 z-10 flex items-center"
    >
      <div aria-hidden className="wall-zoom-backdrop interior-bg absolute inset-0" />

      <div
        ref={contentRef}
        className="relative grid w-full gap-8 px-5 pb-14 pt-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center md:gap-12 md:px-12 md:py-16"
      >
        <div className="relative">
          <div ref={cardRef} className="relative will-change-transform">
            <SiteCard site={site} sizes="(min-width: 768px) 34rem, 92vw" live />
          </div>
          <div aria-hidden className="wall-zoom-shelf shelf shelf-lit -mx-[4%]">
            <span className="shelf-spill" />
          </div>
        </div>

        <div className="wall-zoom-copy lift-in" style={copyDelay}>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
            {pad(index + 1)} / {pad(total)} · {site.category} · {site.year}
          </p>
          <h3 className="mt-4 text-[clamp(2rem,3.2vw,3rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-balance text-ink">
            {site.title}
          </h3>
          <p className="mt-3 font-mono text-[11px] tracking-[0.1em] text-dim">
            {hostOf(site.href)}
          </p>

          {site.description && (
            <p className="mt-6 text-[1.0625rem] leading-[1.7] text-dim">
              {site.description}
            </p>
          )}

          <Badges tags={site.tags} brand={site.brand} className="mt-6" />

          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
            {site.href && (
              <Link
                href={site.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-canvas shadow-[0_8px_24px_-6px_rgba(36,104,155,0.55)] transition-colors hover:bg-ink"
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
            <button
              ref={backRef}
              type="button"
              onClick={onClose}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim transition-colors hover:text-accent"
            >
              ← Back to the wall
            </button>
          </div>
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

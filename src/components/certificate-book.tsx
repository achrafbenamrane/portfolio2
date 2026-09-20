"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useLightbox } from "@/components/zoomable-image";
import {
  certificationKinds,
  site,
  type Certification,
} from "@/content/site";

/**
 * The credentials bound as a book.
 *
 * It waits closed until it has been scrolled into view, then opens itself
 * — the cover swings over to the first spread while the reader is looking
 * — and the certificates are its pages, one to a page, each turning
 * around the spine in three dimensions. Drag a page and it follows
 * your hand until you let go, at which point it finishes turning or falls
 * back; click a page, press an arrow, or swipe, and it turns on its own.
 * Turn back past the contents and the cover closes over it; turn the last
 * page and the book closes on its back.
 *
 * Built from sheets: each sheet is one element with a front face and a
 * back face, rotated about its left edge. Sheets not yet turned stack on
 * the right, first on top; turned sheets stack on the left, last on top;
 * the one in motion sits above everything. The whole book slides half a
 * page sideways when it is closed, so a closed cover sits centred rather
 * than to one side of an invisible spine.
 *
 * What makes it a book and not four rectangles: the boards of the cover
 * showing past the edges of the paper, the fore-edge of the stack on each
 * side growing and shrinking as pages move across, warm stock with tooth,
 * the darkening of each page into the gutter, and the light that crosses
 * a page as it turns edge-on.
 *
 * On a phone there is no room for two pages — a spread works out about
 * 170px a side, which truncates every title and makes the certificates
 * unreadable — so below `SPREAD` it binds one page to a sheet instead and
 * shows them one at a time. Same sheets, same turn: the page still swings
 * about its left edge, it just goes off to the left on its own.
 *
 * No library. The page turn is a CSS transform, the drag sets that
 * transform directly, and the rest is bookkeeping about which sheet is
 * where.
 */

type Numbered = Certification & { number: string };

type Face =
  | { kind: "cover"; entries: readonly Numbered[] }
  | { kind: "contents"; entries: readonly Numbered[] }
  | { kind: "certificate"; certification: Numbered; page: number }
  | { kind: "back" };

/** A leaf: one page on a phone, two — front and back — on a wide screen. */
type Sheet = { front: Face; back: Face | null };

const TURN_MS = 750;
const TURN_EASE = "cubic-bezier(0.4, 0.05, 0.25, 1)";
/** A press that moves less than this is a click, and turns the page. */
const CLICK_PX = 6;
/** Thickness of one sheet at the fore-edge, in px. */
const LEAF_PX = 1.6;
/** How long the closed book is seen, once in view, before it opens itself. */
const OPEN_AFTER_MS = 500;
/** How much of the book must be on screen before it counts as seen. */
const SEEN_RATIO = 0.6;

/** Wide enough for two pages side by side. */
const SPREAD = "(min-width: 768px)";

function subscribeSpread(onChange: () => void) {
  const query = matchMedia(SPREAD);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSpread = () => matchMedia(SPREAD).matches;
/** A phone is the safer guess before hydration: the wide layout laid out at
 *  phone width is unreadable, where the narrow one at desk width is merely
 *  small for the instant before it corrects. */
const getServerSpread = () => false;

/** Sheets from the pages: cover and contents first, then the certificates,
 *  then a back cover. Two faces to a sheet in a spread, one on a phone —
 *  where a turned sheet has gone off to the left, so its back is never
 *  seen and would take half the book with it. */
function bind(entries: readonly Numbered[], spread: boolean): Sheet[] {
  const faces: Face[] = [
    { kind: "cover", entries },
    { kind: "contents", entries },
    ...entries.map<Face>((certification, i) => ({
      kind: "certificate",
      certification,
      page: i + 1,
    })),
  ];

  if (!spread) {
    const single: Face[] = [...faces, { kind: "back" }];
    return single.map((front) => ({ front, back: null }));
  }

  // The back cover must be a back face, so pad to an even count first.
  if (faces.length % 2 === 1) faces.push({ kind: "back" });
  else faces.push({ kind: "back" }, { kind: "back" });

  const sheets: Sheet[] = [];
  for (let i = 0; i < faces.length; i += 2) {
    sheets.push({ front: faces[i], back: faces[i + 1] });
  }
  return sheets;
}

export default function CertificateBook({
  entries,
}: {
  entries: readonly Numbered[];
}) {
  const spread = useSyncExternalStore(
    subscribeSpread,
    getSpread,
    getServerSpread,
  );
  const sheets = bind(entries, spread);
  const count = sheets.length;

  const book = useRef<HTMLDivElement>(null);
  const [turned, setTurned] = useState(0);

  // Closed until it has been scrolled into view, then the cover opens
  // itself: the one page turn the reader sees without asking, which is
  // what tells them the rest turn — and it only counts if they were
  // looking, so it waits for the book to be mostly on screen. Someone who
  // has asked for less motion gets it open straight away.
  useEffect(() => {
    const el = book.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setTurned(1), 0);
      return () => window.clearTimeout(timer);
    }
    let timer: number | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(() => setTurned((n) => (n === 0 ? 1 : n)), OPEN_AFTER_MS);
      },
      { threshold: SEEN_RATIO },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
  /** The sheet under the hand, and how far it has come round. */
  const [drag, setDrag] = useState<{ sheet: number; angle: number } | null>(
    null,
  );
  const gesture = useRef<{
    sheet: number;
    forward: boolean;
    startX: number;
    moved: boolean;
  } | null>(null);

  const closedFront = turned === 0;
  const closedBack = turned === count;
  const open = !closedFront && !closedBack;

  const turnTo = (n: number) => setTurned(Math.max(0, Math.min(count, n)));
  const next = () => turnTo(turned + 1);
  const prev = () => turnTo(turned - 1);

  /** Sheet width in px, for turning pointer travel into degrees. */
  const pageWidth = () =>
    (book.current?.clientWidth ?? 0) / (spread ? 2 : 1);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // A control on a page (the enlarge button) is its own thing.
    if ((e.target as HTMLElement).closest("button, a")) return;
    const el = book.current;
    if (!el) return;
    const spine = el.getBoundingClientRect().left + pageWidth();
    // Right of the spine turns the next sheet forward; left of it turns
    // the last turned sheet back. A closed book's cover counts as right,
    // and with a single page there is no left half to press: a press
    // turns forward, and going back is the arrow's job or a drag right.
    const forward =
      closedFront || !spread || (!closedBack && e.clientX >= spine);
    if (forward && turned === count) return;
    if (!forward && turned === 0) return;
    gesture.current = {
      sheet: forward ? turned : turned - 1,
      forward,
      startX: e.clientX,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const travel = e.clientX - g.startX;
    if (Math.abs(travel) > CLICK_PX) g.moved = true;
    if (!g.moved) return;
    const degrees = (Math.abs(travel) / pageWidth()) * 180;
    const angle = g.forward
      ? Math.max(0, Math.min(180, travel < 0 ? degrees : 0))
      : Math.max(0, Math.min(180, 180 - (travel > 0 ? degrees : 0)));
    setDrag({ sheet: g.sheet, angle });
  };

  const onPointerUp = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (!g.moved) {
      // A click: turn the page the way the click said.
      setDrag(null);
      turnTo(g.forward ? turned + 1 : turned - 1);
      return;
    }
    const angle = drag?.angle ?? (g.forward ? 0 : 180);
    // Let go past the vertical and the page finishes turning; short of
    // it and it falls back where it was.
    setDrag(null);
    if (g.forward && angle > 90) turnTo(turned + 1);
    if (!g.forward && angle < 90) turnTo(turned - 1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  };

  // The stack on each side: sheets lying there, less the one in the hand.
  const leftLeaves = Math.max(0, turned - (drag && drag.sheet < turned ? 1 : 0));
  const rightLeaves = Math.max(
    0,
    count - turned - (drag && drag.sheet >= turned ? 1 : 0),
  );

  return (
    <div className="mx-auto max-w-[54rem]">
      {/* The stage: room above and below for the turning page, which
          swings out past the book's own box. A single page swings out
          sideways instead, past the viewport, so that one is clipped. */}
      <div
        className={`px-4 py-8 [perspective:2600px] sm:px-8 ${
          spread ? "" : "overflow-hidden"
        }`}
      >
        <div
          ref={book}
          role="group"
          aria-label={`${site.name}'s certificates, as a book`}
          aria-roledescription="book"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          // pan-y: a finger dragging sideways turns the page instead of
          // being taken for a scroll; up and down still scrolls the page.
          className={`relative w-full cursor-grab select-none outline-none [touch-action:pan-y] [transform-style:preserve-3d] focus-visible:[outline:2px_solid_var(--color-accent)] active:cursor-grabbing ${
            spread ? "aspect-[5/3]" : "mx-auto aspect-[3/4] max-w-sm"
          }`}
          style={{
            // A spread closed on the cover slides left so the cover is
            // centred, and right when closed on the back. A single page is
            // already centred, whichever page it is.
            transform:
              spread && closedFront
                ? "translateX(-25%)"
                : spread && closedBack
                  ? "translateX(25%)"
                  : "translateX(0)",
            transition: `transform ${TURN_MS}ms ${TURN_EASE}`,
          }}
        >
          {/* The boards: the cover, seen past the edges of the paper when
              the book lies open, with the spine down the middle. */}
          {open && (
            <div
              aria-hidden
              className={`cloth absolute rounded-md shadow-[0_50px_90px_-36px_rgba(24,38,49,0.65)] ${
                spread
                  ? "-inset-x-[1.6%] -inset-y-[2.4%]"
                  : "-inset-y-[2%] -left-[9%] -right-[2.5%]"
              }`}
              style={{
                background:
                  "linear-gradient(160deg, #163F66 0%, #0E2438 55%, #0B1C2C 100%)",
              }}
            >
              {/* The spine shows down the middle of an open spread. On a
                  single page it is the whole left side: the board wraps
                  round the binding, so it runs darker than the cover and
                  takes a line of light along its crown, and the page casts
                  into it. Without that the page is a card with a border. */}
              {spread ? (
                <div className="absolute inset-y-0 left-1/2 w-[2.6%] -translate-x-1/2 bg-linear-to-r from-[#0B1C2C] via-[#091623] to-[#0B1C2C]" />
              ) : (
                <>
                  <div className="absolute inset-y-0 left-0 w-[11%] rounded-l-md bg-linear-to-r from-[#0B1C2C] via-[#06101A] to-[#0A1B2B]" />
                  <div className="absolute inset-y-[7%] left-[2.2%] w-px bg-white/15" />
                  <div className="absolute inset-y-[7%] left-[8.5%] w-px bg-black/45" />
                </>
              )}
            </div>
          )}

          {/* The stacks of pages, seen at the fore-edge and the foot: each
              sheet a leaf, so a stack grows as pages are turned onto it and
              thins as they leave. A single page has only the one stack, to
              its right — what is turned has gone off the left edge. */}
          {spread && !closedFront && (
            <Stack side="left" leaves={leftLeaves} thick={!spread} />
          )}
          {!closedBack && (
            <Stack side="right" leaves={rightLeaves} thick={!spread} />
          )}

          {sheets.map((sheet, i) => {
            const isTurned = i < turned;
            const held = drag?.sheet === i ? drag.angle : null;
            const angle = held ?? (isTurned ? 180 : 0);
            // Untouched sheets stack first-on-top on the right; turned ones
            // last-on-top on the left; the one in the hand above all.
            const z = held !== null ? count + 2 : isTurned ? i + 1 : count - i;
            // How far through its turn: the light across both faces peaks
            // edge-on, when the page is a sliver catching it.
            const shade = Math.sin((angle * Math.PI) / 180);

            return (
              <div
                key={i}
                className={`absolute top-0 h-full origin-left [transform-style:preserve-3d] ${
                  spread ? "left-1/2 w-1/2" : "left-0 w-full"
                }`}
                style={{
                  transform: `rotateY(${-angle}deg)`,
                  zIndex: z,
                  transition:
                    held !== null
                      ? "none"
                      : `transform ${TURN_MS}ms ${TURN_EASE}`,
                }}
              >
                <FaceView face={sheet.front} side="front" shade={shade} />
                {sheet.back && (
                  <FaceView face={sheet.back} side="back" shade={shade} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-6 px-4 sm:px-8">
        <p className="meta text-dim" data-book-status>
          {closedFront
            ? "TAP THE COVER, OR DRAG IT, TO OPEN"
            : closedBack
              ? "THE END · TURN BACK TO REOPEN"
              : `${spread ? "SPREAD" : "PAGE"} ${String(turned).padStart(2, "0")} / ${String(count - 1).padStart(2, "0")}`}
        </p>
        <div className="flex gap-2">
          <ArrowButton label="Previous page" onClick={prev} disabled={closedFront}>
            ←
          </ArrowButton>
          <ArrowButton label="Next page" onClick={next} disabled={closedBack}>
            →
          </ArrowButton>
        </div>
      </div>
    </div>
  );
}

/**
 * The edge of a stack of leaves: a strip of hairlines at the fore-edge
 * and along the foot, one per sheet, stepped out from under the top page.
 */
function Stack({
  side,
  leaves,
  thick = false,
}: {
  side: "left" | "right";
  leaves: number;
  /** A single page shows one block edge and nothing else; at spread
   *  thickness it reads as a hairline rather than as paper. */
  thick?: boolean;
}) {
  if (leaves === 0) return null;
  const depth = leaves * (thick ? LEAF_PX * 1.9 : LEAF_PX);
  const lines =
    "repeating-linear-gradient(var(--dir), #f4efe4 0 1px, #cfc6b4 1px 1.6px)";
  return (
    <div
      aria-hidden
      // A spread's block is half the book wide; a single page's is the whole
      // of it, and at half width the foot stops under the middle of the page.
      className={`absolute inset-y-0 ${
        thick ? "inset-x-0" : `w-1/2 ${side === "left" ? "left-0" : "right-0"}`
      }`}
    >
      {/* Fore-edge. */}
      <div
        className="absolute top-[0.6%] bottom-0"
        style={{
          width: depth,
          [side === "left" ? "left" : "right"]: -depth,
          background: lines,
          ["--dir" as string]: side === "left" ? "to left" : "to right",
          // The block is rounded where thumbs have opened it, and the top
          // page throws a little shade down its edge.
          borderRadius: side === "left" ? "3px 0 0 3px" : "0 3px 3px 0",
          boxShadow:
            side === "left"
              ? "inset -2px 0 3px -2px rgba(60,45,20,0.5)"
              : "inset 2px 0 3px -2px rgba(60,45,20,0.5)",
        }}
      />
      {/* Foot. */}
      <div
        className={`absolute ${side === "left" ? "left-0" : "right-0"}`}
        style={{
          height: depth,
          bottom: -depth,
          width: `calc(100% + ${depth}px)`,
          background: lines,
          ["--dir" as string]: "to bottom",
        }}
      />
    </div>
  );
}

function FaceView({
  face,
  side,
  shade,
}: {
  face: Face;
  side: "front" | "back";
  shade: number;
}) {
  const paper = face.kind === "contents" || face.kind === "certificate";
  return (
    <div
      className={`absolute inset-0 overflow-hidden @container [backface-visibility:hidden] ${
        side === "back" ? "[transform:rotateY(180deg)]" : ""
      } ${side === "front" ? "rounded-r-[3px]" : "rounded-l-[3px]"}`}
    >
      {face.kind === "cover" && <Cover entries={face.entries} />}
      {face.kind === "contents" && <Contents entries={face.entries} />}
      {face.kind === "certificate" && (
        <CertificatePage
          certification={face.certification}
          page={face.page}
          side={side}
        />
      )}
      {face.kind === "back" && <BackCover />}

      {/* Into the gutter: a page darkens where it curves down to the
          binding. The front face's spine is its left edge, the back
          face's its right. */}
      {paper && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              side === "front"
                ? "linear-gradient(to right, rgba(70,52,24,0.30) 0%, rgba(70,52,24,0.10) 5%, rgba(70,52,24,0.03) 12%, transparent 22%)"
                : "linear-gradient(to left, rgba(70,52,24,0.30) 0%, rgba(70,52,24,0.10) 5%, rgba(70,52,24,0.03) 12%, transparent 22%)",
          }}
        />
      )}

      {/* Light crossing the page as it turns: the moving edge catches a
          band of it while the rest falls into shadow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: shade,
          background:
            side === "front"
              ? "linear-gradient(to left, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 18%, rgba(24,38,49,0.28) 100%)"
              : "linear-gradient(to right, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 18%, rgba(24,38,49,0.28) 100%)",
        }}
      />
    </div>
  );
}

/**
 * The cover: a title pressed into the cloth. A double rule round the
 * edge, a medallion with the monogram at the centre, the title beneath it
 * in the wordmark's serif, and the details in small capitals — the way a
 * bound volume is lettered, in a foil that catches the light.
 */
const FOIL = "#D9BE85";
const EMBOSS =
  "0 1px 0 rgba(255,255,255,0.14), 0 -1px 1px rgba(0,0,0,0.55)";

const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function Cover({ entries }: { entries: readonly Numbered[] }) {
  const years = entries.flatMap((c) => c.date.match(/\d{4}/g) ?? []).map(Number);
  const span = `${Math.min(...years)} — ${Math.max(...years)}`;
  const count = WORDS[entries.length] ?? String(entries.length);

  return (
    <div
      className="cloth flex h-full flex-col items-center justify-between p-[8%] text-center"
      style={{
        color: FOIL,
        background:
          "radial-gradient(80% 60% at 30% 12%, #1B4A78 0%, transparent 60%)," +
          "linear-gradient(165deg, #143B61 0%, #0E2438 55%, #0A1A29 100%)",
      }}
    >
      {/* Double rule, blind-tooled then foiled: the outer pressed into
          the cloth, the inner a hairline of foil. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[3.5%] rounded-[2px] border border-black/40 shadow-[0_1px_0_rgba(255,255,255,0.08)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[5%] rounded-[1px] border opacity-70"
        style={{ borderColor: FOIL }}
      />

      <p
        className="meta relative opacity-90"
        style={{ textShadow: EMBOSS }}
      >
        {site.name}
      </p>

      <div className="relative">
        {/* The medallion. */}
        <div
          className="mx-auto grid size-[26cqw] place-items-center rounded-full border-2"
          style={{
            borderColor: FOIL,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 1px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="grid size-[86%] place-items-center rounded-full border"
            style={{ borderColor: FOIL, opacity: 0.85 }}
          >
            <span
              className="font-brand text-[11cqw] italic leading-none"
              style={{ textShadow: EMBOSS }}
            >
              {site.initials}
            </span>
          </div>
        </div>

        <p
          className="font-brand mt-[7%] text-[clamp(1.6rem,9cqw,3.6rem)] italic leading-none tracking-[-0.01em]"
          style={{ textShadow: EMBOSS }}
        >
          Certificates
        </p>
        <p
          className="meta mt-[5%] opacity-90"
          style={{ textShadow: EMBOSS }}
        >
          {count} CREDENTIALS · {span}
        </p>
      </div>

      <p
        className="meta relative opacity-90"
        style={{ textShadow: EMBOSS }}
      >
        VOL. 03 · ANNABA
      </p>
    </div>
  );
}

function Contents({ entries }: { entries: readonly Numbered[] }) {
  return (
    <div className="paper flex h-full flex-col p-[7%]">
      <p className="font-brand text-[clamp(1.05rem,5cqw,2.2rem)] italic leading-none">
        Contents
      </p>
      {/* Ten entries with wrapped titles have to fit the shortest page the
          book ever has — a spread page at the md breakpoint, about 304 by
          365 — so the ramp is set by that and grows from there. Bounded and
          clipped as well, so a future entry crowds nothing. */}
      <ol className="mt-[4%] min-h-0 flex-1 space-y-[1.6%] overflow-hidden">
        {entries.map((certification, i) => (
          <li
            key={certification.title}
            className="grid grid-cols-[2.25rem_1fr_1.25rem] items-baseline gap-x-1.5 text-[clamp(0.65rem,3.1cqw,0.9rem)] leading-[1.3]"
          >
            <span className="meta text-accent">{certification.number}</span>
            {/* Wraps at every width. A contents page whose entries end in
                an ellipsis is not much of one, and the dotted leaders this
                replaced only worked while every title stayed on one line —
                which stopped being true the moment the page narrowed. */}
            <span className="font-medium">{certification.title}</span>
            <span className="font-brand justify-self-end italic text-dim">
              {i + 1}
            </span>
          </li>
        ))}
      </ol>
      <p className="meta shrink-0 pt-[3%] text-dim">{site.name}</p>
    </div>
  );
}

function CertificatePage({
  certification,
  page,
  side,
}: {
  certification: Numbered;
  page: number;
  side: "front" | "back";
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const lightbox = useLightbox(
    certification.image ?? { src: "", width: 4, height: 3 },
    `${certification.title} certificate`,
  );
  // Pasted in by hand, so no two sit quite square.
  const tilt = page % 2 === 0 ? "rotate(0.5deg)" : "rotate(-0.6deg)";

  return (
    /* Narrower gutters on a phone: the certificate is what the page is for
       and it is limited by the page's width, so every millimetre of margin
       comes straight off it. */
    <div className="paper flex h-full flex-col p-[5%] sm:p-[6.5%]">
      <div className="flex items-baseline justify-between">
        <p className="meta text-dim">
          {certificationKinds[certification.kind]}
        </p>
        <p className="meta text-accent">{certification.number}</p>
      </div>

      {/* The certificate takes the space the page has left, centred in it,
          so what is over stands as margin above and below rather than
          collecting under the title as a hole in the paper. */}
      <div className="mt-[5%] flex min-h-0 flex-1 items-center">
      <div
        ref={sheet}
        // max-h-full so a page whose text runs long shortens the mat rather
        // than letting it push past the paper; the scan is object-contain,
        // so what gives is white border, never the certificate.
        className="relative aspect-4/3 max-h-full w-full bg-white shadow-[0_1px_2px_rgba(60,45,20,0.18),0_6px_14px_-6px_rgba(60,45,20,0.35)] ring-1 ring-[#e6dfd0]"
        style={{ transform: tilt }}
      >
        {certification.image ? (
          <Image
            src={certification.image.src}
            alt={`${certification.title} certificate`}
            fill
            sizes="(min-width: 1120px) 34rem, 45vw"
            className="object-contain"
            draggable={false}
          />
        ) : (
          <div className="grid h-full place-items-center px-[8%] text-center">
            <div>
              <p className="meta text-dim">{certification.issuer}</p>
              <p className="mt-2 text-[clamp(0.8rem,2.6cqw,1.2rem)] font-semibold leading-tight tracking-tight text-balance">
                {certification.title}
              </p>
            </div>
          </div>
        )}

        {certification.image && (
          <button
            type="button"
            onClick={() => sheet.current && lightbox.openFrom(sheet.current)}
            onPointerEnter={lightbox.preload}
            aria-label={`View larger: ${certification.title}`}
            className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-line transition-colors hover:bg-ink hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
            </svg>
          </button>
        )}
      </div>
      </div>

      <div className="mt-[5%] shrink-0">
        <h3 className="text-[clamp(0.8rem,2.8cqw,1.15rem)] font-semibold leading-snug tracking-tight text-balance">
          {certification.title}
        </h3>
        <p className="mt-1 text-[clamp(0.72rem,1.9cqw,0.85rem)] text-dim">
          {certification.issuer} · {certification.date}
        </p>

        {/* What the credential is actually for. The index this book replaced
            listed these and the book did not, which lost information and
            left a page with a band of empty paper under two lines of type. */}
        <ul className="mt-[3%] flex flex-wrap gap-1">
          {certification.skills.map((skill) => (
            <li
              key={skill}
              className="meta rounded-full border border-ink/15 px-2 py-0.5 text-[clamp(0.55rem,1.5cqw,0.6875rem)] text-dim"
            >
              {skill}
            </li>
          ))}
        </ul>
      </div>

      {/* The folio, in the book's own serif. */}
      <p
        className={`font-brand mt-[4%] shrink-0 text-[clamp(0.7rem,2.2cqw,1rem)] italic text-dim ${
          side === "front" ? "text-right" : "text-left"
        }`}
      >
        {page}
      </p>

      {lightbox.overlay}
    </div>
  );
}

function BackCover() {
  return (
    <div
      className="cloth flex h-full flex-col items-center justify-center text-white"
      style={{
        background:
          "linear-gradient(200deg, #133A5E 0%, #0E2438 60%, #0B1C2C 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[4.5%] rounded-[2px] border border-white/15 shadow-[inset_0_1px_0_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.08)]"
      />
      <p className="meta relative text-white/70">{site.initials}</p>
      <p className="font-brand relative mt-3 text-[clamp(1rem,3.5cqw,1.6rem)] italic">
        my portfolio
      </p>
    </div>
  );
}

function ArrowButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-11 place-items-center rounded-full border border-ink text-ink transition-colors hover:bg-ink hover:text-canvas disabled:cursor-default disabled:border-line disabled:text-dim/60 disabled:hover:bg-transparent disabled:hover:text-dim/60"
    >
      {children}
    </button>
  );
}

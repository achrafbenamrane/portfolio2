"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { useLightbox } from "@/components/zoomable-image";
import {
  certificationKinds,
  site,
  type Certification,
} from "@/content/site";

/**
 * The credentials bound as a book.
 *
 * A closed cover in the middle of the page; open it and the certificates
 * are its pages, one to a page, each turning around the spine in three
 * dimensions. Drag a page and it follows your hand until you let go, at
 * which point it finishes turning or falls back; click a page, press an
 * arrow, or swipe, and it turns on its own. The last page turned closes
 * the book on its back cover.
 *
 * Built from sheets: each sheet is one element with a front face and a
 * back face, rotated about its left edge. Sheets not yet turned stack on
 * the right, first on top; turned sheets stack on the left, last on top;
 * the one in motion sits above everything. The whole book slides half a
 * page sideways when it is closed, so a closed cover sits centred rather
 * than to one side of an invisible spine.
 *
 * No library. The page turn is a CSS transform, the drag sets that
 * transform directly, and the rest is bookkeeping about which sheet is
 * where.
 */

type Numbered = Certification & { number: string };

type Face =
  | { kind: "cover" }
  | { kind: "contents"; entries: readonly Numbered[] }
  | { kind: "certificate"; certification: Numbered; page: number }
  | { kind: "back" };

type Sheet = { front: Face; back: Face };

const TURN_MS = 750;
const TURN_EASE = "cubic-bezier(0.4, 0.05, 0.25, 1)";
/** A press that moves less than this is a click, and turns the page. */
const CLICK_PX = 6;

/** Sheets from the pages: cover and contents first, then two certificates
 *  per sheet, and a back cover on the last sheet's reverse. */
function bind(entries: readonly Numbered[]): Sheet[] {
  const faces: Face[] = [
    { kind: "cover" },
    { kind: "contents", entries },
    ...entries.map<Face>((certification, i) => ({
      kind: "certificate",
      certification,
      page: i + 1,
    })),
  ];
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
  const sheets = bind(entries);
  const count = sheets.length;

  const book = useRef<HTMLDivElement>(null);
  const [turned, setTurned] = useState(0);
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

  const turnTo = (n: number) => setTurned(Math.max(0, Math.min(count, n)));
  const next = () => turnTo(turned + 1);
  const prev = () => turnTo(turned - 1);

  /** Sheet width in px, for turning pointer travel into degrees. */
  const pageWidth = () => (book.current?.clientWidth ?? 0) / 2;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // A control on a page (the enlarge button) is its own thing.
    if ((e.target as HTMLElement).closest("button, a")) return;
    const el = book.current;
    if (!el) return;
    const spine = el.getBoundingClientRect().left + pageWidth();
    // Right of the spine turns the next sheet forward; left of it turns
    // the last turned sheet back. A closed book's cover counts as right.
    const forward = closedFront || (!closedBack && e.clientX >= spine);
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

  return (
    <div className="mx-auto max-w-[70rem]">
      {/* The stage: room above and below for the turning page, which
          swings out past the book's own box. */}
      <div className="px-4 py-6 [perspective:2600px] sm:px-8">
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
          className="relative aspect-[5/3] w-full cursor-grab select-none outline-none [touch-action:pan-y] [transform-style:preserve-3d] focus-visible:[outline:2px_solid_var(--color-accent)] active:cursor-grabbing"
          style={{
            // Closed on the cover: slide left so the cover is centred.
            // Closed on the back: slide right for the same reason.
            transform: closedFront
              ? "translateX(-25%)"
              : closedBack
                ? "translateX(25%)"
                : "translateX(0)",
            transition: `transform ${TURN_MS}ms ${TURN_EASE}`,
          }}
        >
          {/* The block of pages the sheets turn over: its edges and its
              shadow on the desk are what make it a bound thing and not
              cards floating in a row. */}
          {!closedFront && (
            <div
              aria-hidden
              className="absolute inset-y-[1%] left-0 w-1/2 rounded-l-sm bg-white shadow-[-2px_0_0_#E6EBEF,-4px_0_0_#F2F5F7,0_30px_60px_-30px_rgba(24,38,49,0.5)]"
            />
          )}
          {!closedBack && (
            <div
              aria-hidden
              className="absolute inset-y-[1%] right-0 w-1/2 rounded-r-sm bg-white shadow-[2px_0_0_#E6EBEF,4px_0_0_#F2F5F7,0_30px_60px_-30px_rgba(24,38,49,0.5)]"
            />
          )}

          {sheets.map((sheet, i) => {
            const isTurned = i < turned;
            const held = drag?.sheet === i ? drag.angle : null;
            const angle = held ?? (isTurned ? 180 : 0);
            // Untouched sheets stack first-on-top on the right; turned ones
            // last-on-top on the left; the one in the hand above all.
            const z = held !== null ? count + 2 : isTurned ? i + 1 : count - i;
            // How far through its turn: the shading on both faces peaks
            // edge-on, when the page is a sliver catching the light.
            const shade = Math.sin((angle * Math.PI) / 180);

            return (
              <div
                key={i}
                className="absolute top-0 left-1/2 h-full w-1/2 origin-left [transform-style:preserve-3d]"
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
                <FaceView face={sheet.back} side="back" shade={shade} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-6 px-4 sm:px-8">
        <p className="meta text-dim" data-book-status>
          {closedFront
            ? "CLICK THE COVER, OR DRAG IT, TO OPEN"
            : closedBack
              ? "THE END · TURN BACK TO REOPEN"
              : `SPREAD ${String(turned).padStart(2, "0")} / ${String(count - 1).padStart(2, "0")}`}
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

function FaceView({
  face,
  side,
  shade,
}: {
  face: Face;
  side: "front" | "back";
  shade: number;
}) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden @container [backface-visibility:hidden] ${
        side === "back" ? "[transform:rotateY(180deg)]" : ""
      } ${side === "front" ? "rounded-r-sm" : "rounded-l-sm"}`}
    >
      {face.kind === "cover" && <Cover />}
      {face.kind === "contents" && <Contents entries={face.entries} />}
      {face.kind === "certificate" && (
        <CertificatePage
          certification={face.certification}
          page={face.page}
          side={side}
        />
      )}
      {face.kind === "back" && <BackCover />}

      {/* Light across the page as it turns, and the crease at the spine:
          the front face's spine is its left edge, the back face's its
          right. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            side === "front"
              ? "linear-gradient(to right, rgba(24,38,49,0.18), transparent 12%)"
              : "linear-gradient(to left, rgba(24,38,49,0.18), transparent 12%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#0E2438]"
        style={{ opacity: shade * 0.28 }}
      />
    </div>
  );
}

function Cover() {
  return (
    <div
      className="flex h-full flex-col justify-between p-[7%] text-white"
      style={{
        background:
          "radial-gradient(90% 70% at 20% 10%, #245E95 0%, transparent 60%)," +
          "linear-gradient(160deg, #133A5E 0%, #0E2438 60%, #0B1C2C 100%)",
      }}
    >
      <div className="flex items-start justify-between">
        <p className="meta text-white/70">03 / CERTIFICATIONS</p>
        <p className="meta text-white/70">{site.initials}</p>
      </div>
      <div>
        <p className="font-brand text-[clamp(1.6rem,5cqw,3.2rem)] italic leading-none tracking-[-0.01em]">
          Credentials
        </p>
        <p className="mt-[4%] max-w-[22ch] text-[clamp(0.7rem,1.6cqw,0.95rem)] leading-relaxed text-white/70">
          A degree, a red-team credential, automation certifications and
          community recognition — the documents themselves.
        </p>
      </div>
      <p className="meta text-white/70">{site.name}</p>
    </div>
  );
}

function Contents({ entries }: { entries: readonly Numbered[] }) {
  return (
    <div className="flex h-full flex-col bg-white p-[7%]">
      <p className="meta border-b border-line pb-[3%] text-dim">CONTENTS</p>
      <ol className="mt-[4%] space-y-[2.5%]">
        {entries.map((certification, i) => (
          <li
            key={certification.title}
            className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-2 text-[clamp(0.6rem,1.5cqw,0.9rem)] leading-snug"
          >
            <span className="meta text-accent">{certification.number}</span>
            <span className="truncate font-medium">{certification.title}</span>
            <span className="meta text-dim">{i + 1}</span>
          </li>
        ))}
      </ol>
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

  return (
    <div className="flex h-full flex-col bg-white p-[6%]">
      <div className="flex items-baseline justify-between">
        <p className="meta text-dim">
          {certificationKinds[certification.kind]}
        </p>
        <p className="meta text-accent">{certification.number}</p>
      </div>

      <div
        ref={sheet}
        className="relative mt-[4%] aspect-4/3 w-full overflow-hidden rounded-sm bg-surface-2 ring-1 ring-line"
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
              <p className="mt-2 text-[clamp(0.8rem,2cqw,1.2rem)] font-semibold leading-tight tracking-tight text-balance">
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

      <div className="mt-[4%] min-h-0 flex-1">
        <h3 className="text-[clamp(0.75rem,1.9cqw,1.15rem)] font-semibold leading-snug tracking-tight text-balance">
          {certification.title}
        </h3>
        <p className="mt-1 text-[clamp(0.6rem,1.4cqw,0.85rem)] text-dim">
          {certification.issuer} · {certification.date}
        </p>
      </div>

      <p
        className={`meta mt-auto text-dim ${
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
      className="flex h-full flex-col items-center justify-center text-white"
      style={{
        background:
          "linear-gradient(200deg, #133A5E 0%, #0E2438 60%, #0B1C2C 100%)",
      }}
    >
      <p className="meta text-white/70">{site.initials}</p>
      <p className="font-brand mt-3 text-[clamp(1rem,2.6cqw,1.6rem)] italic">
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

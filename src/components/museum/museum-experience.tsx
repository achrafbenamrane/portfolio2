"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { wide } from "@/components/home/wide-font";
import { MUSEUM_FRAMES, ONEFRAME_STORE } from "@/content/museum";
import { HeadSensor } from "@/lib/vision/head-sensor";

import { MuseumBridge, type MuseumView } from "./museum-bridge";

/** Three and the museum's assets only load here, in the browser, on this page. */
const MuseumScene = dynamic(() => import("./museum-scene"), { ssr: false });
const WallStage = dynamic(() => import("./wall-stage"), { ssr: false });

const getServerVersion = () => 0;

/** How long a lean has to be held before it counts as walking. Long enough that
 *  reaching for a coffee doesn't move the visitor across the room. */
const LEAN_HOLD_MS = 450;
const LEAN_IN = 0.55;
const LEAN_OUT = -0.32;
/** After stepping, the lean has to be let go of before it can step again. */
const LEAN_REST_MS = 1600;

function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const media = matchMedia(query);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
      },
      [query],
    ),
    () => matchMedia(query).matches,
    () => serverValue,
  );
}

let webglSupport: boolean | null = null;

/** Asked once and remembered, and the test context handed straight back: React reads
 *  this on every render, and past about 16 contexts a browser kills the oldest. */
function supportsWebgl(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webglSupport = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const subscribeNever = () => () => {};

/** A missing file must cost the 3D, not the page. */
class SceneBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The ONEFRAME museum: the 3D hall, and everything laid over it.
 *
 * A black hall built like the product itself, six frames in lit bays down one wall. The
 * screen is treated as a window on all of it: the view follows the visitor's head, from
 * the webcam if they switch it on and from the mouse if they don't, so the depth in each
 * box is there either way. Then a frame can be taken off the wall and hung on their own.
 */
export default function MuseumExperience() {
  const [bridge] = useState(() => new MuseumBridge());
  const [sensor] = useState(() => (typeof document === "undefined" ? null : new HeadSensor()));
  const [view, setView] = useState<MuseumView>("door");
  const [focus, setFocus] = useState(0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [onWall, setOnWall] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)", false);
  const coarse = useMedia("(pointer: coarse)", false);
  const webgl = useSyncExternalStore(subscribeNever, supportsWebgl, () => true);
  const live = webgl && !failed;

  useSyncExternalStore(sensor?.subscribe ?? subscribeNever, sensor?.getVersion ?? getServerVersion, getServerVersion);
  const status = sensor?.status ?? "idle";
  const watching = status === "running";
  const startingCamera = status === "requesting" || status === "loading";
  const noCamera = status === "denied" || status === "unsupported" || status === "error";

  useEffect(() => () => sensor?.stop(), [sensor]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __museumHead: sensor, __museumBridge: bridge });
    }
  }, [sensor, bridge]);

  const shut = useCallback(() => {
    bridge.setOpen(false);
    setOpen(false);
  }, [bridge]);

  const goToHall = useCallback(() => {
    shut();
    setView("hall");
  }, [shut]);

  const goToFrame = useCallback((index: number) => {
    setFocus(index);
    setView("frame");
  }, []);

  const step = useCallback(
    (by: number) => {
      shut();
      setFocus((current) => (current + by + MUSEUM_FRAMES.length) % MUSEUM_FRAMES.length);
    },
    [shut],
  );

  const toggleOpen = useCallback(() => {
    bridge.setOpen(!open);
    setOpen(!open);
  }, [bridge, open]);

  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setFailed(true), []);

  // Without a webcam, the pointer stands in for the head: everyone gets the depth.
  useEffect(() => {
    if (reducedMotion) return;
    const onMove = (event: PointerEvent) => {
      if (watching) return;
      bridge.look((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [bridge, reducedMotion, watching]);

  // With one, the head drives the window, and leaning in walks.
  const leaning = useRef({ since: 0, restUntil: 0 });
  useEffect(() => {
    if (!watching || !sensor) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const head = sensor.frame;
      if (!head.hasFace) return;
      bridge.look(head.x, head.y, head.lean);

      const now = performance.now();
      const lean = leaning.current;
      const wants = view === "hall" ? head.lean > LEAN_IN : view === "frame" ? head.lean < LEAN_OUT : false;
      if (!wants || now < lean.restUntil) {
        lean.since = 0;
        return;
      }
      lean.since ||= now;
      if (now - lean.since < LEAN_HOLD_MS) return;
      lean.since = 0;
      lean.restUntil = now + LEAN_REST_MS;
      if (view === "hall") setView("frame");
      else goToHall();
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [watching, sensor, bridge, view, goToHall]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (onWall) return;
      if (event.key === "Escape" && view === "frame") goToHall();
      if (event.key === "ArrowLeft" && view !== "door") step(-1);
      if (event.key === "ArrowRight" && view !== "door") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onWall, goToHall, step]);

  const toggleCamera = () => {
    if (!sensor) return;
    if (watching) {
      sensor.stop();
      bridge.look(0, 0, 0);
    } else if (videoRef.current) {
      void sensor.start(videoRef.current);
    }
  };

  const frame = MUSEUM_FRAMES[focus];

  return (
    <div className={`museum-stage page-head ${wide.variable}`} data-view={view}>
      <video
        ref={videoRef}
        aria-hidden
        playsInline
        muted
        className="pointer-events-none absolute left-0 top-0 size-px opacity-0"
      />

      {!live && (
        <Image
          src="/museum/poster.webp"
          alt="A black gallery with a polished floor: six lit ONEFRAME frames along one wall, each throwing its own colour, under one long bar of light."
          fill
          sizes="100vw"
          className="object-cover"
        />
      )}

      {live && (
        <div className="absolute inset-0">
          <SceneBoundary onFail={onFail}>
            <MuseumScene
              view={view}
              focus={focus}
              bridge={bridge}
              paused={onWall}
              reducedMotion={reducedMotion}
              small={coarse}
              onPick={goToFrame}
              onReady={onReady}
              onProgress={setProgress}
            />
          </SceneBoundary>
        </div>
      )}

      {live && !ready && (
        <div className="museum-loading" role="status">
          <Image src="/museum/logo.webp" alt="ONEFRAME" width={300} height={84} priority={false} />
          <span className="museum-bar-track">
            <span style={{ transform: `scaleX(${Math.max(progress, 3) / 100})` }} />
          </span>
          <span className="museum-label">Switching on the lights</span>
        </div>
      )}

      {!live && (
        <div className="museum-card museum-fallback">
          <h1 className="museum-title text-2xl">The ONEFRAME museum</h1>
          <p className="mt-2 text-white/70">
            {webgl
              ? "The 3D hall didn't load this time, so here is the collection as a list."
              : "Your browser can't draw the 3D hall, so here is the collection as a list."}
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {MUSEUM_FRAMES.map((item) => (
              <li key={item.slug}>
                <strong>{item.name}</strong>
                <span className="block text-white/60">{item.line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {live && ready && view === "door" && (
        <div className="museum-door">
          <p className="museum-label">The ONEFRAME museum</p>
          <h1 className="museum-title mt-3 text-[clamp(1.7rem,4.4vw,3.2rem)]">
            Six frames. <span className="museum-outline">Each one made once.</span>
          </h1>
          <button type="button" className="museum-button mt-6" onClick={() => setView("hall")}>
            Walk in
          </button>
        </div>
      )}

      {live && view !== "door" && !onWall && (
        <div className="museum-overlay">
          <div className="flex items-start justify-between gap-3">
            {view === "frame" ? (
              <button type="button" className="museum-chip shrink-0" onClick={goToHall}>
                <span aria-hidden>←</span> Back to the hall
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                className="museum-chip"
                aria-pressed={watching}
                disabled={startingCamera}
                onClick={toggleCamera}
              >
                <i className={`museum-dot ${watching ? "is-on" : ""}`} aria-hidden />
                {startingCamera
                  ? "Starting the camera"
                  : watching
                    ? "Window on. Lean in to step closer"
                    : noCamera
                      ? "No camera. Move the mouse instead"
                      : "Turn your screen into a window"}
              </button>
              {watching && (
                <p className="museum-chip museum-chip-quiet">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
              )}
            </div>
          </div>

          {view === "hall" && (
            <div className="flex flex-col items-center gap-3">
              <p className="museum-chip museum-chip-quiet" aria-live="polite">
                {String(focus + 1).padStart(2, "0")} / 06 · {frame.name}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" className="museum-round" aria-label="Previous frame" onClick={() => step(-1)}>
                  ←
                </button>
                <button type="button" className="museum-button" onClick={() => goToFrame(focus)}>
                  Step closer
                </button>
                <button type="button" className="museum-round" aria-label="Next frame" onClick={() => step(1)}>
                  →
                </button>
              </div>
            </div>
          )}

          {view === "frame" && (
            <aside className="museum-panel" aria-label={frame.name}>
              <p className="museum-label">{String(focus + 1).padStart(2, "0")} / 06</p>
              <h2 className="museum-title mt-2 text-[1.55rem]">{frame.name}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-white/70">“{frame.line}”</p>
              <p className="mt-4 text-[13px] leading-relaxed text-white/55">
                One edition. One owner. No second copy, no reprint.
              </p>

              <div className="mt-5 grid gap-2">
                <button type="button" className="museum-button" aria-pressed={open} onClick={toggleOpen}>
                  {open ? "Put it back" : "Bring it out of the frame"}
                </button>
                <button type="button" className="museum-button museum-button-ghost" onClick={() => setOnWall(true)}>
                  Hang it on your wall
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button type="button" className="museum-round museum-round-small" aria-label="Previous frame" onClick={() => step(-1)}>
                    ←
                  </button>
                  <button type="button" className="museum-round museum-round-small" aria-label="Next frame" onClick={() => step(1)}>
                    →
                  </button>
                </div>
                <a href={ONEFRAME_STORE} target="_blank" rel="noopener noreferrer" className="museum-link">
                  oneframe.me ↗
                </a>
              </div>
            </aside>
          )}
        </div>
      )}

      {live && onWall && (
        <SceneBoundary onFail={() => setOnWall(false)}>
          <WallStage
            slug={frame.slug}
            onSelect={(slug) => setFocus(MUSEUM_FRAMES.findIndex((item) => item.slug === slug))}
            onClose={() => setOnWall(false)}
          />
        </SceneBoundary>
      )}

      <p className="museum-note">
        A 3D website by Achraf Benamrane for ONEFRAME, my own brand.{" "}
        <Link href="/contact" className="underline underline-offset-2">
          Want one for your brand?
        </Link>
      </p>
    </div>
  );
}

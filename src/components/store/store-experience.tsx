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
import { KITS, type KitSlug, kitBySlug, SIZES, type Size } from "@/content/store";

import { StoreBridge, type ShirtAngle, type StoreView } from "./store-bridge";

/** Three and the store's assets only load here, in the browser, on this page. */
const StoreScene = dynamic(() => import("./store-scene"), { ssr: false });
const MirrorStage = dynamic(() => import("./mirror-stage"), { ssr: false });

const ANGLES: { id: ShirtAngle; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "crest", label: "Crest" },
  { id: "collar", label: "Collar" },
];

/** A media query as an external store, so a setting changed mid-visit is honoured
 *  and nothing has to set state from an effect to read it. */
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

/**
 * Asked once and remembered, and the test context is handed straight back. React
 * reads this on every render, and browsers allow about 16 live contexts a page: past
 * that they kill the oldest, which here would be the store itself.
 */
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

/**
 * A file that fails to load must cost the 3D, not the page: without this, one
 * missing texture takes the whole route down. What's left is the poster and the
 * list of kits. Error boundaries are the one thing that still has to be a class.
 */
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

/** The running clock on the corner camera's picture. */
function Clock() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tick = () => {
      if (ref.current) ref.current.textContent = new Date().toLocaleTimeString("en-GB");
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return <span ref={ref} className="tabular-nums" />;
}

/** A label pinned to the scene, which writes its position as it draws. The scene
 *  draws on demand, so a new pin has to ask for the frame that places it. */
function Pin({
  id,
  bridge,
  onClick,
  children,
}: {
  id: string;
  bridge: StoreBridge;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    bridge.pins.set(id, element);
    bridge.kick();
    return () => {
      bridge.pins.delete(id);
    };
  }, [bridge, id]);

  return (
    <button ref={ref} type="button" className="store-pin" onClick={onClick}>
      <span>{children}</span>
    </button>
  );
}

/**
 * The store's page: the 3D scene, and everything laid over it.
 *
 * Four places, one after the other: the sales floor through the corner camera, the
 * shirt wall, one shirt in the hand, and the mirror. They all live in one scene, so
 * moving between them is the camera moving, never a page loading.
 *
 * Every way through works from the keyboard too. The canvas is only ever a second
 * route to the buttons here, and with no WebGL at all the page is a list of the
 * kits under a rendered picture of the shop.
 */
export default function StoreExperience() {
  const [bridge] = useState(() => new StoreBridge());
  const [view, setView] = useState<StoreView>({ name: "overview" });
  const [selected, setSelected] = useState<KitSlug>("barcelona");
  const [size, setSize] = useState<Size>("M");
  const [chosen, setChosen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [atMirror, setAtMirror] = useState(false);
  const [mirrorLive, setMirrorLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState(bridge.wallFocus);

  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)", false);
  const coarse = useMedia("(pointer: coarse)", false);
  const webgl = useSyncExternalStore(subscribeNever, supportsWebgl, () => true);
  const live = webgl && !failed;

  const goToWall = useCallback(() => {
    setView({ name: "wall" });
    bridge.resetShirt();
  }, [bridge]);

  const goToFloor = useCallback(() => {
    setAtMirror(false);
    setMirrorLive(false);
    setView({ name: "overview" });
    bridge.resetShirt();
  }, [bridge]);

  const goToMirror = useCallback(() => {
    setView({ name: "mirror" });
    bridge.resetShirt();
  }, [bridge]);

  const openShirt = useCallback(
    (slug: KitSlug) => {
      setSelected(slug);
      setChosen(false);
      bridge.resetShirt();
      setView({ name: "shirt", slug });
    },
    [bridge],
  );

  const onZone = useCallback(
    (zone: "wall" | "mirror") => (zone === "wall" ? goToWall() : goToMirror()),
    [goToMirror, goToWall],
  );

  const onArrive = useCallback((name: StoreView["name"]) => {
    if (name === "mirror") setAtMirror(true);
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setFailed(true), []);

  const step = useCallback(
    (by: number) => {
      bridge.stepWall(by);
      setFocus(bridge.wallFocus);
    },
    [bridge],
  );

  // Escape takes you one step back out of the shop, as a browser's back would.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (view.name === "shirt") goToWall();
        else if (view.name !== "overview") goToFloor();
      }
      if (view.name === "wall" && event.key === "ArrowLeft") step(-1);
      if (view.name === "wall" && event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, goToFloor, goToWall, step]);

  const held = view.name === "shirt" ? kitBySlug(view.slug) : null;
  const focused = KITS[Math.round(focus)];

  return (
    <div className={`store-stage page-head ${wide.variable}`} data-view={view.name}>
      {/* Rendered in Blender from the camera the scene opens on, so the live
          scene fades up over a picture of itself. */}
      <Image
        src="/store/poster.webp"
        alt="A white football shop seen from a high corner: a chrome rail of shirts under the Wolfexo name, a deep red counter, and a tall mirror."
        fill
        loading="eager"
        fetchPriority="high"
        sizes="100vw"
        className={`object-cover transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`}
      />

      {live && (
        <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
          <SceneBoundary onFail={onFail}>
            <StoreScene
              view={view}
              bridge={bridge}
              paused={mirrorLive}
              reducedMotion={reducedMotion}
              resolution={coarse ? "2k" : "4k"}
              onShirt={openShirt}
              onZone={onZone}
              onReady={onReady}
              onArrive={onArrive}
              onProgress={setProgress}
            />
          </SceneBoundary>
        </div>
      )}

      {live && !ready && (
        <div className="store-loading" role="status">
          <span className="meta">Opening the store</span>
          <span className="store-bar">
            <span style={{ transform: `scaleX(${Math.max(progress, 4) / 100})` }} />
          </span>
        </div>
      )}

      {!live && (
        <div className="home-light absolute inset-x-0 bottom-0 max-h-[70%] overflow-auto bg-white/95 p-6">
          <h1 className="home-display text-2xl">The sports store</h1>
          <p className="mt-2 text-dim">
            {webgl
              ? "The 3D shop didn't load this time, so here is the rail as a list."
              : "Your browser can't draw the 3D shop, so here is the rail as a list."}
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {KITS.map((kit) => (
              <li key={kit.slug}>
                <strong>{kit.club}</strong>
                <span className="block text-dim">{kit.blurb}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {live && ready && view.name === "overview" && (
        <div className="store-cctv">
          <div className="store-cctv-bar">
            <span>CAM 01 · SALES FLOOR</span>
            <span className="flex items-center gap-2">
              <i className="store-rec" aria-hidden /> LIVE <Clock />
            </span>
          </div>

          <Pin id="wall" bridge={bridge} onClick={goToWall}>
            Shirt wall
          </Pin>
          <Pin id="mirror" bridge={bridge} onClick={goToMirror}>
            Mirror
          </Pin>

          <div className="store-caption">
            <h1 className="home-display text-[clamp(1.2rem,3vw,1.9rem)]">The sports store</h1>
            <p>Pick the shirt wall to browse, or the mirror to try one on.</p>
          </div>
        </div>
      )}

      {live && view.name === "wall" && (
        <div className="home-light store-overlay">
          <button type="button" className="store-chip self-start" onClick={goToFloor}>
            <span aria-hidden>←</span> Sales floor
          </button>

          <div className="flex flex-col items-center gap-3">
            <p className="store-chip store-chip-quiet" aria-live="polite">
              {focused.club}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="store-round"
                aria-label="Previous shirts"
                disabled={Math.round(focus) === 0}
                onClick={() => step(-1)}
              >
                <span aria-hidden>←</span>
              </button>
              <button type="button" className="home-btn" onClick={() => openShirt(focused.slug)}>
                Pick up this shirt
              </button>
              <button
                type="button"
                className="store-round"
                aria-label="Next shirts"
                disabled={Math.round(focus) === KITS.length - 1}
                onClick={() => step(1)}
              >
                <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {live && held && (
        <div className="home-light store-overlay store-overlay-shirt">
          <button type="button" className="store-chip self-start" onClick={goToWall}>
            <span aria-hidden>←</span> Back to the wall
          </button>

          <aside className="store-panel" aria-label={`${held.club} shirt`}>
            <p className="meta text-dim">HOME SHIRT · CONCEPT KIT</p>
            <h2 className="home-display mt-2 text-[1.5rem]">{held.club}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-dim">{held.blurb}</p>
            <p className="mt-3 font-mono text-[15px]">€{held.price}</p>

            <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Show the shirt from">
              {ANGLES.map((angle) => (
                <button
                  key={angle.id}
                  type="button"
                  className="store-tab"
                  onClick={() => bridge.showAngle(angle.id)}
                >
                  {angle.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-1.5" role="group" aria-label="Size">
              {SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="store-tab"
                  aria-pressed={option === size}
                  onClick={() => setSize(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-2">
              <button type="button" className="home-btn justify-center" onClick={goToMirror}>
                Try it in the mirror
              </button>
              <button
                type="button"
                className="home-btn home-btn-ghost justify-center"
                aria-pressed={chosen}
                onClick={() => setChosen(true)}
              >
                {chosen ? `Selected, size ${size}` : "Select this shirt"}
              </button>
            </div>

            <p className="mt-4 text-[12px] leading-relaxed text-dim">
              Drag to turn it. {coarse ? "Pinch" : "Scroll"} to bring it closer.
            </p>
          </aside>
        </div>
      )}

      {live && atMirror && (
        <SceneBoundary onFail={goToFloor}>
          <MirrorStage
            selected={selected}
            reducedMotion={reducedMotion}
            resolution={coarse ? "2k" : "4k"}
            onSelect={setSelected}
            onClose={goToFloor}
            onLive={setMirrorLive}
          />
        </SceneBoundary>
      )}

      <p className="store-note">
        A concept store by Achraf Benamrane. Kits are my own designs in club colours, not official
        products, and nothing here is for sale.{" "}
        <Link href="/contact" className="underline underline-offset-2">
          Want one for your brand?
        </Link>
      </p>
    </div>
  );
}

"use client";

import { Canvas } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useHeroSignal } from "@/components/hero/hero-signal-context";
import Desktop from "./desktop";
import {
  CAMERA_FOV,
  CAMERA_Z,
  DESKTOP_CSS,
  projectScreen,
} from "./geometry";

/**
 * Its own Canvas rather than sharing the hero's — the hero's is absolutely
 * positioned at 56% width inside its own section and hard-set to
 * `pointer-events: none`, which is the opposite of what this needs. three and
 * fiber are already in a shared async chunk, so the marginal JS is nothing.
 */
const ImacModel = dynamic(() => import("./imac-model"), { ssr: false });

/** The media query as an external store — it genuinely is one, and reading it
 *  through setState-in-an-effect causes the cascading render the compiler
 *  rules flag. This also tracks the user changing the setting mid-visit. */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const query = matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getMotion = () => matchMedia(REDUCED_MOTION).matches;
const getServerMotion = () => false;

export default function ImacSection() {
  const signal = useHeroSignal();
  const router = useRouter();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getMotion,
    getServerMotion,
  );

  // A second WebGL context is not worth paying for while the section is below
  // the fold. Latches once — the canvas costs nothing at idle on demand.
  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The overlay is placed from the stage's real box, measured here rather than
  // taken from R3F — the canvas fills this element exactly, so this is the same
  // coordinate system the projection is computed in.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setStage({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const navigate = useCallback((href: string) => router.push(href), [router]);

  const screen = stage.height ? projectScreen(stage.width, stage.height) : null;

  return (
    <section
      ref={sectionRef}
      id="desktop"
      className="relative px-6 pb-24 pt-8 md:px-12"
    >
      <div className="mx-auto max-w-350">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4">
          <h2 className="meta text-dim">DESKTOP</h2>
          <span className="meta text-dim">
            POINT · PINCH TO CLICK · OR JUST USE THE MOUSE
          </span>
        </div>

        {/* Sized from HEIGHT, not width: the camera has to frame the whole
            machine including the stand, so the canvas height decides
            everything and the width follows from a 4:3 ratio. */}
        <div className="mt-6 flex justify-center">
          <div
            ref={stageRef}
            className="relative aspect-4/3 h-[82vh] max-h-220 min-h-100"
          >
            {mounted && (
              <>
                <Canvas
                  dpr={[1, 1.75]}
                  // On demand: the monitor is static, so one frame per resize
                  // is all it needs and the GPU sits idle the rest of the time.
                  frameloop="demand"
                  gl={{ antialias: true, alpha: true }}
                  // y = 0 deliberately: R3F aims the default camera at the
                  // origin, so any y offset here becomes a tilt, not a pan.
                  camera={{ position: [0, 0, CAMERA_Z], fov: CAMERA_FOV }}
                >
                  <ambientLight intensity={1.1} />
                  <hemisphereLight
                    intensity={0.9}
                    color="#ffffff"
                    groundColor="#c3ccd3"
                  />
                  <directionalLight position={[-4, 5, 6]} intensity={1.9} />
                  <directionalLight position={[5, -1, 3]} intensity={0.7} />
                  <directionalLight position={[0, 3, -6]} intensity={0.6} />
                  <ImacModel />
                </Canvas>

                {/* The desktop, laid over the glass at its projected rect.
                    Authored at DESKTOP_CSS and scaled from the top-left, so
                    every internal coordinate — including the finger cursor's
                    hit-testing — stays in the authored space. */}
                {screen && (
                  <div
                    className="absolute"
                    style={{
                      left: screen.left,
                      top: screen.top,
                      width: DESKTOP_CSS.width,
                      height: DESKTOP_CSS.height,
                      transform: `scale(${screen.scale})`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <Desktop
                      signal={signal}
                      onNavigate={navigate}
                      reducedMotion={reducedMotion}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

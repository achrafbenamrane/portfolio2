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

import VisionDemo from "@/components/vision/vision-demo";
import { useVisionSignal } from "@/components/vision/vision-signal";
import Desktop from "./desktop";
import {
  CAMERA_FOV,
  CAMERA_Z,
  DESKTOP_CSS,
  projectScreen,
} from "./geometry";

/**
 * Its own Canvas rather than sharing the portrait's — that one is sized by a
 * window on the desktop and hard-set to `pointer-events: none`, which is the
 * opposite of what this needs. three and fiber are already in a shared async
 * chunk, so the marginal JS is nothing.
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

/**
 * Below this the desktop is not worth rendering at all.
 *
 * It is authored at 800 CSS px, and on a phone the glass works out around
 * 270 px across — a scale of about 0.34, which puts the menu bar text under
 * four pixels tall. Unreadable, un-clickable, and it still costs a WebGL
 * context and the three.js bundle. A phone gets the demo the desktop exists
 * to show — the portrait and its camera panel — on its own.
 */
const WIDE = "(min-width: 768px)";

function subscribeWide(onChange: () => void) {
  const query = matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getWide = () => matchMedia(WIDE).matches;
const getServerWide = () => false;

/**
 * The iMac, lit and framed, with the live desktop on its glass — the
 * computer-vision band's showcase. It boots into the Vision app, so the
 * first thing on the screen is the portrait that folds as a hand closes, and
 * the rest of the machine is there to be pointed at once the camera is on.
 * Needs a VisionSignalProvider above it: the portrait, the camera panel and
 * the finger cursor all read the one camera.
 */
export default function ImacStage() {
  const signal = useVisionSignal();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getMotion,
    getServerMotion,
  );
  const wide = useSyncExternalStore(subscribeWide, getWide, getServerWide);

  // Two WebGL contexts — the machine and the portrait on its screen — are not
  // worth paying for while the band is below the fold. Latches once: the
  // canvases cost nothing at idle on demand.
  useEffect(() => {
    const element = rootRef.current;
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
    <div ref={rootRef}>
      {/* Width-driven with a HEIGHT CAP, which is the only formulation that
          cannot overflow either axis. Deriving the width from the height
          alone put a 729px stage in the 327px a phone has available, and
          1120px in an iPad's 720px. The camera still needs to frame the whole
          machine, so max-w is the height budget converted through the same
          4:3 ratio. */}
      <div className="hidden justify-center md:flex">
        <div
          ref={stageRef}
          className="relative aspect-4/3 w-full max-w-[calc(82vh*4/3)]"
        >
          {mounted && wide && (
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

      {/* In the server's HTML, so nothing below it moves when it arrives —
          a link to this band lands before the page has finished. Hidden by
          CSS as well as by the `wide` flag, so a desktop never flashes it
          before hydration decides; its portrait waits for the band to come
          near, like the iMac. */}
      <div className="md:hidden">
        {!wide && <VisionDemo live={mounted} />}
        <p className="mt-5 max-w-md text-balance text-sm leading-relaxed text-dim">
          On a laptop this portrait sits on a desktop you steer with your
          finger — point to move, pinch to click.
        </p>
      </div>
    </div>
  );
}

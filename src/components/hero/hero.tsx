import { site } from "@/content/site";
import HandControl from "./hand-control";
import HeroCanvas from "./hero-canvas";
import RoleRotator from "./role-rotator";

/**
 * Server component. The headline, role line and tagline are in the initial HTML
 * — the LCP element never waits on JavaScript, let alone on WebGL.
 *
 * The control panel sits in normal flow rather than pinned to a corner, so it
 * cannot collide with the copy on a short viewport. The signal provider now
 * lives on the page, because the iMac section shares this one camera stream.
 *
 * Two arrangements, one markup. Wide: the portrait fills the right half and
 * the copy sits clear of it. Narrow: there is no right half to sit in, so the
 * three parts stack — copy, portrait, panel — and the flex order puts the
 * portrait between them. Laid over the copy instead (which is what a
 * full-width canvas does on a phone) it puts a face behind the paragraph and
 * the panel over the mouth.
 */
export default function Hero() {
  return (
    <>
      <section
        className="relative flex min-h-dvh flex-col justify-center gap-5 overflow-hidden px-6 pb-10 pt-32 md:px-12 lg:gap-0 lg:pb-0 lg:pt-32"
        style={{
          /* The nav's blue, continued. The bar sits directly above this, so
             anything else would put a seam across the top of the page. The
             radial lifts the right side, where the portrait sits. */
          background:
            "radial-gradient(70% 90% at 72% 40%, #1B4A78 0%, transparent 62%)," +
            "linear-gradient(160deg, #0E2438 0%, #133A5E 55%, #0B1C2C 100%)",
        }}
      >
        <HeroCanvas />

        <div className="pointer-events-none relative z-10 order-1 max-w-2xl lg:order-none">
          <p className="meta text-white/60">{site.availability}</p>

          {/*
            Two-tier lockup. The size ratio isn't arbitrary: wide tracking makes
            the light line eat about 0.80em per character against roughly 0.72em
            for the black one, so at ~52% of the size its 14 characters land
            close to the surname's 9 — the two lines read as one block instead
            of a heading with a stray label above it.
          */}
          <h1 className="mt-6 uppercase">
            <span className="block whitespace-nowrap text-[clamp(1.1rem,3.1vw,2.6rem)] font-light leading-none tracking-[0.2em] text-white/70">
              {site.nameLines.light}
            </span>
            <span className="mt-2 block whitespace-nowrap text-[clamp(2.25rem,6vw,5rem)] font-black leading-[0.85] tracking-[-0.035em] text-white">
              {site.nameLines.bold}
            </span>
          </h1>

          <RoleRotator roles={site.roles} />

          <p className="mt-4 max-w-md text-balance text-white/75">{site.tagline}</p>
        </div>

        {/* Order 3: after the portrait on a phone, straight after the copy on
            a wide screen, where the portrait is out of flow. */}
        <div className="pointer-events-auto relative z-10 order-3 max-w-2xl lg:order-none lg:mt-10">
          <HandControl />
        </div>

      </section>
    </>
  );
}

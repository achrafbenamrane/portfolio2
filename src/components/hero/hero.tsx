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
 */
export default function Hero() {
  return (
    <>
      <section className="relative flex min-h-dvh flex-col justify-center overflow-hidden px-6 pb-16 pt-40 md:px-12 md:pt-32">
        <HeroCanvas />

        <div className="pointer-events-none relative z-10 max-w-2xl">
          <p className="meta text-dim">{site.availability}</p>

          {/*
            Two-tier lockup. The size ratio isn't arbitrary: wide tracking makes
            the light line eat about 0.80em per character against roughly 0.72em
            for the black one, so at ~52% of the size its 14 characters land
            close to the surname's 9 — the two lines read as one block instead
            of a heading with a stray label above it.
          */}
          <h1 className="mt-6 uppercase">
            <span className="block whitespace-nowrap text-[clamp(1.1rem,3.1vw,2.6rem)] font-light leading-none tracking-[0.2em] text-dim">
              {site.nameLines.light}
            </span>
            <span className="mt-2 block whitespace-nowrap text-[clamp(2.25rem,6vw,5rem)] font-black leading-[0.85] tracking-[-0.035em]">
              {site.nameLines.bold}
            </span>
          </h1>

          <RoleRotator roles={site.roles} />

          <p className="mt-4 max-w-md text-balance text-dim">{site.tagline}</p>

          <div className="pointer-events-auto mt-10">
            <HandControl />
            <p className="meta mt-3 max-w-62 leading-relaxed text-dim">
              OPEN YOUR HAND FOR THE PORTRAIT · CLOSE IT TO FOLD
            </p>
          </div>
        </div>

        <div className="meta pointer-events-none absolute inset-x-0 bottom-6 hidden justify-end px-12 text-dim lg:flex">
          <span>{site.location}</span>
        </div>
      </section>
    </>
  );
}

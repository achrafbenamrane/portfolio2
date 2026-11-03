import Link from "next/link";

import { site } from "@/content/site";
import RoleRotator from "./role-rotator";

/**
 * Server component. The headline, role line and tagline are in the initial HTML
 * — the LCP element never waits on JavaScript.
 *
 * The live portrait and its hand control moved to the Work page, where they
 * run on the iMac's desktop as the computer-vision project; the hero links
 * to them rather than hosting them.
 */
export default function Hero() {
  return (
    <>
      <section
        /* From lg the copy's left edge follows the site's column — the
           1400px one the nav and every section sit in — so on a 1920 or
           2560 screen it lines up under the wordmark instead of hugging the
           window's edge. */
        className="relative flex min-h-dvh flex-col justify-center gap-5 overflow-hidden px-6 pb-10 pt-32 md:px-12 lg:gap-0 lg:pb-0 lg:pl-[max(3rem,calc((100%_-_87.5rem)/2_+_3rem))] lg:pt-32"
        style={{
          /* The nav's blue, continued. The bar sits directly above this, so
             anything else would put a seam across the top of the page. */
          background:
            "radial-gradient(70% 90% at 72% 40%, #1B4A78 0%, transparent 62%)," +
            "linear-gradient(160deg, #0E2438 0%, #133A5E 55%, #0B1C2C 100%)",
        }}
      >
        <div className="relative z-10 max-w-2xl">
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

        <div className="relative z-10 max-w-2xl lg:mt-10">
          <Link
            href="/projects#computer-vision"
            className="group inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-[#7CC4F0] hover:text-[#7CC4F0]"
          >
            Try the hand-tracking demo
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>

      </section>
    </>
  );
}

import Link from "next/link";

import { site } from "@/content/site";

/**
 * The closing call to action.
 *
 * A server component with no state: it is a headline and a link, and shipping
 * JavaScript for that would be paying for nothing.
 *
 * The gradient is built from the palette's own accent and the iMac's shell
 * blue rather than an arbitrary blue, so it reads as part of this site instead
 * of a banner lifted from a template. The soft light bands are two very wide
 * radial gradients — cheap, resolution-independent, and no image to download.
 */
export default function CtaBanner() {
  return (
    <section className="px-6 pb-24 md:px-12">
      <div
        className="relative mx-auto max-w-350 overflow-hidden rounded-2xl px-7 py-14 md:px-14 md:py-20"
        style={{
          background:
            "radial-gradient(120% 140% at 85% 15%, #3D7FC0 0%, transparent 55%)," +
            "radial-gradient(90% 120% at 15% 90%, #1B4A78 0%, transparent 60%)," +
            "linear-gradient(135deg, #0E2438 0%, #133A5E 55%, #0B1C2C 100%)",
        }}
      >
        <div className="relative grid gap-10 md:grid-cols-[1fr_auto] md:items-end md:gap-16">
          <div>
            <p className="meta text-white/55">LET&rsquo;S CREATE TOGETHER</p>
            <h2 className="mt-5 max-w-xl text-balance text-[clamp(1.9rem,4.4vw,3.4rem)] font-bold leading-[1.03] tracking-tight text-white">
              Ready to bring your ideas to life?
            </h2>
          </div>

          <div className="md:max-w-xs md:text-right">
            <p className="text-balance leading-relaxed text-white/70">
              Tell me what you are building. I work across development, design
              and security, so the whole thing can come from one place.
            </p>

            <Link
              href="/contact"
              className="group mt-7 inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-white/90"
            >
              START A PROJECT
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </Link>

            <p className="meta mt-5 text-white/45">{site.availability}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

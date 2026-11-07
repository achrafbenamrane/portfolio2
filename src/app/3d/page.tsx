import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import Badges from "@/components/badges";
import { wide } from "@/components/home/wide-font";
import PageHeader from "@/components/page-header";
import { THREE_D_SITES } from "@/content/store";

export const metadata: Metadata = {
  title: "3D websites",
  description:
    "Websites you walk through, not scroll past. I model the space in Blender, light it once, and ship it to the browser.",
};

export default function ThreeDPage() {
  return (
    <>
      <PageHeader
        index="04"
        label="3D websites"
        title="3D websites"
        outline="you walk into"
        description="I model the space in Blender, light it once, and ship it to the browser, so a full room runs on a phone. Then I make it do something a photo can't."
        meta={{ label: "Live builds", value: String(THREE_D_SITES.length).padStart(3, "0") }}
      />

      <section className={`home home-light ${wide.variable} px-6 py-14 md:px-12 md:py-20`}>
        <ul className="mx-auto grid max-w-350 gap-10">
          {THREE_D_SITES.map((build) => (
            <li key={build.slug} className="grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
              <Link
                href={build.href}
                className="group relative block aspect-video overflow-hidden rounded-2xl bg-surface-2"
                aria-label={build.cta}
              >
                <Image
                  src={build.poster}
                  alt={build.alt}
                  fill
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                />
              </Link>
              <div>
                <h2 className="home-display text-[clamp(1.5rem,3vw,2.3rem)]">{build.title}</h2>
                <p className="mt-4 max-w-md leading-relaxed text-[var(--home-dim)]">{build.summary}</p>
                <Badges tags={build.tags} brand={build.brand} className="mt-5" />
                <Link href={build.href} className="home-btn mt-7">
                  {build.cta} <span aria-hidden>→</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

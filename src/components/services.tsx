import Link from "next/link";

import { services, type Service } from "@/content/site";

/**
 * What Achraf does, as four cards.
 *
 * A server component — icons, text and links, so shipping JavaScript for it
 * would be paying for nothing.
 *
 * Each card links into the Work page rather than dead-ending on a claim. A
 * services list that cannot be checked is just adjectives; every one of these
 * has finished projects behind it, and the card is the way to them.
 */
export default function Services() {
  return (
    <section className="px-6 pb-20 pt-4 md:px-12" aria-label="Services">
      <div className="mx-auto max-w-350">
        <div className="grid gap-8 border-b border-line pb-10 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:items-end md:gap-16">
          <div>
            <p className="meta text-dim">WHAT I DO</p>
            <h2 className="mt-5 text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.05] tracking-tight">
              Ideas that
              <br />
              make an impact
            </h2>
          </div>

          <div>
            <p className="text-balance leading-relaxed text-dim">
              I combine development, design and security to build digital
              products that work properly — and keep working once they are live.
            </p>

            <Link
              href="/work"
              className="group mt-6 inline-flex items-center gap-2.5 rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Explore work
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>
        </div>

        <ul className="grid gap-5 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <li key={service.title}>
              <Link
                href={service.href}
                className="group flex h-full flex-col rounded-xl border border-line bg-surface-1 p-6 transition-colors hover:border-accent"
              >
                <span className="text-dim transition-colors group-hover:text-accent">
                  <Icon name={service.icon} />
                </span>

                <h3 className="mt-6 font-medium tracking-tight transition-colors group-hover:text-accent">
                  {service.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-dim">
                  {service.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Drawn rather than pulled from an icon package: four glyphs do not justify a
 * dependency, and these inherit `currentColor` so they follow the hover state
 * without any extra wiring.
 */
function Icon({ name }: { name: Service["icon"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-6",
    "aria-hidden": true,
  };

  switch (name) {
    case "code":
      return (
        <svg {...common}>
          <path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 4l-4 16" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <rect x="6" y="2" width="12" height="20" rx="3" />
          <path d="M11 18.5h2" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 2 4 5.5v6c0 5 3.4 9.1 8 10.5 4.6-1.4 8-5.5 8-10.5v-6L12 2Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M12 19 7 21l2-5 9-9a2.1 2.1 0 0 1 3 3l-9 9Z" />
          <path d="M15 5.5 18.5 9" />
        </svg>
      );
  }
}
